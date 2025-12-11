import type { RateLimitGroupState } from './types'
import { LOW_LIMIT_GROUPS } from './types'

const DEFAULT_WINDOW_MS = 15 * 60 * 1000

export class RateLimitTracker {
  private groups = new Map<string, RateLimitGroupState>()
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

    const remaining = headers.get('X-Ratelimit-Remaining')
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

    const key = this.makeKey(characterId, group)
    const state = this.groups.get(key)
    if (!state) return 100

    const windowElapsed = Date.now() - state.windowStart
    if (windowElapsed >= state.windowMs) {
      this.groups.delete(key)
      return 100
    }

    const pct = state.remaining / state.limit
    const overrides = LOW_LIMIT_GROUPS[group]
    const warnAt = overrides?.warnAt ?? 0.2
    const slowdownAt = overrides?.slowdownAt ?? 0.15

    if (state.remaining === 0) {
      return state.windowMs - windowElapsed
    }
    if (pct < 0.05) {
      return 2000 + Math.random() * 3000
    }
    if (pct < slowdownAt) {
      return 500 + Math.random() * 1500
    }
    if (pct < warnAt) {
      return 100 + Math.random() * 400
    }
    return 100
  }

  setGlobalRetryAfter(retryAfterSec: number): void {
    this.globalRetryAfter = Date.now() + retryAfterSec * 1000
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
    this.globalRetryAfter = null
  }
}
