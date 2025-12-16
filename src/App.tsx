import { useEffect, useState, Component, type ReactNode } from 'react'
import { useAuthStore } from './store/auth-store'
import { useAssetStore, setupSyntheticAssetSubscriptions } from './store/asset-store'
import { useMarketOrdersStore } from './store/market-orders-store'
import { useContractsStore } from './store/contracts-store'
import { useWalletStore } from './store/wallet-store'
import { useBlueprintsStore } from './store/blueprints-store'
import { useStructuresStore } from './store/structures-store'
import { useIndustryJobsStore } from './store/industry-jobs-store'
import { useExpiryCacheStore } from './store/expiry-cache-store'
import { MainLayout } from './components/layout/MainLayout'
import { initCache } from './store/reference-cache'
import { logger } from './lib/logger'
import { setupESITokenProvider } from './api/esi'
import { initTheme } from './store/theme-store'

let appInitStarted = false
let appInitComplete = false

initTheme()

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('Uncaught error in component tree', error, {
      module: 'ErrorBoundary',
      componentStack: errorInfo.componentStack,
    })
    this.setState({ errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-surface text-content">
          <div className="text-center max-w-2xl p-4">
            <p className="text-semantic-danger text-lg font-bold">Something went wrong</p>
            <pre className="mt-4 text-left text-xs text-content-secondary bg-surface-secondary p-4 rounded overflow-auto max-h-48">
              {this.state.error?.message}
            </pre>
            <pre className="mt-2 text-left text-xs text-content-muted bg-surface-secondary p-4 rounded overflow-auto max-h-48">
              {this.state.errorInfo?.componentStack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-accent rounded hover:bg-accent-hover"
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
  const [cacheReady, setCacheReady] = useState(appInitComplete)
  const [cacheError, setCacheError] = useState<string | null>(null)

  useEffect(() => {
    const cleanupTokenProvider = setupESITokenProvider()
    return cleanupTokenProvider
  }, [])

  useEffect(() => {
    if (appInitStarted) return
    appInitStarted = true

    logger.info('App starting', { module: 'App' })
    initCache()
      .then(() => {
        logger.info('Cache initialized', { module: 'App' })
        return useExpiryCacheStore.getState().init()
      })
      .then(() => {
        logger.info('Expiry cache initialized', { module: 'App' })
        return useAssetStore.getState().init()
      })
      .then(() => {
        logger.info('Asset store initialized', { module: 'App' })
        return Promise.all([
          useMarketOrdersStore.getState().init(),
          useContractsStore.getState().init(),
          useWalletStore.getState().init(),
          useBlueprintsStore.getState().init(),
          useStructuresStore.getState().init(),
          useIndustryJobsStore.getState().init(),
        ])
      })
      .then(async () => {
        logger.info('All stores initialized', { module: 'App' })
        setupSyntheticAssetSubscriptions()
        useAssetStore.getState().rebuildSyntheticAssets()
        const ownerKeys = Object.keys(useAuthStore.getState().owners)
        useExpiryCacheStore.getState().queueMissingEndpoints(ownerKeys)
        appInitComplete = true
        setCacheReady(true)
      })
      .catch((err) => {
        logger.error('Failed to initialize cache', err, { module: 'App' })
        setCacheError(err.message)
      })
  }, [])

  if (cacheError) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface text-content">
        <div className="text-center">
          <p className="text-semantic-danger">Failed to initialize cache</p>
          <p className="text-sm text-content-secondary">{cacheError}</p>
        </div>
      </div>
    )
  }

  if (!cacheReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface text-content">
        <p className="text-content-secondary">Initializing...</p>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="h-screen bg-surface text-content">
        <MainLayout />
      </div>
    </ErrorBoundary>
  )
}

export default App
