interface AuthResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  characterId?: number
  characterName?: string
  corporationId?: number
  error?: string
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

interface LogContext {
  module?: string
  [key: string]: unknown
}

interface RefApiResult {
  items?: Record<string, unknown>
  error?: string
}

interface MutamarketResult {
  estimated_value?: number | null
  error?: string
  status?: number
}

interface RefShipsResult {
  ships?: Record<number, {
    id: number
    name: string
    groupId: number
    groupName: string
    slots: {
      high: number
      mid: number
      low: number
      rig: number
      subsystem: number
      launcher: number
      turret: number
    }
  }>
  error?: string
}

interface ESIRequestOptions {
  method?: 'GET' | 'POST'
  body?: string
  characterId?: number
  requiresAuth?: boolean
  etag?: string
}

interface ESISuccessResponse<T> {
  success: true
  data: T
  meta?: { expiresAt: number; etag: string | null; notModified: boolean }
}

interface ESIErrorResponse {
  success: false
  error: string
  status?: number
  retryAfter?: number
}

type ESIResponse<T> = ESISuccessResponse<T> | ESIErrorResponse

interface ESIRateLimitInfo {
  globalRetryAfter: number | null
  groups: Record<string, unknown>
  queueLength: number
}

interface ElectronAPI {
  startAuth: (includeCorporationScopes?: boolean) => Promise<AuthResult>
  cancelAuth: () => Promise<void>
  refreshToken: (refreshToken: string, characterId: number) => Promise<AuthResult>
  logout: (characterId?: number) => Promise<{ success: boolean }>
  storageGet: () => Promise<Record<string, unknown> | null>
  storageSet: (data: Record<string, unknown>) => Promise<boolean>
  writeLog: (level: LogLevel, message: string, context?: LogContext) => Promise<void>
  getLogDir: () => Promise<string>
  refTypes: (ids: number[], market: 'jita' | 'the_forge') => Promise<RefApiResult>
  refUniverse: (ids: number[]) => Promise<RefApiResult>
  refShips: (ids: number[]) => Promise<RefShipsResult>
  mutamarketModule: (itemId: number) => Promise<MutamarketResult>
  onUpdateAvailable: (callback: (version: string) => void) => () => void
  onUpdateDownloadProgress: (callback: (percent: number) => void) => () => void
  onUpdateDownloaded: (callback: (version: string) => void) => () => void
  installUpdate: () => Promise<void>
  esiRequest: <T>(method: string, endpoint: string, options?: ESIRequestOptions) => Promise<ESIResponse<T>>
  esiProvideToken: (characterId: number, token: string | null) => Promise<void>
  esiClearCache: () => Promise<{ success: boolean }>
  esiRateLimitInfo: () => Promise<ESIRateLimitInfo>
  onEsiRequestToken: (callback: (characterId: number) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
