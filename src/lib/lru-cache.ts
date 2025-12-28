interface CacheEntry<V> {
  value: V
  expiresAt: number
}

export interface LRUCache<K, V> {
  get: (key: K) => V | null
  set: (key: K, value: V) => void
  delete: (key: K) => void
  clear: () => void
  size: () => number
}

/**
 * Creates an LRU cache with TTL support.
 *
 * Uses Map's insertion order for O(1) LRU eviction:
 * - On get(): delete + re-set moves entry to end (most recently used)
 * - On evict: Map.keys().next() gives oldest entry
 */
export function createLRUCache<K, V>(
  ttlMs: number,
  maxSize: number
): LRUCache<K, V> {
  const cache = new Map<K, CacheEntry<V>>()

  function get(key: K): V | null {
    const entry = cache.get(key)
    if (!entry) return null

    if (Date.now() >= entry.expiresAt) {
      cache.delete(key)
      return null
    }

    // Move to end (most recently used) - O(1)
    cache.delete(key)
    cache.set(key, entry)
    return entry.value
  }

  function set(key: K, value: V): void {
    if (cache.has(key)) {
      cache.delete(key)
    } else if (cache.size >= maxSize) {
      // Evict oldest (first key in Map) - O(1)
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  function del(key: K): void {
    cache.delete(key)
  }

  function clear(): void {
    cache.clear()
  }

  function size(): number {
    return cache.size
  }

  return { get, set, delete: del, clear, size }
}
