import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { formatNumber, formatVolume } from '@/lib/utils'
import { CopyButton } from '@/components/ui/copy-button'
import { useFreightInfoStore } from '@/store/freight-info-store'
import { FreightForm } from './FreightForm'
import { FreightResults } from './FreightResults'
import { DEFAULT_CORPORATION, getTierColors } from './constants'

export function FreightPanel() {
  const {
    info,
    isLoading: isLoadingInfo,
    error: infoError,
    fetchInfo,
  } = useFreightInfoStore()
  const [result, setResult] = useState<ShippingCalculateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchInfo()
  }, [fetchInfo])

  const handleSubmit = useCallback(async (text: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await window.electronAPI!.refShippingCalculate(text)
      if (res.error) {
        setError(res.error)
        setResult(null)
      } else {
        setResult(res)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleReset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  if (isLoadingInfo && !info) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }

  if (infoError && !info) {
    return (
      <div className="h-full overflow-auto p-4">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-lg border border-semantic-danger/30 bg-semantic-danger/10 p-4 text-status-negative">
            Failed to load shipping configuration: {infoError}
          </div>
        </div>
      </div>
    )
  }

  const serviceName = info?.service?.name ?? 'Jump Freighter Shipping'
  const corporation = info?.service?.corporation ?? DEFAULT_CORPORATION
  const tiers = info?.tiers ?? []

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="mb-4 text-2xl font-bold text-content">
            {serviceName}
          </h1>
          <p className="text-content-secondary">
            Calculate optimal shipping packages for{' '}
            <span className="font-semibold text-accent">{corporation}</span>
            {info?.service?.ticker && ` (${info.service.ticker})`}.
          </p>
          {info?.service?.forumUrl && (
            <p className="mt-2 text-sm text-content-muted">
              Check out their{' '}
              <a
                href={info.service.forumUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                feedback
              </a>
              {info?.service?.deliveryTimesUrl && (
                <>
                  {' '}
                  and{' '}
                  <a
                    href={info.service.deliveryTimesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    average delivery times
                  </a>
                </>
              )}
              .
            </p>
          )}
        </div>

        {/* Service Tiers */}
        {tiers.length > 0 && (
          <div className="mb-6 rounded-lg border border-border bg-surface-secondary/50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-content-secondary">
              Service Tiers
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {tiers.map((tier) => {
                const colors = getTierColors(tier.name)
                return (
                  <div
                    key={tier.name}
                    className={`rounded-lg border ${colors.border} ${colors.bg} p-3`}
                  >
                    <div className={`text-sm font-medium ${colors.text}`}>
                      {tier.nullSecAllowed
                        ? `${tier.name} / Null Sec`
                        : tier.name}
                    </div>
                    <div className="text-xs text-content-muted">
                      Up to {formatNumber(tier.maxCollateral)} collateral
                    </div>
                    <div
                      className={`mt-1 text-lg font-semibold ${colors.textLight}`}
                    >
                      {formatNumber(tier.cost)} ISK
                    </div>
                    <div className="mt-1 text-xs text-content-muted">
                      {tier.delivery} delivery · {tier.description}
                    </div>
                  </div>
                )
              })}
            </div>
            {info?.limits && (
              <div className="mt-4 rounded-lg bg-surface-tertiary/50 p-3 text-xs text-content-muted">
                <p className="font-medium text-content-secondary">
                  Contract Settings:
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  <li>
                    Private to{' '}
                    <CopyButton
                      text={corporation}
                      className="font-mono text-accent"
                      showValue
                    />
                  </li>
                  <li>
                    {info.contractSettings?.expiration ?? '7 days'} expiration
                  </li>
                  <li>
                    Up to {formatVolume(info.limits.maxVolumePerPackage)} m³
                    cargo per contract
                  </li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <div className="mb-6 rounded-lg border border-border bg-surface-secondary/50 p-6">
          <FreightForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            hasResult={!!result}
            onReset={handleReset}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-semantic-danger/30 bg-semantic-danger/10 p-4 text-status-negative">
            {error}
          </div>
        )}

        {/* Results */}
        {!error && result && <FreightResults result={result} />}
      </div>
    </div>
  )
}
