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
    throw new Error(
      `ESI validation failed for ${endpoint}: ${result.error.issues[0]?.message}`
    )
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
    const result = await getESI().fetchPaginatedWithMeta<T>(
      endpoint,
      esiOptions
    )
    if (schema && !result.notModified) {
      return {
        ...result,
        data: validate(result.data, schema.array(), endpoint),
      }
    }
    return result
  },

  async fetchBatch<T, R>(
    items: T[],
    fetcher: (item: T) => Promise<R>,
    options: {
      batchSize?: number
      onProgress?: (completed: number, total: number) => void
    } = {}
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

  const cleanup = window.electronAPI.esi.onRequestToken(
    async (characterId: number) => {
      logger.debug('Token requested', { module: 'ESI', characterId })

      const store = useAuthStore.getState()
      const charOwnerKey = ownerKey('character', characterId)
      let owner = store.getOwner(charOwnerKey)

      if (!owner) {
        owner = store.getOwnerByCharacterId(characterId)
      }

      if (!owner) {
        logger.warn('No owner found for token request', {
          module: 'ESI',
          characterId,
        })
        window.electronAPI!.esi.provideToken(characterId, null)
        return
      }

      const ownerId = ownerKey(owner.type, owner.id)

      if (owner.authFailed) {
        logger.debug('Owner auth already failed, skipping', {
          module: 'ESI',
          ownerId,
        })
        window.electronAPI!.esi.provideToken(characterId, null)
        return
      }

      const needsRefresh =
        !owner.accessToken || store.isOwnerTokenExpired(ownerId)
      logger.debug('Token status', {
        module: 'ESI',
        ownerId,
        needsRefresh,
        hasAccessToken: !!owner.accessToken,
      })

      if (needsRefresh && owner.refreshToken) {
        try {
          logger.debug('Refreshing token', { module: 'ESI', ownerId })
          const result = await window.electronAPI!.refreshToken(
            owner.refreshToken,
            owner.characterId
          )
          if (result.success && result.accessToken && result.refreshToken) {
            store.updateOwnerTokens(ownerId, {
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
              expiresAt: result.expiresAt ?? Date.now() + 1200000,
              scopes: result.scopes,
            })
            logger.debug('Token refreshed successfully', {
              module: 'ESI',
              ownerId,
            })
            window.electronAPI!.esi.provideToken(
              characterId,
              result.accessToken
            )
            return
          }
          logger.warn('Token refresh returned failure', {
            module: 'ESI',
            ownerId,
            success: result.success,
          })
        } catch (err) {
          logger.error(
            'Token refresh threw error',
            err instanceof Error ? err : undefined,
            { module: 'ESI', characterId }
          )
        }
        store.setOwnerAuthFailed(ownerId, true)
        logger.warn('Owner auth failed, marking for re-authentication', {
          module: 'ESI',
          ownerId,
        })
        window.electronAPI!.esi.provideToken(characterId, null)
        return
      }

      window.electronAPI!.esi.provideToken(characterId, owner.accessToken)
    }
  )

  return cleanup
}
