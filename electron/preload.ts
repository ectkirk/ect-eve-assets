import { contextBridge, ipcRenderer } from 'electron'

export interface AuthResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  characterId?: number
  characterName?: string
  error?: string
}

export interface ElectronAPI {
  startAuth: () => Promise<AuthResult>
  refreshToken: (refreshToken: string) => Promise<AuthResult>
  logout: () => Promise<{ success: boolean }>
}

const electronAPI: ElectronAPI = {
  startAuth: () => ipcRenderer.invoke('auth:start'),
  refreshToken: (refreshToken: string) =>
    ipcRenderer.invoke('auth:refresh', refreshToken),
  logout: () => ipcRenderer.invoke('auth:logout'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
