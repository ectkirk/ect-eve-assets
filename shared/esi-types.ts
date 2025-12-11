export const ESI_BASE_URL = 'https://esi.evetech.net'
export const ESI_COMPATIBILITY_DATE = '2025-11-06'
export const ESI_USER_AGENT =
  'ECTEVEAssets/0.2.0 (ecteveassets@edencom.net; +https://github.com/ectkirk/ect-eve-assets)'

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
  queueLength: number
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
