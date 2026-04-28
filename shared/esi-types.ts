export interface ESIRateLimitInfo {
  globalRetryAfter: number | null
  activeRequests: number
}

export interface SerializedESIError {
  name: 'ESIError'
  message: string
  status: number
  retryAfter?: number | undefined
}

export function isSerializedESIError(err: unknown): err is SerializedESIError {
  if (typeof err !== 'object' || err === null) return false
  const e = err as Record<string, unknown>
  return (
    e['name'] === 'ESIError' &&
    typeof e['message'] === 'string' &&
    typeof e['status'] === 'number'
  )
}

export interface ESIRequestOptions {
  method?: 'GET' | 'POST' | undefined
  body?: string | undefined
  characterId?: number | undefined
  requiresAuth?: boolean | undefined
  etag?: string | undefined
  language?: string | undefined
}

export interface ESIResponseMeta<T> {
  data: T
  expiresAt: number
  etag: string | null
  notModified: boolean
  xPages?: number | undefined
}

export class ESIError extends Error {
  status: number
  retryAfter?: number | undefined

  constructor(message: string, status: number, retryAfter?: number) {
    super(message)
    this.name = 'ESIError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

export function isNotInCorporationError(err: unknown): boolean {
  return (
    err instanceof ESIError &&
    err.status === 403 &&
    err.message.toLowerCase().includes('not in the corporation')
  )
}
