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

interface ElectronAPI {
  startAuth: (includeCorporationScopes?: boolean) => Promise<AuthResult>
  refreshToken: (refreshToken: string, characterId: number) => Promise<AuthResult>
  logout: (characterId?: number) => Promise<{ success: boolean }>
  fetchStructures: () => Promise<Record<string, unknown>>
  fetchCapitalPrices: () => Promise<unknown>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
