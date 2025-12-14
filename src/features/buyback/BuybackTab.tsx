import { useState } from 'react'
import { BuybackForm } from './BuybackForm'
import { BuybackResults } from './BuybackResults'
import { BUYBACK_TABS, getConfigByTabName, type BuybackTabType } from './config'

interface BuybackTabProps {
  activeTab: BuybackTabType
  onTabChange: (tab: BuybackTabType) => void
}

export function BuybackTab({ activeTab, onTabChange }: BuybackTabProps) {
  const [result, setResult] = useState<BuybackResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const config = getConfigByTabName(activeTab)

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

  const handleTabChange = (tab: BuybackTabType) => {
    handleReset()
    onTabChange(tab)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-700 bg-slate-800/50">
        <div className="flex gap-1 px-4">
          {BUYBACK_TABS.map((tab) => {
            const tabConfig = getConfigByTabName(tab)
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                  isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  {tabConfig && (
                    <span className={`h-2 w-2 rounded-full ${tabConfig.color}`} />
                  )}
                  {tab}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6">
            <h1 className="mb-2 flex items-center gap-3 text-2xl font-bold text-white">
              EC Trade Buyback
              {config && (
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold text-white ${config.color}`}
                >
                  {config.name}
                </span>
              )}
            </h1>
            <p className="text-slate-400">
              {config?.key === 'assetsafety'
                ? 'For null sec users selling items from player-owned structures that require asset safety retrieval.'
                : `${config?.name} buyback. General buyback for items${config?.acceptCapitals ? ' and capitals' : ''}.`}
            </p>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
              <BuybackForm
                onSubmit={handleSubmit}
                isLoading={isLoading}
                hasQuote={!!result}
                onReset={handleReset}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
                {error}
              </div>
            )}

            {!error && result && config && <BuybackResults result={result} config={config} />}
          </div>
        </div>
      </div>
    </div>
  )
}
