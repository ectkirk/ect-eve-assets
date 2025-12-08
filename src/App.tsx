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
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <p className="text-destructive">Failed to load game data</p>
          <p className="text-sm text-muted-foreground">{sdeError}</p>
        </div>
      </div>
    )
  }

  if (!sdeLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground">Loading game data...</p>
      </div>
    )
  }

  return (
    <div className="h-screen bg-background text-foreground">
      {isAuthenticated ? <MainLayout /> : <LoginScreen />}
    </div>
  )
}

export default App
