import { useEffect, useState, useCallback, Component, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from './store/auth-store'
import { useDataCacheStore, type DataType } from './store/data-cache-store'
import { LoginScreen } from './components/layout/LoginScreen'
import { MainLayout } from './components/layout/MainLayout'
import { UpdateDialog } from './components/dialogs/UpdateDialog'
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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const queryClient = useQueryClient()
  const setFetching = useDataCacheStore((state) => state.setFetching)
  const setFetched = useDataCacheStore((state) => state.setFetched)
  const setError = useDataCacheStore((state) => state.setError)

  const [cacheReady, setCacheReady] = useState(false)
  const [cacheError, setCacheError] = useState<string | null>(null)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)

  const handleDataUpdate = useCallback(async (selected: DataType[]) => {
    logger.info('Starting data update', { module: 'App', dataTypes: selected })

    for (const dataType of selected) {
      setFetching(dataType, true)
    }

    try {
      if (selected.includes('assets')) {
        await queryClient.invalidateQueries({ queryKey: ['assets'] })
        setFetched('assets', null)
      }
      if (selected.includes('marketOrders')) {
        await queryClient.invalidateQueries({ queryKey: ['marketOrders'] })
        setFetched('marketOrders', null)
      }
      if (selected.includes('industryJobs')) {
        await queryClient.invalidateQueries({ queryKey: ['industryJobs'] })
        setFetched('industryJobs', null)
      }
      if (selected.includes('contracts')) {
        await queryClient.invalidateQueries({ queryKey: ['contracts'] })
        setFetched('contracts', null)
      }
      if (selected.includes('clones')) {
        await queryClient.invalidateQueries({ queryKey: ['clones'] })
        setFetched('clones', null)
      }
      if (selected.includes('prices')) {
        await queryClient.invalidateQueries({ queryKey: ['marketPrices'] })
        await queryClient.invalidateQueries({ queryKey: ['capitalPrices'] })
        setFetched('prices', null)
      }

      logger.info('Data update completed', { module: 'App', dataTypes: selected })
    } catch (err) {
      logger.error('Data update failed', err as Error, { module: 'App' })
      for (const dataType of selected) {
        setError(dataType, (err as Error).message)
      }
    }
  }, [queryClient, setFetching, setFetched, setError])

  useEffect(() => {
    logger.info('App starting', { module: 'App' })
    initCache()
      .then(() => {
        logger.info('Cache initialized', { module: 'App' })
        setCacheReady(true)
      })
      .catch((err) => {
        logger.error('Failed to initialize cache', err, { module: 'App' })
        setCacheError(err.message)
      })
  }, [])

  useEffect(() => {
    if (!window.electronAPI) return

    const unsubDialog = window.electronAPI.onOpenUpdateDialog(() => setUpdateDialogOpen(true))

    return () => {
      unsubDialog()
    }
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
        {isAuthenticated ? <MainLayout /> : <LoginScreen />}
        <UpdateDialog
          open={updateDialogOpen}
          onOpenChange={setUpdateDialogOpen}
          onUpdate={handleDataUpdate}
        />
      </div>
    </ErrorBoundary>
  )
}

export default App
