import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import { ESI_CONFIG, type CacheEntry } from './types'
import { logger } from '../logger.js'
import { getErrorMessage } from '../fetch-utils.js'

interface SerializedCache {
  version: 1
  entries: Array<{ key: string; entry: CacheEntry }>
}

export class ESICache {
  private cache = new Map<string, CacheEntry>()
  private filePath: string | null = null
  private saveTimeout: NodeJS.Timeout | null = null
  private saveInProgress = false
  private pendingSave = false

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
        error: getErrorMessage(err),
      })
    }
  }

  private collectValidEntries(): Array<{ key: string; entry: CacheEntry }> {
    const now = Date.now()
    const entries: Array<{ key: string; entry: CacheEntry }> = []
    for (const [key, entry] of this.cache) {
      if (entry.expires > now) {
        entries.push({ key, entry })
      }
    }
    return entries
  }

  private scheduleSave(): void {
    if (this.saveTimeout) return
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null
      this.saveAsync()
    }, 1000)
  }

  private async saveAsync(): Promise<void> {
    if (!this.filePath) return

    if (this.saveInProgress) {
      this.pendingSave = true
      return
    }

    this.saveInProgress = true
    try {
      const serialized: SerializedCache = {
        version: 1,
        entries: this.collectValidEntries(),
      }
      await fsPromises.writeFile(this.filePath, JSON.stringify(serialized))
    } catch (err) {
      logger.debug('Failed to save ESI cache', {
        module: 'ESICache',
        error: getErrorMessage(err),
      })
    } finally {
      this.saveInProgress = false
      if (this.pendingSave) {
        this.pendingSave = false
        this.saveAsync()
      }
    }
  }

  saveImmediately(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
    if (!this.filePath) return
    try {
      const serialized: SerializedCache = {
        version: 1,
        entries: this.collectValidEntries(),
      }
      fs.writeFileSync(this.filePath, JSON.stringify(serialized))
    } catch (err) {
      logger.debug('Failed to save ESI cache immediately', {
        module: 'ESICache',
        error: getErrorMessage(err),
      })
    }
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
    if (this.cache.size >= ESI_CONFIG.cacheMaxEntries && !this.cache.has(key)) {
      this.evictOldest()
    }
    this.cache.set(key, { data, etag, expires })
    this.scheduleSave()
  }

  private evictOldest(): void {
    const now = Date.now()
    const targetSize = Math.floor(ESI_CONFIG.cacheMaxEntries * 0.9)

    for (const [key, entry] of this.cache) {
      if (entry.expires < now) {
        this.cache.delete(key)
        if (this.cache.size <= targetSize) return
      }
    }

    while (this.cache.size > targetSize) {
      let oldestKey: string | null = null
      let oldestExpires = Infinity
      for (const [key, entry] of this.cache) {
        if (entry.expires < oldestExpires) {
          oldestExpires = entry.expires
          oldestKey = key
        }
      }
      if (oldestKey) {
        this.cache.delete(oldestKey)
      } else {
        break
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

  makeKey(
    characterId: number | undefined,
    endpoint: string,
    language?: string
  ): string {
    const lang = language || 'en'
    return `${characterId ?? 'public'}:${lang}:${endpoint}`
  }
}
