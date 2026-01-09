import { useState, useEffect, useCallback } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { formatNumber, formatVolume } from '@/lib/utils'
import { CopyButton } from '@/components/ui/copy-button'
import { useFreightInfoStore } from '@/store/freight-info-store'
import { FreightForm } from './FreightForm'
import { FreightResults } from './FreightResults'
import { DEFAULT_CORPORATION, getTierColors } from './constants'

interface FreightPanelProps {
  prefillText?: string | null
  prefillNullSec?: boolean
  onPrefillConsumed?: () => void
}

export function FreightPanel({
  prefillText,
  prefillNullSec,
  onPrefillConsumed,
}: FreightPanelProps) {
  const { t } = useTranslation('tools')
  const {
    info,
    isLoading: isLoadingInfo,
    error: infoError,
    fetchInfo,
  } = useFreightInfoStore()
  const [result, setResult] = useState<ShippingCalculateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [nullSec, setNullSec] = useState(false)
  const [pendingAutoSubmit, setPendingAutoSubmit] = useState<{
    text: string
    nullSec: boolean
  } | null>(null)

  useEffect(() => {
    if (prefillText && prefillText !== pendingAutoSubmit?.text) {
      setFormKey((k) => k + 1)
      setNullSec(prefillNullSec ?? false)
      setPendingAutoSubmit({
        text: prefillText,
        nullSec: prefillNullSec ?? false,
      })
      onPrefillConsumed?.()
    }
  }, [prefillText, prefillNullSec, pendingAutoSubmit?.text, onPrefillConsumed])

  useEffect(() => {
    fetchInfo()
  }, [fetchInfo])

  const handleSubmit = useCallback(async (text: string, nullSec?: boolean) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await window.electronAPI!.refShippingCalculate(text, nullSec)
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
    setNullSec(false)
  }, [])

  useEffect(() => {
    if (pendingAutoSubmit && info && !isLoading && !result) {
      handleSubmit(pendingAutoSubmit.text, pendingAutoSubmit.nullSec)
      setPendingAutoSubmit(null)
    }
  }, [pendingAutoSubmit, info, isLoading, result, handleSubmit])

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
            {t('freight.loadError', { error: infoError })}
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
            <Trans
              i18nKey="freight.calculateDescription"
              t={t}
              values={{
                corp: corporation,
                ticker: info?.service?.ticker
                  ? ` (${info.service.ticker})`
                  : '',
              }}
              components={{
                corp: (
                  <span className="font-semibold text-accent">
                    {corporation}
                  </span>
                ),
              }}
            />
          </p>
          {info?.service?.forumUrl && (
            <p className="mt-2 text-sm text-content-muted">
              <Trans
                i18nKey="freight.checkFeedback"
                t={t}
                components={{
                  feedback: (
                    <a
                      href={info.service.forumUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      feedback
                    </a>
                  ),
                }}
              />
              {info?.service?.deliveryTimesUrl && (
                <Trans
                  i18nKey="freight.andDeliveryTimes"
                  t={t}
                  components={{
                    times: (
                      <a
                        href={info.service.deliveryTimesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        average delivery times
                      </a>
                    ),
                  }}
                />
              )}
              .
            </p>
          )}
        </div>

        {/* Service Tiers */}
        {tiers.length > 0 && (
          <div className="mb-6 rounded-lg border border-border bg-surface-secondary/50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-content-secondary">
              {t('freight.serviceTiers')}
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
                        ? t('freight.nullSecTier', { name: tier.name })
                        : tier.name}
                    </div>
                    <div className="text-xs text-content-muted">
                      {t('freight.upToCollateral', {
                        amount: formatNumber(tier.maxCollateral),
                      })}
                    </div>
                    <div
                      className={`mt-1 text-lg font-semibold ${colors.textLight}`}
                    >
                      {formatNumber(tier.cost)}
                    </div>
                    <div className="mt-1 text-xs text-content-muted">
                      {t('freight.deliveryDescription', {
                        delivery: tier.delivery,
                        description: tier.description,
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            {info?.limits && (
              <div className="mt-4 rounded-lg bg-surface-tertiary/50 p-3 text-xs text-content-muted">
                <p className="font-medium text-content-secondary">
                  {t('freight.contractSettings')}
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  <li>
                    <Trans
                      i18nKey="freight.privateTo"
                      t={t}
                      values={{ corp: corporation }}
                      components={{
                        corp: (
                          <CopyButton
                            text={corporation}
                            className="font-mono text-accent"
                            showValue
                          />
                        ),
                      }}
                    />
                  </li>
                  <li>
                    {t('freight.expirationDays', {
                      days:
                        info.contractSettings?.expiration ??
                        t('freight.defaultExpiration'),
                    })}
                  </li>
                  <li>
                    {t('freight.cargoPerContract', {
                      volume: formatVolume(info.limits.maxVolumePerPackage),
                    })}
                  </li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <div className="mb-6 rounded-lg border border-border bg-surface-secondary/50 p-6">
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={nullSec}
              onClick={() => setNullSec(!nullSec)}
              disabled={isLoading || !!result}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:ring-2 focus:ring-accent/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                nullSec ? 'bg-semantic-info' : 'bg-surface-tertiary'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  nullSec ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <label className="text-sm text-content-secondary">
              <span className="font-medium text-accent">
                {t('freight.nullSecDestination')}
              </span>
              <span className="ml-2 text-content-muted">
                {t('freight.nullSecDescription')}
              </span>
            </label>
          </div>
          <FreightForm
            key={formKey}
            onSubmit={(text) => handleSubmit(text, nullSec)}
            isLoading={isLoading}
            hasResult={!!result}
            onReset={handleReset}
            defaultText={pendingAutoSubmit?.text ?? ''}
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
