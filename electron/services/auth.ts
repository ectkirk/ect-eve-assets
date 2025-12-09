import { shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { URL } from 'node:url'
import * as jose from 'jose'
import { logger } from './logger.js'

const CHARACTER_SCOPES = [
  'publicData',
  'esi-assets.read_assets.v1',
  'esi-markets.read_character_orders.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-clones.read_clones.v1',
  'esi-clones.read_implants.v1',
  'esi-universe.read_structures.v1',
  'esi-wallet.read_character_wallet.v1',
]

const CORPORATION_SCOPES = [
  ...CHARACTER_SCOPES,
  'esi-assets.read_corporation_assets.v1',
  'esi-contracts.read_corporation_contracts.v1',
  'esi-industry.read_corporation_jobs.v1',
  'esi-markets.read_corporation_orders.v1',
  'esi-wallet.read_corporation_wallets.v1',
]

const EVE_SSO = {
  authUrl: 'https://login.eveonline.com/v2/oauth/authorize',
  tokenUrl: 'https://login.eveonline.com/v2/oauth/token',
  revokeUrl: 'https://login.eveonline.com/v2/oauth/revoke',
  jwksUrl: 'https://login.eveonline.com/oauth/jwks',
  issuer: 'https://login.eveonline.com',
  clientId: 'ff72276da5e947b3a64763038d22ef53',
}

const CALLBACK_PORTS = [2020, 2021, 2022, 2023, 2024]

const JWKS = jose.createRemoteJWKSet(new URL(EVE_SSO.jwksUrl))

function tryListen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(err)
      } else {
        reject(err)
      }
    })
    server.listen(port, () => resolve(port))
  })
}

async function findAvailablePort(server: Server): Promise<number> {
  for (const port of CALLBACK_PORTS) {
    try {
      return await tryListen(server, port)
    } catch {
      logger.debug('Port in use, trying next', { module: 'Auth', port })
    }
  }
  throw new Error('No available ports for OAuth callback')
}

function generateCodeVerifier(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~'
  let result = ''
  const bytes = randomBytes(128)
  for (let i = 0; i < 128; i++) {
    result += chars[bytes[i]! % chars.length]
  }
  return result
}

function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier, 'ascii').digest()
  return hash.toString('base64url')
}

interface AuthResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  characterId?: number
  characterName?: string
  corporationId?: number
  error?: string
}

interface ESICharacterInfo {
  corporation_id: number
  name: string
  // other fields exist but we don't need them
}

async function fetchCharacterInfo(characterId: number): Promise<ESICharacterInfo> {
  const response = await fetch(
    `https://esi.evetech.net/characters/${characterId}/`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch character info')
  }
  return response.json() as Promise<ESICharacterInfo>
}

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
}

interface JWTPayload {
  sub: string
  name: string
  scp: string | string[]
  iss: string
  exp: number
}

let authServer: Server | null = null
let pendingState: string | null = null
let pendingCodeVerifier: string | null = null
let pendingResolve: ((result: AuthResult) => void) | null = null

const AUTH_TIMEOUT_MS = 2 * 60 * 1000

export function cancelAuth(): void {
  if (authServer) {
    logger.info('Authentication cancelled by user', { module: 'Auth' })
    authServer.close()
    authServer = null
    pendingResolve?.({ success: false, error: 'Authentication cancelled' })
    pendingResolve = null
  }
}

async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: EVE_SSO.issuer,
  })
  return payload as unknown as JWTPayload
}

function extractCharacterId(sub: string): number {
  const parts = sub.split(':')
  const idPart = parts[2]
  if (!idPart) {
    throw new Error('Invalid sub claim format')
  }
  return parseInt(idPart, 10)
}

async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
  const response = await fetch(EVE_SSO.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Host: 'login.eveonline.com',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: EVE_SSO.clientId,
      code,
      code_verifier: codeVerifier,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  return (await response.json()) as TokenResponse
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<AuthResult> {
  logger.debug('Refreshing access token', { module: 'Auth' })

  try {
    const response = await fetch(EVE_SSO.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Host: 'login.eveonline.com',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: EVE_SSO.clientId,
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      logger.error('Token refresh failed', undefined, { module: 'Auth', status: response.status })
      return { success: false, error: `Token refresh failed: ${error}` }
    }

    const tokens = (await response.json()) as TokenResponse
    const jwt = await verifyToken(tokens.access_token)
    const expiresAt = Date.now() + tokens.expires_in * 1000
    const characterId = extractCharacterId(jwt.sub)

    const charInfo = await fetchCharacterInfo(characterId)

    logger.info('Token refreshed successfully', { module: 'Auth', characterId, characterName: jwt.name })

    return {
      success: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      characterId,
      characterName: jwt.name,
      corporationId: charInfo.corporation_id,
    }
  } catch (error) {
    logger.error('Token refresh exception', error, { module: 'Auth' })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function startAuth(includeCorporationScopes = false): Promise<AuthResult> {
  logger.info('Starting EVE SSO authentication', { module: 'Auth', includeCorporationScopes })

  pendingState = randomBytes(32).toString('hex')
  pendingCodeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(pendingCodeVerifier)
  const scopes = includeCorporationScopes ? CORPORATION_SCOPES : CHARACTER_SCOPES

  authServer = createServer()

  let callbackPort: number
  try {
    callbackPort = await findAvailablePort(authServer)
    logger.info('OAuth callback server started', { module: 'Auth', port: callbackPort })
  } catch (err) {
    logger.error('Failed to start OAuth callback server', err, { module: 'Auth' })
    return { success: false, error: 'No available ports for OAuth callback' }
  }

  const redirectUri = `http://localhost:${callbackPort}/callback`

  const authUrl = new URL(EVE_SSO.authUrl)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', EVE_SSO.clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', scopes.join(' '))
  authUrl.searchParams.set('state', pendingState)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  return new Promise((resolve) => {
    pendingResolve = resolve

    authServer!.on('request', async (req, res) => {
      const url = new URL(req.url || '', `http://localhost:${callbackPort}`)

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #e2e8f0;">
              <h1>${error ? 'Authentication Failed' : 'Authentication Successful'}</h1>
              <p>${error ? error : 'You can close this window and return to the application.'}</p>
            </body>
          </html>
        `)

        authServer?.close()
        authServer = null
        pendingResolve = null

        if (error) {
          logger.error('SSO callback returned error', undefined, { module: 'Auth', error })
          resolve({ success: false, error })
          return
        }

        if (state !== pendingState) {
          logger.error('SSO state mismatch', undefined, { module: 'Auth' })
          resolve({ success: false, error: 'State mismatch - possible CSRF' })
          return
        }

        if (!code) {
          logger.error('No authorization code received', undefined, { module: 'Auth' })
          resolve({ success: false, error: 'No authorization code received' })
          return
        }

        if (!pendingCodeVerifier) {
          logger.error('Missing code verifier', undefined, { module: 'Auth' })
          resolve({ success: false, error: 'Missing code verifier' })
          return
        }

        try {
          logger.debug('Exchanging auth code for tokens', { module: 'Auth' })
          const tokens = await exchangeCodeForTokens(code, pendingCodeVerifier)
          const jwt = await verifyToken(tokens.access_token)
          const expiresAt = Date.now() + tokens.expires_in * 1000
          const characterId = extractCharacterId(jwt.sub)

          const charInfo = await fetchCharacterInfo(characterId)

          logger.info('Authentication successful', {
            module: 'Auth',
            characterId,
            characterName: jwt.name,
            corporationId: charInfo.corporation_id,
          })

          resolve({
            success: true,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt,
            characterId,
            characterName: jwt.name,
            corporationId: charInfo.corporation_id,
          })
        } catch (err) {
          logger.error('Token exchange failed', err, { module: 'Auth' })
          resolve({
            success: false,
            error: err instanceof Error ? err.message : 'Token exchange failed',
          })
        }
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    shell.openExternal(authUrl.toString())

    setTimeout(() => {
      if (authServer) {
        logger.warn('Authentication timed out', { module: 'Auth' })
        authServer.close()
        authServer = null
        pendingResolve = null
        resolve({ success: false, error: 'Authentication timed out' })
      }
    }, AUTH_TIMEOUT_MS)
  })
}

export async function revokeToken(refreshToken: string): Promise<boolean> {
  logger.debug('Revoking token', { module: 'Auth' })

  try {
    const response = await fetch(EVE_SSO.revokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Host: 'login.eveonline.com',
      },
      body: new URLSearchParams({
        client_id: EVE_SSO.clientId,
        token_type_hint: 'refresh_token',
        token: refreshToken,
      }),
    })

    if (response.ok) {
      logger.info('Token revoked successfully', { module: 'Auth' })
    } else {
      logger.warn('Token revocation failed', { module: 'Auth', status: response.status })
    }

    return response.ok
  } catch (err) {
    logger.error('Token revocation exception', err, { module: 'Auth' })
    return false
  }
}
