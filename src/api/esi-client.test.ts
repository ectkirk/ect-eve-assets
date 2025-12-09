import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ESI_BASE_URL, ESI_COMPATIBILITY_DATE, ESI_USER_AGENT } from './esi-client'

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
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    vi.clearAllMocks()
  })

  describe('fetch', () => {
    it('adds required headers to requests', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ test: 'data' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: '"abc123"',
            Expires: new Date(Date.now() + 60000).toUTCString(),
          },
        })
      )

      const { esiClient } = await import('./esi-client')
      await esiClient.fetch('/test/endpoint')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/test/endpoint'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
            'User-Agent': ESI_USER_AGENT,
            Authorization: 'Bearer test-token',
          }),
        })
      )
    })

    it('caches responses with ETag and Expires', async () => {
      const futureDate = new Date(Date.now() + 60000).toUTCString()
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ cached: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: '"etag123"',
            Expires: futureDate,
          },
        })
      )

      const { esiClient } = await import('./esi-client')
      esiClient.clearCache()

      await esiClient.fetch('/cacheable')
      fetchSpy.mockClear()
      const result = await esiClient.fetch('/cacheable')

      expect(result).toEqual({ cached: true })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('sends If-None-Match header for cached requests with stale data', async () => {
      const pastDate = new Date(Date.now() - 1000).toUTCString()
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ initial: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: '"first-etag"',
            Expires: pastDate,
          },
        })
      )

      const { esiClient } = await import('./esi-client')
      esiClient.clearCache()

      await esiClient.fetch('/etag-test')

      fetchSpy.mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: { Expires: new Date(Date.now() + 60000).toUTCString() },
        })
      )

      await esiClient.fetch('/etag-test')

      const calls = fetchSpy.mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall).toBeDefined()
      const headers = lastCall![1]?.headers as Record<string, string>
      expect(headers['If-None-Match']).toBe('"first-etag"')
    })

    it('handles 304 Not Modified responses', async () => {
      const pastDate = new Date(Date.now() - 1000).toUTCString()
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'original' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: '"orig"',
            Expires: pastDate,
          },
        })
      )

      const { esiClient } = await import('./esi-client')
      esiClient.clearCache()

      await esiClient.fetch('/not-modified-test')

      fetchSpy.mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: { Expires: new Date(Date.now() + 60000).toUTCString() },
        })
      )

      const result = await esiClient.fetch('/not-modified-test')
      expect(result).toEqual({ data: 'original' })
    })

    it('throws on rate limit (420)', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Rate limited' }), {
          status: 420,
          headers: { 'Retry-After': '60' },
        })
      )

      const { esiClient } = await import('./esi-client')
      esiClient.clearCache()

      await expect(esiClient.fetch('/rate-limited', { skipQueue: true })).rejects.toThrow(
        /Rate limited/
      )
    })

    it('throws on rate limit (429)', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: { 'Retry-After': '30' },
        })
      )

      const { esiClient } = await import('./esi-client')
      esiClient.clearCache()

      await expect(esiClient.fetch('/too-many', { skipQueue: true })).rejects.toThrow(/Rate limited/)
    })

    it('throws on error responses', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Character not found' }), {
          status: 404,
        })
      )

      const { esiClient } = await import('./esi-client')

      await expect(esiClient.fetch('/not-found', { skipQueue: true })).rejects.toThrow(
        'Character not found'
      )
    })

    it('throws generic error for non-JSON error responses', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 })
      )

      const { esiClient } = await import('./esi-client')

      await expect(esiClient.fetch('/server-error', { skipQueue: true })).rejects.toThrow(
        /ESI request failed: 500/
      )
    })
  })

  describe('fetchPublic', () => {
    it('does not add Authorization header', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ public: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: '"pub"',
            Expires: new Date(Date.now() + 60000).toUTCString(),
          },
        })
      )

      const { esiClient } = await import('./esi-client')
      await esiClient.fetchPublic('/public/endpoint')

      const headers = fetchSpy.mock.calls[0]![1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBeUndefined()
    })
  })

  describe('rate limit tracking', () => {
    it('reports not rate limited initially', async () => {
      const { esiClient } = await import('./esi-client')
      expect(esiClient.isRateLimited()).toBe(false)
    })

    it('returns rate limit info', async () => {
      const { esiClient } = await import('./esi-client')
      const info = esiClient.getRateLimitInfo()
      expect(info).toHaveProperty('isLimited')
      expect(info).toHaveProperty('retryAfter')
    })
  })

  describe('clearCache', () => {
    it('clears the cache', async () => {
      const createResponse = () =>
        new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: '"clear"',
            Expires: new Date(Date.now() + 60000).toUTCString(),
          },
        })

      fetchSpy.mockResolvedValueOnce(createResponse())

      const { esiClient } = await import('./esi-client')
      esiClient.clearCache()

      await esiClient.fetch('/clear-test')
      const callCount1 = fetchSpy.mock.calls.length

      esiClient.clearCache()
      fetchSpy.mockResolvedValueOnce(createResponse())
      await esiClient.fetch('/clear-test')
      const callCount2 = fetchSpy.mock.calls.length

      expect(callCount2).toBe(callCount1 + 1)
    })
  })

  describe('fetchWithPagination', () => {
    it('fetches single page when X-Pages is 1', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Pages': '1',
          },
        })
      )

      const { esiClient } = await import('./esi-client')
      const results = await esiClient.fetchWithPagination<{ id: number }>('/paginated')

      expect(results).toEqual([{ id: 1 }, { id: 2 }])
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('fetches multiple pages and concatenates results', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 1 }]), {
            status: 200,
            headers: { 'X-Pages': '3' },
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 2 }]), {
            status: 200,
            headers: { 'X-Pages': '3' },
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 3 }]), {
            status: 200,
            headers: { 'X-Pages': '3' },
          })
        )

      const { esiClient } = await import('./esi-client')
      const results = await esiClient.fetchWithPagination<{ id: number }>('/multi-page')

      expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('appends page parameter correctly to URLs with existing query', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'X-Pages': '1' },
        })
      )

      const { esiClient } = await import('./esi-client')
      await esiClient.fetchWithPagination('/endpoint?filter=active')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('?filter=active&page=1'),
        expect.any(Object)
      )
    })

    it('throws on rate limit during pagination', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Rate limited' }), {
          status: 420,
          headers: { 'Retry-After': '60' },
        })
      )

      const { esiClient } = await import('./esi-client')

      await expect(esiClient.fetchWithPagination('/rate-limited-page')).rejects.toThrow(
        /Rate limited/
      )
    })

    it('throws on error response during pagination', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
      )

      const { esiClient } = await import('./esi-client')

      await expect(esiClient.fetchWithPagination('/forbidden')).rejects.toThrow('Forbidden')
    })

    it('works without auth when requiresAuth is false', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify([{ public: true }]), {
          status: 200,
          headers: { 'X-Pages': '1' },
        })
      )

      const { esiClient } = await import('./esi-client')
      const results = await esiClient.fetchWithPagination('/public', { requiresAuth: false })

      expect(results).toEqual([{ public: true }])
      const headers = fetchSpy.mock.calls[0]![1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBeUndefined()
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

  describe('rate limit state tracking', () => {
    it('tracks rate limit from response headers', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Ratelimit-Remaining': '100',
            'X-Ratelimit-Limit': '150; window=60',
            'X-Ratelimit-Group': 'esi-characters',
            ETag: '"test"',
            Expires: new Date(Date.now() + 60000).toUTCString(),
          },
        })
      )

      const { esiClient } = await import('./esi-client')
      await esiClient.fetch('/tracked', { skipQueue: true })

      expect(esiClient.isRateLimited()).toBe(false)
    })

    it('sets global retry after on rate limit', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Rate limited' }), {
          status: 420,
          headers: { 'Retry-After': '30' },
        })
      )

      const { esiClient } = await import('./esi-client')

      try {
        await esiClient.fetch('/trigger-limit', { skipQueue: true })
      } catch {
        // Expected
      }

      expect(esiClient.isRateLimited()).toBe(true)
      const info = esiClient.getRateLimitInfo()
      expect(info.isLimited).toBe(true)
      expect(info.retryAfter).toBeGreaterThan(0)
    })

    it('uses default 60s retry when Retry-After header missing', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Rate limited' }), {
          status: 429,
          headers: {},
        })
      )

      const { esiClient } = await import('./esi-client')

      try {
        await esiClient.fetch('/no-retry-header', { skipQueue: true })
      } catch {
        // Expected
      }

      const info = esiClient.getRateLimitInfo()
      expect(info.retryAfter).toBeGreaterThanOrEqual(59000)
    })
  })

  describe('request queue', () => {
    it('queues requests by default', async () => {
      const responses = [
        new Response(JSON.stringify({ n: 1 }), {
          status: 200,
          headers: { ETag: '"1"', Expires: new Date(Date.now() + 60000).toUTCString() },
        }),
        new Response(JSON.stringify({ n: 2 }), {
          status: 200,
          headers: { ETag: '"2"', Expires: new Date(Date.now() + 60000).toUTCString() },
        }),
      ]
      fetchSpy.mockResolvedValueOnce(responses[0]).mockResolvedValueOnce(responses[1])

      const { esiClient } = await import('./esi-client')
      esiClient.clearCache()

      const [r1, r2] = await Promise.all([
        esiClient.fetch('/queue-1'),
        esiClient.fetch('/queue-2'),
      ])

      expect(r1).toEqual({ n: 1 })
      expect(r2).toEqual({ n: 2 })
    })

    it('skips queue when skipQueue is true', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ immediate: true }), {
          status: 200,
          headers: { ETag: '"skip"', Expires: new Date(Date.now() + 60000).toUTCString() },
        })
      )

      const { esiClient } = await import('./esi-client')
      esiClient.clearCache()

      const result = await esiClient.fetch('/skip-queue', { skipQueue: true })
      expect(result).toEqual({ immediate: true })
    })
  })
})
