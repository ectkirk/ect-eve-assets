import type { z } from 'zod'
import type { ESIResponseMeta, ESIRequestOptions } from 'electron/preload'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { logger } from '@/lib/logger'

export type { ESIResponseMeta, ESIRequestOptions }

export class ESIError extends Error {
  status: number
  retryAfter?: number

  constructor(message: string, status: number, retryAfter?: number) {
    super(message)
    this.name = 'ESIError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

function validate<T>(data: unknown, schema: z.ZodType<T>, endpoint: string): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(`ESI validation failed for ${endpoint}: ${result.error.issues[0]?.message}`)
  }
  return result.data
}

function getESI() {
  if (!window.electronAPI) {
    throw new Error('ESI requests require Electron environment')
  }
  return window.electronAPI.esi
}

export const esi = {
  async fetch<T>(
    endpoint: string,
    options: ESIRequestOptions & { schema?: z.ZodType<T> } = {}
  ): Promise<T> {
    const { schema, ...esiOptions } = options
    const data = await getESI().fetch<T>(endpoint, esiOptions)
    return schema ? validate(data, schema, endpoint) : data
  },

  async fetchWithMeta<T>(
    endpoint: string,
    options: ESIRequestOptions & { schema?: z.ZodType<T> } = {}
  ): Promise<ESIResponseMeta<T>> {
    const { schema, ...esiOptions } = options
    const result = await getESI().fetchWithMeta<T>(endpoint, esiOptions)
    if (schema && !result.notModified) {
      return { ...result, data: validate(result.data, schema, endpoint) }
    }
    return result
  },

  async fetchPaginated<T>(
    endpoint: string,
    options: ESIRequestOptions & { schema?: z.ZodType<T> } = {}
  ): Promise<T[]> {
    const { schema, ...esiOptions } = options
    const data = await getESI().fetchPaginated<T>(endpoint, esiOptions)
    return schema ? validate(data, schema.array(), endpoint) : data
  },

  async fetchPaginatedWithMeta<T>(
    endpoint: string,
    options: ESIRequestOptions & { schema?: z.ZodType<T> } = {}
  ): Promise<ESIResponseMeta<T[]>> {
    const { schema, ...esiOptions } = options
    const result = await getESI().fetchPaginatedWithMeta<T>(endpoint, esiOptions)
    if (schema && !result.notModified) {
      return { ...result, data: validate(result.data, schema.array(), endpoint) }
    }
    return result
  },

  async fetchBatch<T, R>(
    items: T[],
    fetcher: (item: T) => Promise<R>,
    options: { batchSize?: number; onProgress?: (completed: number, total: number) => void } = {}
  ): Promise<Map<T, R | null>> {
    const { batchSize = 20, onProgress } = options
    const results = new Map<T, R | null>()

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          try {
            return { item, result: await fetcher(item) }
          } catch {
            return { item, result: null }
          }
        })
      )

      for (const { item, result } of batchResults) {
        results.set(item, result)
      }

      onProgress?.(Math.min(i + batchSize, items.length), items.length)
    }

    return results
  },

  clearCache(): void {
    getESI().clearCache()
  },

  getRateLimitInfo() {
    return getESI().getRateLimitInfo()
  },
}

export function setupESITokenProvider(): () => void {
  if (!window.electronAPI) return () => {}

  const cleanup = window.electronAPI.esi.onRequestToken(async (characterId: number) => {
    const store = useAuthStore.getState()
    const charOwnerKey = ownerKey('character', characterId)
    let owner = store.getOwner(charOwnerKey)

    if (!owner) {
      owner = store.getOwnerByCharacterId(characterId)
    }

    if (!owner) {
      window.electronAPI!.esi.provideToken(characterId, null)
      return
    }

    const ownerId = ownerKey(owner.type, owner.id)

    if (owner.authFailed) {
      window.electronAPI!.esi.provideToken(characterId, null)
      return
    }

    const needsRefresh = !owner.accessToken || store.isOwnerTokenExpired(ownerId)

    if (needsRefresh && owner.refreshToken) {
      try {
        const result = await window.electronAPI!.refreshToken(owner.refreshToken, owner.characterId)
        if (result.success && result.accessToken && result.refreshToken) {
          store.updateOwnerTokens(ownerId, {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt ?? Date.now() + 1200000,
            scopes: result.scopes,
          })
          window.electronAPI!.esi.provideToken(characterId, result.accessToken)
          return
        }
      } catch {
        logger.error('Token refresh failed for ESI provider', undefined, { module: 'ESI', characterId })
      }
      store.setOwnerAuthFailed(ownerId, true)
      logger.warn('Owner auth failed, marking for re-authentication', { module: 'ESI', ownerId })
      window.electronAPI!.esi.provideToken(characterId, null)
      return
    }

    window.electronAPI!.esi.provideToken(characterId, owner.accessToken)
  })

  return cleanup
}
