import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { ESICache } from './cache'
import { RateLimitTracker } from './rate-limit'
import { RequestQueue } from './queue'
import { logger } from '../logger.js'
import {
  ESI_BASE_URL,
  ESI_COMPATIBILITY_DATE,
  makeUserAgent,
  type ESIRequestOptions,
  type ESIResponse,
  type ESIResponseMeta,
} from './types'
import { ESIError } from '../../../shared/esi-types'

const RATE_LIMIT_FILE = 'rate-limits.json'
const CACHE_FILE = 'esi-cache.json'

type TokenProvider = (characterId: number) => Promise<string | null>

export class MainESIService {
  private cache = new ESICache()
  private rateLimiter = new RateLimitTracker()
  private queue: RequestQueue
  private tokenProvider: TokenProvider | null = null
  private rateLimitFilePath: string
  private userAgent: string

  constructor() {
    const userData = app.getPath('userData')
    this.rateLimitFilePath = path.join(userData, RATE_LIMIT_FILE)
    this.cache.setFilePath(path.join(userData, CACHE_FILE))
    this.queue = new RequestQueue(this.rateLimiter, this.executeRequest.bind(this))
    this.userAgent = makeUserAgent(app.getVersion())
    this.loadState()
  }

  setTokenProvider(provider: TokenProvider): void {
    this.tokenProvider = provider
  }

  async fetch<T>(endpoint: string, options: ESIRequestOptions = {}): Promise<T> {
    const result = await this.queue.enqueue(endpoint, options)
    if (!result.success) {
      throw new ESIError(result.error, result.status ?? 500, result.retryAfter)
    }
    return result.data as T
  }

  async fetchWithMeta<T>(endpoint: string, options: ESIRequestOptions = {}): Promise<ESIResponseMeta<T>> {
    const cacheKey = this.cache.makeKey(options.characterId, endpoint)
    const cached = this.cache.get(cacheKey)

    if (cached && !options.etag) {
      return {
        data: cached.data as T,
        expiresAt: cached.expires,
        etag: cached.etag,
        notModified: true,
      }
    }

    const result = await this.queue.enqueue(endpoint, {
      ...options,
      etag: options.etag ?? cached?.etag,
    })

    if (!result.success) {
      throw new ESIError(result.error, result.status ?? 500, result.retryAfter)
    }

    if (!result.meta?.expiresAt) {
      const error = `ESI meta missing: expiresAt not returned for ${endpoint}`
      logger.error(error, undefined, { module: 'ESI', endpoint })
      throw new Error(error)
    }

    const response: ESIResponseMeta<T> = {
      data: result.data as T,
      expiresAt: result.meta.expiresAt,
      etag: result.meta.etag ?? null,
      notModified: result.meta.notModified ?? false,
    }

    const xPages = (result as { xPages?: number }).xPages
    if (xPages) response.xPages = xPages

    return response
  }

  async fetchPaginated<T>(endpoint: string, options: ESIRequestOptions = {}): Promise<T[]> {
    const result = await this.fetchPaginatedWithMeta<T>(endpoint, options)
    return result.data
  }

  async fetchPaginatedWithMeta<T>(endpoint: string, options: ESIRequestOptions = {}): Promise<ESIResponseMeta<T[]>> {
    const results: T[] = []
    let page = 1
    let totalPages = 1
    let lastMeta: { expiresAt: number; etag: string | null; notModified: boolean } | undefined

    while (page <= totalPages) {
      const separator = endpoint.includes('?') ? '&' : '?'
      const pagedEndpoint = `${endpoint}${separator}page=${page}`

      const result = await this.queue.enqueue(pagedEndpoint, options)

      if (!result.success) {
        throw new ESIError(result.error, result.status ?? 500, result.retryAfter)
      }

      const pageData = result.data as T[]
      results.push(...pageData)

      if (result.meta) {
        lastMeta = result.meta
        const xPages = (result as { xPages?: number }).xPages
        if (xPages) totalPages = xPages
      }

      page++
    }

    if (!lastMeta?.expiresAt) {
      const error = `ESI meta missing: expiresAt not returned for ${endpoint}`
      logger.error(error, undefined, { module: 'ESI', endpoint })
      throw new Error(error)
    }

    return {
      data: results,
      expiresAt: lastMeta.expiresAt,
      etag: lastMeta.etag ?? null,
      notModified: lastMeta.notModified ?? false,
    }
  }

  private async executeRequest(
    endpoint: string,
    options: ESIRequestOptions
  ): Promise<ESIResponse<unknown>> {
    const url = `${ESI_BASE_URL}${endpoint}`
    const cacheKey = this.cache.makeKey(options.characterId, endpoint)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
      'User-Agent': this.userAgent,
    }

    if (options.requiresAuth !== false && options.characterId) {
      if (!this.tokenProvider) {
        return { success: false, error: 'No token provider configured' }
      }
      let token: string | null
      try {
        token = await this.tokenProvider(options.characterId)
      } catch {
        return { success: false, error: 'Token provider error', status: 401 }
      }
      if (!token) {
        return { success: false, error: 'Failed to get access token', status: 401 }
      }
      headers['Authorization'] = `Bearer ${token}`
    }

    if (options.etag) {
      headers['If-None-Match'] = options.etag
    }

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body,
      })

      if (options.characterId) {
        this.rateLimiter.updateFromHeaders(options.characterId, response.headers)
        this.saveState()
      }

      if (response.status === 420 || response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const waitSec = retryAfter ? parseInt(retryAfter, 10) : 60
        this.rateLimiter.setGlobalRetryAfter(waitSec)
        return {
          success: false,
          error: 'Rate limited',
          status: response.status,
          retryAfter: waitSec,
        }
      }

      const expiresHeader = response.headers.get('Expires')
      const expiresAt = expiresHeader ? new Date(expiresHeader).getTime() : null
      const etag = response.headers.get('ETag')

      if (expiresAt) {
        logger.debug('ESI response headers', {
          module: 'ESI',
          url,
          status: response.status,
          expiresHeader,
          expiresAt,
          expiresIn: Math.round((expiresAt - Date.now()) / 1000),
        })
      }
      const xPages = response.headers.get('X-Pages')

      if (response.status === 304) {
        const cached = this.cache.get(cacheKey)
        if (cached && expiresAt) {
          this.cache.updateExpires(cacheKey, expiresAt)
          return {
            success: true,
            data: cached.data,
            meta: { expiresAt, etag: etag ?? cached.etag, notModified: true },
          }
        }
      }

      if (!response.ok) {
        let errorMessage = `ESI error: ${response.status}`
        try {
          const errorBody = (await response.json()) as { error?: string }
          if (errorBody.error) errorMessage = errorBody.error
        } catch {
          // Non-JSON response
        }
        return { success: false, error: errorMessage, status: response.status }
      }

      const data = await response.json()

      if (etag && expiresAt) {
        this.cache.set(cacheKey, data, etag, expiresAt)
      }

      const result: ESIResponse<unknown> = {
        success: true,
        data,
        meta: expiresAt ? { expiresAt, etag, notModified: false } : undefined,
      }

      if (xPages) {
        ;(result as { xPages?: number }).xPages = parseInt(xPages, 10)
      }

      return result
    } catch (error) {
      if (error instanceof ESIError) throw error
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      }
    }
  }

  clearCache(): void {
    this.cache.clear()
  }

  getRateLimitInfo(): { globalRetryAfter: number | null; queueLength: number } {
    return {
      globalRetryAfter: this.rateLimiter.getGlobalRetryAfter(),
      queueLength: this.queue.length,
    }
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.rateLimitFilePath)) {
        const data = fs.readFileSync(this.rateLimitFilePath, 'utf-8')
        const states = JSON.parse(data)
        this.rateLimiter.loadStates(states)
      }
    } catch {
      // Ignore load errors
    }
    this.cache.load()
  }

  private saveState(): void {
    try {
      const states = this.rateLimiter.exportStates()
      fs.writeFileSync(this.rateLimitFilePath, JSON.stringify(states, null, 2))
    } catch {
      // Ignore save errors
    }
  }
}

let instance: MainESIService | null = null

export function getESIService(): MainESIService {
  if (!instance) {
    instance = new MainESIService()
  }
  return instance
}
