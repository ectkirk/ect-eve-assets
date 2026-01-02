export type {
  ESIRequestOptions,
  ESIResponseMeta,
} from '../../../shared/esi-types.js'

export const ESI_BASE_URL = 'https://esi.evetech.net'
export const ESI_COMPATIBILITY_DATE = '2025-11-06'

export const ESI_CONFIG = {
  maxRetries: 2,
  maxTimeoutRetries: 1,
  requestTimeoutMs: 30_000,
  maxConcurrentPages: 10,
  cacheMaxEntries: 2000,
  healthCacheTtlMs: 60_000,
  healthRequestTimeoutMs: 10_000,
  tokenRequestTimeoutMs: 10_000,
  staleCleanupIntervalMs: 60_000,
  maxPendingPerCharacter: 10,
} as const

export const RATE_LIMIT_CONFIG = {
  errorLimitWarnThreshold: 50,
  errorLimitPauseThreshold: 20,
  contractItemsLimit: 20,
  contractItemsWindowMs: 10_000,
} as const

export function makeUserAgent(version: string): string {
  return `ECTEVEAssets/${version} (ecteveassets@edencom.net; +https://github.com/ectkirk/ect-eve-assets)`
}

export interface ESISuccessResponse<T> {
  success: true
  data: T
  meta?: { expiresAt: number; etag: string | null; notModified: boolean }
  xPages?: number
}

export interface ESIErrorResponse {
  success: false
  error: string
  status?: number
  retryAfter?: number
}

export type ESIResponse<T> = ESISuccessResponse<T> | ESIErrorResponse

export interface CacheEntry {
  data: unknown
  etag: string
  expires: number
}

export type ESIRouteStatus =
  | 'OK'
  | 'Degraded'
  | 'Down'
  | 'Recovering'
  | 'Unknown'

export interface ESIRouteHealth {
  method: string
  path: string
  status: ESIRouteStatus
}

export interface ESIHealthStatus {
  healthy: boolean
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
  routes: ESIRouteHealth[]
  fetchedAt: number
}
