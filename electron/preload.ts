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

export interface ElectronAPI {
  startAuth: (includeCorporationScopes?: boolean) => Promise<AuthResult>
  refreshToken: (refreshToken: string, characterId: number) => Promise<AuthResult>
  logout: (characterId?: number) => Promise<{ success: boolean }>
  fetchStructures: () => Promise<Record<string, unknown>>
  fetchCapitalPrices: () => Promise<unknown>
  storageGet: () => Promise<Record<string, unknown> | null>
  storageSet: (data: Record<string, unknown>) => Promise<boolean>
}

const electronAPI: ElectronAPI = {
  startAuth: (includeCorporationScopes = false) =>
    ipcRenderer.invoke('auth:start', includeCorporationScopes),
  refreshToken: (refreshToken: string, characterId: number) =>
    ipcRenderer.invoke('auth:refresh', refreshToken, characterId),
  logout: (characterId?: number) => ipcRenderer.invoke('auth:logout', characterId),
  fetchStructures: () => ipcRenderer.invoke('fetch:structures'),
  fetchCapitalPrices: () => ipcRenderer.invoke('fetch:capitalPrices'),
  storageGet: () => ipcRenderer.invoke('storage:get'),
  storageSet: (data: Record<string, unknown>) => ipcRenderer.invoke('storage:set', data),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
