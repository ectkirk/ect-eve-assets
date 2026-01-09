import { logger } from '../logger.js'
import { RATE_LIMIT_CONFIG } from './types'

interface RateLimitState {
  remaining: number
  limit: number
  windowMs: number
  windowStart: number
}

interface ErrorLimitState {
  remain: number
  resetAt: number
}

export interface RateLimitExportedState {
  groups: Record<string, RateLimitState>
  errorLimit: ErrorLimitState | null
  globalRetryAfter: number | null
  contractItemsTimestamps?: Record<number, number[]>
}

export class RateLimitTracker {
  private groups = new Map<string, RateLimitState>()
  private errorLimit: ErrorLimitState | null = null
  private globalRetryAfter: number | null = null
  private contractItemsTimestamps = new Map<number, number[]>()

  getDelayMs(characterId: number, group: string): number {
    const now = Date.now()

    if (this.globalRetryAfter && now < this.globalRetryAfter) {
      return this.globalRetryAfter - now
    }

    const errorDelay = this.getErrorLimitDelay(now)
    if (errorDelay > 0) return errorDelay

    const key = `${characterId}:${group}`
    const state = this.groups.get(key)
    if (!state) return 0

    const elapsed = now - state.windowStart
    if (elapsed >= state.windowMs) {
      this.groups.delete(key)
      return 0
    }

    if (state.remaining === 0) {
      return state.windowMs - elapsed
    }

    const pct = state.remaining / state.limit
    if (pct < 0.1) {
      return 1000 + Math.random() * 2000
    }
    if (pct < 0.2) {
      return 200 + Math.random() * 300
    }

    return 0
  }

  private getErrorLimitDelay(now: number): number {
    if (!this.errorLimit) return 0

    if (now >= this.errorLimit.resetAt) {
      this.errorLimit = null
      return 0
    }

    if (this.errorLimit.remain <= RATE_LIMIT_CONFIG.errorLimitPauseThreshold) {
      return this.errorLimit.resetAt - now
    }

    if (this.errorLimit.remain <= RATE_LIMIT_CONFIG.errorLimitWarnThreshold) {
      return 500 + Math.random() * 500
    }

    return 0
  }

  updateFromHeaders(characterId: number, headers: Headers): void {
    const now = Date.now()

    const errorRemain = headers.get('X-ESI-Error-Limit-Remain')
    const errorReset = headers.get('X-ESI-Error-Limit-Reset')
    if (errorRemain !== null) {
      const remain = parseInt(errorRemain, 10)
      const resetAt = errorReset
        ? now + parseInt(errorReset, 10) * 1000
        : now + 60000

      if (remain <= RATE_LIMIT_CONFIG.errorLimitWarnThreshold) {
        if (
          !this.errorLimit ||
          this.errorLimit.remain > RATE_LIMIT_CONFIG.errorLimitWarnThreshold
        ) {
          logger.warn('ESI error limit getting low', { module: 'ESI', remain })
        }
      }
      this.errorLimit = { remain, resetAt }
    }

    const group = headers.get('X-Ratelimit-Group')
    const remaining = headers.get('X-Ratelimit-Remaining')
    if (!group || remaining === null) return

    const limitHeader = headers.get('X-Ratelimit-Limit')
    let limit = 150
    let windowMs = 15 * 60 * 1000

    if (limitHeader) {
      const match = limitHeader.match(/(\d+)\/(\d+)([smh])/)
      if (match?.[1] && match[2] && match[3]) {
        limit = parseInt(match[1], 10)
        const windowValue = parseInt(match[2], 10)
        windowMs =
          match[3] === 'h'
            ? windowValue * 3600000
            : match[3] === 'm'
              ? windowValue * 60000
              : windowValue * 1000
      }
    }

    const key = `${characterId}:${group}`
    const existing = this.groups.get(key)

    const state: RateLimitState = {
      remaining: parseInt(remaining, 10),
      limit,
      windowMs,
      windowStart: existing?.windowStart ?? now,
    }

    if (state.remaining > (existing?.remaining ?? 0)) {
      state.windowStart = now
    }

    this.groups.set(key, state)
  }

  setGlobalRetryAfter(seconds: number): void {
    this.globalRetryAfter = Date.now() + seconds * 1000
    logger.warn('ESI global rate limit hit', {
      module: 'ESI',
      retryAfterSeconds: seconds,
    })
  }

  getContractItemsDelay(characterId: number): number {
    const now = Date.now()
    const timestamps = this.contractItemsTimestamps.get(characterId)
    if (!timestamps || timestamps.length === 0) return 0

    const cutoff = now - RATE_LIMIT_CONFIG.contractItemsWindowMs
    const recent = timestamps.filter((t) => t > cutoff)

    if (recent.length < RATE_LIMIT_CONFIG.contractItemsLimit) return 0

    const oldest = recent[0]!
    return oldest + RATE_LIMIT_CONFIG.contractItemsWindowMs - now + 50
  }

  recordContractItemsRequest(characterId: number): void {
    const now = Date.now()
    const timestamps = this.contractItemsTimestamps.get(characterId) ?? []
    const cutoff = now - RATE_LIMIT_CONFIG.contractItemsWindowMs
    const filtered = timestamps.filter((t) => t > cutoff)
    filtered.push(now)
    this.contractItemsTimestamps.set(characterId, filtered)
  }

  getGlobalRetryAfter(): number | null {
    if (this.globalRetryAfter && Date.now() < this.globalRetryAfter) {
      return this.globalRetryAfter - Date.now()
    }
    this.globalRetryAfter = null
    return null
  }

  clear(): void {
    this.groups.clear()
    this.errorLimit = null
    this.globalRetryAfter = null
    this.contractItemsTimestamps.clear()
  }

  exportState(): RateLimitExportedState {
    const groups: Record<string, RateLimitState> = {}
    for (const [key, state] of this.groups) {
      groups[key] = state
    }
    const now = Date.now()
    const cutoff = now - RATE_LIMIT_CONFIG.contractItemsWindowMs
    const contractItemsTimestamps: Record<number, number[]> = {}
    for (const [charId, timestamps] of this.contractItemsTimestamps) {
      const recent = timestamps.filter((t) => t > cutoff)
      if (recent.length > 0) {
        contractItemsTimestamps[charId] = recent
      }
    }
    return {
      groups,
      errorLimit: this.errorLimit,
      globalRetryAfter: this.globalRetryAfter,
      contractItemsTimestamps,
    }
  }

  loadState(
    state: RateLimitExportedState | Record<string, RateLimitState>
  ): void {
    const now = Date.now()

    const isNewFormat = 'groups' in state && typeof state.groups === 'object'
    const groups = isNewFormat
      ? (state as RateLimitExportedState).groups
      : (state as Record<string, RateLimitState>)

    for (const [key, s] of Object.entries(groups)) {
      if (now - s.windowStart < s.windowMs) {
        this.groups.set(key, s)
      }
    }

    if (isNewFormat) {
      const fullState = state as RateLimitExportedState
      if (fullState.errorLimit && now < fullState.errorLimit.resetAt) {
        this.errorLimit = fullState.errorLimit
      }
      if (fullState.globalRetryAfter && now < fullState.globalRetryAfter) {
        this.globalRetryAfter = fullState.globalRetryAfter
      }
      if (fullState.contractItemsTimestamps) {
        const cutoff = now - RATE_LIMIT_CONFIG.contractItemsWindowMs
        for (const [charIdStr, timestamps] of Object.entries(
          fullState.contractItemsTimestamps
        )) {
          const recent = timestamps.filter((t) => t > cutoff)
          if (recent.length > 0) {
            this.contractItemsTimestamps.set(Number(charIdStr), recent)
          }
        }
      }
    }
  }
}

export function guessRateLimitGroup(endpoint: string): string {
  if (endpoint.includes('/characters/') && endpoint.includes('/assets'))
    return 'char-asset'
  if (endpoint.includes('/corporations/') && endpoint.includes('/assets'))
    return 'corp-asset'
  if (endpoint.includes('/characters/') && endpoint.includes('/wallet'))
    return 'char-wallet'
  if (endpoint.includes('/characters/') && endpoint.includes('/loyalty'))
    return 'char-wallet'
  if (endpoint.includes('/corporations/') && endpoint.includes('/wallet'))
    return 'corp-wallet'
  if (endpoint.includes('/characters/') && endpoint.includes('/industry'))
    return 'char-industry'
  if (endpoint.includes('/corporations/') && endpoint.includes('/industry'))
    return 'corp-industry'
  if (endpoint.includes('/characters/') && endpoint.includes('/contracts'))
    return 'char-contract'
  if (endpoint.includes('/corporations/') && endpoint.includes('/contracts'))
    return 'corp-contract'
  if (endpoint.includes('/characters/') && endpoint.includes('/clones'))
    return 'char-location'
  if (endpoint.includes('/characters/') && endpoint.includes('/implants'))
    return 'char-detail'
  if (endpoint.includes('/characters/') && endpoint.includes('/blueprints'))
    return 'char-industry'
  if (endpoint.includes('/corporations/') && endpoint.includes('/blueprints'))
    return 'corp-industry'
  if (endpoint.includes('/corporations/') && endpoint.includes('/starbases'))
    return 'corp-structure'
  if (endpoint.includes('/corporations/') && endpoint.includes('/structures'))
    return 'corp-structure'
  if (
    endpoint.includes('/corporations/') &&
    endpoint.includes('/customs_offices')
  )
    return 'corp-industry'
  if (endpoint.includes('/markets/')) return 'market'
  if (endpoint.includes('/universe/')) return 'universe'
  return 'default'
}

export function isContractItemsEndpoint(endpoint: string): boolean {
  return endpoint.includes('/contracts/') && endpoint.includes('/items')
}
