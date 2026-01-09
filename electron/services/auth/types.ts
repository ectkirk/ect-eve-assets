import type { CorporationRoles } from './token-handler.js'

export interface AuthResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  characterId?: number
  characterName?: string
  corporationId?: number
  scopes?: string[]
  corporationRoles?: CorporationRoles | null
  error?: string
  isAuthFailure?: boolean
}

export interface PendingAuth {
  state: string
  codeVerifier: string
  resolve: (result: AuthResult) => void
  timeoutId: NodeJS.Timeout
}
