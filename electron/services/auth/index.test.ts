import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'

const mocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  verifyToken: vi.fn(),
  extractCharacterId: vi.fn(),
  extractScopes: vi.fn(),
  fetchCharacterInfo: vi.fn(),
  fetchCharacterRoles: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  openExternal: vi.fn(),
  generateCodeVerifier: vi.fn(() => 'test-code-verifier'),
  generateCodeChallenge: vi.fn(() => 'test-code-challenge'),
  sendHtmlResponse: vi.fn(),
  SUCCESS_HTML: '<html>Success</html>',
  ERROR_HTML: vi.fn((msg: string) => `<html>Error: ${msg}</html>`),
}))

vi.mock('../logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('./token-handler.js', () => ({
  verifyToken: mocks.verifyToken,
  extractCharacterId: mocks.extractCharacterId,
  extractScopes: mocks.extractScopes,
  fetchCharacterInfo: mocks.fetchCharacterInfo,
  fetchCharacterRoles: mocks.fetchCharacterRoles,
  exchangeCodeForTokens: mocks.exchangeCodeForTokens,
}))

vi.mock('./pkce.js', () => ({
  generateCodeVerifier: mocks.generateCodeVerifier,
  generateCodeChallenge: mocks.generateCodeChallenge,
}))

vi.mock('./html-responses.js', () => ({
  SUCCESS_HTML: mocks.SUCCESS_HTML,
  ERROR_HTML: mocks.ERROR_HTML,
  sendHtmlResponse: mocks.sendHtmlResponse,
}))

vi.mock('electron', () => ({
  shell: { openExternal: mocks.openExternal },
}))

const httpMock = vi.hoisted(() => {
  type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void
  type EventCallback = (...args: unknown[]) => void

  interface MockServer {
    listening: boolean
    listen: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    on: (event: string, cb: EventCallback) => MockServer
    emit: (event: string, ...args: unknown[]) => boolean
  }

  let mockServerInstance: MockServer
  let requestHandler: RequestHandler | null = null

  const createMockServer = () => {
    const listeners: Map<string, EventCallback[]> = new Map()

    const server: MockServer = {
      listening: false,
      listen: vi.fn((_port: number, _host: string, callback: () => void) => {
        server.listening = true
        callback()
        return server
      }),
      close: vi.fn(() => {
        server.listening = false
      }),
      on: (event: string, cb: EventCallback) => {
        if (!listeners.has(event)) listeners.set(event, [])
        listeners.get(event)!.push(cb)
        return server
      },
      emit: (event: string, ...args: unknown[]) => {
        const cbs = listeners.get(event)
        if (cbs) cbs.forEach((cb) => cb(...args))
        return !!cbs
      },
    }
    mockServerInstance = server
    return server
  }

  return {
    createMockServer,
    getMockServer: () => mockServerInstance,
    getRequestHandler: () => requestHandler,
    createServer: vi.fn((handler: RequestHandler) => {
      requestHandler = handler
      return mockServerInstance
    }),
  }
})

vi.mock('node:http', () => {
  const mockModule = {
    createServer: httpMock.createServer,
  }
  return {
    ...mockModule,
    default: mockModule,
  }
})

import { refreshAccessToken, revokeToken, startAuth, cancelAuth } from './index'

function createMockRequest(url: string): IncomingMessage {
  return { url } as IncomingMessage
}

function createMockResponse(): ServerResponse & { endCalled: boolean } {
  const res: {
    endCalled: boolean
    writeHead: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
  } = {
    endCalled: false,
    writeHead: vi.fn(),
    end: vi.fn(() => {
      res.endCalled = true
    }),
  }
  return res as unknown as ServerResponse & { endCalled: boolean }
}

describe('Auth Service', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('EVE_CLIENT_ID', 'test-client-id')
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    httpMock.createMockServer()
    mocks.openExternal.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  describe('refreshAccessToken', () => {
    it('refreshes token successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 1200,
        }),
      })
      mocks.verifyToken.mockResolvedValue({
        sub: 'CHARACTER:EVE:12345678',
        name: 'Test Character',
        scp: ['esi-assets.read_assets.v1'],
      })
      mocks.extractCharacterId.mockReturnValue(12345678)
      mocks.extractScopes.mockReturnValue(['esi-assets.read_assets.v1'])
      mocks.fetchCharacterInfo.mockResolvedValue({ corporation_id: 98000001 })

      const result = await refreshAccessToken('old-refresh-token')

      expect(result.success).toBe(true)
      expect(result.accessToken).toBe('new-access-token')
      expect(result.refreshToken).toBe('new-refresh-token')
      expect(result.characterId).toBe(12345678)
      expect(result.characterName).toBe('Test Character')
      expect(result.corporationId).toBe(98000001)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://login.eveonline.com/v2/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      )
    })

    it('sends correct refresh token request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 1200,
        }),
      })
      mocks.verifyToken.mockResolvedValue({
        sub: 'CHARACTER:EVE:123',
        name: 'Test',
        scp: [],
      })
      mocks.extractCharacterId.mockReturnValue(123)
      mocks.extractScopes.mockReturnValue([])
      mocks.fetchCharacterInfo.mockResolvedValue({ corporation_id: 1 })

      await refreshAccessToken('my-refresh-token')

      const call = mockFetch.mock.calls[0]!
      const body = call[1].body as URLSearchParams
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('my-refresh-token')
      expect(body.get('client_id')).toBe('test-client-id')
    })

    it('returns error on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'invalid_grant',
      })

      const result = await refreshAccessToken('invalid-refresh-token')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Token refresh failed')
      expect(result.error).toContain('invalid_grant')
    })

    it('returns error on 401 unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      const result = await refreshAccessToken('expired-token')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Token refresh failed')
    })

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await refreshAccessToken('refresh-token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
      expect(mocks.logger.error).toHaveBeenCalled()
    })

    it('handles token verification failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'bad-token',
          refresh_token: 'refresh',
          expires_in: 1200,
        }),
      })
      mocks.verifyToken.mockRejectedValue(new Error('Invalid token signature'))

      const result = await refreshAccessToken('refresh-token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid token signature')
    })

    it('handles character info fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 1200,
        }),
      })
      mocks.verifyToken.mockResolvedValue({
        sub: 'CHARACTER:EVE:123',
        name: 'Test',
        scp: [],
      })
      mocks.extractCharacterId.mockReturnValue(123)
      mocks.fetchCharacterInfo.mockRejectedValue(new Error('ESI unavailable'))

      const result = await refreshAccessToken('refresh-token')

      expect(result.success).toBe(false)
      expect(result.error).toBe('ESI unavailable')
    })

    it('calculates expiry time correctly', async () => {
      const now = Date.now()
      vi.setSystemTime(now)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 1200,
        }),
      })
      mocks.verifyToken.mockResolvedValue({
        sub: 'CHARACTER:EVE:123',
        name: 'Test',
        scp: [],
      })
      mocks.extractCharacterId.mockReturnValue(123)
      mocks.extractScopes.mockReturnValue([])
      mocks.fetchCharacterInfo.mockResolvedValue({ corporation_id: 1 })

      const result = await refreshAccessToken('refresh-token')

      expect(result.success).toBe(true)
      expect(result.expiresAt).toBe(now + 1200 * 1000)
    })
  })

  describe('revokeToken', () => {
    it('revokes token successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await revokeToken('refresh-token')

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://login.eveonline.com/v2/oauth/revoke',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      )
      expect(mocks.logger.info).toHaveBeenCalledWith(
        'Token revoked successfully',
        expect.any(Object)
      )
    })

    it('sends correct revocation request body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await revokeToken('my-refresh-token')

      const call = mockFetch.mock.calls[0]!
      const body = call[1].body as URLSearchParams
      expect(body.get('client_id')).toBe('test-client-id')
      expect(body.get('token_type_hint')).toBe('refresh_token')
      expect(body.get('token')).toBe('my-refresh-token')
    })

    it('returns false on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 })

      const result = await revokeToken('invalid-token')

      expect(result).toBe(false)
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'Token revocation failed',
        expect.objectContaining({ status: 400 })
      )
    })

    it('returns false on server error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

      const result = await revokeToken('token')

      expect(result).toBe(false)
    })

    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await revokeToken('refresh-token')

      expect(result).toBe(false)
      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Token revocation exception',
        expect.any(Error),
        expect.any(Object)
      )
    })

    it('handles non-Error exceptions', async () => {
      mockFetch.mockRejectedValueOnce('String error')

      const result = await revokeToken('refresh-token')

      expect(result).toBe(false)
    })
  })

  describe('startAuth', () => {
    it('returns error when EVE_CLIENT_ID is not set', async () => {
      vi.stubEnv('EVE_CLIENT_ID', '')

      const result = await startAuth()

      expect(result.success).toBe(false)
      expect(result.error).toContain('EVE_CLIENT_ID')
    })

    it('starts callback server and opens browser', async () => {
      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      expect(httpMock.getMockServer().listen).toHaveBeenCalledWith(
        52742,
        '127.0.0.1',
        expect.any(Function)
      )
      expect(mocks.openExternal).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://login.eveonline.com/v2/oauth/authorize'
        )
      )

      cancelAuth()
      await authPromise
    })

    it('includes correct OAuth parameters in auth URL', async () => {
      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      const authUrl = mocks.openExternal.mock.calls[0]![0] as string
      expect(authUrl).toContain('response_type=code')
      expect(authUrl).toContain('client_id=test-client-id')
      expect(authUrl).toContain(
        'redirect_uri=http%3A%2F%2Flocalhost%3A52742%2Fcallback'
      )
      expect(authUrl).toContain('code_challenge=test-code-challenge')
      expect(authUrl).toContain('code_challenge_method=S256')

      cancelAuth()
      await authPromise
    })

    it('uses character scopes by default', async () => {
      const authPromise = startAuth(false)
      await vi.advanceTimersByTimeAsync(0)

      const authUrl = mocks.openExternal.mock.calls[0]![0] as string
      expect(authUrl).toContain('esi-assets.read_assets.v1')
      expect(authUrl).not.toContain('esi-assets.read_corporation_assets.v1')

      cancelAuth()
      await authPromise
    })

    it('includes corporation scopes when requested', async () => {
      const authPromise = startAuth(true)
      await vi.advanceTimersByTimeAsync(0)

      const authUrl = mocks.openExternal.mock.calls[0]![0] as string
      expect(authUrl).toContain('esi-assets.read_corporation_assets.v1')

      cancelAuth()
      await authPromise
    })

    it('times out after AUTH_TIMEOUT_MS', async () => {
      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

      const result = await authPromise
      expect(result.success).toBe(false)
      expect(result.error).toBe('Authentication timed out')
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'Authentication timed out',
        expect.any(Object)
      )
    })

    it('returns error when browser fails to open', async () => {
      mocks.openExternal.mockRejectedValueOnce(new Error('No browser'))

      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      const result = await authPromise
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to open browser')
    })

    it('returns error when server fails to start', async () => {
      const mockServer = httpMock.getMockServer()
      mockServer.listen = vi.fn((_port, _host, _cb) => {
        mockServer.emit('error', new Error('Port in use'))
        return mockServer
      })

      const result = await startAuth()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to start callback server')
    })

    it('cancels previous pending auth when starting new one', async () => {
      const firstAuthPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      httpMock.createMockServer()
      const secondAuthPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      const firstResult = await firstAuthPromise
      expect(firstResult.success).toBe(false)
      expect(firstResult.error).toBe('Authentication cancelled')

      cancelAuth()
      await secondAuthPromise
    })
  })

  describe('cancelAuth', () => {
    it('cancels pending authentication', async () => {
      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      cancelAuth()

      const result = await authPromise
      expect(result.success).toBe(false)
      expect(result.error).toBe('Authentication cancelled')
      expect(httpMock.getMockServer().close).toHaveBeenCalled()
    })

    it('does nothing when no pending auth', () => {
      expect(() => cancelAuth()).not.toThrow()
    })
  })

  describe('callback handling', () => {
    it('returns 404 for non-callback paths', async () => {
      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      const req = createMockRequest('/other-path')
      const res = createMockResponse()
      await httpMock.getRequestHandler()!(req, res)

      expect(res.writeHead).toHaveBeenCalledWith(404)
      expect(res.end).toHaveBeenCalledWith('Not found')

      cancelAuth()
      await authPromise
    })

    it('handles callback with no pending auth', async () => {
      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)
      cancelAuth()
      await authPromise

      httpMock.createMockServer()
      const secondAuthPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)
      cancelAuth()
      await secondAuthPromise

      const req = createMockRequest('/callback?code=test&state=test')
      const res = createMockResponse()
      await httpMock.getRequestHandler()!(req, res)

      expect(mocks.sendHtmlResponse).toHaveBeenCalledWith(
        res,
        400,
        expect.stringContaining('No pending authentication')
      )
    })

    it('rejects callback with mismatched state (CSRF protection)', async () => {
      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      const req = createMockRequest(
        '/callback?code=test-code&state=wrong-state'
      )
      const res = createMockResponse()
      await httpMock.getRequestHandler()!(req, res)

      const result = await authPromise
      expect(result.success).toBe(false)
      expect(result.error).toContain('CSRF')
      expect(mocks.sendHtmlResponse).toHaveBeenCalledWith(
        res,
        400,
        expect.stringContaining('State mismatch')
      )
    })

    it('handles OAuth error in callback', async () => {
      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      const authUrl = mocks.openExternal.mock.calls[0]![0] as string
      const state = new URL(authUrl).searchParams.get('state')

      const req = createMockRequest(
        `/callback?error=access_denied&state=${state}`
      )
      const res = createMockResponse()
      await httpMock.getRequestHandler()!(req, res)

      const result = await authPromise
      expect(result.success).toBe(false)
      expect(result.error).toBe('access_denied')
    })

    it('handles callback with no authorization code', async () => {
      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      const authUrl = mocks.openExternal.mock.calls[0]![0] as string
      const state = new URL(authUrl).searchParams.get('state')

      const req = createMockRequest(`/callback?state=${state}`)
      const res = createMockResponse()
      await httpMock.getRequestHandler()!(req, res)

      const result = await authPromise
      expect(result.success).toBe(false)
      expect(result.error).toBe('No authorization code received')
    })

    it('completes successful authentication flow', async () => {
      mocks.exchangeCodeForTokens.mockResolvedValue({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 1200,
      })
      mocks.verifyToken.mockResolvedValue({
        sub: 'CHARACTER:EVE:12345678',
        name: 'Test Pilot',
        scp: ['esi-assets.read_assets.v1'],
      })
      mocks.extractCharacterId.mockReturnValue(12345678)
      mocks.extractScopes.mockReturnValue(['esi-assets.read_assets.v1'])
      mocks.fetchCharacterInfo.mockResolvedValue({ corporation_id: 98000001 })
      mocks.fetchCharacterRoles.mockResolvedValue({ roles: ['Director'] })

      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      const authUrl = mocks.openExternal.mock.calls[0]![0] as string
      const state = new URL(authUrl).searchParams.get('state')

      const req = createMockRequest(`/callback?code=auth-code&state=${state}`)
      const res = createMockResponse()
      await httpMock.getRequestHandler()!(req, res)

      const result = await authPromise
      expect(result.success).toBe(true)
      expect(result.accessToken).toBe('test-access-token')
      expect(result.refreshToken).toBe('test-refresh-token')
      expect(result.characterId).toBe(12345678)
      expect(result.characterName).toBe('Test Pilot')
      expect(result.corporationId).toBe(98000001)
      expect(result.scopes).toEqual(['esi-assets.read_assets.v1'])
      expect(result.corporationRoles).toEqual({ roles: ['Director'] })
      expect(mocks.exchangeCodeForTokens).toHaveBeenCalledWith(
        'auth-code',
        'test-code-verifier'
      )
    })

    it('handles token exchange failure', async () => {
      mocks.exchangeCodeForTokens.mockRejectedValue(
        new Error('Token exchange failed')
      )

      const authPromise = startAuth()
      await vi.advanceTimersByTimeAsync(0)

      const authUrl = mocks.openExternal.mock.calls[0]![0] as string
      const state = new URL(authUrl).searchParams.get('state')

      const req = createMockRequest(`/callback?code=bad-code&state=${state}`)
      const res = createMockResponse()
      await httpMock.getRequestHandler()!(req, res)

      const result = await authPromise
      expect(result.success).toBe(false)
      expect(result.error).toBe('Token exchange failed')
      expect(mocks.sendHtmlResponse).toHaveBeenCalledWith(
        res,
        500,
        expect.stringContaining('Token exchange failed')
      )
    })
  })
})
