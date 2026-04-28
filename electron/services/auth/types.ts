import type { CorporationRoles } from './token-handler.js'

export interface AuthResult {
  success: boolean
  accessToken?: string | undefined
  refreshToken?: string | undefined
  expiresAt?: number | undefined
  characterId?: number | undefined
  characterName?: string | undefined
  corporationId?: number | undefined
  allianceId?: number | undefined
  scopes?: string[] | undefined
  corporationRoles?: CorporationRoles | null | undefined
  error?: string | undefined
  isAuthFailure?: boolean | undefined
}

export interface PendingAuth {
  state: string
  codeVerifier: string
  resolve: (result: AuthResult) => void
  timeoutId: NodeJS.Timeout
}
