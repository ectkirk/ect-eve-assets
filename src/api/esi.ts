import type { z } from 'zod'
import type { ESIResponseMeta, ESIRequestOptions } from 'electron/preload'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { logger } from '@/lib/logger'
import { chunkArray } from '@/lib/utils'
import {
  ValidationError,
  ConfigurationError,
  getErrorForLog,
} from '@/lib/errors'
import {
  ESIError,
  isSerializedESIError,
  type SerializedESIError,
} from '../../shared/esi-types'

export type { ESIResponseMeta, ESIRequestOptions }
export { ESIError }

function checkForESIError(result: unknown): void {
  if (
    typeof result === 'object' &&
    result !== null &&
    '__esiError' in result &&
    isSerializedESIError((result as { __esiError: unknown }).__esiError)
  ) {
    const err = (result as { __esiError: SerializedESIError }).__esiError
    throw new ESIError(err.message, err.status, err.retryAfter)
  }
}

function validate<T>(data: unknown, schema: z.ZodType<T>, endpoint: string): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError(
      `ESI validation failed for ${endpoint}: ${result.error.issues[0]?.message}`,
      endpoint,
      data
    )
  }
  return result.data
}

function getESI() {
  if (!window.electronAPI) {
    throw new ConfigurationError('ESI requests require Electron environment')
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
    checkForESIError(data)
    return schema ? validate(data, schema, endpoint) : data
  },

  async fetchWithMeta<T>(
    endpoint: string,
    options: ESIRequestOptions & { schema?: z.ZodType<T> } = {}
  ): Promise<ESIResponseMeta<T>> {
    const { schema, ...esiOptions } = options
    const result = await getESI().fetchWithMeta<T>(endpoint, esiOptions)
    checkForESIError(result)
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
    checkForESIError(data)
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
    checkForESIError(result)
    if (schema && !result.notModified) {
      return {
        ...result,
        data: validate(result.data, schema.array(), endpoint),
      }
    }
    return result
  },

  async fetchPaginatedWithProgress<T>(
    endpoint: string,
    options: ESIRequestOptions & {
      schema?: z.ZodType<T>
      onProgress?: (progress: { current: number; total: number }) => void
    } = {}
  ): Promise<ESIResponseMeta<T[]>> {
    const { schema, onProgress, ...esiOptions } = options
    const progressChannel = onProgress
      ? `esi:progress:${Date.now()}-${Math.random().toString(36).slice(2)}`
      : undefined

    let cleanup: (() => void) | undefined
    if (progressChannel && onProgress) {
      cleanup = getESI().onPaginatedProgress(progressChannel, onProgress)
    }

    try {
      const result = await getESI().fetchPaginatedWithProgress<T>(
        endpoint,
        esiOptions,
        progressChannel
      )
      checkForESIError(result)
      if (schema && !result.notModified) {
        return {
          ...result,
          data: validate(result.data, schema.array(), endpoint),
        }
      }
      return result
    } finally {
      cleanup?.()
    }
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

    for (const [i, batch] of chunkArray(items, batchSize).entries()) {
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          try {
            return { item, result: await fetcher(item) }
          } catch (error) {
            logger.warn('Batch fetch item failed', {
              module: 'ESI',
              item,
              error,
            })
            return { item, result: null }
          }
        })
      )

      for (const { item, result } of batchResults) {
        results.set(item, result)
      }

      onProgress?.(Math.min((i + 1) * batchSize, items.length), items.length)
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

const pendingRefreshes = new Map<string, Promise<string | null>>()

export function setupESITokenProvider(): () => void {
  if (!window.electronAPI) return () => {}

  const cleanup = window.electronAPI.esi.onRequestToken(
    async (characterId: number) => {
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
        window.electronAPI!.esi.provideToken(characterId, null)
        return
      }

      const needsRefresh =
        !owner.accessToken || store.isOwnerTokenExpired(ownerId)

      if (needsRefresh && owner.refreshToken) {
        const existingRefresh = pendingRefreshes.get(ownerId)
        if (existingRefresh) {
          const token = await existingRefresh
          window.electronAPI!.esi.provideToken(characterId, token)
          return
        }

        const refreshPromise = (async (): Promise<string | null> => {
          try {
            const result = await window.electronAPI!.refreshToken(
              owner.refreshToken!,
              owner.characterId
            )
            if (result.success && result.accessToken && result.refreshToken) {
              store.updateOwnerTokens(ownerId, {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                expiresAt: result.expiresAt ?? Date.now() + 1200000,
                scopes: result.scopes,
              })
              return result.accessToken
            }
            logger.warn('Token refresh returned failure', {
              module: 'ESI',
              ownerId,
              success: result.success,
            })
          } catch (err) {
            logger.error('Token refresh threw error', getErrorForLog(err), {
              module: 'ESI',
              characterId,
            })
          }
          store.setOwnerAuthFailed(ownerId, true)
          logger.warn('Owner auth failed, marking for re-authentication', {
            module: 'ESI',
            ownerId,
          })
          return null
        })()

        pendingRefreshes.set(ownerId, refreshPromise)
        try {
          const token = await refreshPromise
          window.electronAPI!.esi.provideToken(characterId, token)
        } finally {
          pendingRefreshes.delete(ownerId)
        }
        return
      }

      window.electronAPI!.esi.provideToken(characterId, owner.accessToken)
    }
  )

  return cleanup
}
