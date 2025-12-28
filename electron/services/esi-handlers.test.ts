import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IpcMainInvokeEvent, BrowserWindow } from 'electron'

const mocks = vi.hoisted(() => ({
  ipcMain: {
    handle: vi.fn(),
  },
  esiService: {
    setTokenProvider: vi.fn(),
    fetch: vi.fn(),
    fetchWithMeta: vi.fn(),
    fetchPaginated: vi.fn(),
    fetchPaginatedWithMeta: vi.fn(),
    fetchPaginatedWithProgress: vi.fn(),
    clearCache: vi.fn(),
    clearCacheByPattern: vi.fn(),
    getRateLimitInfo: vi.fn(),
    getHealthStatus: vi.fn(),
    getCachedHealthStatus: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  ipcMain: mocks.ipcMain,
}))

vi.mock('./esi/index.js', () => ({
  getESIService: () => mocks.esiService,
}))

vi.mock('./logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('./validation.js', () => ({
  isValidCharacterId: (v: unknown) =>
    typeof v === 'number' && Number.isInteger(v) && v > 0,
  isValidEndpoint: (v: unknown) => typeof v === 'string' && v.length > 0,
  isValidString: (v: unknown) => typeof v === 'string',
}))

import {
  setupESIService,
  registerESIHandlers,
  stopESIHandlers,
} from './esi-handlers'

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

function getRegisteredHandler(channel: string): IpcHandler {
  const call = mocks.ipcMain.handle.mock.calls.find(
    (c: unknown[]) => c[0] === channel
  )
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as IpcHandler
}

const mockEvent = {} as IpcMainInvokeEvent

describe('ESI Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('setupESIService', () => {
    it('sets up token provider', () => {
      const getMainWindow = vi.fn(() => null)
      setupESIService(getMainWindow as () => BrowserWindow | null)
      expect(mocks.esiService.setTokenProvider).toHaveBeenCalled()
    })
  })

  describe('stopESIHandlers', () => {
    it('cleans up pending requests', () => {
      stopESIHandlers()
    })
  })

  describe('registerESIHandlers', () => {
    beforeEach(() => {
      const mockWindow = {
        webContents: { send: vi.fn() },
        isDestroyed: () => false,
      }
      registerESIHandlers(() => mockWindow as unknown as BrowserWindow)
    })

    describe('esi:provideToken', () => {
      it('rejects invalid character ID', async () => {
        const handler = getRegisteredHandler('esi:provideToken')

        expect(await handler(mockEvent, 'not-a-number', 'token')).toEqual({
          success: false,
          error: 'Invalid character ID',
        })

        expect(await handler(mockEvent, -1, 'token')).toEqual({
          success: false,
          error: 'Invalid character ID',
        })

        expect(await handler(mockEvent, 0, 'token')).toEqual({
          success: false,
          error: 'Invalid character ID',
        })
      })

      it('accepts valid character ID', async () => {
        const handler = getRegisteredHandler('esi:provideToken')
        const result = await handler(mockEvent, 12345, 'token')
        expect(result).toEqual({ success: true })
      })

      it('handles null token', async () => {
        const handler = getRegisteredHandler('esi:provideToken')
        const result = await handler(mockEvent, 12345, null)
        expect(result).toEqual({ success: true })
      })
    })

    describe('esi:fetch', () => {
      it('rejects invalid endpoint', async () => {
        const handler = getRegisteredHandler('esi:fetch')

        await expect(handler(mockEvent, '', {})).rejects.toThrow(
          'Invalid endpoint'
        )
        await expect(handler(mockEvent, 123, {})).rejects.toThrow(
          'Invalid endpoint'
        )
      })

      it('calls ESI service with valid endpoint', async () => {
        mocks.esiService.fetch.mockResolvedValue({ data: 'test' })

        const handler = getRegisteredHandler('esi:fetch')
        await handler(mockEvent, '/characters/12345/', {})

        expect(mocks.esiService.fetch).toHaveBeenCalledWith(
          '/characters/12345/',
          expect.any(Object)
        )
      })

      it('parses options correctly', async () => {
        mocks.esiService.fetch.mockResolvedValue({ data: 'test' })

        const handler = getRegisteredHandler('esi:fetch')
        await handler(mockEvent, '/test/', {
          method: 'POST',
          body: '{"key":"value"}',
          characterId: 12345,
          requiresAuth: true,
          etag: '"abc123"',
        })

        expect(mocks.esiService.fetch).toHaveBeenCalledWith('/test/', {
          method: 'POST',
          body: '{"key":"value"}',
          characterId: 12345,
          requiresAuth: true,
          etag: '"abc123"',
        })
      })
    })

    describe('esi:fetchWithMeta', () => {
      it('rejects invalid endpoint', async () => {
        const handler = getRegisteredHandler('esi:fetchWithMeta')
        await expect(handler(mockEvent, '', {})).rejects.toThrow(
          'Invalid endpoint'
        )
      })

      it('calls ESI service', async () => {
        mocks.esiService.fetchWithMeta.mockResolvedValue({
          data: 'test',
          expiresAt: 123,
          etag: '"abc"',
        })

        const handler = getRegisteredHandler('esi:fetchWithMeta')
        await handler(mockEvent, '/test/', {})

        expect(mocks.esiService.fetchWithMeta).toHaveBeenCalled()
      })
    })

    describe('esi:fetchPaginated', () => {
      it('rejects invalid endpoint', async () => {
        const handler = getRegisteredHandler('esi:fetchPaginated')
        await expect(handler(mockEvent, '', {})).rejects.toThrow(
          'Invalid endpoint'
        )
      })

      it('calls ESI service', async () => {
        mocks.esiService.fetchPaginated.mockResolvedValue([1, 2, 3])

        const handler = getRegisteredHandler('esi:fetchPaginated')
        await handler(mockEvent, '/test/', {})

        expect(mocks.esiService.fetchPaginated).toHaveBeenCalled()
      })
    })

    describe('esi:fetchPaginatedWithMeta', () => {
      it('rejects invalid endpoint', async () => {
        const handler = getRegisteredHandler('esi:fetchPaginatedWithMeta')
        await expect(handler(mockEvent, '', {})).rejects.toThrow(
          'Invalid endpoint'
        )
      })

      it('calls ESI service', async () => {
        mocks.esiService.fetchPaginatedWithMeta.mockResolvedValue({
          data: [1, 2, 3],
          expiresAt: 123,
          etag: null,
        })

        const handler = getRegisteredHandler('esi:fetchPaginatedWithMeta')
        await handler(mockEvent, '/test/', {})

        expect(mocks.esiService.fetchPaginatedWithMeta).toHaveBeenCalled()
      })
    })

    describe('esi:fetchPaginatedWithProgress', () => {
      it('rejects invalid endpoint', async () => {
        const handler = getRegisteredHandler('esi:fetchPaginatedWithProgress')
        await expect(
          handler(mockEvent, '', {}, 'esi:progress:123')
        ).rejects.toThrow('Invalid endpoint')
      })

      it('calls ESI service with progress callback', async () => {
        mocks.esiService.fetchPaginatedWithProgress.mockResolvedValue({
          data: [1, 2, 3],
          expiresAt: 123,
          etag: null,
        })

        const handler = getRegisteredHandler('esi:fetchPaginatedWithProgress')
        await handler(mockEvent, '/test/', {}, 'esi:progress:123')

        expect(
          mocks.esiService.fetchPaginatedWithProgress
        ).toHaveBeenCalledWith(
          '/test/',
          expect.any(Object),
          expect.any(Function)
        )
      })

      it('ignores invalid progress channel', async () => {
        mocks.esiService.fetchPaginatedWithProgress.mockResolvedValue({
          data: [1, 2, 3],
          expiresAt: 123,
          etag: null,
        })

        const handler = getRegisteredHandler('esi:fetchPaginatedWithProgress')
        await handler(mockEvent, '/test/', {}, 'invalid-channel')

        expect(
          mocks.esiService.fetchPaginatedWithProgress
        ).toHaveBeenCalledWith('/test/', expect.any(Object), undefined)
      })
    })

    describe('esi:clearCache', () => {
      it('clears ESI cache', async () => {
        const handler = getRegisteredHandler('esi:clearCache')
        await handler(mockEvent)
        expect(mocks.esiService.clearCache).toHaveBeenCalled()
      })
    })

    describe('esi:clearCacheByPattern', () => {
      it('rejects invalid pattern', async () => {
        const handler = getRegisteredHandler('esi:clearCacheByPattern')

        expect(await handler(mockEvent, '')).toBe(0)
        expect(await handler(mockEvent, 123)).toBe(0)
        expect(await handler(mockEvent, 'x'.repeat(101))).toBe(0)
      })

      it('clears cache by pattern', async () => {
        mocks.esiService.clearCacheByPattern.mockReturnValue(5)

        const handler = getRegisteredHandler('esi:clearCacheByPattern')
        const result = await handler(mockEvent, '/characters/')

        expect(result).toBe(5)
        expect(mocks.esiService.clearCacheByPattern).toHaveBeenCalledWith(
          '/characters/'
        )
      })
    })

    describe('esi:getRateLimitInfo', () => {
      it('returns rate limit info', async () => {
        mocks.esiService.getRateLimitInfo.mockReturnValue({
          globalRetryAfter: null,
          activeRequests: 3,
        })

        const handler = getRegisteredHandler('esi:getRateLimitInfo')
        const result = await handler(mockEvent)

        expect(result).toEqual({
          globalRetryAfter: null,
          activeRequests: 3,
        })
      })
    })

    describe('esi:getHealth', () => {
      it('returns health status', async () => {
        mocks.esiService.getHealthStatus.mockResolvedValue({
          healthy: true,
          latency: 50,
        })

        const handler = getRegisteredHandler('esi:getHealth')
        const result = await handler(mockEvent)

        expect(result).toEqual({ healthy: true, latency: 50 })
      })
    })

    describe('esi:getCachedHealth', () => {
      it('returns cached health status', async () => {
        mocks.esiService.getCachedHealthStatus.mockReturnValue({
          healthy: true,
          latency: 50,
        })

        const handler = getRegisteredHandler('esi:getCachedHealth')
        const result = await handler(mockEvent)

        expect(result).toEqual({ healthy: true, latency: 50 })
      })
    })
  })
})
