import { shell } from 'electron'
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { URL } from 'node:url'
import * as jose from 'jose'
import { logger } from './logger.js'

const CHARACTER_SCOPES = [
  'publicData',
  'esi-assets.read_assets.v1',
  'esi-characters.read_blueprints.v1',
  'esi-characters.read_corporation_roles.v1',
  'esi-characters.read_loyalty.v1',
  'esi-markets.read_character_orders.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-clones.read_clones.v1',
  'esi-clones.read_implants.v1',
  'esi-universe.read_structures.v1',
  'esi-wallet.read_character_wallet.v1',
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
]

const CORPORATION_SCOPES = [
  ...CHARACTER_SCOPES,
  'esi-assets.read_corporation_assets.v1',
  'esi-corporations.read_blueprints.v1',
  'esi-corporations.read_divisions.v1',
  'esi-corporations.read_starbases.v1',
  'esi-corporations.read_structures.v1',
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
  get clientId() {
    return process.env.EVE_CLIENT_ID || ''
  },
}

const CALLBACK_PORT = 52742
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`
const AUTH_TIMEOUT_MS = 5 * 60 * 1000

const JWKS = jose.createRemoteJWKSet(new URL(EVE_SSO.jwksUrl))

let callbackServer: Server | null = null
let pendingAuth: {
  state: string
  codeVerifier: string
  resolve: (result: AuthResult) => void
  timeoutId: NodeJS.Timeout
} | null = null

function generateCodeVerifier(): string {
  const chars =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~'
  const charsLength = chars.length
  const maxValid = 256 - (256 % charsLength)
  let result = ''
  while (result.length < 128) {
    const bytes = randomBytes(256)
    for (let i = 0; i < bytes.length && result.length < 128; i++) {
      if (bytes[i]! < maxValid) {
        result += chars[bytes[i]! % charsLength]
      }
    }
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
  scopes?: string[]
  corporationRoles?: CorporationRoles | null
  error?: string
}

interface ESICharacterInfo {
  corporation_id: number
  name: string
}

async function fetchCharacterInfo(
  characterId: number
): Promise<ESICharacterInfo> {
  const response = await fetch(
    `https://esi.evetech.net/characters/${characterId}/`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch character info')
  }
  return response.json() as Promise<ESICharacterInfo>
}

export interface CorporationRoles {
  roles: string[]
  roles_at_hq?: string[]
  roles_at_base?: string[]
  roles_at_other?: string[]
}

async function fetchCharacterRoles(
  characterId: number,
  accessToken: string
): Promise<CorporationRoles | null> {
  try {
    const response = await fetch(
      `https://esi.evetech.net/characters/${characterId}/roles/`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
    if (!response.ok) return null
    return (await response.json()) as CorporationRoles
  } catch {
    return null
  }
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

function extractScopes(scp: string | string[]): string[] {
  if (Array.isArray(scp)) return scp
  return scp.split(' ')
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
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

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Authentication Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    h1 { color: #4ade80; margin-bottom: 16px; }
    p { color: #a0a0a0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✓ Authentication Successful</h1>
    <p>You can close this tab and return to the application.</p>
  </div>
  <script>window.close();</script>
</body>
</html>`

function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return str.replace(/[&<>"']/g, (c) => map[c]!)
}

const ERROR_HTML = (error: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Authentication Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    h1 { color: #f87171; margin-bottom: 16px; }
    p { color: #a0a0a0; }
    .error { color: #fca5a5; font-size: 14px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✗ Authentication Failed</h1>
    <p>Please close this tab and try again.</p>
    <p class="error">${escapeHtml(error)}</p>
  </div>
</body>
</html>`

function sendHtmlResponse(
  res: ServerResponse,
  statusCode: number,
  html: string
): void {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

async function handleCallbackRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${CALLBACK_PORT}`)

  if (url.pathname !== '/callback') {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  if (!pendingAuth) {
    sendHtmlResponse(res, 400, ERROR_HTML('No pending authentication'))
    return
  }

  const { state: expectedState, codeVerifier, resolve, timeoutId } = pendingAuth
  pendingAuth = null
  clearTimeout(timeoutId)

  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    logger.error('SSO callback returned error', undefined, {
      module: 'Auth',
      error,
    })
    sendHtmlResponse(res, 400, ERROR_HTML(error))
    resolve({ success: false, error })
    stopCallbackServer()
    return
  }

  if (returnedState !== expectedState) {
    logger.error('SSO state mismatch', undefined, { module: 'Auth' })
    sendHtmlResponse(
      res,
      400,
      ERROR_HTML('State mismatch - possible security issue')
    )
    resolve({ success: false, error: 'State mismatch - possible CSRF' })
    stopCallbackServer()
    return
  }

  if (!code) {
    logger.error('No authorization code received', undefined, {
      module: 'Auth',
    })
    sendHtmlResponse(res, 400, ERROR_HTML('No authorization code received'))
    resolve({ success: false, error: 'No authorization code received' })
    stopCallbackServer()
    return
  }

  try {
    logger.debug('Exchanging auth code for tokens', { module: 'Auth' })
    const tokens = await exchangeCodeForTokens(code, codeVerifier)
    const jwt = await verifyToken(tokens.access_token)
    const expiresAt = Date.now() + tokens.expires_in * 1000
    const characterId = extractCharacterId(jwt.sub)
    const charInfo = await fetchCharacterInfo(characterId)
    const corporationRoles = await fetchCharacterRoles(
      characterId,
      tokens.access_token
    )

    logger.info('Authentication successful', {
      module: 'Auth',
      characterId,
      characterName: jwt.name,
      corporationId: charInfo.corporation_id,
      hasDirectorRole: corporationRoles?.roles?.includes('Director') ?? false,
    })

    sendHtmlResponse(res, 200, SUCCESS_HTML)
    resolve({
      success: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      characterId,
      characterName: jwt.name,
      corporationId: charInfo.corporation_id,
      scopes: extractScopes(jwt.scp),
      corporationRoles,
    })
  } catch (err) {
    logger.error('Token exchange failed', err, { module: 'Auth' })
    const errorMsg =
      err instanceof Error ? err.message : 'Token exchange failed'
    sendHtmlResponse(res, 500, ERROR_HTML(errorMsg))
    resolve({ success: false, error: errorMsg })
  }

  stopCallbackServer()
}

function startCallbackServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (callbackServer) {
      resolve()
      return
    }

    callbackServer = createServer((req, res) => {
      handleCallbackRequest(req, res).catch((err) => {
        logger.error('Callback request handler error', err, { module: 'Auth' })
        res.writeHead(500)
        res.end('Internal server error')
      })
    })

    callbackServer.on('error', (err) => {
      logger.error('Callback server error', err, { module: 'Auth' })
      callbackServer = null
      reject(err)
    })

    callbackServer.listen(CALLBACK_PORT, '127.0.0.1', () => {
      logger.debug('Callback server started', {
        module: 'Auth',
        port: CALLBACK_PORT,
      })
      resolve()
    })
  })
}

function stopCallbackServer(): void {
  if (callbackServer) {
    callbackServer.close()
    callbackServer = null
    logger.debug('Callback server stopped', { module: 'Auth' })
  }
}

export function cancelAuth(): void {
  if (pendingAuth) {
    logger.info('Authentication cancelled by user', { module: 'Auth' })
    clearTimeout(pendingAuth.timeoutId)
    pendingAuth.resolve({ success: false, error: 'Authentication cancelled' })
    pendingAuth = null
  }
  stopCallbackServer()
}

export async function startAuth(
  includeCorporationScopes = false
): Promise<AuthResult> {
  logger.info('Starting EVE SSO authentication', {
    module: 'Auth',
    includeCorporationScopes,
  })

  if (!EVE_SSO.clientId) {
    logger.error('EVE_CLIENT_ID environment variable is not set', undefined, {
      module: 'Auth',
    })
    return {
      success: false,
      error: 'EVE_CLIENT_ID environment variable is not set',
    }
  }

  if (pendingAuth) {
    cancelAuth()
  }

  try {
    await startCallbackServer()
  } catch (err) {
    return {
      success: false,
      error: `Failed to start callback server: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }

  const state = randomBytes(32).toString('hex')
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const scopes = includeCorporationScopes
    ? CORPORATION_SCOPES
    : CHARACTER_SCOPES

  const authUrl = new URL(EVE_SSO.authUrl)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', EVE_SSO.clientId)
  authUrl.searchParams.set('redirect_uri', CALLBACK_URL)
  authUrl.searchParams.set('scope', scopes.join(' '))
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      if (pendingAuth) {
        logger.warn('Authentication timed out', { module: 'Auth' })
        pendingAuth = null
        stopCallbackServer()
        resolve({ success: false, error: 'Authentication timed out' })
      }
    }, AUTH_TIMEOUT_MS)

    pendingAuth = { state, codeVerifier, resolve, timeoutId }

    shell.openExternal(authUrl.toString()).catch((err) => {
      logger.error('Failed to open browser', err, { module: 'Auth' })
      clearTimeout(timeoutId)
      pendingAuth = null
      stopCallbackServer()
      resolve({ success: false, error: 'Failed to open browser' })
    })
  })
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
      logger.error('Token refresh failed', undefined, {
        module: 'Auth',
        status: response.status,
      })
      return { success: false, error: `Token refresh failed: ${error}` }
    }

    const tokens = (await response.json()) as TokenResponse
    const jwt = await verifyToken(tokens.access_token)
    const expiresAt = Date.now() + tokens.expires_in * 1000
    const characterId = extractCharacterId(jwt.sub)
    const charInfo = await fetchCharacterInfo(characterId)

    logger.info('Token refreshed successfully', {
      module: 'Auth',
      characterId,
      characterName: jwt.name,
    })

    return {
      success: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      characterId,
      characterName: jwt.name,
      corporationId: charInfo.corporation_id,
      scopes: extractScopes(jwt.scp),
    }
  } catch (error) {
    logger.error('Token refresh exception', error, { module: 'Auth' })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
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
      logger.warn('Token revocation failed', {
        module: 'Auth',
        status: response.status,
      })
    }

    return response.ok
  } catch (err) {
    logger.error('Token revocation exception', err, { module: 'Auth' })
    return false
  }
}
