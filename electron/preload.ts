const { contextBridge, ipcRenderer } = require('electron')

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

export interface RefApiResult {
  items?: Record<string, unknown>
  error?: string
}

export interface MutamarketResult {
  estimated_value?: number | null
  error?: string
  status?: number
}

export interface ElectronAPI {
  startAuth: (includeCorporationScopes?: boolean) => Promise<AuthResult>
  cancelAuth: () => Promise<void>
  refreshToken: (refreshToken: string, characterId: number) => Promise<AuthResult>
  logout: (characterId?: number) => Promise<{ success: boolean }>
  storageGet: () => Promise<Record<string, unknown> | null>
  storageSet: (data: Record<string, unknown>) => Promise<boolean>
  writeLog: (level: LogLevel, message: string, context?: LogContext) => Promise<void>
  getLogDir: () => Promise<string>
  onOpenUpdateDialog: (callback: () => void) => () => void
  refTypes: (ids: number[], market: 'jita' | 'the_forge') => Promise<RefApiResult>
  refUniverse: (ids: number[]) => Promise<RefApiResult>
  mutamarketModule: (itemId: number) => Promise<MutamarketResult>
}

const electronAPI: ElectronAPI = {
  startAuth: (includeCorporationScopes = false) =>
    ipcRenderer.invoke('auth:start', includeCorporationScopes),
  cancelAuth: () => ipcRenderer.invoke('auth:cancel'),
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
  refTypes: (ids: number[], market: 'jita' | 'the_forge') =>
    ipcRenderer.invoke('ref:types', ids, market),
  refUniverse: (ids: number[]) => ipcRenderer.invoke('ref:universe', ids),
  mutamarketModule: (itemId: number) => ipcRenderer.invoke('mutamarket:module', itemId),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
