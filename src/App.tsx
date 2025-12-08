import { useEffect, useState } from 'react'
import { useAuthStore } from './store/auth-store'
import { LoginScreen } from './components/layout/LoginScreen'
import { MainLayout } from './components/layout/MainLayout'
import { initSDE } from './data/sde'

function App() {
  const { isAuthenticated } = useAuthStore()
  const [sdeLoaded, setSdeLoaded] = useState(false)
  const [sdeError, setSdeError] = useState<string | null>(null)

  useEffect(() => {
    initSDE()
      .then(() => setSdeLoaded(true))
      .catch((err) => setSdeError(err.message))
  }, [])

  if (sdeError) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-50">
        <div className="text-center">
          <p className="text-red-500">Failed to load game data</p>
          <p className="text-sm text-slate-400">{sdeError}</p>
        </div>
      </div>
    )
  }

  if (!sdeLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-50">
        <p className="text-slate-400">Loading game data...</p>
      </div>
    )
  }

  return (
    <div className="h-screen bg-slate-900 text-slate-50">
      {isAuthenticated ? <MainLayout /> : <LoginScreen />}
    </div>
  )
}

export default App
