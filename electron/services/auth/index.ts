import { shell } from 'electron'
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { randomBytes } from 'node:crypto'
import { URL } from 'node:url'
import { logger } from '../logger.js'
import {
  EVE_SSO,
  CALLBACK_PORT,
  CALLBACK_URL,
  AUTH_TIMEOUT_MS,
  CHARACTER_SCOPES,
  CORPORATION_SCOPES,
} from './config.js'
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js'
import {
  exchangeCodeForTokens,
  verifyToken,
  extractCharacterId,
  extractScopes,
  fetchCharacterInfo,
  fetchCharacterRoles,
  type TokenResponse,
} from './token-handler.js'
import { SUCCESS_HTML, ERROR_HTML, sendHtmlResponse } from './html-responses.js'
import type { AuthResult, PendingAuth } from './types.js'

export type { AuthResult } from './types.js'
export type { CorporationRoles } from './token-handler.js'

let callbackServer: Server | null = null
let pendingAuth: PendingAuth | null = null

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

  if (!pendingAuth || pendingAuth.resolved) {
    sendHtmlResponse(res, 400, ERROR_HTML('No pending authentication'))
    return
  }

  const { state: expectedState, codeVerifier, resolve, timeoutId } = pendingAuth
  pendingAuth.resolved = true
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
      resolve()
    })
  })
}

function stopCallbackServer(): void {
  if (callbackServer) {
    callbackServer.close()
    callbackServer = null
  }
}

export function cancelAuth(): void {
  if (pendingAuth && !pendingAuth.resolved) {
    logger.info('Authentication cancelled by user', { module: 'Auth' })
    clearTimeout(pendingAuth.timeoutId)
    pendingAuth.resolved = true
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
      if (pendingAuth && !pendingAuth.resolved) {
        logger.warn('Authentication timed out', { module: 'Auth' })
        pendingAuth.resolved = true
        pendingAuth = null
        stopCallbackServer()
        resolve({ success: false, error: 'Authentication timed out' })
      }
    }, AUTH_TIMEOUT_MS)

    pendingAuth = { state, codeVerifier, resolve, timeoutId, resolved: false }

    shell.openExternal(authUrl.toString()).catch((err) => {
      if (pendingAuth && !pendingAuth.resolved) {
        logger.error('Failed to open browser', err, { module: 'Auth' })
        clearTimeout(timeoutId)
        pendingAuth.resolved = true
        pendingAuth = null
        stopCallbackServer()
        resolve({ success: false, error: 'Failed to open browser' })
      }
    })
  })
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<AuthResult> {
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
