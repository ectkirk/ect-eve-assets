interface AuthResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  characterId?: number
  characterName?: string
  error?: string
}

interface ElectronAPI {
  startAuth: () => Promise<AuthResult>
  refreshToken: (refreshToken: string) => Promise<AuthResult>
  logout: () => Promise<{ success: boolean }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
