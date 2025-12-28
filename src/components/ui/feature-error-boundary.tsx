import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { logger } from '@/lib/logger'

interface Props {
  feature: string
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class FeatureErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error(`Error in ${this.props.feature}`, error, {
      module: 'FeatureErrorBoundary',
      feature: this.props.feature,
      componentStack: errorInfo.componentStack,
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex h-full items-center justify-center p-8"
          role="alert"
          aria-live="assertive"
        >
          <div className="max-w-md text-center">
            <AlertTriangle
              className="mx-auto h-12 w-12 text-semantic-warning"
              aria-hidden="true"
            />
            <p className="mt-4 text-lg font-medium text-content">
              {this.props.feature} encountered an error
            </p>
            <p className="mt-2 text-sm text-content-secondary">
              {this.state.error?.message}
            </p>
            <button
              onClick={this.handleRetry}
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-hover"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
