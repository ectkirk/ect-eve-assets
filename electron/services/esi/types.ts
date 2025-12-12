export const ESI_BASE_URL = 'https://esi.evetech.net'
export const ESI_COMPATIBILITY_DATE = '2025-11-06'

export function makeUserAgent(version: string): string {
  return `ECTEVEAssets/${version} (ecteveassets@edencom.net; +https://github.com/ectkirk/ect-eve-assets)`
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
}

export interface ESISuccessResponse<T> {
  success: true
  data: T
  meta?: { expiresAt: number; etag: string | null; notModified: boolean }
}

export interface ESIErrorResponse {
  success: false
  error: string
  status?: number
  retryAfter?: number
}

export type ESIResponse<T> = ESISuccessResponse<T> | ESIErrorResponse

export interface RateLimitGroupState {
  remaining: number
  limit: number
  windowMs: number
  lastUpdated: number
  windowStart: number
}

export interface CacheEntry {
  data: unknown
  etag: string
  expires: number
}

export interface PendingRequest {
  id: string
  endpoint: string
  options: ESIRequestOptions
  resolve: (value: ESIResponse<unknown>) => void
  characterId?: number
  rateLimitGroup?: string
}

export const TOKEN_COSTS: Record<string, number> = {
  '2XX': 2,
  '3XX': 1,
  '4XX': 5,
  '5XX': 0,
}

export const LOW_LIMIT_GROUPS: Record<string, { warnAt: number; slowdownAt: number }> = {
  'char-wallet': { warnAt: 0.3, slowdownAt: 0.2 },
  'corp-wallet': { warnAt: 0.25, slowdownAt: 0.15 },
}
