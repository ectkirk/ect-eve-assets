import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Character {
  id: number
  name: string
  corporationId: number
}

interface AuthState {
  isAuthenticated: boolean
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
  character: Character | null
  setAuth: (auth: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    character: Character
  }) => void
  clearAuth: () => void
  isTokenExpired: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      character: null,

      setAuth: ({ accessToken, refreshToken, expiresAt, character }) => {
        set({
          isAuthenticated: true,
          accessToken,
          refreshToken,
          expiresAt,
          character,
        })
      },

      clearAuth: () => {
        set({
          isAuthenticated: false,
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          character: null,
        })
      },

      isTokenExpired: () => {
        const { expiresAt } = get()
        if (!expiresAt) return true
        // Consider expired 60 seconds before actual expiry
        return Date.now() >= expiresAt - 60000
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Only persist refresh token, not access token
        refreshToken: state.refreshToken,
        character: state.character,
      }),
    }
  )
)
