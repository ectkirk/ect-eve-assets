import { describe, it, expect, beforeEach } from 'vitest'
import { RateLimitTracker } from './rate-limit'

function createHeaders(values: Record<string, string>): Headers {
  return new Headers(values)
}

describe('RateLimitTracker', () => {
  let tracker: RateLimitTracker

  beforeEach(() => {
    tracker = new RateLimitTracker()
  })

  describe('updateFromHeaders', () => {
    it('parses rate limit headers', () => {
      const headers = createHeaders({
        'X-Ratelimit-Group': 'char-asset',
        'X-Ratelimit-Remaining': '1750',
        'X-Ratelimit-Limit': '1800/15m',
      })

      const result = tracker.updateFromHeaders(12345, headers)

      expect(result).toBeDefined()
      expect(result?.group).toBe('char-asset')
      expect(result?.state.remaining).toBe(1750)
      expect(result?.state.limit).toBe(1800)
      expect(result?.state.windowMs).toBe(15 * 60 * 1000)
    })

    it('returns null if no group header', () => {
      const headers = createHeaders({ 'X-Ratelimit-Remaining': '100' })
      expect(tracker.updateFromHeaders(12345, headers)).toBeNull()
    })

    it('returns null if no remaining header', () => {
      const headers = createHeaders({ 'X-Ratelimit-Group': 'char-asset' })
      expect(tracker.updateFromHeaders(12345, headers)).toBeNull()
    })

    it('handles different time units', () => {
      const headers1h = createHeaders({
        'X-Ratelimit-Group': 'test-h',
        'X-Ratelimit-Remaining': '100',
        'X-Ratelimit-Limit': '200/1h',
      })
      const result1h = tracker.updateFromHeaders(1, headers1h)
      expect(result1h?.state.windowMs).toBe(3600000)

      const headers30s = createHeaders({
        'X-Ratelimit-Group': 'test-s',
        'X-Ratelimit-Remaining': '50',
        'X-Ratelimit-Limit': '100/30s',
      })
      const result30s = tracker.updateFromHeaders(2, headers30s)
      expect(result30s?.state.windowMs).toBe(30000)
    })
  })

  describe('getDelayMs', () => {
    it('returns 100ms base delay for unknown group', () => {
      expect(tracker.getDelayMs(12345, 'unknown')).toBe(100)
    })

    it('returns higher delay when tokens low', () => {
      const headers = createHeaders({
        'X-Ratelimit-Group': 'char-asset',
        'X-Ratelimit-Remaining': '90',
        'X-Ratelimit-Limit': '1800/15m',
      })
      tracker.updateFromHeaders(12345, headers)

      const delay = tracker.getDelayMs(12345, 'char-asset')
      expect(delay).toBeGreaterThan(500)
    })

    it('returns global retry delay when globally limited', () => {
      tracker.setGlobalRetryAfter(10)
      const delay = tracker.getDelayMs(12345, 'any-group')
      expect(delay).toBeGreaterThan(9000)
      expect(delay).toBeLessThanOrEqual(10000)
    })
  })

  describe('global rate limiting', () => {
    it('tracks global retry after', () => {
      expect(tracker.isGloballyLimited()).toBe(false)
      tracker.setGlobalRetryAfter(60)
      expect(tracker.isGloballyLimited()).toBe(true)
    })

    it('returns remaining time', () => {
      tracker.setGlobalRetryAfter(30)
      const remaining = tracker.getGlobalRetryAfter()
      expect(remaining).toBeGreaterThan(29000)
      expect(remaining).toBeLessThanOrEqual(30000)
    })

    it('clears after expiry', async () => {
      tracker.setGlobalRetryAfter(0.1)
      await new Promise((r) => setTimeout(r, 150))
      expect(tracker.getGlobalRetryAfter()).toBeNull()
    })
  })

  describe('state persistence', () => {
    it('exports and loads states', () => {
      const headers = createHeaders({
        'X-Ratelimit-Group': 'char-asset',
        'X-Ratelimit-Remaining': '1500',
        'X-Ratelimit-Limit': '1800/15m',
      })
      tracker.updateFromHeaders(12345, headers)

      const exported = tracker.exportStates()
      expect(exported['12345:char-asset']).toBeDefined()

      const newTracker = new RateLimitTracker()
      newTracker.loadStates(exported)
      expect(newTracker.getState(12345, 'char-asset')).toBeDefined()
    })

    it('skips expired states on load', () => {
      const oldState = {
        '12345:old-group': {
          remaining: 100,
          used: 2,
          limit: 200,
          windowMs: 900000,
          lastUpdated: Date.now() - 1000000,
          windowStart: Date.now() - 1000000,
        },
      }
      tracker.loadStates(oldState)
      expect(tracker.getState(12345, 'old-group')).toBeUndefined()
    })
  })

  describe('clear', () => {
    it('clears all state', () => {
      tracker.setGlobalRetryAfter(60)
      const headers = createHeaders({
        'X-Ratelimit-Group': 'test',
        'X-Ratelimit-Remaining': '50',
        'X-Ratelimit-Limit': '100/15m',
      })
      tracker.updateFromHeaders(1, headers)

      tracker.clear()

      expect(tracker.isGloballyLimited()).toBe(false)
      expect(tracker.getAllStates().size).toBe(0)
    })
  })

  describe('contract items throttling', () => {
    it('returns 0 delay when no requests recorded', () => {
      expect(tracker.getContractItemsDelay(12345)).toBe(0)
    })

    it('returns 0 delay when under limit', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordContractItemsRequest(12345)
      }
      expect(tracker.getContractItemsDelay(12345)).toBe(0)
    })

    it('returns delay when at limit', () => {
      for (let i = 0; i < 20; i++) {
        tracker.recordContractItemsRequest(12345)
      }
      const delay = tracker.getContractItemsDelay(12345)
      expect(delay).toBeGreaterThan(0)
      expect(delay).toBeLessThanOrEqual(10100)
    })

    it('tracks per character', () => {
      for (let i = 0; i < 20; i++) {
        tracker.recordContractItemsRequest(111)
      }
      expect(tracker.getContractItemsDelay(111)).toBeGreaterThan(0)
      expect(tracker.getContractItemsDelay(222)).toBe(0)
    })

    it('clears contract timestamps on clear', () => {
      for (let i = 0; i < 20; i++) {
        tracker.recordContractItemsRequest(12345)
      }
      tracker.clear()
      expect(tracker.getContractItemsDelay(12345)).toBe(0)
    })
  })
})
