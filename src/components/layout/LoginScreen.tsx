import { useState } from 'react'
import { useAuthStore } from '@/store/auth-store'

export function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { setAuth } = useAuthStore()

  const handleLogin = async () => {
    if (!window.electronAPI) {
      setError('Electron API not available')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await window.electronAPI.startAuth()

      if (result.success && result.accessToken && result.refreshToken) {
        setAuth({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
          character: {
            id: result.characterId ?? 0,
            name: result.characterName ?? 'Unknown',
            corporationId: 0,
          },
        })
      } else {
        setError(result.error ?? 'Authentication failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary">ECTEVEAssets</h1>
        <p className="mt-2 text-muted-foreground">
          EVE Online Asset Management
        </p>
      </div>

      <button
        onClick={handleLogin}
        disabled={isLoading}
        className="flex items-center gap-3 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <svg
              className="h-5 w-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Authenticating...
          </>
        ) : (
          <>
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            Log in with EVE Online
          </>
        )}
      </button>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <p className="max-w-md text-center text-sm text-muted-foreground">
        This application requires EVE SSO authentication to access your
        character&apos;s assets and other data via the ESI API.
      </p>
    </div>
  )
}
