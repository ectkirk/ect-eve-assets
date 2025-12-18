import type { ESIRequestOptions, ESIResponse } from './types'
import type { RateLimitTracker } from './rate-limit'

interface QueuedRequest {
  id: string
  endpoint: string
  options: ESIRequestOptions
  resolve: (value: ESIResponse<unknown>) => void
  reject: (error: Error) => void
}

export class RequestQueue {
  private queue: QueuedRequest[] = []
  private processing = false
  private rateLimiter: RateLimitTracker
  private executeRequest: (endpoint: string, options: ESIRequestOptions) => Promise<ESIResponse<unknown>>

  constructor(
    rateLimiter: RateLimitTracker,
    executeRequest: (endpoint: string, options: ESIRequestOptions) => Promise<ESIResponse<unknown>>
  ) {
    this.rateLimiter = rateLimiter
    this.executeRequest = executeRequest
  }

  enqueue(endpoint: string, options: ESIRequestOptions): Promise<ESIResponse<unknown>> {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      this.queue.push({ id, endpoint, options, resolve, reject })
      this.process()
    })
  }

  private async process(): Promise<void> {
    if (this.processing) return
    this.processing = true

    while (this.queue.length > 0) {
      const globalDelay = this.rateLimiter.getGlobalRetryAfter()
      if (globalDelay) {
        await this.delay(globalDelay)
      }

      const request = this.queue.shift()
      if (!request) break

      const group = this.guessRateLimitGroup(request.endpoint)
      const characterId = request.options.characterId ?? 0
      const delayMs = this.rateLimiter.getDelayMs(characterId, group)

      if (delayMs > 100) {
        await this.delay(delayMs)
      }

      try {
        const result = await this.executeRequest(request.endpoint, request.options)
        request.resolve(result)
      } catch (error) {
        request.reject(error instanceof Error ? error : new Error(String(error)))
      }

      await this.delay(100)
    }

    this.processing = false
  }

  private guessRateLimitGroup(endpoint: string): string {
    if (endpoint.includes('/characters/') && endpoint.includes('/assets')) return 'char-asset'
    if (endpoint.includes('/corporations/') && endpoint.includes('/assets')) return 'corp-asset'
    if (endpoint.includes('/characters/') && endpoint.includes('/wallet')) return 'char-wallet'
    if (endpoint.includes('/corporations/') && endpoint.includes('/wallet')) return 'corp-wallet'
    if (endpoint.includes('/characters/') && endpoint.includes('/industry')) return 'char-industry'
    if (endpoint.includes('/corporations/') && endpoint.includes('/industry')) return 'corp-industry'
    if (endpoint.includes('/characters/') && endpoint.includes('/contracts')) return 'char-contract'
    if (endpoint.includes('/corporations/') && endpoint.includes('/contracts')) return 'corp-contract'
    if (endpoint.includes('/characters/') && endpoint.includes('/clones')) return 'char-location'
    if (endpoint.includes('/characters/') && endpoint.includes('/implants')) return 'char-detail'
    if (endpoint.includes('/characters/') && endpoint.includes('/blueprints')) return 'char-industry'
    if (endpoint.includes('/corporations/') && endpoint.includes('/blueprints')) return 'corp-industry'
    if (endpoint.includes('/corporations/') && endpoint.includes('/starbases')) return 'corp-structure'
    if (endpoint.includes('/corporations/') && endpoint.includes('/structures')) return 'corp-structure'
    if (endpoint.includes('/markets/')) return 'market'
    if (endpoint.includes('/universe/')) return 'universe'
    return 'default'
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  get length(): number {
    return this.queue.length
  }

  get isProcessing(): boolean {
    return this.processing
  }

  clear(): void {
    for (const request of this.queue) {
      request.reject(new Error('Queue cleared'))
    }
    this.queue = []
  }
}
