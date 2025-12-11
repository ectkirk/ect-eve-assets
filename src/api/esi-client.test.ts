import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { ESI_BASE_URL, ESI_COMPATIBILITY_DATE, ESI_USER_AGENT, ESIError } from './esi-client'

const mockEsiRequest = vi.fn()
const mockEsiClearCache = vi.fn()
const mockOnEsiRequestToken = vi.fn(() => vi.fn())
const mockEsiProvideToken = vi.fn()

vi.stubGlobal('window', {
  electronAPI: {
    esiRequest: mockEsiRequest,
    esiClearCache: mockEsiClearCache,
    onEsiRequestToken: mockOnEsiRequestToken,
    esiProvideToken: mockEsiProvideToken,
    refreshToken: vi.fn(),
  },
})

vi.mock('@/store/auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      getActiveOwner: vi.fn(() => ({
        id: 12345,
        characterId: 12345,
        name: 'Test',
        type: 'character',
        accessToken: 'test-token',
      })),
      getOwner: vi.fn(() => ({
        id: 12345,
        characterId: 12345,
        name: 'Test',
        type: 'character',
        accessToken: 'test-token',
      })),
      getOwnerByCharacterId: vi.fn(() => ({
        id: 12345,
        characterId: 12345,
        name: 'Test',
        type: 'character',
        accessToken: 'test-token',
      })),
      isOwnerTokenExpired: vi.fn(() => false),
      updateOwnerTokens: vi.fn(),
    })),
  },
  ownerKey: vi.fn((type: string, id: number) => `${type}-${id}`),
}))

describe('ESI Client Constants', () => {
  it('has correct base URL', () => {
    expect(ESI_BASE_URL).toBe('https://esi.evetech.net')
  })

  it('has compatibility date', () => {
    expect(ESI_COMPATIBILITY_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('has user agent with app name and contact', () => {
    expect(ESI_USER_AGENT).toContain('ECTEVEAssets')
    expect(ESI_USER_AGENT).toContain('edencom.net')
  })
})

describe('ESIClient', () => {
  beforeEach(() => {
    vi.resetModules()
    mockEsiRequest.mockReset()
    mockEsiClearCache.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetch', () => {
    it('calls IPC with correct parameters', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: { test: 'data' },
      })

      const { esiClient } = await import('./esi-client')
      await esiClient.fetch('/test/endpoint', { characterId: 12345 })

      expect(mockEsiRequest).toHaveBeenCalledWith('fetch', '/test/endpoint', {
        method: 'GET',
        body: undefined,
        characterId: 12345,
        requiresAuth: true,
      })
    })

    it('passes POST method and body', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: { created: true },
      })

      const { esiClient } = await import('./esi-client')
      await esiClient.fetch('/post/endpoint', {
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
        characterId: 123,
      })

      expect(mockEsiRequest).toHaveBeenCalledWith('fetch', '/post/endpoint', {
        method: 'POST',
        body: '{"foo":"bar"}',
        characterId: 123,
        requiresAuth: true,
      })
    })

    it('returns data from successful IPC response', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: { id: 42, name: 'Test' },
      })

      const { esiClient } = await import('./esi-client')
      const result = await esiClient.fetch<{ id: number; name: string }>('/test')

      expect(result).toEqual({ id: 42, name: 'Test' })
    })

    it('throws ESIError on IPC failure', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: false,
        error: 'Not found',
        status: 404,
      })

      const { esiClient } = await import('./esi-client')

      try {
        await esiClient.fetch('/not-found')
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).name).toBe('ESIError')
        expect((e as Error).message).toBe('Not found')
        expect((e as ESIError).status).toBe(404)
      }
    })

    it('validates response with schema', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: { id: 1, name: 'Valid' },
      })

      const schema = z.object({ id: z.number(), name: z.string() })
      const { esiClient } = await import('./esi-client')
      const result = await esiClient.fetch('/validated', { schema })

      expect(result).toEqual({ id: 1, name: 'Valid' })
    })

    it('throws on schema validation failure', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: { id: 'not-a-number', name: 'Invalid' },
      })

      const schema = z.object({ id: z.number(), name: z.string() })
      const { esiClient } = await import('./esi-client')

      await expect(esiClient.fetch('/invalid', { schema })).rejects.toThrow(/validation failed/)
    })

    it('uses 500 status when none provided', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: false,
        error: 'Unknown error',
      })

      const { esiClient } = await import('./esi-client')

      try {
        await esiClient.fetch('/error')
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).name).toBe('ESIError')
        expect((e as ESIError).status).toBe(500)
      }
    })
  })

  describe('fetchWithMeta', () => {
    it('calls IPC with fetchWithMeta method', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: {
          data: [{ id: 1 }],
          expiresAt: Date.now() + 60000,
          etag: '"abc123"',
          notModified: false,
        },
      })

      const { esiClient } = await import('./esi-client')
      await esiClient.fetchWithMeta('/assets', { characterId: 123 })

      expect(mockEsiRequest).toHaveBeenCalledWith('fetchWithMeta', '/assets', {
        method: 'GET',
        body: undefined,
        characterId: 123,
        requiresAuth: true,
        etag: undefined,
      })
    })

    it('passes etag to IPC', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: {
          data: [],
          expiresAt: Date.now() + 60000,
          etag: '"new-etag"',
          notModified: true,
        },
      })

      const { esiClient } = await import('./esi-client')
      await esiClient.fetchWithMeta('/assets', { characterId: 123, etag: '"old-etag"' })

      expect(mockEsiRequest).toHaveBeenCalledWith('fetchWithMeta', '/assets', {
        method: 'GET',
        body: undefined,
        characterId: 123,
        requiresAuth: true,
        etag: '"old-etag"',
      })
    })

    it('returns meta information', async () => {
      const expiresAt = Date.now() + 60000
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: {
          data: { id: 1 },
          expiresAt,
          etag: '"etag"',
          notModified: false,
        },
      })

      const { esiClient } = await import('./esi-client')
      const result = await esiClient.fetchWithMeta<{ id: number }>('/test')

      expect(result.expiresAt).toBe(expiresAt)
      expect(result.etag).toBe('"etag"')
      expect(result.notModified).toBe(false)
      expect(result.data).toEqual({ id: 1 })
    })

    it('validates data with schema when not notModified', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: {
          data: { id: 'invalid' },
          expiresAt: Date.now(),
          etag: null,
          notModified: false,
        },
      })

      const schema = z.object({ id: z.number() })
      const { esiClient } = await import('./esi-client')

      await expect(esiClient.fetchWithMeta('/test', { schema })).rejects.toThrow(/validation failed/)
    })

    it('skips validation when notModified', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: {
          data: { id: 'anything' },
          expiresAt: Date.now(),
          etag: '"etag"',
          notModified: true,
        },
      })

      const schema = z.object({ id: z.number() })
      const { esiClient } = await import('./esi-client')
      const result = await esiClient.fetchWithMeta('/test', { schema })

      expect(result.notModified).toBe(true)
    })
  })

  describe('fetchWithPagination', () => {
    it('calls IPC with fetchPaginated method', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: [{ id: 1 }, { id: 2 }],
      })

      const { esiClient } = await import('./esi-client')
      await esiClient.fetchWithPagination('/assets', { characterId: 123 })

      expect(mockEsiRequest).toHaveBeenCalledWith('fetchPaginated', '/assets', {
        characterId: 123,
        requiresAuth: undefined,
      })
    })

    it('returns array data', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
      })

      const { esiClient } = await import('./esi-client')
      const result = await esiClient.fetchWithPagination<{ id: number }>('/test')

      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    })

    it('validates with schema array', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: [{ id: 1 }, { id: 2 }],
      })

      const schema = z.object({ id: z.number() })
      const { esiClient } = await import('./esi-client')
      const result = await esiClient.fetchWithPagination('/test', { schema })

      expect(result).toEqual([{ id: 1 }, { id: 2 }])
    })

    it('throws on validation failure', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: [{ id: 'not-number' }],
      })

      const schema = z.object({ id: z.number() })
      const { esiClient } = await import('./esi-client')

      await expect(esiClient.fetchWithPagination('/test', { schema })).rejects.toThrow(/validation failed/)
    })

    it('throws on IPC error', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: false,
        error: 'Forbidden',
        status: 403,
      })

      const { esiClient } = await import('./esi-client')

      await expect(esiClient.fetchWithPagination('/forbidden')).rejects.toThrow('Forbidden')
    })
  })

  describe('fetchWithPaginationMeta', () => {
    it('returns data with meta information', async () => {
      const expiresAt = Date.now() + 60000
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: [{ id: 1 }],
        meta: { expiresAt, etag: '"etag"' },
      })

      const { esiClient } = await import('./esi-client')
      const result = await esiClient.fetchWithPaginationMeta<{ id: number }>('/test')

      expect(result.data).toEqual([{ id: 1 }])
      expect(result.expiresAt).toBe(expiresAt)
      expect(result.etag).toBe('"etag"')
    })

    it('uses default cache time when meta not provided', async () => {
      const before = Date.now()
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: [],
      })

      const { esiClient } = await import('./esi-client')
      const result = await esiClient.fetchWithPaginationMeta('/test')

      expect(result.expiresAt).toBeGreaterThanOrEqual(before + 5 * 60 * 1000 - 100)
    })
  })

  describe('fetchPublic', () => {
    it('calls fetch with requiresAuth false', async () => {
      mockEsiRequest.mockResolvedValueOnce({
        success: true,
        data: { public: true },
      })

      const { esiClient } = await import('./esi-client')
      await esiClient.fetchPublic('/public/endpoint')

      expect(mockEsiRequest).toHaveBeenCalledWith('fetch', '/public/endpoint', {
        method: 'GET',
        body: undefined,
        characterId: undefined,
        requiresAuth: false,
      })
    })
  })

  describe('fetchBatch', () => {
    it('processes items in batches', async () => {
      const { esiClient } = await import('./esi-client')
      const items = [1, 2, 3, 4, 5]
      const fetcher = vi.fn((n: number) => Promise.resolve(n * 2))

      const results = await esiClient.fetchBatch(items, fetcher, { batchSize: 2 })

      expect(results.size).toBe(5)
      expect(results.get(1)).toBe(2)
      expect(results.get(5)).toBe(10)
    })

    it('calls onProgress callback', async () => {
      const { esiClient } = await import('./esi-client')
      const items = [1, 2, 3]
      const fetcher = vi.fn((n: number) => Promise.resolve(n))
      const onProgress = vi.fn()

      await esiClient.fetchBatch(items, fetcher, { batchSize: 2, onProgress })

      expect(onProgress).toHaveBeenCalledWith(2, 3)
      expect(onProgress).toHaveBeenCalledWith(3, 3)
    })

    it('handles errors in individual fetches', async () => {
      const { esiClient } = await import('./esi-client')
      const items = [1, 2, 3]
      const fetcher = vi.fn((n: number) => {
        if (n === 2) return Promise.reject(new Error('Failed'))
        return Promise.resolve(n)
      })

      const results = await esiClient.fetchBatch(items, fetcher)

      expect(results.get(1)).toBe(1)
      expect(results.get(2)).toBeNull()
      expect(results.get(3)).toBe(3)
    })

    it('uses default batch size of 20', async () => {
      const { esiClient } = await import('./esi-client')
      const items = Array.from({ length: 25 }, (_, i) => i)
      const fetcher = vi.fn((n: number) => Promise.resolve(n))

      await esiClient.fetchBatch(items, fetcher)

      expect(fetcher).toHaveBeenCalledTimes(25)
    })
  })

  describe('rate limit info', () => {
    it('reports not rate limited', async () => {
      const { esiClient } = await import('./esi-client')
      expect(esiClient.isRateLimited()).toBe(false)
    })

    it('returns rate limit info', async () => {
      const { esiClient } = await import('./esi-client')
      const info = esiClient.getRateLimitInfo()
      expect(info).toEqual({ isLimited: false, retryAfter: null })
    })
  })

  describe('clearCache', () => {
    it('calls IPC clearCache', async () => {
      const { esiClient } = await import('./esi-client')
      esiClient.clearCache()

      expect(mockEsiClearCache).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('throws when electronAPI is not available', async () => {
      const originalWindow = global.window
      vi.stubGlobal('window', { electronAPI: undefined })

      vi.resetModules()
      const { esiClient } = await import('./esi-client')

      await expect(esiClient.fetch('/test')).rejects.toThrow('ESI requests require Electron environment')

      vi.stubGlobal('window', originalWindow)
    })
  })
})
