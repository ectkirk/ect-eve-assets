type Fetcher<T> = () => Promise<T | null>

interface AsyncCache<T> {
  get: () => Promise<T | null>
  clear: () => void
}

export function createAsyncCache<T>(fetcher: Fetcher<T>): AsyncCache<T> {
  let cache: T | null = null
  let fetching = false
  const callbacks: Array<(value: T | null) => void> = []

  return {
    get: async () => {
      if (cache) return cache

      if (fetching) {
        return new Promise((resolve) => {
          callbacks.push(resolve)
        })
      }

      fetching = true
      try {
        cache = await fetcher()
      } catch {
        cache = null
      }
      fetching = false
      callbacks.forEach((cb) => cb(cache))
      callbacks.length = 0
      return cache
    },
    clear: () => {
      cache = null
    },
  }
}
