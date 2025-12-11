import { useAuthStore, ownerKey } from '@/store/auth-store'
import { logger } from '@/lib/logger'
import type { z } from 'zod'

export const ESI_BASE_URL = 'https://esi.evetech.net'
export const ESI_COMPATIBILITY_DATE = '2025-11-06'
export const ESI_USER_AGENT = 'ECTEVEAssets/0.2.0 (ecteveassets@edencom.net; +https://github.com/ectkirk/ect-eve-assets)'

export interface ESIErrorResponse {
  error: string
  timeout?: number
}

export class ESIError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ESIError'
    this.status = status
  }
}

export interface ESIResponseMeta<T> {
  data: T
  expiresAt: number
  etag: string | null
  notModified: boolean
}

const DEFAULT_CACHE_MS = 5 * 60 * 1000

class ESIClient {
  async fetch<T>(
    endpoint: string,
    options: {
      method?: string
      body?: string
      headers?: Record<string, string>
      characterId?: number
      requiresAuth?: boolean
      skipQueue?: boolean
      schema?: z.ZodType<T>
    } = {}
  ): Promise<T> {
    const { characterId, requiresAuth = true, schema, ...fetchOptions } = options

    if (!window.electronAPI) {
      throw new Error('ESI requests require Electron environment')
    }

    const result = await window.electronAPI.esiRequest<T>('fetch', endpoint, {
      method: (fetchOptions.method as 'GET' | 'POST') ?? 'GET',
      body: fetchOptions.body,
      characterId,
      requiresAuth,
    })

    if (!result.success) {
      throw new ESIError(result.error, result.status ?? 500)
    }

    if (schema) {
      const parsed = schema.safeParse(result.data)
      if (!parsed.success) {
        throw new Error(`ESI response validation failed: ${parsed.error.issues[0]?.message}`)
      }
      return parsed.data
    }

    return result.data
  }

  async fetchWithMeta<T>(
    endpoint: string,
    options: {
      method?: string
      body?: string
      headers?: Record<string, string>
      characterId?: number
      requiresAuth?: boolean
      skipQueue?: boolean
      schema?: z.ZodType<T>
      etag?: string
    } = {}
  ): Promise<ESIResponseMeta<T>> {
    const { characterId, requiresAuth = true, schema, etag: providedEtag, ...fetchOptions } = options

    if (!window.electronAPI) {
      throw new Error('ESI requests require Electron environment')
    }

    const result = await window.electronAPI.esiRequest<ESIResponseMeta<T>>('fetchWithMeta', endpoint, {
      method: (fetchOptions.method as 'GET' | 'POST') ?? 'GET',
      body: fetchOptions.body,
      characterId,
      requiresAuth,
      etag: providedEtag,
    })

    if (!result.success) {
      throw new ESIError(result.error, result.status ?? 500)
    }

    if (schema && !result.data.notModified) {
      const parsed = schema.safeParse(result.data.data)
      if (!parsed.success) {
        throw new Error(`ESI response validation failed: ${parsed.error.issues[0]?.message}`)
      }
      return { ...result.data, data: parsed.data }
    }

    return result.data
  }

  async fetchWithPaginationMeta<T>(
    endpoint: string,
    options: { characterId?: number; requiresAuth?: boolean; schema?: z.ZodType<T> } = {}
  ): Promise<ESIResponseMeta<T[]>> {
    if (!window.electronAPI) {
      throw new Error('ESI requests require Electron environment')
    }

    const result = await window.electronAPI.esiRequest<T[]>('fetchPaginated', endpoint, {
      characterId: options.characterId,
      requiresAuth: options.requiresAuth,
    })

    if (!result.success) {
      throw new ESIError(result.error, result.status ?? 500)
    }

    let data = result.data
    if (options.schema) {
      const arraySchema = options.schema.array()
      const parsed = arraySchema.safeParse(data)
      if (!parsed.success) {
        throw new Error(`ESI response validation failed: ${parsed.error.issues[0]?.message}`)
      }
      data = parsed.data
    }

    return {
      data,
      expiresAt: result.meta?.expiresAt ?? Date.now() + DEFAULT_CACHE_MS,
      etag: result.meta?.etag ?? null,
      notModified: false,
    }
  }

  async fetchWithPagination<T>(
    endpoint: string,
    options: { characterId?: number; requiresAuth?: boolean; schema?: z.ZodType<T> } = {}
  ): Promise<T[]> {
    if (!window.electronAPI) {
      throw new Error('ESI requests require Electron environment')
    }

    const result = await window.electronAPI.esiRequest<T[]>('fetchPaginated', endpoint, {
      characterId: options.characterId,
      requiresAuth: options.requiresAuth,
    })

    if (!result.success) {
      throw new ESIError(result.error, result.status ?? 500)
    }

    if (options.schema) {
      const arraySchema = options.schema.array()
      const parsed = arraySchema.safeParse(result.data)
      if (!parsed.success) {
        throw new Error(`ESI response validation failed: ${parsed.error.issues[0]?.message}`)
      }
      return parsed.data
    }

    return result.data
  }

  async fetchPublic<T>(endpoint: string, options: { skipQueue?: boolean } = {}): Promise<T> {
    return this.fetch<T>(endpoint, { requiresAuth: false, ...options })
  }

  isRateLimited(): boolean {
    return false
  }

  getRateLimitInfo(): { isLimited: boolean; retryAfter: number | null } {
    return { isLimited: false, retryAfter: null }
  }

  clearCache(): void {
    window.electronAPI?.esiClearCache()
  }

  async fetchBatch<T, R>(
    items: T[],
    fetcher: (item: T) => Promise<R>,
    options: { batchSize?: number; onProgress?: (completed: number, total: number) => void } = {}
  ): Promise<Map<T, R | null>> {
    const { batchSize = 20, onProgress } = options
    const results = new Map<T, R | null>()

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      const batchPromises = batch.map(async (item) => {
        try {
          const result = await fetcher(item)
          return { item, result, error: null }
        } catch (error) {
          return { item, result: null, error }
        }
      })

      const batchResults = await Promise.all(batchPromises)

      for (const { item, result } of batchResults) {
        results.set(item, result)
      }

      onProgress?.(Math.min(i + batchSize, items.length), items.length)
    }

    return results
  }
}

export const esiClient = new ESIClient()

export function setupESITokenProvider(): () => void {
  if (!window.electronAPI) return () => {}

  const cleanup = window.electronAPI.onEsiRequestToken(async (characterId: number) => {
    const store = useAuthStore.getState()
    const charOwnerKey = ownerKey('character', characterId)
    let owner = store.getOwner(charOwnerKey)

    if (!owner) {
      owner = store.getOwnerByCharacterId(characterId)
    }

    if (!owner) {
      window.electronAPI!.esiProvideToken(characterId, null)
      return
    }

    const ownerId = ownerKey(owner.type, owner.id)

    if (owner.authFailed) {
      window.electronAPI!.esiProvideToken(characterId, null)
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
          })
          window.electronAPI!.esiProvideToken(characterId, result.accessToken)
          return
        }
      } catch {
        logger.error('Token refresh failed for ESI provider', undefined, { module: 'ESI', characterId })
      }
      store.setOwnerAuthFailed(ownerId, true)
      logger.warn('Owner auth failed, marking for re-authentication', { module: 'ESI', ownerId })
      window.electronAPI!.esiProvideToken(characterId, null)
      return
    }

    window.electronAPI!.esiProvideToken(characterId, owner.accessToken)
  })

  return cleanup
}
