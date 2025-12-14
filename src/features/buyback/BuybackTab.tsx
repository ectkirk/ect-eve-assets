import { useState, useEffect, useRef } from 'react'
import { BuybackForm } from './BuybackForm'
import { BuybackResults } from './BuybackResults'
import { BuybackFAQ } from './BuybackFAQ'
import { getConfigByTabName, type BuybackTabType } from './config'

interface BuybackTabProps {
  activeTab: BuybackTabType
}

export function BuybackTab({ activeTab }: BuybackTabProps) {
  const [result, setResult] = useState<BuybackResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const prevTabRef = useRef(activeTab)

  const config = getConfigByTabName(activeTab)

  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      setResult(null)
      setError(null)
      prevTabRef.current = activeTab
    }
  }, [activeTab])

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
          {config?.key === 'assetsafety'
            ? 'For null sec users selling items from player-owned structures that require asset safety retrieval.'
            : `${config?.name} buyback. General buyback for items${config?.acceptCapitals ? ' and capitals' : ''}.`}
        </p>
      </div>

      <div className="space-y-6">
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
