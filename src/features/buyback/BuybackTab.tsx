import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { BuybackForm } from './BuybackForm'
import { BuybackResults } from './BuybackResults'
import { BuybackFAQ } from './BuybackFAQ'
import { useBuybackInfoStore } from '@/store/buyback-info-store'
import {
  getStyling,
  formatRate,
  type BuybackTabType,
  type RuntimeSecurityConfig,
  type AssetSafetySecurityLevel,
} from './config'
import { Loader2 } from 'lucide-react'

type NPCStationOption = 'yes' | 'no'

interface ToggleGroupProps<T extends string> {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}

function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: ToggleGroupProps<T>) {
  return (
    <div className={`flex items-center gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-sm font-medium text-content-secondary">
        {label}
      </span>
      <div className="flex rounded-lg border border-border bg-surface-tertiary p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              value === option.value
                ? 'bg-semantic-asset-safety text-semantic-asset-safety-foreground'
                : 'text-content-secondary hover:text-content'
            } disabled:cursor-not-allowed`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface BuybackTabProps {
  activeTab: BuybackTabType
  prefillText?: string | null
  onPrefillConsumed?: () => void
}

export function BuybackTab({
  activeTab,
  prefillText,
  onPrefillConsumed,
}: BuybackTabProps) {
  const { t } = useTranslation('tools')
  const {
    info,
    isLoading: isLoadingInfo,
    error: infoError,
    fetchInfo,
  } = useBuybackInfoStore()
  const [result, setResult] = useState<BuybackResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const prevTabRef = useRef(activeTab)
  const [formKey, setFormKey] = useState(0)
  const [pendingAutoSubmit, setPendingAutoSubmit] = useState<string | null>(
    null
  )

  useEffect(() => {
    if (prefillText && prefillText !== pendingAutoSubmit) {
      setFormKey((k) => k + 1)
      setPendingAutoSubmit(prefillText)
      onPrefillConsumed?.()
    }
  }, [prefillText, pendingAutoSubmit, onPrefillConsumed])

  const [assetSafetySecLevel, setAssetSafetySecLevel] =
    useState<AssetSafetySecurityLevel>('nullsec')
  const [npcStation, setNpcStation] = useState<NPCStationOption>('no')

  useEffect(() => {
    fetchInfo()
  }, [fetchInfo])

  const config: RuntimeSecurityConfig | null = useMemo(() => {
    if (!info?.securityConfigs || !info?.assetSafetyRates) return null

    if (activeTab !== 'assetsafety') {
      const apiConfig = info.securityConfigs[activeTab]
      if (!apiConfig) return null
      return {
        name: apiConfig.name,
        key: activeTab,
        buyRate: apiConfig.buyRate,
        iskPerM3: apiConfig.iskPerM3,
        acceptCapitals: apiConfig.acceptCapitals,
        styling: getStyling(activeTab),
      }
    }

    const assetSafetyRates = info.assetSafetyRates[assetSafetySecLevel]
    const buyRate =
      npcStation === 'yes'
        ? assetSafetyRates.npcStation
        : assetSafetyRates.noNpcStation
    const feeRate =
      npcStation === 'yes'
        ? info.assetSafetyRates.npcStationFeeRate
        : info.assetSafetyRates.feeRate

    return {
      name: t('buyback.tabs.assetsafety'),
      key: 'assetsafety',
      buyRate,
      iskPerM3: assetSafetyRates.iskPerM3,
      acceptCapitals: assetSafetySecLevel !== 'highsec',
      assetSafetyRate: feeRate,
      styling: getStyling('assetsafety'),
    }
  }, [info, activeTab, assetSafetySecLevel, npcStation, t])

  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      setResult(null)
      setError(null)
      prevTabRef.current = activeTab
    }
  }, [activeTab])

  const prevAssetSafetyOptions = useRef({
    secLevel: assetSafetySecLevel,
    npc: npcStation,
  })
  useEffect(() => {
    const prev = prevAssetSafetyOptions.current
    if (
      activeTab === 'assetsafety' &&
      (prev.secLevel !== assetSafetySecLevel || prev.npc !== npcStation)
    ) {
      setResult(null)
      setError(null)
    }
    prevAssetSafetyOptions.current = {
      secLevel: assetSafetySecLevel,
      npc: npcStation,
    }
  }, [activeTab, assetSafetySecLevel, npcStation])

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!config) return

      setIsLoading(true)
      setError(null)

      try {
        const buybackConfig: BuybackConfig = {
          buyRate: config.buyRate,
          iskPerM3: config.iskPerM3,
          acceptCapitals: config.acceptCapitals,
          assetSafetyRate: config.assetSafetyRate,
        }
        const res = await window.electronAPI!.refBuybackCalculate(
          text,
          buybackConfig
        )
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
    },
    [config]
  )

  const handleReset = () => {
    setResult(null)
    setError(null)
  }

  useEffect(() => {
    if (pendingAutoSubmit && config && !isLoading && !result) {
      handleSubmit(pendingAutoSubmit)
      setPendingAutoSubmit(null)
    }
  }, [pendingAutoSubmit, config, isLoading, result, handleSubmit])

  if (isLoadingInfo && !info) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }

  if (infoError && !info) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="rounded-lg border border-semantic-danger/30 bg-semantic-danger/10 p-4 text-status-negative">
          {t('buyback.loadError', { error: infoError })}
        </div>
      </div>
    )
  }

  const serviceName = info?.service?.name ?? 'Buyback'
  const feeRate = info?.assetSafetyRates
    ? npcStation === 'yes'
      ? info.assetSafetyRates.npcStationFeeRate
      : info.assetSafetyRates.feeRate
    : 0.15

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="mb-2 flex items-center gap-3 text-2xl font-bold text-content">
          {serviceName}
          {config && (
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${config.styling.colorForeground} ${config.styling.color}`}
            >
              {config.name}
            </span>
          )}
        </h1>
        <p className="text-content-secondary">
          {activeTab === 'assetsafety'
            ? t('buyback.assetSafetyDescription', {
                secLevel: t(
                  `buyback.${assetSafetySecLevel === 'highsec' ? 'highSec' : assetSafetySecLevel === 'lowsec' ? 'lowSec' : 'nullSec'}`
                ),
                buyRate: formatRate(config?.buyRate ?? 0),
                feeRate: formatRate(feeRate),
              })
            : config?.acceptCapitals
              ? t('buyback.descriptionWithCapitals', { name: config?.name })
              : t('buyback.description', { name: config?.name })}
        </p>
      </div>

      <div className="space-y-6">
        {activeTab === 'assetsafety' && (
          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-surface-secondary/50 p-4">
            <ToggleGroup
              label={t('buyback.securityLevel')}
              options={[
                { value: 'nullsec', label: t('buyback.nullSec') },
                { value: 'lowsec', label: t('buyback.lowSec') },
                { value: 'highsec', label: t('buyback.highSec') },
              ]}
              value={assetSafetySecLevel}
              onChange={setAssetSafetySecLevel}
              disabled={isLoading}
            />
            <ToggleGroup
              label={t('buyback.npcStation')}
              options={[
                { value: 'no', label: t('buyback.no') },
                { value: 'yes', label: t('buyback.yes') },
              ]}
              value={npcStation}
              onChange={setNpcStation}
              disabled={isLoading}
            />
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface-secondary/50 p-6">
          <BuybackForm
            key={formKey}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            hasQuote={!!result}
            onReset={handleReset}
            defaultText={pendingAutoSubmit ?? ''}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-semantic-danger/30 bg-semantic-danger/10 p-4 text-status-negative">
            {error}
          </div>
        )}

        {!error && result && config && (
          <BuybackResults result={result} config={config} />
        )}

        <BuybackFAQ />
      </div>
    </div>
  )
}
