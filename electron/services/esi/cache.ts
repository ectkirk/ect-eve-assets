import type { CacheEntry } from './types'

export class ESICache {
  private cache = new Map<string, CacheEntry>()

  get(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expires) {
      this.cache.delete(key)
      return undefined
    }
    return entry
  }

  set(key: string, data: unknown, etag: string, expires: number): void {
    this.cache.set(key, { data, etag, expires })
  }

  updateExpires(key: string, expires: number): void {
    const entry = this.cache.get(key)
    if (entry) entry.expires = expires
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }

  makeKey(characterId: number | undefined, endpoint: string): string {
    return `${characterId ?? 'public'}:${endpoint}`
  }
}
