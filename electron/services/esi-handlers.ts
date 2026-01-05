import { ipcMain, BrowserWindow } from 'electron'
import { getESIService } from './esi/index.js'
import { logger } from './logger.js'
import { ESI_CONFIG, type ESIRequestOptions } from './esi/types.js'
import {
  isValidCharacterId,
  isValidEndpoint,
  isValidString,
} from './validation.js'
import { ESIError, type SerializedESIError } from '../../shared/esi-types.js'

function serializeESIError(error: ESIError): SerializedESIError {
  return {
    name: 'ESIError',
    message: error.message,
    status: error.status,
    retryAfter: error.retryAfter,
  }
}

function wrapESIHandler<T>(
  handler: () => Promise<T>
): Promise<T | { __esiError: SerializedESIError }> {
  return handler().catch((error: unknown) => {
    if (error instanceof ESIError) {
      return { __esiError: serializeESIError(error) }
    }
    throw error
  })
}

interface PendingTokenRequest {
  resolve: (token: string | null) => void
  timeout: NodeJS.Timeout
  createdAt: number
}

const pendingTokenRequests = new Map<number, PendingTokenRequest[]>()
let cleanupInterval: NodeJS.Timeout | null = null

function cleanupStaleRequests(): void {
  const now = Date.now()
  const staleThreshold = ESI_CONFIG.tokenRequestTimeoutMs * 2

  for (const [characterId, pending] of pendingTokenRequests) {
    const stale = pending.filter((p) => now - p.createdAt > staleThreshold)
    for (const p of stale) {
      clearTimeout(p.timeout)
      p.resolve(null)
    }
    const remaining = pending.filter((p) => now - p.createdAt <= staleThreshold)
    if (remaining.length === 0) {
      pendingTokenRequests.delete(characterId)
    } else {
      pendingTokenRequests.set(characterId, remaining)
    }
  }
}

export function setupESIService(
  getMainWindow: () => BrowserWindow | null
): void {
  const esiService = getESIService()

  if (!cleanupInterval) {
    cleanupInterval = setInterval(
      cleanupStaleRequests,
      ESI_CONFIG.staleCleanupIntervalMs
    )
  }

  esiService.setTokenProvider(async (characterId: number) => {
    const win = getMainWindow()
    if (!win) return null

    const existing = pendingTokenRequests.get(characterId)
    if (existing && existing.length >= ESI_CONFIG.maxPendingPerCharacter) {
      return null
    }

    return new Promise<string | null>((resolve) => {
      const now = Date.now()

      const wrappedResolve = (token: string | null) => {
        clearTimeout(timeout)
        resolve(token)
      }

      const timeout = setTimeout(() => {
        const pending = pendingTokenRequests.get(characterId)
        if (pending) {
          const idx = pending.findIndex((p) => p.resolve === wrappedResolve)
          if (idx !== -1) pending.splice(idx, 1)
          if (pending.length === 0) pendingTokenRequests.delete(characterId)
        }
        resolve(null)
      }, ESI_CONFIG.tokenRequestTimeoutMs)

      const request: PendingTokenRequest = {
        resolve: wrappedResolve,
        timeout,
        createdAt: now,
      }

      if (existing) {
        existing.push(request)
      } else {
        pendingTokenRequests.set(characterId, [request])
        try {
          win.webContents.send('esi:requestToken', characterId)
        } catch (err) {
          logger.warn('Failed to send token request to renderer', {
            module: 'ESI',
            characterId,
            error: err instanceof Error ? err.message : String(err),
          })
          pendingTokenRequests.delete(characterId)
          clearTimeout(timeout)
          resolve(null)
          return
        }
      }
    })
  })
}

export function stopESIHandlers(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
  for (const [, pending] of pendingTokenRequests) {
    for (const p of pending) {
      clearTimeout(p.timeout)
    }
  }
  pendingTokenRequests.clear()
}

function parseESIOptions(options: unknown): ESIRequestOptions {
  const esiOptions: ESIRequestOptions = {}
  if (options && typeof options === 'object' && !Array.isArray(options)) {
    const opts = options as Record<string, unknown>
    if (opts.method === 'GET' || opts.method === 'POST')
      esiOptions.method = opts.method
    if (typeof opts.body === 'string') esiOptions.body = opts.body
    if (typeof opts.characterId === 'number')
      esiOptions.characterId = opts.characterId
    if (typeof opts.requiresAuth === 'boolean')
      esiOptions.requiresAuth = opts.requiresAuth
    if (typeof opts.etag === 'string') esiOptions.etag = opts.etag
  }
  return esiOptions
}

let mainWindowGetter: (() => BrowserWindow | null) | null = null

export function registerESIHandlers(
  getMainWindow: () => BrowserWindow | null
): void {
  mainWindowGetter = getMainWindow

  ipcMain.handle(
    'esi:provideToken',
    (_event, characterId: unknown, token: unknown) => {
      if (!isValidCharacterId(characterId)) {
        return { success: false, error: 'Invalid character ID' }
      }
      const pending = pendingTokenRequests.get(characterId)
      if (pending) {
        const resolvedToken = isValidString(token) ? token : null
        for (const p of pending) {
          clearTimeout(p.timeout)
          p.resolve(resolvedToken)
        }
        pendingTokenRequests.delete(characterId)
      }
      return { success: true }
    }
  )

  ipcMain.handle(
    'esi:fetch',
    async (_event, endpoint: unknown, options: unknown) => {
      if (!isValidEndpoint(endpoint)) throw new Error('Invalid endpoint')
      return wrapESIHandler(() =>
        getESIService().fetch(endpoint, parseESIOptions(options))
      )
    }
  )

  ipcMain.handle(
    'esi:fetchWithMeta',
    async (_event, endpoint: unknown, options: unknown) => {
      if (!isValidEndpoint(endpoint)) throw new Error('Invalid endpoint')
      return wrapESIHandler(() =>
        getESIService().fetchWithMeta(endpoint, parseESIOptions(options))
      )
    }
  )

  ipcMain.handle(
    'esi:fetchPaginated',
    async (_event, endpoint: unknown, options: unknown) => {
      if (!isValidEndpoint(endpoint)) throw new Error('Invalid endpoint')
      return wrapESIHandler(() =>
        getESIService().fetchPaginated(endpoint, parseESIOptions(options))
      )
    }
  )

  ipcMain.handle(
    'esi:fetchPaginatedWithMeta',
    async (_event, endpoint: unknown, options: unknown) => {
      if (!isValidEndpoint(endpoint)) throw new Error('Invalid endpoint')
      return wrapESIHandler(() =>
        getESIService().fetchPaginatedWithMeta(
          endpoint,
          parseESIOptions(options)
        )
      )
    }
  )

  ipcMain.handle(
    'esi:fetchPaginatedWithProgress',
    async (
      _event,
      endpoint: unknown,
      options: unknown,
      progressChannel: unknown
    ) => {
      if (!isValidEndpoint(endpoint)) throw new Error('Invalid endpoint')
      const channel =
        typeof progressChannel === 'string' &&
        progressChannel.startsWith('esi:progress:')
          ? progressChannel
          : null
      const win = mainWindowGetter?.()

      const onProgress =
        channel && win
          ? (progress: { current: number; total: number }) => {
              if (!win.isDestroyed()) {
                win.webContents.send(channel, progress)
              }
            }
          : undefined

      return wrapESIHandler(() =>
        getESIService().fetchPaginatedWithProgress(
          endpoint,
          parseESIOptions(options),
          onProgress
        )
      )
    }
  )

  ipcMain.handle('esi:clearCache', () => {
    getESIService().clearCache()
  })

  ipcMain.handle('esi:clearCacheByPattern', (_event, pattern: unknown) => {
    if (
      typeof pattern !== 'string' ||
      pattern.length === 0 ||
      pattern.length > 100
    ) {
      return 0
    }
    return getESIService().clearCacheByPattern(pattern)
  })

  ipcMain.handle('esi:getRateLimitInfo', () => {
    return getESIService().getRateLimitInfo()
  })

  ipcMain.handle('esi:getHealth', async () => {
    return getESIService().getHealthStatus()
  })

  ipcMain.handle('esi:getCachedHealth', () => {
    return getESIService().getCachedHealthStatus()
  })
}
