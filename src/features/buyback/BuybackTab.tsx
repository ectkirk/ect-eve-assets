import { useState, useEffect, useRef, useMemo } from 'react'
import { BuybackForm } from './BuybackForm'
import { BuybackResults } from './BuybackResults'
import { BuybackFAQ } from './BuybackFAQ'
import {
  getConfigByTabName,
  SECURITY_CONFIGS,
  ASSET_SAFETY_FEE,
  type BuybackTabType,
  type SecurityConfig,
} from './config'

type AssetSafetySecurityLevel = 'lowsec' | 'nullsec'
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
      <span className="text-sm font-medium text-content-secondary">{label}</span>
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
}

export function BuybackTab({ activeTab }: BuybackTabProps) {
  const [result, setResult] = useState<BuybackResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const prevTabRef = useRef(activeTab)

  const [assetSafetySecLevel, setAssetSafetySecLevel] = useState<AssetSafetySecurityLevel>('nullsec')
  const [npcStation, setNpcStation] = useState<NPCStationOption>('no')

  const config: SecurityConfig | null = useMemo(() => {
    if (activeTab !== 'Asset Safety') {
      return getConfigByTabName(activeTab)
    }
    const baseConfig = SECURITY_CONFIGS[assetSafetySecLevel]
    const assetSafetyConfig = SECURITY_CONFIGS.assetsafety
    if (!baseConfig || !assetSafetyConfig) return null
    const feeRate =
      npcStation === 'yes' ? ASSET_SAFETY_FEE.NPC_STATION : ASSET_SAFETY_FEE.NO_NPC_STATION
    return {
      name: assetSafetyConfig.name,
      key: assetSafetyConfig.key,
      color: assetSafetyConfig.color,
      colorForeground: assetSafetyConfig.colorForeground,
      textColor: assetSafetyConfig.textColor,
      borderColor: assetSafetyConfig.borderColor,
      bgColor: assetSafetyConfig.bgColor,
      acceptCapitals: assetSafetyConfig.acceptCapitals,
      buyRate: baseConfig.buyRate,
      iskPerM3: baseConfig.iskPerM3,
      assetSafetyRate: feeRate,
    }
  }, [activeTab, assetSafetySecLevel, npcStation])

  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      setResult(null)
      setError(null)
      prevTabRef.current = activeTab
    }
  }, [activeTab])

  const prevAssetSafetyOptions = useRef({ secLevel: assetSafetySecLevel, npc: npcStation })
  useEffect(() => {
    const prev = prevAssetSafetyOptions.current
    if (
      activeTab === 'Asset Safety' &&
      (prev.secLevel !== assetSafetySecLevel || prev.npc !== npcStation)
    ) {
      setResult(null)
      setError(null)
    }
    prevAssetSafetyOptions.current = { secLevel: assetSafetySecLevel, npc: npcStation }
  }, [activeTab, assetSafetySecLevel, npcStation])

  const handleSubmit = async (text: string) => {
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
      const res = await window.electronAPI!.refBuybackCalculate(text, buybackConfig)
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
  }

  const handleReset = () => {
    setResult(null)
    setError(null)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="mb-2 flex items-center gap-3 text-2xl font-bold text-content">
          EC Trade Buyback
          {config && (
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${config.colorForeground} ${config.color}`}
            >
              {config.name}
            </span>
          )}
        </h1>
        <p className="text-content-secondary">
          {activeTab === 'Asset Safety'
            ? `${assetSafetySecLevel === 'nullsec' ? 'Null-sec' : 'Low-sec'} rates with ${npcStation === 'yes' ? '0.5%' : '15%'} asset safety fee${npcStation === 'yes' ? ' (NPC station in system)' : ''}.`
            : `${config?.name} buyback. General buyback for items${config?.acceptCapitals ? ' and capitals' : ''}.`}
        </p>
      </div>

      <div className="space-y-6">
        {activeTab === 'Asset Safety' && (
          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-surface-secondary/50 p-4">
            <ToggleGroup
              label="Security Level"
              options={[
                { value: 'nullsec', label: 'Null-sec' },
                { value: 'lowsec', label: 'Low-sec' },
              ]}
              value={assetSafetySecLevel}
              onChange={setAssetSafetySecLevel}
              disabled={isLoading}
            />
            <ToggleGroup
              label="NPC Station in System"
              options={[
                { value: 'no', label: 'No' },
                { value: 'yes', label: 'Yes' },
              ]}
              value={npcStation}
              onChange={setNpcStation}
              disabled={isLoading}
            />
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface-secondary/50 p-6">
          <BuybackForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            hasQuote={!!result}
            onReset={handleReset}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-semantic-danger/30 bg-semantic-danger/10 p-4 text-status-negative">
            {error}
          </div>
        )}

        {!error && result && config && <BuybackResults result={result} config={config} />}

        <BuybackFAQ />
      </div>
    </div>
  )
}
