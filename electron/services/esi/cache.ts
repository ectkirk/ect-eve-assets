import * as fs from 'fs'
import type { CacheEntry } from './types'
import { logger } from '../logger.js'

const MAX_ENTRIES = 2000

interface SerializedCache {
  version: 1
  entries: Array<{ key: string; entry: CacheEntry }>
}

export class ESICache {
  private cache = new Map<string, CacheEntry>()
  private filePath: string | null = null
  private saveTimeout: NodeJS.Timeout | null = null

  setFilePath(path: string): void {
    this.filePath = path
  }

  load(): void {
    if (!this.filePath) return
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(data) as SerializedCache
        if (parsed.version === 1) {
          for (const { key, entry } of parsed.entries) {
            this.cache.set(key, entry)
          }
        }
      }
    } catch (err) {
      logger.debug('Failed to load ESI cache', {
        module: 'ESICache',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) return
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null
      this.save()
    }, 1000)
  }

  save(): void {
    if (!this.filePath) return
    try {
      const now = Date.now()
      const entries: Array<{ key: string; entry: CacheEntry }> = []
      for (const [key, entry] of this.cache) {
        if (entry.expires > now) {
          entries.push({ key, entry })
        }
      }
      const serialized: SerializedCache = { version: 1, entries }
      fs.writeFileSync(this.filePath, JSON.stringify(serialized))
    } catch (err) {
      logger.debug('Failed to save ESI cache', {
        module: 'ESICache',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  saveImmediately(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
    this.save()
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expires) {
      return undefined
    }
    return entry
  }

  getEtag(key: string): string | undefined {
    return this.cache.get(key)?.etag
  }

  getStale(key: string): CacheEntry | undefined {
    return this.cache.get(key)
  }

  set(key: string, data: unknown, etag: string, expires: number): void {
    this.cache.set(key, { data, etag, expires })
    if (this.cache.size > MAX_ENTRIES) {
      this.evictOldest()
    }
    this.scheduleSave()
  }

  private evictOldest(): void {
    const now = Date.now()
    const entries = Array.from(this.cache.entries())
      .map(([k, v]) => ({ key: k, expires: v.expires }))
      .sort((a, b) => a.expires - b.expires)

    const toRemove = Math.max(1, Math.floor(entries.length * 0.1))
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const entry = entries[i]
      if (entry && (entry.expires < now || this.cache.size > MAX_ENTRIES)) {
        this.cache.delete(entry.key)
      }
    }
  }

  updateExpires(key: string, expires: number): void {
    const entry = this.cache.get(key)
    if (entry) {
      entry.expires = expires
      this.scheduleSave()
    }
  }

  delete(key: string): void {
    this.cache.delete(key)
    this.scheduleSave()
  }

  clear(): void {
    this.cache.clear()
    this.scheduleSave()
  }

  clearByPattern(pattern: string): number {
    let count = 0
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
        count++
      }
    }
    if (count > 0) {
      this.scheduleSave()
    }
    return count
  }

  size(): number {
    return this.cache.size
  }

  makeKey(characterId: number | undefined, endpoint: string): string {
    return `${characterId ?? 'public'}:${endpoint}`
  }
}
