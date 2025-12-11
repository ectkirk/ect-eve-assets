import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ESICache } from './cache'

describe('ESICache', () => {
  let cache: ESICache

  beforeEach(() => {
    vi.useFakeTimers()
    cache = new ESICache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('get/set', () => {
    it('stores and retrieves entries', () => {
      cache.set('key1', { data: 'test' }, 'etag123', Date.now() + 60000)
      const entry = cache.get('key1')
      expect(entry).toBeDefined()
      expect(entry?.data).toEqual({ data: 'test' })
      expect(entry?.etag).toBe('etag123')
    })

    it('returns undefined for non-existent keys', () => {
      expect(cache.get('missing')).toBeUndefined()
    })

    it('returns undefined for expired entries and removes them', () => {
      cache.set('expired', { data: 'old' }, 'etag', Date.now() - 1000)
      expect(cache.get('expired')).toBeUndefined()
      expect(cache.size()).toBe(0)
    })
  })

  describe('updateExpires', () => {
    it('updates expiry time for existing entry', () => {
      const originalExpires = Date.now() + 1000
      const newExpires = Date.now() + 60000
      cache.set('key', { data: 'test' }, 'etag', originalExpires)
      cache.updateExpires('key', newExpires)
      const entry = cache.get('key')
      expect(entry?.expires).toBe(newExpires)
    })

    it('does nothing for non-existent keys', () => {
      cache.updateExpires('missing', Date.now() + 60000)
      expect(cache.size()).toBe(0)
    })
  })

  describe('delete', () => {
    it('removes entry', () => {
      cache.set('toDelete', { data: 'bye' }, 'etag', Date.now() + 60000)
      cache.delete('toDelete')
      expect(cache.get('toDelete')).toBeUndefined()
    })
  })

  describe('clear', () => {
    it('removes all entries', () => {
      cache.set('a', 1, 'e1', Date.now() + 60000)
      cache.set('b', 2, 'e2', Date.now() + 60000)
      cache.clear()
      expect(cache.size()).toBe(0)
    })
  })

  describe('makeKey', () => {
    it('creates key with characterId', () => {
      expect(cache.makeKey(12345, '/endpoint')).toBe('12345:/endpoint')
    })

    it('creates key with public for undefined characterId', () => {
      expect(cache.makeKey(undefined, '/public')).toBe('public:/public')
    })
  })

  describe('persistence', () => {
    let testFilePath: string

    beforeEach(() => {
      vi.useRealTimers()
      testFilePath = path.join(os.tmpdir(), `esi-cache-test-${Date.now()}.json`)
    })

    afterEach(() => {
      try {
        fs.unlinkSync(testFilePath)
      } catch {
        // Ignore cleanup errors
      }
    })

    it('saves and loads cache from file', async () => {
      const futureTime = Date.now() + 60000
      cache.setFilePath(testFilePath)
      cache.set('test:key', { foo: 'bar' }, 'abc', futureTime)

      await new Promise((r) => setTimeout(r, 1100))

      const newCache = new ESICache()
      newCache.setFilePath(testFilePath)
      newCache.load()

      const entry = newCache.get('test:key')
      expect(entry).toBeDefined()
      expect(entry?.data).toEqual({ foo: 'bar' })
      expect(entry?.etag).toBe('abc')
    })

    it('skips expired entries when loading', async () => {
      const pastTime = Date.now() - 1000
      const savedData = JSON.stringify({
        version: 1,
        entries: [
          { key: 'expired:key', entry: { data: 'old', etag: 'xyz', expires: pastTime } },
        ],
      })
      fs.writeFileSync(testFilePath, savedData)

      const newCache = new ESICache()
      newCache.setFilePath(testFilePath)
      newCache.load()

      expect(newCache.size()).toBe(0)
    })

    it('does not save if no file path set', async () => {
      cache.set('key', { data: 'value' }, 'etag', Date.now() + 60000)
      await new Promise((r) => setTimeout(r, 1100))
      expect(fs.existsSync(testFilePath)).toBe(false)
    })
  })
})
