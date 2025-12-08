import { useState } from 'react'
import { useAuthStore } from '@/store/auth-store'
import eveSsoLoginWhite from '/eve-sso-login-white.png'

export function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const addCharacter = useAuthStore((state) => state.addCharacter)

  const handleLogin = async () => {
    if (!window.electronAPI) {
      setError('Electron API not available')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await window.electronAPI.startAuth()

      if (result.success && result.accessToken && result.refreshToken && result.characterId && result.characterName) {
        addCharacter({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
          character: {
            id: result.characterId,
            name: result.characterName,
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
        <h1 className="text-4xl font-bold text-white tracking-tight">
          <span className="text-blue-400">ECT</span> EVE Assets
        </h1>
        <p className="text-xl tracking-[0.25em] text-slate-400">We Like The Data</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 rounded px-6 py-3">
          <svg
            className="h-5 w-5 animate-spin text-slate-400"
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
          <span className="text-slate-400">Authenticating...</span>
        </div>
      ) : (
        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          <img
            src={eveSsoLoginWhite}
            alt="Log in with EVE Online"
          />
        </button>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <p className="max-w-md text-center text-sm text-slate-400">
        This application requires EVE SSO authentication to access your
        character&apos;s assets and other data via the ESI API.
      </p>
    </div>
  )
}
