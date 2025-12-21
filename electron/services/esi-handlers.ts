import { ipcMain, BrowserWindow } from 'electron'
import { getESIService } from './esi/index.js'
import type { ESIRequestOptions } from './esi/types.js'

interface PendingTokenRequest {
  resolve: (token: string | null) => void
  timeout: NodeJS.Timeout
}

const pendingTokenRequests = new Map<number, PendingTokenRequest[]>()

export function setupESIService(getMainWindow: () => BrowserWindow | null): void {
  const esiService = getESIService()

  esiService.setTokenProvider(async (characterId: number) => {
    const win = getMainWindow()
    if (!win) return null

    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        const pending = pendingTokenRequests.get(characterId)
        if (pending) {
          const idx = pending.findIndex((p) => p.resolve === wrappedResolve)
          if (idx !== -1) pending.splice(idx, 1)
          if (pending.length === 0) pendingTokenRequests.delete(characterId)
        }
        resolve(null)
      }, 10000)

      const wrappedResolve = (token: string | null) => {
        clearTimeout(timeout)
        resolve(token)
      }

      const existing = pendingTokenRequests.get(characterId)
      if (existing) {
        existing.push({ resolve: wrappedResolve, timeout })
      } else {
        pendingTokenRequests.set(characterId, [
          { resolve: wrappedResolve, timeout },
        ])
        win.webContents.send('esi:requestToken', characterId)
      }
    })
  })
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

export function registerESIHandlers(): void {
  ipcMain.handle(
    'esi:provideToken',
    (_event, characterId: unknown, token: unknown) => {
      if (
        typeof characterId !== 'number' ||
        !Number.isInteger(characterId) ||
        characterId <= 0
      ) {
        return
      }
      const pending = pendingTokenRequests.get(characterId)
      if (pending) {
        const resolvedToken = typeof token === 'string' ? token : null
        for (const p of pending) {
          clearTimeout(p.timeout)
          p.resolve(resolvedToken)
        }
        pendingTokenRequests.delete(characterId)
      }
    }
  )

  ipcMain.handle(
    'esi:fetch',
    async (_event, endpoint: unknown, options: unknown) => {
      if (typeof endpoint !== 'string') throw new Error('Invalid endpoint')
      return getESIService().fetch(endpoint, parseESIOptions(options))
    }
  )

  ipcMain.handle(
    'esi:fetchWithMeta',
    async (_event, endpoint: unknown, options: unknown) => {
      if (typeof endpoint !== 'string') throw new Error('Invalid endpoint')
      return getESIService().fetchWithMeta(endpoint, parseESIOptions(options))
    }
  )

  ipcMain.handle(
    'esi:fetchPaginated',
    async (_event, endpoint: unknown, options: unknown) => {
      if (typeof endpoint !== 'string') throw new Error('Invalid endpoint')
      return getESIService().fetchPaginated(endpoint, parseESIOptions(options))
    }
  )

  ipcMain.handle(
    'esi:fetchPaginatedWithMeta',
    async (_event, endpoint: unknown, options: unknown) => {
      if (typeof endpoint !== 'string') throw new Error('Invalid endpoint')
      return getESIService().fetchPaginatedWithMeta(
        endpoint,
        parseESIOptions(options)
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
}
