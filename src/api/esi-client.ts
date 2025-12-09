import { useAuthStore, ownerKey } from '@/store/auth-store'
import { logger } from '@/lib/logger'
import type { z } from 'zod'

export const ESI_BASE_URL = 'https://esi.evetech.net'
export const ESI_COMPATIBILITY_DATE = '2025-11-06'
export const ESI_USER_AGENT = 'ECTEVEAssets/0.2.0 (ecteveassets@edencom.net; +https://github.com/ectkirk/ecteveassets)'

export interface ESIError {
  error: string
  timeout?: number
}

interface CacheEntry {
  data: unknown
  etag: string
  expires: number
}

interface RateLimitState {
  remaining: number
  limit: number
}

class ESIClient {
  private baseUrl: string
  private cache = new Map<string, CacheEntry>()
  private rateLimits = new Map<string, RateLimitState>()
  private globalRetryAfter: number | null = null
  private isProcessingQueue = false
  private requestQueue: Array<() => Promise<void>> = []
  private minRequestInterval = 100

  constructor(baseUrl = ESI_BASE_URL) {
    this.baseUrl = baseUrl
  }

  private async getAccessToken(characterId?: number): Promise<string | null> {
    const store = useAuthStore.getState()

    let targetCharId = characterId
    if (!targetCharId) {
      const activeOwner = store.getActiveOwner()
      if (!activeOwner) return null
      targetCharId = activeOwner.characterId
    }

    const charOwnerKey = ownerKey('character', targetCharId)
    let owner = store.getOwner(charOwnerKey)

    if (!owner) {
      owner = store.getOwnerByCharacterId(targetCharId)
    }

    if (!owner) return null

    const ownerId = ownerKey(owner.type, owner.id)
    const needsRefresh = !owner.accessToken || store.isOwnerTokenExpired(ownerId)

    if (needsRefresh && owner.refreshToken && window.electronAPI) {
      try {
        const result = await window.electronAPI.refreshToken(owner.refreshToken, owner.characterId)
        if (result.success && result.accessToken && result.refreshToken) {
          store.updateOwnerTokens(ownerId, {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt ?? Date.now() + 1200000,
          })
          return result.accessToken
        }
      } catch {
        logger.error('Token refresh failed', undefined, { module: 'ESI' })
      }
      return null
    }

    return owner.accessToken ?? null
  }

  private updateRateLimitState(group: string, headers: Headers): void {
    const remaining = headers.get('X-Ratelimit-Remaining')
    const limit = headers.get('X-Ratelimit-Limit')

    if (remaining !== null) {
      const state: RateLimitState = { remaining: parseInt(remaining, 10), limit: 150 }
      if (limit) {
        const match = limit.match(/(\d+)/)
        if (match && match[1]) state.limit = parseInt(match[1], 10)
      }
      this.rateLimits.set(group, state)

      if (state.remaining < 20) {
        logger.warn('ESI rate limit low', { module: 'ESI', group, remaining: state.remaining })
      }
    }
  }

  private handleRateLimitError(status: number, headers: Headers): number {
    const retryAfter = headers.get('Retry-After')
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000

    logger.error(`ESI rate limit (${status})`, undefined, { module: 'ESI', retryAfter: waitMs / 1000 })
    this.globalRetryAfter = Date.now() + waitMs
    return waitMs
  }

  private async waitForRateLimit(): Promise<void> {
    if (this.globalRetryAfter && Date.now() < this.globalRetryAfter) {
      const waitMs = this.globalRetryAfter - Date.now()
      await this.delay(waitMs)
      this.globalRetryAfter = null
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return
    this.isProcessingQueue = true

    while (this.requestQueue.length > 0) {
      await this.waitForRateLimit()
      const request = this.requestQueue.shift()
      if (request) await request()
      await this.delay(this.minRequestInterval)
    }

    this.isProcessingQueue = false
  }

  private queueRequest<T>(executor: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          resolve(await executor())
        } catch (error) {
          reject(error)
        }
      })
      this.processQueue()
    })
  }

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
    const { characterId, requiresAuth = true, skipQueue = false, schema, ...fetchOptions } = options

    const executor = async (): Promise<T> => {
      await this.waitForRateLimit()

      const url = `${this.baseUrl}${endpoint}`
      const cacheKey = `${characterId ?? 'public'}:${url}`

      const cached = this.cache.get(cacheKey)
      if (cached && Date.now() < cached.expires) {
        logger.debug('ESI cache hit', { module: 'ESI', url, expiresIn: cached.expires - Date.now() })
        return cached.data as T
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
        'User-Agent': ESI_USER_AGENT,
        ...fetchOptions.headers,
      }

      if (requiresAuth) {
        const accessToken = await this.getAccessToken(characterId)
        if (!accessToken) throw new Error('Not authenticated')
        headers['Authorization'] = `Bearer ${accessToken}`
      }

      if (cached?.etag) {
        headers['If-None-Match'] = cached.etag
      }

      logger.debug('ESI request', { module: 'ESI', url, method: fetchOptions.method ?? 'GET' })

      const response = await fetch(url, {
        method: fetchOptions.method ?? 'GET',
        headers,
        body: fetchOptions.body,
      })

      logger.debug('ESI response', {
        module: 'ESI',
        url,
        status: response.status,
        contentType: response.headers.get('Content-Type'),
      })

      const rateLimitGroup = response.headers.get('X-Ratelimit-Group') ?? 'default'
      this.updateRateLimitState(rateLimitGroup, response.headers)

      if (response.status === 420 || response.status === 429) {
        const waitMs = this.handleRateLimitError(response.status, response.headers)
        throw new Error(`Rate limited. Retry after ${waitMs / 1000} seconds`)
      }

      if (response.status === 304 && cached) {
        const expires = response.headers.get('Expires')
        if (expires) cached.expires = new Date(expires).getTime()
        return cached.data as T
      }

      if (!response.ok) {
        let errorMessage = `ESI request failed: ${response.status}`
        try {
          const error = (await response.json()) as ESIError
          errorMessage = error.error || errorMessage
        } catch {
          // Response not JSON
        }
        logger.error('ESI request failed', undefined, { module: 'ESI', endpoint, status: response.status })
        throw new Error(errorMessage)
      }

      const rawData = await response.json()

      let data: T
      if (schema) {
        const result = schema.safeParse(rawData)
        if (!result.success) {
          logger.error('ESI response validation failed', undefined, {
            module: 'ESI',
            endpoint,
            errors: result.error.issues.slice(0, 3),
          })
          throw new Error(`ESI response validation failed: ${result.error.issues[0]?.message}`)
        }
        data = result.data
      } else {
        data = rawData as T
      }

      const etag = response.headers.get('ETag')
      const expires = response.headers.get('Expires')
      if (etag && expires) {
        this.cache.set(cacheKey, { data, etag, expires: new Date(expires).getTime() })
      }

      return data
    }

    return skipQueue ? executor() : this.queueRequest(executor)
  }

  async fetchWithPagination<T>(
    endpoint: string,
    options: { characterId?: number; requiresAuth?: boolean; schema?: z.ZodType<T> } = {}
  ): Promise<T[]> {
    const results: T[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const separator = endpoint.includes('?') ? '&' : '?'
      const pagedEndpoint = `${endpoint}${separator}page=${page}`

      await this.waitForRateLimit()

      const url = `${this.baseUrl}${pagedEndpoint}`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
        'User-Agent': ESI_USER_AGENT,
      }

      if (options.requiresAuth !== false) {
        const accessToken = await this.getAccessToken(options.characterId)
        if (!accessToken) throw new Error('Not authenticated')
        headers['Authorization'] = `Bearer ${accessToken}`
      }

      const response = await fetch(url, { headers })

      const rateLimitGroup = response.headers.get('X-Ratelimit-Group') ?? 'default'
      this.updateRateLimitState(rateLimitGroup, response.headers)

      if (response.status === 420 || response.status === 429) {
        const waitMs = this.handleRateLimitError(response.status, response.headers)
        throw new Error(`Rate limited. Retry after ${waitMs / 1000} seconds`)
      }

      if (!response.ok) {
        const error = (await response.json()) as ESIError
        throw new Error(error.error || `ESI request failed: ${response.status}`)
      }

      const rawData = await response.json()

      if (options.schema) {
        const arraySchema = options.schema.array()
        const result = arraySchema.safeParse(rawData)
        if (!result.success) {
          logger.error('ESI paginated response validation failed', undefined, {
            module: 'ESI',
            endpoint,
            page,
            errors: result.error.issues.slice(0, 3),
          })
          throw new Error(`ESI response validation failed: ${result.error.issues[0]?.message}`)
        }
        results.push(...result.data)
      } else {
        results.push(...(rawData as T[]))
      }

      const xPages = response.headers.get('X-Pages')
      const totalPages = xPages ? parseInt(xPages, 10) : 1
      hasMore = page < totalPages
      page++

      if (hasMore) await this.delay(this.minRequestInterval)
    }

    return results
  }

  async fetchPublic<T>(endpoint: string, options: { skipQueue?: boolean } = {}): Promise<T> {
    return this.fetch<T>(endpoint, { requiresAuth: false, ...options })
  }

  isRateLimited(): boolean {
    return this.globalRetryAfter !== null && Date.now() < this.globalRetryAfter
  }

  getRateLimitInfo(): { isLimited: boolean; retryAfter: number | null } {
    if (this.globalRetryAfter && Date.now() < this.globalRetryAfter) {
      return { isLimited: true, retryAfter: this.globalRetryAfter - Date.now() }
    }
    return { isLimited: false, retryAfter: null }
  }

  clearCache(): void {
    this.cache.clear()
  }

  async fetchBatch<T, R>(
    items: T[],
    fetcher: (item: T) => Promise<R>,
    options: { batchSize?: number; onProgress?: (completed: number, total: number) => void } = {}
  ): Promise<Map<T, R | null>> {
    const { batchSize = 20, onProgress } = options
    const results = new Map<T, R | null>()

    for (let i = 0; i < items.length; i += batchSize) {
      await this.waitForRateLimit()

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

      if (i + batchSize < items.length) {
        await this.delay(this.minRequestInterval)
      }
    }

    return results
  }
}

export const esiClient = new ESIClient()
