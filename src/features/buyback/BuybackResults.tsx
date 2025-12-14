import { useState } from 'react'
import { formatNumber } from '@/lib/utils'
import type { SecurityConfig } from './config'

interface BuybackResultsProps {
  result: BuybackResult
  config: SecurityConfig
}

function ExcludedItemsDropdown({
  title,
  items,
  color = 'yellow',
}: {
  title: string
  items: string[]
  color?: 'yellow' | 'red' | 'orange'
}) {
  const [isOpen, setIsOpen] = useState(false)

  if (items.length === 0) return null

  const colorClasses = {
    yellow: 'border-yellow-600/30 bg-yellow-900/20 text-yellow-400',
    red: 'border-red-600/30 bg-red-900/20 text-red-400',
    orange: 'border-orange-600/30 bg-orange-900/20 text-orange-400',
  }

  return (
    <div className={`rounded-lg border ${colorClasses[color]} p-3`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-medium">
          {title} ({items.length})
        </span>
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <ul className="mt-2 max-h-40 overflow-y-auto text-sm opacity-80">
          {items.map((item, idx) => (
            <li key={idx} className="py-0.5">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function BuybackResults({ result, config }: BuybackResultsProps) {
  const { totals } = result

  const formatVolume = (value: number) =>
    value.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' m³'

  const formatISKFull = (value: number) =>
    value.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ISK'

  const volumePenalty = totals.totalVolume * config.iskPerM3

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Quote Summary</h2>

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-700/50 p-4">
            <div className="text-xs text-slate-400">Total Volume</div>
            <div className="text-lg font-semibold text-white">
              {formatVolume(totals.totalVolume)}
            </div>
          </div>

          <div className="rounded-lg bg-slate-700/50 p-4">
            <div className="text-xs text-slate-400">Jita Buy</div>
            <div className="text-lg font-semibold text-blue-400">
              {formatNumber(totals.jitaBuyTotal)}
            </div>
            <div className="text-xs text-slate-500">{formatISKFull(totals.jitaBuyTotal)}</div>
          </div>

          <div className="rounded-lg bg-slate-700/50 p-4">
            <div className="text-xs text-slate-400">Jita Sell</div>
            <div className="text-lg font-semibold text-green-400">
              {formatNumber(totals.jitaSellTotal)}
            </div>
            <div className="text-xs text-slate-500">{formatISKFull(totals.jitaSellTotal)}</div>
          </div>

          <div className="rounded-lg bg-slate-700/50 p-4">
            <div className="text-xs text-slate-400">Items</div>
            <div className="text-lg font-semibold text-white">
              {totals.matchedCount} / {totals.itemCount}
            </div>
            <div className="text-xs text-slate-500">matched</div>
          </div>
        </div>

        <div
          className={`rounded-lg border p-6 ${config.borderColor} ${config.bgColor}`}
        >
          <div className={`text-sm ${config.textColor}`}>
            {config.name} Buyback Value ({Math.round(config.buyRate * 100)}%)
          </div>
          <div className={`text-3xl font-bold ${config.textColor}`}>
            {formatNumber(totals.buybackValue)} ISK
          </div>
          <div className="mt-2 text-sm text-slate-400">
            <span>{formatISKFull(totals.buybackValue)}</span>
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            <div>Volume penalty: -{formatNumber(volumePenalty)} ISK ({config.iskPerM3} ISK/m³)</div>
            {config.assetSafetyRate && totals.assetSafetyCost > 0 && (
              <div>
                Asset safety fee: -{formatNumber(totals.assetSafetyCost)} ISK (
                {Math.round(config.assetSafetyRate * 100)}%)
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-600 bg-slate-800 p-4">
          <h3 className="mb-2 text-sm font-medium text-slate-300">Contract Instructions</h3>
          <p className="text-sm text-slate-400">
            Create an <span className="text-white">Item Exchange</span> contract to{' '}
            <span className="text-blue-400">ECTrade</span> for exactly{' '}
            <span className="font-mono text-white">
              {formatISKFull(Math.floor(totals.buybackValue))}
            </span>
          </p>
        </div>
      </div>

      {(result.unmatchedItems.length > 0 ||
        result.excludedItems.length > 0 ||
        result.lowVolumeItems.length > 0 ||
        result.unprofitableItems.length > 0 ||
        result.excludedCrystals.length > 0 ||
        result.excludedRigs.length > 0 ||
        result.excludedCapitals.length > 0 ||
        result.blueprintCopies.length > 0) && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-300">Excluded Items</h3>
          <p className="text-xs text-slate-500">
            These items are not included in your buyback value. Remove them from your contract.
          </p>

          <ExcludedItemsDropdown
            title="Unmatched (not found)"
            items={result.unmatchedItems}
            color="red"
          />
          <ExcludedItemsDropdown title="Excluded categories" items={result.excludedItems} />
          <ExcludedItemsDropdown title="Low volume items" items={result.lowVolumeItems} />
          <ExcludedItemsDropdown title="Unprofitable items" items={result.unprofitableItems} />
          <ExcludedItemsDropdown title="Crystal ammunition" items={result.excludedCrystals} />
          <ExcludedItemsDropdown title="Rigs" items={result.excludedRigs} />
          <ExcludedItemsDropdown
            title="Capitals not accepted"
            items={result.excludedCapitals}
            color="orange"
          />
          <ExcludedItemsDropdown
            title="Blueprint copies"
            items={result.blueprintCopies}
            color="orange"
          />
        </div>
      )}
    </div>
  )
}
