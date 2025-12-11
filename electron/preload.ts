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

export interface RefShipsResult {
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

export interface ESIAPI {
  fetch: <T>(endpoint: string, options?: ESIRequestOptions) => Promise<T>
  fetchWithMeta: <T>(endpoint: string, options?: ESIRequestOptions) => Promise<ESIResponseMeta<T>>
  fetchPaginated: <T>(endpoint: string, options?: ESIRequestOptions) => Promise<T[]>
  fetchPaginatedWithMeta: <T>(endpoint: string, options?: ESIRequestOptions) => Promise<ESIResponseMeta<T[]>>
  clearCache: () => Promise<void>
  getRateLimitInfo: () => Promise<ESIRateLimitInfo>
  provideToken: (characterId: number, token: string | null) => Promise<void>
  onRequestToken: (callback: (characterId: number) => void) => () => void
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
  refTypes: (ids: number[], market: 'jita' | 'the_forge') => Promise<RefApiResult>
  refUniverse: (ids: number[]) => Promise<RefApiResult>
  refShips: (ids: number[]) => Promise<RefShipsResult>
  mutamarketModule: (itemId: number) => Promise<MutamarketResult>
  onUpdateAvailable: (callback: (version: string) => void) => () => void
  onUpdateDownloadProgress: (callback: (percent: number) => void) => () => void
  onUpdateDownloaded: (callback: (version: string) => void) => () => void
  installUpdate: () => Promise<void>
  esi: ESIAPI
}

const esi: ESIAPI = {
  fetch: <T>(endpoint: string, options?: ESIRequestOptions) =>
    ipcRenderer.invoke('esi:fetch', endpoint, options) as Promise<T>,
  fetchWithMeta: <T>(endpoint: string, options?: ESIRequestOptions) =>
    ipcRenderer.invoke('esi:fetchWithMeta', endpoint, options) as Promise<ESIResponseMeta<T>>,
  fetchPaginated: <T>(endpoint: string, options?: ESIRequestOptions) =>
    ipcRenderer.invoke('esi:fetchPaginated', endpoint, options) as Promise<T[]>,
  fetchPaginatedWithMeta: <T>(endpoint: string, options?: ESIRequestOptions) =>
    ipcRenderer.invoke('esi:fetchPaginatedWithMeta', endpoint, options) as Promise<ESIResponseMeta<T[]>>,
  clearCache: () => ipcRenderer.invoke('esi:clearCache'),
  getRateLimitInfo: () => ipcRenderer.invoke('esi:getRateLimitInfo'),
  provideToken: (characterId: number, token: string | null) =>
    ipcRenderer.invoke('esi:provideToken', characterId, token),
  onRequestToken: (callback: (characterId: number) => void) => {
    const handler = (_event: unknown, characterId: number) => callback(characterId)
    ipcRenderer.on('esi:requestToken', handler)
    return () => ipcRenderer.removeListener('esi:requestToken', handler)
  },
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
  refTypes: (ids: number[], market: 'jita' | 'the_forge') =>
    ipcRenderer.invoke('ref:types', ids, market),
  refUniverse: (ids: number[]) => ipcRenderer.invoke('ref:universe', ids),
  refShips: (ids: number[]) => ipcRenderer.invoke('ref:ships', ids),
  mutamarketModule: (itemId: number) => ipcRenderer.invoke('mutamarket:module', itemId),
  onUpdateAvailable: (callback: (version: string) => void) => {
    const handler = (_event: unknown, version: string) => callback(version)
    ipcRenderer.on('updater:update-available', handler)
    return () => ipcRenderer.removeListener('updater:update-available', handler)
  },
  onUpdateDownloadProgress: (callback: (percent: number) => void) => {
    const handler = (_event: unknown, percent: number) => callback(percent)
    ipcRenderer.on('updater:download-progress', handler)
    return () => ipcRenderer.removeListener('updater:download-progress', handler)
  },
  onUpdateDownloaded: (callback: (version: string) => void) => {
    const handler = (_event: unknown, version: string) => callback(version)
    ipcRenderer.on('updater:update-downloaded', handler)
    return () => ipcRenderer.removeListener('updater:update-downloaded', handler)
  },
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  esi,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
