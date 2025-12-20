import type { RateLimitGroupState } from './types'
import { logger } from '../logger.js'

const DEFAULT_WINDOW_MS = 15 * 60 * 1000
const ERROR_WINDOW_MS = 60 * 1000
const GROUP_ERROR_BACKOFF_THRESHOLD = 3
const ERROR_LIMIT_WARN_THRESHOLD = 50
const ERROR_LIMIT_PAUSE_THRESHOLD = 20

interface GroupErrorState {
  errors: number
  windowStart: number
}

interface GroupErrorLimitState {
  remain: number
  resetAt: number
}

export class RateLimitTracker {
  private groups = new Map<string, RateLimitGroupState>()
  private groupErrors = new Map<string, GroupErrorState>()
  private groupErrorLimits = new Map<string, GroupErrorLimitState>()
  private globalRetryAfter: number | null = null

  makeKey(characterId: number, group: string): string {
    return `${characterId}:${group}`
  }

  updateFromHeaders(
    characterId: number,
    headers: Headers
  ): { group: string; state: RateLimitGroupState } | null {
    const group = headers.get('X-Ratelimit-Group')
    if (!group) return null

    const errorRemain = headers.get('X-ESI-Error-Limit-Remain')
    const errorReset = headers.get('X-ESI-Error-Limit-Reset')

    if (errorRemain !== null) {
      const remain = parseInt(errorRemain, 10)
      const resetAt = errorReset ? Date.now() + parseInt(errorReset, 10) * 1000 : Date.now() + 60000
      const existing = this.groupErrorLimits.get(group)

      if (!existing || remain < existing.remain) {
        if (remain <= ERROR_LIMIT_WARN_THRESHOLD && (!existing || existing.remain > ERROR_LIMIT_WARN_THRESHOLD)) {
          logger.warn('ESI error limit getting low for group', { module: 'ESI', group, remain })
        }
      }

      this.groupErrorLimits.set(group, { remain, resetAt })
    }

    const remaining = headers.get('X-Ratelimit-Remaining')
    const used = headers.get('X-Ratelimit-Used')
    const limitHeader = headers.get('X-Ratelimit-Limit')
    if (remaining === null) return null

    let limit = 150
    let windowMs = DEFAULT_WINDOW_MS

    if (limitHeader) {
      const match = limitHeader.match(/(\d+)\/(\d+)([smh])/)
      if (match && match[1] && match[2] && match[3]) {
        limit = parseInt(match[1], 10)
        const windowValue = parseInt(match[2], 10)
        const unit = match[3]
        windowMs =
          unit === 'h' ? windowValue * 3600000 : unit === 'm' ? windowValue * 60000 : windowValue * 1000
      }
    }

    const now = Date.now()
    const key = this.makeKey(characterId, group)
    const existing = this.groups.get(key)

    const state: RateLimitGroupState = {
      remaining: parseInt(remaining, 10),
      used: used !== null ? parseInt(used, 10) : 0,
      limit,
      windowMs,
      lastUpdated: now,
      windowStart: existing?.windowStart ?? now,
    }

    if (state.remaining > (existing?.remaining ?? 0)) {
      state.windowStart = now
    }

    this.groups.set(key, state)
    return { group, state }
  }

  getDelayMs(characterId: number, group: string): number {
    if (this.globalRetryAfter && Date.now() < this.globalRetryAfter) {
      return this.globalRetryAfter - Date.now()
    }

    const groupErrorDelay = this.getGroupErrorDelay(group)
    if (groupErrorDelay > 0) {
      return groupErrorDelay
    }

    const groupErrorLimitDelay = this.getGroupErrorLimitDelay(group)
    if (groupErrorLimitDelay > 0) {
      return groupErrorLimitDelay
    }

    const key = this.makeKey(characterId, group)
    const state = this.groups.get(key)
    if (!state) return 100

    const windowElapsed = Date.now() - state.windowStart
    if (windowElapsed >= state.windowMs) {
      this.groups.delete(key)
      return 100
    }

    const pct = state.remaining / state.limit

    if (state.remaining === 0) {
      return state.windowMs - windowElapsed
    }
    if (pct < 0.05) {
      return 2000 + Math.random() * 3000
    }
    if (pct < 0.15) {
      return 500 + Math.random() * 1500
    }
    if (pct < 0.25) {
      return 100 + Math.random() * 400
    }
    return 100
  }

  setGlobalRetryAfter(retryAfterSec: number): void {
    this.globalRetryAfter = Date.now() + retryAfterSec * 1000
  }

  recordGroupError(group: string): void {
    const now = Date.now()
    const existing = this.groupErrors.get(group)

    if (existing && now - existing.windowStart < ERROR_WINDOW_MS) {
      existing.errors++
      if (existing.errors >= GROUP_ERROR_BACKOFF_THRESHOLD) {
        logger.warn('Group generating errors, backing off', {
          module: 'ESI',
          group,
          errors: existing.errors,
        })
      }
    } else {
      this.groupErrors.set(group, { errors: 1, windowStart: now })
    }
  }

  getGroupErrorDelay(group: string): number {
    const state = this.groupErrors.get(group)
    if (!state) return 0

    const elapsed = Date.now() - state.windowStart
    if (elapsed >= ERROR_WINDOW_MS) {
      this.groupErrors.delete(group)
      return 0
    }

    if (state.errors >= GROUP_ERROR_BACKOFF_THRESHOLD) {
      const backoffMs = Math.min(state.errors * 2000, 30000)
      return backoffMs
    }

    return 0
  }

  getGroupErrorLimitDelay(group: string): number {
    const state = this.groupErrorLimits.get(group)
    if (!state) return 0

    if (Date.now() >= state.resetAt) {
      this.groupErrorLimits.delete(group)
      return 0
    }

    if (state.remain <= ERROR_LIMIT_PAUSE_THRESHOLD) {
      return state.resetAt - Date.now()
    }

    if (state.remain <= ERROR_LIMIT_WARN_THRESHOLD) {
      return 500 + Math.random() * 1000
    }

    return 0
  }

  isGloballyLimited(): boolean {
    return this.globalRetryAfter !== null && Date.now() < this.globalRetryAfter
  }

  getGlobalRetryAfter(): number | null {
    if (this.globalRetryAfter && Date.now() < this.globalRetryAfter) {
      return this.globalRetryAfter - Date.now()
    }
    this.globalRetryAfter = null
    return null
  }

  getState(characterId: number, group: string): RateLimitGroupState | undefined {
    return this.groups.get(this.makeKey(characterId, group))
  }

  getAllStates(): Map<string, RateLimitGroupState> {
    return new Map(this.groups)
  }

  loadStates(states: Record<string, RateLimitGroupState>): void {
    const now = Date.now()
    for (const [key, state] of Object.entries(states)) {
      if (now - state.windowStart < state.windowMs) {
        this.groups.set(key, state)
      }
    }
  }

  exportStates(): Record<string, RateLimitGroupState> {
    const result: Record<string, RateLimitGroupState> = {}
    for (const [key, state] of this.groups) {
      result[key] = state
    }
    return result
  }

  clear(): void {
    this.groups.clear()
    this.groupErrors.clear()
    this.groupErrorLimits.clear()
    this.globalRetryAfter = null
  }
}
