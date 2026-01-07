export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs: number
}

export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions
): Promise<Response> {
  const { timeoutMs, ...fetchOptions } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

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
