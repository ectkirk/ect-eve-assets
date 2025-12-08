import { contextBridge, ipcRenderer } from 'electron'

export interface AuthResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  characterId?: number
  characterName?: string
  corporationId?: number
  error?: string
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface LogContext {
  module?: string
  [key: string]: unknown
}

export interface ElectronAPI {
  startAuth: (includeCorporationScopes?: boolean) => Promise<AuthResult>
  refreshToken: (refreshToken: string, characterId: number) => Promise<AuthResult>
  logout: (characterId?: number) => Promise<{ success: boolean }>
  storageGet: () => Promise<Record<string, unknown> | null>
  storageSet: (data: Record<string, unknown>) => Promise<boolean>
  writeLog: (level: LogLevel, message: string, context?: LogContext) => Promise<void>
  getLogDir: () => Promise<string>
  onOpenUpdateDialog: (callback: () => void) => () => void
}

const electronAPI: ElectronAPI = {
  startAuth: (includeCorporationScopes = false) =>
    ipcRenderer.invoke('auth:start', includeCorporationScopes),
  refreshToken: (refreshToken: string, characterId: number) =>
    ipcRenderer.invoke('auth:refresh', refreshToken, characterId),
  logout: (characterId?: number) => ipcRenderer.invoke('auth:logout', characterId),
  storageGet: () => ipcRenderer.invoke('storage:get'),
  storageSet: (data: Record<string, unknown>) => ipcRenderer.invoke('storage:set', data),
  writeLog: (level: LogLevel, message: string, context?: LogContext) =>
    ipcRenderer.invoke('log:write', level, message, context),
  getLogDir: () => ipcRenderer.invoke('log:getDir'),
  onOpenUpdateDialog: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('data:openUpdateDialog', handler)
    return () => ipcRenderer.removeListener('data:openUpdateDialog', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
