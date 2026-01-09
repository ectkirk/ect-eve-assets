import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  Component,
  type ReactNode,
} from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { version } from '../package.json'
import { useAuthStore } from './store/auth-store'
import { useAssetStore } from './store/asset-store'
import { useStoreRegistry } from './store/store-registry'
import { stopPriceRefreshTimers } from './store/price-store'
import { useExpiryCacheStore } from './store/expiry-cache-store'
import { MainLayout } from './components/layout/MainLayout'
import { useReferenceCacheStore } from './store/reference-cache'
import {
  loadReferenceData,
  loadUniverseData,
  loadRefStructures,
} from './api/ref-client'
import { logger } from './lib/logger'
import { getErrorMessage } from './lib/errors'
import { setupESITokenProvider } from './api/esi'
import { initTheme } from './store/theme-store'
import { initI18n, i18n } from './i18n'
import { LanguageSelectionModal } from './components/dialogs/LanguageSelectionModal'
import {
  useSettingsStore,
  detectSystemLocale,
  hasSelectedLanguage,
  type SupportedLanguage,
} from './store/settings-store'

function RefDataWarningBanner({
  warnings,
  onDismiss,
}: {
  warnings: string[]
  onDismiss: () => void
}) {
  if (warnings.length === 0) return null

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-2 bg-semantic-warning/20 border-b border-semantic-warning/30 px-4 py-2 text-sm"
    >
      <div className="flex items-center gap-2 text-semantic-warning">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Reference data partially failed to load. Some item names may be
          missing.
        </span>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss warning"
        className="rounded p-1 hover:bg-semantic-warning/20 text-semantic-warning"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

let appInitStarted = false
let appInitComplete = false

initTheme()

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }
> {
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
            <p className="text-semantic-danger text-lg font-bold">
              Something went wrong
            </p>
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
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null)
  const [refDataWarnings, setRefDataWarnings] = useState<string[]>([])
  const [showLanguageSelection, setShowLanguageSelection] = useState(false)
  const setInitialLanguage = useSettingsStore((s) => s.setInitialLanguage)
  const detectedLocale = useMemo(() => detectSystemLocale(), [])

  const continueInitialization = useCallback(async () => {
    await initI18n()
    const refResult = await loadReferenceData(setLoadingStatus)
    if (!refResult.success && refResult.errors.length > 0) {
      setRefDataWarnings(refResult.errors)
    }
    await loadUniverseData(setLoadingStatus)
    await loadRefStructures(setLoadingStatus)
    setLoadingStatus(i18n.t('status.initializingStores'))
    await useExpiryCacheStore.getState().init()
    logger.info('Expiry cache initialized', { module: 'App' })
    await useAssetStore.getState().init()
    logger.info('Asset store initialized', { module: 'App' })
    await useStoreRegistry.getState().initAll(['assets'])
    logger.info('All stores initialized', { module: 'App' })
    const ownerKeys = Object.keys(useAuthStore.getState().owners)
    useExpiryCacheStore.getState().queueMissingEndpoints(ownerKeys)
    appInitComplete = true
    setCacheReady(true)
  }, [])

  const handleLanguageSelected = useCallback(
    async (language: SupportedLanguage) => {
      setInitialLanguage(language)
      setShowLanguageSelection(false)
      try {
        await continueInitialization()
      } catch (err) {
        logger.error('Failed to initialize after language selection', err, {
          module: 'App',
        })
        setCacheError(getErrorMessage(err))
      }
    },
    [setInitialLanguage, continueInitialization]
  )

  useEffect(() => {
    const cleanupTokenProvider = setupESITokenProvider()
    return () => {
      cleanupTokenProvider()
      stopPriceRefreshTimers()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onWindowMinimizeChange?.(
      (isMinimized) => {
        if (isMinimized) {
          useExpiryCacheStore.getState().pause()
        } else {
          useExpiryCacheStore.getState().resume()
        }
      }
    )
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    if (appInitStarted) return
    appInitStarted = true

    logger.info('App starting', { module: 'App' })
    useReferenceCacheStore
      .getState()
      .init()
      .then(async () => {
        logger.info('Cache initialized', { module: 'App' })

        if (!hasSelectedLanguage()) {
          logger.info('First launch, showing language selection', {
            module: 'App',
            detectedLanguage: detectedLocale,
          })
          setShowLanguageSelection(true)
          return
        }

        await continueInitialization()
      })
      .catch((err) => {
        logger.error('Failed to initialize cache', err, { module: 'App' })
        setCacheError(getErrorMessage(err))
      })
  }, [continueInitialization, detectedLocale])

  const [isClearing, setIsClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)

  if (cacheError) {
    const handleClearAndRestart = async () => {
      if (isClearing) return
      setIsClearing(true)
      setClearError(null)
      try {
        await window.electronAPI?.clearStorageAndRestart?.()
      } catch (err) {
        setClearError(getErrorMessage(err))
        setIsClearing(false)
      }
    }
    return (
      <div className="flex h-screen items-center justify-center bg-surface text-content">
        <div className="text-center max-w-md">
          <p className="text-semantic-danger text-lg font-bold">
            Failed to initialize cache
          </p>
          <p className="text-sm text-content-secondary mt-2">{cacheError}</p>
          <p className="text-xs text-content-muted mt-4">
            This is usually caused by corrupted cache data. Clearing the cache
            will resolve this issue.
          </p>
          {clearError && (
            <p className="text-xs text-semantic-danger mt-2">{clearError}</p>
          )}
          <button
            onClick={handleClearAndRestart}
            disabled={isClearing}
            className="mt-4 px-4 py-2 bg-accent rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isClearing ? 'Clearing...' : 'Clear Cache & Restart'}
          </button>
        </div>
      </div>
    )
  }

  if (showLanguageSelection) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface text-content">
        <LanguageSelectionModal
          detectedLanguage={detectedLocale}
          onSelect={handleLanguageSelected}
        />
      </div>
    )
  }

  if (!cacheReady) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-surface text-content">
        <span className="text-2xl font-bold tracking-tight">
          <span className="text-accent">ECT</span> EVE Assets
        </span>
        <span className="text-xs text-content-muted">Beta {version}</span>
        {loadingStatus && (
          <p className="mt-2 text-content-secondary">{loadingStatus}</p>
        )}
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen flex-col bg-surface text-content">
        <RefDataWarningBanner
          warnings={refDataWarnings}
          onDismiss={() => setRefDataWarnings([])}
        />
        <div className="flex-1 overflow-hidden">
          <MainLayout />
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default App
