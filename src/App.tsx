import { useEffect, useState, useRef, Component, type ReactNode } from 'react'
import { useAuthStore } from './store/auth-store'
import { LoginScreen } from './components/layout/LoginScreen'
import { MainLayout } from './components/layout/MainLayout'
import { initSDE, loadStructuresFromEveRef, getStructuresCount, clearStructuresCache } from './data/sde'

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error.message)
    console.error('[ErrorBoundary] Stack:', error.stack)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
    this.setState({ errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-50">
          <div className="text-center max-w-2xl p-4">
            <p className="text-red-500 text-lg font-bold">Something went wrong</p>
            <pre className="mt-4 text-left text-xs text-slate-400 bg-slate-800 p-4 rounded overflow-auto max-h-48">
              {this.state.error?.message}
            </pre>
            <pre className="mt-2 text-left text-xs text-slate-500 bg-slate-800 p-4 rounded overflow-auto max-h-48">
              {this.state.errorInfo?.componentStack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-600 rounded hover:bg-blue-500"
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [sdeLoaded, setSdeLoaded] = useState(false)
  const [sdeError, setSdeError] = useState<string | null>(null)
  const structuresLoadingRef = useRef(false)

  useEffect(() => {
    initSDE()
      .then(() => setSdeLoaded(true))
      .catch((err) => setSdeError(err.message))
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !sdeLoaded || structuresLoadingRef.current) return

    const count = getStructuresCount()
    const needsReload = count < 1000

    if (needsReload) {
      structuresLoadingRef.current = true
      const action = count > 0 ? clearStructuresCache() : Promise.resolve()
      action
        .then(() => {
          console.log('[SDE] Loading structures from everef.net...')
          return loadStructuresFromEveRef()
        })
        .then((loaded) => console.log(`[SDE] Loaded ${loaded} structures`))
        .catch((err) => console.warn('[SDE] Failed to load structures:', err.message))
    } else {
      console.log(`[SDE] ${count} structures already cached`)
    }
  }, [isAuthenticated, sdeLoaded])

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
    <ErrorBoundary>
      <div className="h-screen bg-slate-900 text-slate-50">
        {isAuthenticated ? <MainLayout /> : <LoginScreen />}
      </div>
    </ErrorBoundary>
  )
}

export default App
