import * as fs from 'fs'
import type { CacheEntry } from './types'

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
    } catch {
      // Ignore load errors
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
    } catch {
      // Ignore save errors
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

  set(key: string, data: unknown, etag: string, expires: number): void {
    this.cache.set(key, { data, etag, expires })
    this.scheduleSave()
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

  size(): number {
    return this.cache.size
  }

  makeKey(characterId: number | undefined, endpoint: string): string {
    return `${characterId ?? 'public'}:${endpoint}`
  }
}
