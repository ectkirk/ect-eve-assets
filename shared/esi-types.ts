export interface ESIRateLimitInfo {
  globalRetryAfter: number | null
  activeRequests: number
}

export interface ESIRequestOptions {
  method?: 'GET' | 'POST'
  body?: string
  characterId?: number
  requiresAuth?: boolean
  etag?: string
}

export interface ESIResponseMeta<T> {
  data: T
  expiresAt: number
  etag: string | null
  notModified: boolean
  xPages?: number
}

export class ESIError extends Error {
  status: number
  retryAfter?: number

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
