export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs: number
}

export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions,
): Promise<Response> {
  const { timeoutMs, ...fetchOptions } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function pLimit(concurrency: number) {
  let activeCount = 0
  const queue: (() => void)[] = []

  const next = () => {
    activeCount--
    if (queue.length > 0) {
      const resolve = queue.shift()
      resolve?.()
    }
  }

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => {
        queue.push(resolve)
      })
    }
    activeCount++
    try {
      return await fn()
    } finally {
      next()
    }
  }
}
