import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import pLimit from 'p-limit'
import { ESICache } from './cache'
import { ESIHealthChecker } from './health'
import {
  RateLimitTracker,
  guessRateLimitGroup,
  isContractItemsEndpoint,
} from './rate-limit'
import { logger } from '../logger.js'
import {
  ESI_BASE_URL,
  ESI_COMPATIBILITY_DATE,
  ESI_CONFIG,
  makeUserAgent,
  type ESIRequestOptions,
  type ESIResponse,
  type ESISuccessResponse,
  type ESIResponseMeta,
  type ESIHealthStatus,
} from './types'
import { ESIError } from '../../../shared/esi-types'
import { isAbortError, getErrorMessage } from '../fetch-utils.js'

const RATE_LIMIT_FILE = 'rate-limits.json'
const CACHE_FILE = 'esi-cache.json'

export type ProgressCallback = (progress: {
  current: number
  total: number
}) => void

type TokenProvider = (characterId: number) => Promise<string | null>

export class MainESIService {
  private cache = new ESICache()
  private rateLimiter = new RateLimitTracker()
  private healthChecker: ESIHealthChecker
  private tokenProvider: TokenProvider | null = null
  private rateLimitFilePath: string
  private userAgent: string
  private saveStateTimeout: NodeJS.Timeout | null = null
  private paused = false
  private activeRequests = 0
  private inflightRequests = new Map<string, Promise<ESIResponse<unknown>>>()

  private assertSuccess(
    result: ESIResponse<unknown>
  ): asserts result is ESISuccessResponse<unknown> {
    if (!result.success) {
      throw new ESIError(result.error, result.status ?? 500, result.retryAfter)
    }
  }

  private assertHasMeta(
    result: ESISuccessResponse<unknown>,
    endpoint: string
  ): asserts result is ESISuccessResponse<unknown> & {
    meta: { expiresAt: number; etag: string | null; notModified: boolean }
  } {
    if (!result.meta?.expiresAt) {
      const error = `ESI meta missing: expiresAt not returned for ${endpoint}`
      logger.error(error, undefined, { module: 'ESI', endpoint })
      throw new Error(error)
    }
  }

  constructor() {
    const userData = app.getPath('userData')
    this.rateLimitFilePath = path.join(userData, RATE_LIMIT_FILE)
    this.cache.setFilePath(path.join(userData, CACHE_FILE))
    this.userAgent = makeUserAgent(app.getVersion())
    this.healthChecker = new ESIHealthChecker(app.getVersion())
    this.loadState()
  }

  setTokenProvider(provider: TokenProvider): void {
    this.tokenProvider = provider
  }

  async fetch<T>(
    endpoint: string,
    options: ESIRequestOptions = {}
  ): Promise<T> {
    const result = await this.executeWithRateLimit(endpoint, options)
    this.assertSuccess(result)
    return result.data as T
  }

  async fetchWithMeta<T>(
    endpoint: string,
    options: ESIRequestOptions = {}
  ): Promise<ESIResponseMeta<T>> {
    const cacheKey = this.cache.makeKey(
      options.characterId,
      endpoint,
      options.language
    )
    const cached = this.cache.get(cacheKey)

    if (cached && !options.etag) {
      return {
        data: cached.data as T,
        expiresAt: cached.expires,
        etag: cached.etag,
        notModified: true,
      }
    }

    const result = await this.executeWithRateLimit(endpoint, {
      ...options,
      etag: options.etag ?? this.cache.getEtag(cacheKey),
    })

    this.assertSuccess(result)
    this.assertHasMeta(result, endpoint)

    const response: ESIResponseMeta<T> = {
      data: result.data as T,
      expiresAt: result.meta.expiresAt,
      etag: result.meta.etag ?? null,
      notModified: result.meta.notModified ?? false,
    }

    if (result.xPages) response.xPages = result.xPages

    return response
  }

  async fetchPaginated<T>(
    endpoint: string,
    options: ESIRequestOptions = {}
  ): Promise<T[]> {
    const result = await this.fetchPaginatedWithMeta<T>(endpoint, options)
    return result.data
  }

  async fetchPaginatedWithMeta<T>(
    endpoint: string,
    options: ESIRequestOptions = {}
  ): Promise<ESIResponseMeta<T[]>> {
    const results: T[] = []
    let page = 1
    let totalPages = 1
    let lastMeta:
      | { expiresAt: number; etag: string | null; notModified: boolean }
      | undefined

    while (page <= totalPages) {
      const separator = endpoint.includes('?') ? '&' : '?'
      const pagedEndpoint = `${endpoint}${separator}page=${page}`

      const result = await this.executeWithRateLimit(pagedEndpoint, options)
      this.assertSuccess(result)

      const pageData = result.data as T[]
      results.push(...pageData)

      if (result.meta) {
        lastMeta = result.meta
        if (result.xPages) totalPages = result.xPages
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

  async fetchPaginatedWithProgress<T>(
    endpoint: string,
    options: ESIRequestOptions = {},
    onProgress?: ProgressCallback
  ): Promise<ESIResponseMeta<T[]>> {
    const separator = endpoint.includes('?') ? '&' : '?'

    const firstResult = await this.executeWithRateLimit(
      `${endpoint}${separator}page=1`,
      options
    )
    this.assertSuccess(firstResult)

    const totalPages = firstResult.xPages ?? 1
    const results: T[] = [...(firstResult.data as T[])]
    let lastMeta = firstResult.meta

    onProgress?.({ current: 1, total: totalPages })

    if (totalPages > 1) {
      const limit = pLimit(ESI_CONFIG.maxConcurrentPages)
      const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
      const completedPages = new Set<number>([1])

      const pageResults = await Promise.all(
        pages.map((page) =>
          limit(async () => {
            const result = await this.executeWithRateLimit(
              `${endpoint}${separator}page=${page}`,
              options
            )
            this.assertSuccess(result)

            completedPages.add(page)
            onProgress?.({ current: completedPages.size, total: totalPages })

            return {
              data: result.data as T[],
              meta: result.meta,
            }
          })
        )
      )

      for (const { data, meta } of pageResults) {
        results.push(...data)
        if (meta) lastMeta = meta
      }
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

  private async executeWithRateLimit(
    endpoint: string,
    options: ESIRequestOptions
  ): Promise<ESIResponse<unknown>> {
    while (this.paused) {
      await this.delay(100)
    }

    const healthCheck = await this.healthChecker.ensureHealthy(endpoint)
    if (!healthCheck.healthy) {
      return {
        success: false,
        error: healthCheck.error ?? 'ESI service unavailable',
        status: 503,
        retryAfter: 60,
      }
    }

    const characterId = options.characterId ?? 0
    const cacheKey = this.cache.makeKey(characterId, endpoint, options.language)

    if (options.method !== 'POST') {
      const inflight = this.inflightRequests.get(cacheKey)
      if (inflight) {
        return inflight
      }
    }

    if (isContractItemsEndpoint(endpoint)) {
      const contractDelay = this.rateLimiter.getContractItemsDelay(characterId)
      if (contractDelay > 0) {
        await this.delay(contractDelay)
      }
      this.rateLimiter.recordContractItemsRequest(characterId)
    }

    const group = guessRateLimitGroup(endpoint)
    const delay = this.rateLimiter.getDelayMs(characterId, group)
    if (delay > 0) {
      await this.delay(delay)
    }

    const requestPromise = this.executeRequest(endpoint, options)

    if (options.method !== 'POST') {
      this.inflightRequests.set(cacheKey, requestPromise)
      requestPromise.finally(() => {
        this.inflightRequests.delete(cacheKey)
      })
    }

    return requestPromise
  }

  private async executeRequest(
    endpoint: string,
    options: ESIRequestOptions,
    attempt = 0
  ): Promise<ESIResponse<unknown>> {
    const url = `${ESI_BASE_URL}${endpoint}`
    const cacheKey = this.cache.makeKey(
      options.characterId,
      endpoint,
      options.language
    )

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
      'User-Agent': this.userAgent,
      'Accept-Language': options.language || 'en',
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
        return {
          success: false,
          error: 'Failed to get access token',
          status: 401,
        }
      }
      headers['Authorization'] = `Bearer ${token}`
    }

    if (options.etag) {
      headers['If-None-Match'] = options.etag
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      ESI_CONFIG.requestTimeoutMs
    )

    this.activeRequests++
    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      this.rateLimiter.updateFromHeaders(
        options.characterId ?? 0,
        response.headers
      )
      this.scheduleSaveState()

      if (response.status === 420 || response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const waitSec = retryAfter ? parseInt(retryAfter, 10) : 60
        this.rateLimiter.setGlobalRetryAfter(waitSec)

        if (attempt < ESI_CONFIG.maxRetries) {
          await this.delay(waitSec * 1000)
          return this.executeRequest(endpoint, options, attempt + 1)
        }

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

      const xPages = response.headers.get('X-Pages')

      if (response.status === 304) {
        const cached = this.cache.getStale(cacheKey)
        if (cached && expiresAt) {
          this.cache.updateExpires(cacheKey, expiresAt)
          return {
            success: true,
            data: cached.data,
            meta: { expiresAt, etag: etag ?? cached.etag, notModified: true },
          }
        }
        if (options.etag) {
          logger.debug('304 but cache miss, retrying without etag', {
            module: 'ESI',
            endpoint,
          })
          return this.executeRequest(
            endpoint,
            { ...options, etag: undefined },
            attempt
          )
        }
      }

      if (!response.ok) {
        let errorMessage = `ESI error: ${response.status}`
        try {
          const errorBody = (await response.json()) as { error?: string }
          if (errorBody.error) errorMessage = errorBody.error
        } catch (parseErr) {
          logger.debug('ESI error response was not JSON', {
            module: 'ESI',
            endpoint,
            status: response.status,
            parseError:
              parseErr instanceof Error ? parseErr.message : String(parseErr),
          })
        }
        return { success: false, error: errorMessage, status: response.status }
      }

      const data = await response.json()

      if (etag && expiresAt) {
        this.cache.set(cacheKey, data, etag, expiresAt)
      }

      return {
        success: true,
        data,
        meta: expiresAt ? { expiresAt, etag, notModified: false } : undefined,
        xPages: xPages ? parseInt(xPages, 10) : undefined,
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof ESIError) throw error

      const isAbort = isAbortError(error)
      const message = isAbort
        ? 'Request timeout'
        : error instanceof Error
          ? error.message
          : 'Network error'

      const maxAttempts = isAbort
        ? ESI_CONFIG.maxTimeoutRetries
        : ESI_CONFIG.maxRetries
      if (attempt < maxAttempts) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000)
        logger.debug(
          `Retrying after ${isAbort ? 'timeout' : 'network error'}`,
          {
            module: 'ESI',
            endpoint,
            attempt: attempt + 1,
            error: message,
            backoffMs,
          }
        )
        await this.delay(backoffMs)
        return this.executeRequest(endpoint, options, attempt + 1)
      }

      return { success: false, error: message }
    } finally {
      this.activeRequests--
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  clearCache(): void {
    this.cache.clear()
  }

  clearCacheByPattern(pattern: string): number {
    return this.cache.clearByPattern(pattern)
  }

  getRateLimitInfo(): {
    globalRetryAfter: number | null
    activeRequests: number
  } {
    return {
      globalRetryAfter: this.rateLimiter.getGlobalRetryAfter(),
      activeRequests: this.activeRequests,
    }
  }

  async getHealthStatus(): Promise<ESIHealthStatus> {
    return this.healthChecker.getHealthStatus()
  }

  getCachedHealthStatus(): ESIHealthStatus | null {
    return this.healthChecker.getCachedStatus()
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.rateLimitFilePath)) {
        const data = fs.readFileSync(this.rateLimitFilePath, 'utf-8')
        const states = JSON.parse(data)
        this.rateLimiter.loadState(states)
      }
    } catch (err) {
      logger.warn('Failed to load rate limit state', {
        module: 'ESI',
        error: getErrorMessage(err),
      })
    }
    this.cache.load()
  }

  private scheduleSaveState(): void {
    if (this.saveStateTimeout) return
    this.saveStateTimeout = setTimeout(() => {
      this.saveStateTimeout = null
      this.saveState()
    }, 5000)
  }

  private saveState(): void {
    try {
      const states = this.rateLimiter.exportState()
      fs.writeFileSync(this.rateLimitFilePath, JSON.stringify(states, null, 2))
    } catch (err) {
      logger.warn('Failed to save rate limit state', {
        module: 'ESI',
        error: getErrorMessage(err),
      })
    }
  }

  saveImmediately(): void {
    if (this.saveStateTimeout) {
      clearTimeout(this.saveStateTimeout)
      this.saveStateTimeout = null
    }
    this.saveState()
    this.cache.saveImmediately()
  }
}

let instance: MainESIService | null = null

export function getESIService(): MainESIService {
  if (!instance) {
    instance = new MainESIService()
  }
  return instance
}
