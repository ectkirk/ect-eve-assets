import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest'
import { ESIError } from '../../../shared/esi-types'

const mocks = vi.hoisted(() => ({
  ensureHealthy: vi.fn(),
  getHealthStatus: vi.fn(),
  getCachedStatus: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-user-data',
    getVersion: () => '1.0.0-test',
  },
}))

vi.mock('fs', () => ({
  existsSync: () => false,
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('./health', () => ({
  ESIHealthChecker: class MockHealthChecker {
    ensureHealthy = mocks.ensureHealthy
    getHealthStatus = mocks.getHealthStatus
    getCachedStatus = mocks.getCachedStatus
  },
}))

import { MainESIService, getESIService } from './index'

describe('MainESIService', () => {
  let service: MainESIService
  let mockFetch: Mock

  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    mocks.ensureHealthy.mockResolvedValue({ healthy: true })
    mocks.getHealthStatus.mockResolvedValue({
      healthy: true,
      status: 'healthy',
      routes: [],
      fetchedAt: Date.now(),
    })
    mocks.getCachedStatus.mockReturnValue(null)
    service = new MainESIService()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('fetch', () => {
    it('makes a successful GET request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          Expires: new Date(Date.now() + 60000).toUTCString(),
          ETag: '"abc123"',
        }),
        json: async () => ({ id: 1, name: 'Test' }),
      })

      const result = await service.fetch<{ id: number; name: string }>(
        '/test/endpoint'
      )
      expect(result).toEqual({ id: 1, name: 'Test' })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://esi.evetech.net/test/endpoint',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Compatibility-Date': '2025-11-06',
          }),
        })
      )
    })

    it('throws ESIError on failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({}),
        json: async () => ({ error: 'Not found' }),
      })

      await expect(service.fetch('/missing')).rejects.toThrow(ESIError)
    })

    it('adds authorization header when characterId is provided', async () => {
      const mockToken = 'test-access-token'
      service.setTokenProvider(async () => mockToken)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          Expires: new Date(Date.now() + 60000).toUTCString(),
        }),
        json: async () => ({ assets: [] }),
      })

      await service.fetch('/characters/123/assets', { characterId: 123 })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      )
    })

    it('returns error when token provider fails', async () => {
      service.setTokenProvider(async () => {
        throw new Error('Token expired')
      })

      await expect(
        service.fetch('/characters/123/assets', { characterId: 123 })
      ).rejects.toThrow(ESIError)
    })

    it('returns error when no token provider is set', async () => {
      await expect(
        service.fetch('/characters/123/assets', { characterId: 123 })
      ).rejects.toMatchObject({
        message: 'No token provider configured',
      })
    })
  })

  describe('fetchWithMeta', () => {
    it('returns data with metadata', async () => {
      const expiresAt = Date.now() + 60000
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          Expires: new Date(expiresAt).toUTCString(),
          ETag: '"meta-etag"',
        }),
        json: async () => ({ value: 42 }),
      })

      const result = await service.fetchWithMeta<{ value: number }>(
        '/test/meta'
      )
      expect(result.data).toEqual({ value: 42 })
      expect(result.etag).toBe('"meta-etag"')
      expect(result.notModified).toBe(false)
    })

    it('returns cached data for 304 response', async () => {
      const expiresAt = Date.now() + 60000
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          Expires: new Date(expiresAt).toUTCString(),
          ETag: '"cached-etag"',
        }),
        json: async () => ({ cached: true }),
      })

      await service.fetchWithMeta('/test/cached')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 304,
        headers: new Headers({
          Expires: new Date(expiresAt + 60000).toUTCString(),
          ETag: '"cached-etag"',
        }),
        json: async () => null,
      })

      const result = await service.fetchWithMeta('/test/cached', {
        etag: '"cached-etag"',
      })
      expect(result.notModified).toBe(true)
      expect(result.data).toEqual({ cached: true })
    })
  })

  describe('fetchPaginated', () => {
    it('fetches single page', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          Expires: new Date(Date.now() + 60000).toUTCString(),
          'X-Pages': '1',
        }),
        json: async () => [{ id: 1 }, { id: 2 }],
      })

      const result = await service.fetchPaginated<{ id: number }>(
        '/test/paginated'
      )
      expect(result).toEqual([{ id: 1 }, { id: 2 }])
    })

    it('fetches multiple pages sequentially', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            Expires: new Date(Date.now() + 60000).toUTCString(),
            'X-Pages': '2',
          }),
          json: async () => [{ id: 1 }],
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            Expires: new Date(Date.now() + 60000).toUTCString(),
          }),
          json: async () => [{ id: 2 }],
        })

      const result = await service.fetchPaginated<{ id: number }>('/test/multi')
      expect(result).toEqual([{ id: 1 }, { id: 2 }])
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('fetchPaginatedWithProgress', () => {
    it('reports progress during pagination', async () => {
      const progressCalls: { current: number; total: number }[] = []

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            Expires: new Date(Date.now() + 60000).toUTCString(),
            'X-Pages': '3',
          }),
          json: async () => [{ id: 1 }],
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            Expires: new Date(Date.now() + 60000).toUTCString(),
          }),
          json: async () => [{ id: 2 }],
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            Expires: new Date(Date.now() + 60000).toUTCString(),
          }),
          json: async () => [{ id: 3 }],
        })

      await service.fetchPaginatedWithProgress<{ id: number }>(
        '/test/progress',
        {},
        (p) => progressCalls.push(p)
      )

      expect(progressCalls).toContainEqual({ current: 1, total: 3 })
    })
  })

  describe('rate limiting', () => {
    it('handles 429 rate limit response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({
            'Retry-After': '1',
          }),
          json: async () => ({ error: 'Rate limited' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            Expires: new Date(Date.now() + 60000).toUTCString(),
          }),
          json: async () => ({ success: true }),
        })

      const fetchPromise = service.fetch('/test/rate-limited')
      await vi.advanceTimersByTimeAsync(1100)
      const result = await fetchPromise

      expect(result).toEqual({ success: true })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('handles 420 rate limit response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 420,
          headers: new Headers({
            'Retry-After': '1',
          }),
          json: async () => ({ error: 'Enhance your calm' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            Expires: new Date(Date.now() + 60000).toUTCString(),
          }),
          json: async () => ({ calm: true }),
        })

      const fetchPromise = service.fetch('/test/enhance-calm')
      await vi.advanceTimersByTimeAsync(1100)
      const result = await fetchPromise

      expect(result).toEqual({ calm: true })
    })
  })

  describe('health checking', () => {
    it('returns error when ESI is unhealthy', async () => {
      mocks.ensureHealthy.mockResolvedValueOnce({
        healthy: false,
        error: 'ESI service unavailable',
      })

      await expect(service.fetch('/test')).rejects.toMatchObject({
        status: 503,
      })
    })
  })

  describe('pause/resume', () => {
    it('pauses and resumes requests', async () => {
      service.pause()

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          Expires: new Date(Date.now() + 60000).toUTCString(),
        }),
        json: async () => ({ paused: false }),
      })

      const fetchPromise = service.fetch('/test/paused')

      await vi.advanceTimersByTimeAsync(50)
      expect(mockFetch).not.toHaveBeenCalled()

      service.resume()
      await vi.advanceTimersByTimeAsync(150)

      const result = await fetchPromise
      expect(result).toEqual({ paused: false })
    })
  })

  describe('request deduplication', () => {
    it('deduplicates concurrent GET requests to same endpoint', async () => {
      let resolveFirst: (value: Response) => void
      const firstFetchPromise = new Promise<Response>((resolve) => {
        resolveFirst = resolve
      })

      mockFetch.mockReturnValueOnce(firstFetchPromise)

      const request1 = service.fetch('/test/dedup')
      const request2 = service.fetch('/test/dedup')

      resolveFirst!({
        ok: true,
        status: 200,
        headers: new Headers({
          Expires: new Date(Date.now() + 60000).toUTCString(),
        }),
        json: async () => ({ id: 1 }),
      } as Response)

      const [result1, result2] = await Promise.all([request1, request2])

      expect(result1).toEqual({ id: 1 })
      expect(result2).toEqual({ id: 1 })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('does not deduplicate requests with different characterIds', async () => {
      service.setTokenProvider(async () => 'token')

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            Expires: new Date(Date.now() + 60000).toUTCString(),
          }),
          json: async () => ({ id: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            Expires: new Date(Date.now() + 60000).toUTCString(),
          }),
          json: async () => ({ id: 2 }),
        })

      const request1 = service.fetch('/test/endpoint', { characterId: 111 })
      const request2 = service.fetch('/test/endpoint', { characterId: 222 })

      const [result1, result2] = await Promise.all([request1, request2])

      expect(result1).toEqual({ id: 1 })
      expect(result2).toEqual({ id: 2 })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('cache operations', () => {
    it('clears cache', () => {
      expect(() => service.clearCache()).not.toThrow()
    })

    it('clears cache by pattern', () => {
      const count = service.clearCacheByPattern('/characters/')
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getRateLimitInfo', () => {
    it('returns rate limit info', () => {
      const info = service.getRateLimitInfo()
      expect(info).toHaveProperty('globalRetryAfter')
      expect(info).toHaveProperty('activeRequests')
    })
  })

  describe('getHealthStatus', () => {
    it('returns health status', async () => {
      const status = await service.getHealthStatus()
      expect(status).toHaveProperty('healthy')
      expect(status).toHaveProperty('status')
    })
  })
})

describe('getESIService', () => {
  it('returns singleton instance', () => {
    const instance1 = getESIService()
    const instance2 = getESIService()
    expect(instance1).toBe(instance2)
  })
})
