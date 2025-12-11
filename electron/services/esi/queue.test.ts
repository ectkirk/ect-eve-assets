import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RequestQueue } from './queue'
import { RateLimitTracker } from './rate-limit'
import type { ESIRequestOptions, ESIResponse } from './types'

type ExecuteRequestFn = (endpoint: string, options: ESIRequestOptions) => Promise<ESIResponse<unknown>>

describe('RequestQueue', () => {
  let rateLimiter: RateLimitTracker
  let executeRequest: ReturnType<typeof vi.fn<ExecuteRequestFn>>
  let queue: RequestQueue

  beforeEach(() => {
    rateLimiter = new RateLimitTracker()
    executeRequest = vi.fn<ExecuteRequestFn>()
    queue = new RequestQueue(rateLimiter, executeRequest)
  })

  describe('enqueue', () => {
    it('executes request and returns result', async () => {
      const response: ESIResponse<{ test: boolean }> = { success: true, data: { test: true } }
      executeRequest.mockResolvedValue(response)

      const result = await queue.enqueue('/test', {})

      expect(result).toEqual(response)
      expect(executeRequest).toHaveBeenCalledWith('/test', {})
    })

    it('processes requests sequentially', async () => {
      const order: number[] = []
      executeRequest.mockImplementation(async (endpoint: string) => {
        const num = parseInt(endpoint.replace('/test', ''))
        order.push(num)
        return { success: true, data: num }
      })

      const promises = [
        queue.enqueue('/test1', {}),
        queue.enqueue('/test2', {}),
        queue.enqueue('/test3', {}),
      ]

      await Promise.all(promises)

      expect(order).toEqual([1, 2, 3])
    })

    it('rejects on executor error', async () => {
      executeRequest.mockRejectedValue(new Error('Network failed'))

      await expect(queue.enqueue('/fail', {})).rejects.toThrow('Network failed')
    })
  })

  describe('rate limit group guessing', () => {
    it('identifies char-asset endpoints', async () => {
      vi.spyOn(rateLimiter, 'getDelayMs')
      executeRequest.mockResolvedValue({ success: true, data: [] })

      await queue.enqueue('/latest/characters/123/assets/', { characterId: 123 })

      expect(rateLimiter.getDelayMs).toHaveBeenCalledWith(123, 'char-asset')
    })

    it('identifies char-wallet endpoints', async () => {
      vi.spyOn(rateLimiter, 'getDelayMs')
      executeRequest.mockResolvedValue({ success: true, data: 0 })

      await queue.enqueue('/latest/characters/123/wallet/', { characterId: 123 })

      expect(rateLimiter.getDelayMs).toHaveBeenCalledWith(123, 'char-wallet')
    })

    it('identifies corp-industry endpoints', async () => {
      vi.spyOn(rateLimiter, 'getDelayMs')
      executeRequest.mockResolvedValue({ success: true, data: [] })

      await queue.enqueue('/latest/corporations/456/industry/jobs/', { characterId: 789 })

      expect(rateLimiter.getDelayMs).toHaveBeenCalledWith(789, 'corp-industry')
    })
  })

  describe('length', () => {
    it('reports queue length', () => {
      expect(queue.length).toBe(0)
    })
  })

  describe('clear', () => {
    it('rejects queued requests that have not started', async () => {
      let resolveFirst: () => void
      const firstBlocking = new Promise<void>((r) => {
        resolveFirst = r
      })

      executeRequest.mockImplementationOnce(async () => {
        await firstBlocking
        return { success: true, data: 'first' }
      })
      executeRequest.mockResolvedValue({ success: true, data: 'queued' })

      const first = queue.enqueue('/first', {})
      const second = queue.enqueue('/second', {})

      await new Promise((r) => setTimeout(r, 10))
      queue.clear()
      resolveFirst!()

      const firstResult = await first
      expect(firstResult).toEqual({ success: true, data: 'first' })
      await expect(second).rejects.toThrow('Queue cleared')
    })
  })
})
