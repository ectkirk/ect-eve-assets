import { useEffect, useState, Component, type ReactNode } from 'react'
import { useAssetStore } from './store/asset-store'
import { useMarketOrdersStore } from './store/market-orders-store'
import { useIndustryJobsStore } from './store/industry-jobs-store'
import { useContractsStore } from './store/contracts-store'
import { useWalletStore } from './store/wallet-store'
import { useBlueprintsStore } from './store/blueprints-store'
import { MainLayout } from './components/layout/MainLayout'
import { initCache } from './store/reference-cache'
import { logger } from './lib/logger'

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
  const [cacheReady, setCacheReady] = useState(false)
  const [cacheError, setCacheError] = useState<string | null>(null)

  useEffect(() => {
    logger.info('App starting', { module: 'App' })
    initCache()
      .then(() => {
        logger.info('Cache initialized', { module: 'App' })
        return useAssetStore.getState().init()
      })
      .then(() => {
        logger.info('Asset store initialized', { module: 'App' })
        return Promise.all([
          useMarketOrdersStore.getState().init(),
          useIndustryJobsStore.getState().init(),
          useContractsStore.getState().init(),
          useWalletStore.getState().init(),
          useBlueprintsStore.getState().init(),
        ])
      })
      .then(() => {
        logger.info('All stores initialized', { module: 'App' })
        setCacheReady(true)
      })
      .catch((err) => {
        logger.error('Failed to initialize cache', err, { module: 'App' })
        setCacheError(err.message)
      })
  }, [])

  if (cacheError) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-50">
        <div className="text-center">
          <p className="text-red-500">Failed to initialize cache</p>
          <p className="text-sm text-slate-400">{cacheError}</p>
        </div>
      </div>
    )
  }

  if (!cacheReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-50">
        <p className="text-slate-400">Initializing...</p>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="h-screen bg-slate-900 text-slate-50">
        <MainLayout />
      </div>
    </ErrorBoundary>
  )
}

export default App
