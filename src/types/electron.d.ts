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

interface ElectronAPI {
  startAuth: (includeCorporationScopes?: boolean) => Promise<AuthResult>
  cancelAuth: () => Promise<void>
  refreshToken: (refreshToken: string, characterId: number) => Promise<AuthResult>
  logout: (characterId?: number) => Promise<{ success: boolean }>
  storageGet: () => Promise<Record<string, unknown> | null>
  storageSet: (data: Record<string, unknown>) => Promise<boolean>
  writeLog: (level: LogLevel, message: string, context?: LogContext) => Promise<void>
  getLogDir: () => Promise<string>
  onOpenUpdateDialog: (callback: () => void) => () => void
  onRefreshAbyssalPrices: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
