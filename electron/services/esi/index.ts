import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { ESICache } from './cache'
import { RateLimitTracker } from './rate-limit'
import { RequestQueue } from './queue'
import {
  ESI_BASE_URL,
  ESI_COMPATIBILITY_DATE,
  ESI_USER_AGENT,
  type ESIRequestOptions,
  type ESIResponse,
  type ESIResponseMeta,
} from './types'

const DEFAULT_CACHE_MS = 5 * 60 * 1000
const STATE_FILE = 'rate-limits.json'

type TokenProvider = (characterId: number) => Promise<string | null>

export class MainESIService {
  private cache = new ESICache()
  private rateLimiter = new RateLimitTracker()
  private queue: RequestQueue
  private tokenProvider: TokenProvider | null = null
  private stateFilePath: string

  constructor() {
    this.stateFilePath = path.join(app.getPath('userData'), STATE_FILE)
    this.queue = new RequestQueue(this.rateLimiter, this.executeRequest.bind(this))
    this.loadState()
  }

  setTokenProvider(provider: TokenProvider): void {
    this.tokenProvider = provider
  }

  async request<T>(endpoint: string, options: ESIRequestOptions = {}): Promise<ESIResponse<T>> {
    return this.queue.enqueue(endpoint, options) as Promise<ESIResponse<T>>
  }

  async requestWithMeta<T>(
    endpoint: string,
    options: ESIRequestOptions = {}
  ): Promise<ESIResponse<ESIResponseMeta<T>>> {
    const cacheKey = this.cache.makeKey(options.characterId, endpoint)
    const cached = this.cache.get(cacheKey)

    if (cached && !options.etag) {
      return {
        success: true,
        data: {
          data: cached.data as T,
          expiresAt: cached.expires,
          etag: cached.etag,
          notModified: true,
        },
      }
    }

    const result = await this.queue.enqueue(endpoint, {
      ...options,
      etag: options.etag ?? cached?.etag,
    })

    if (!result.success) return result as ESIResponse<ESIResponseMeta<T>>

    return {
      success: true,
      data: {
        data: result.data as T,
        expiresAt: result.meta?.expiresAt ?? Date.now() + DEFAULT_CACHE_MS,
        etag: result.meta?.etag ?? null,
        notModified: result.meta?.notModified ?? false,
      },
    }
  }

  async requestPaginated<T>(
    endpoint: string,
    options: ESIRequestOptions = {}
  ): Promise<ESIResponse<T[]>> {
    const results: T[] = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      const separator = endpoint.includes('?') ? '&' : '?'
      const pagedEndpoint = `${endpoint}${separator}page=${page}`

      const result = await this.queue.enqueue(pagedEndpoint, options)

      if (!result.success) return result as ESIResponse<T[]>

      const pageData = result.data as T[]
      results.push(...pageData)

      if (result.meta?.expiresAt) {
        const xPages = (result as { xPages?: number }).xPages
        if (xPages) totalPages = xPages
      }

      page++
    }

    return { success: true, data: results }
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
      'User-Agent': ESI_USER_AGENT,
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
          error: `Rate limited`,
          status: response.status,
          retryAfter: waitSec,
        }
      }

      const expiresHeader = response.headers.get('Expires')
      const expiresAt = expiresHeader ? new Date(expiresHeader).getTime() : Date.now() + DEFAULT_CACHE_MS
      const etag = response.headers.get('ETag')
      const xPages = response.headers.get('X-Pages')

      if (response.status === 304) {
        const cached = this.cache.get(cacheKey)
        if (cached) {
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

      if (etag) {
        this.cache.set(cacheKey, data, etag, expiresAt)
      }

      const result: ESIResponse<unknown> = {
        success: true,
        data,
        meta: { expiresAt, etag, notModified: false },
      }

      if (xPages) {
        ;(result as { xPages?: number }).xPages = parseInt(xPages, 10)
      }

      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      }
    }
  }

  clearCache(): void {
    this.cache.clear()
  }

  getRateLimitInfo(): Record<string, unknown> {
    return {
      globalRetryAfter: this.rateLimiter.getGlobalRetryAfter(),
      groups: Object.fromEntries(this.rateLimiter.getAllStates()),
      queueLength: this.queue.length,
    }
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath, 'utf-8')
        const states = JSON.parse(data)
        this.rateLimiter.loadStates(states)
      }
    } catch {
      // Ignore load errors
    }
  }

  private saveState(): void {
    try {
      const states = this.rateLimiter.exportStates()
      fs.writeFileSync(this.stateFilePath, JSON.stringify(states, null, 2))
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
