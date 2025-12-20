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
}

export interface ESIRateLimitInfo {
  globalRetryAfter: number | null
  activeRequests: number
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
