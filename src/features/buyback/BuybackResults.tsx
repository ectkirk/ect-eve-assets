import { useState } from 'react'
import type { SecurityConfig } from './config'

interface BuybackResultsProps {
  result: BuybackResult
  config: SecurityConfig
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 font-semibold ${label === 'corp' ? 'text-status-info hover:opacity-80' : 'text-status-positive hover:opacity-80'}`}
      title="Click to copy"
    >
      {text}
      {copied ? (
        <svg className="h-3.5 w-3.5 text-status-positive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  )
}

function getItemImageUrl(typeId: number | null, itemName: string): string | null {
  if (!typeId) return null
  const isBPC = itemName.includes('(Copy)')
  const isBP = itemName.toLowerCase().includes('blueprint') && !isBPC
  const variation = isBPC ? 'bpc' : isBP ? 'bp' : 'icon'
  return `https://images.evetech.net/types/${typeId}/${variation}?size=32`
}

export function BuybackResults({ result, config }: BuybackResultsProps) {
  const { items, totals } = result
  const [showExcluded, setShowExcluded] = useState(totals.buybackValue === 0)

  const formatVolume = (value: number) =>
    value.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' m³'

  const formatISK = (value: number) =>
    value.toLocaleString('en-US', { maximumFractionDigits: 0 })

  const formatISKFull = (value: number) => formatISK(value) + ' ISK'

  const excludedFromList = new Set([
    ...result.unmatchedItems,
    ...result.lowVolumeItems,
    ...result.unprofitableItems,
    ...result.excludedItems,
    ...result.excludedCrystals,
    ...result.excludedRigs,
    ...result.excludedCapitals,
    ...result.blueprintCopies,
    ...(result.unpricedCapitals || []),
  ])
  const displayItems = items.filter((item) => !excludedFromList.has(item.itemName))

  const hasExcludedItems =
    result.excludedItems.length > 0 ||
    result.unmatchedItems.length > 0 ||
    result.lowVolumeItems.length > 0 ||
    result.unprofitableItems.length > 0 ||
    result.excludedCrystals.length > 0 ||
    result.excludedRigs.length > 0 ||
    result.excludedCapitals.length > 0 ||
    result.blueprintCopies.length > 0 ||
    (result.unpricedCapitals?.length || 0) > 0

  return (
    <div className="space-y-6">
      {totals.buybackValue === 0 && (
        <div className="rounded-lg border border-semantic-danger/30 bg-semantic-danger/10 p-6 text-center">
          <div className="text-lg font-medium text-status-negative">No valid items for buyback</div>
          <div className="mt-1 text-sm text-status-negative/80">
            There are no valid items to offer a buyback value.
          </div>
        </div>
      )}

      {totals.buybackValue > 0 && (
        <div className="rounded-lg border border-semantic-success/30 bg-semantic-success/10 p-6">
          <div className="mb-4 text-center">
            <div className="text-3xl font-bold text-status-positive">
              {formatISKFull(totals.buybackValue)}
            </div>
            <div className="text-sm text-status-positive/80">Total Buyback Value</div>
          </div>
          <div className="rounded-lg border border-semantic-success/20 bg-surface-secondary/50 p-4">
            <div className="text-sm text-content-secondary">
              <p>
                Send an <span className="font-semibold text-content">Item Exchange</span> contract to
                corporation <CopyButton text="ECTrade" label="corp" /> for{' '}
                <CopyButton text={formatISKFull(totals.buybackValue)} label="value" />
              </p>
              <p className="mt-1 text-content-secondary">
                Set the reason to: <span className="font-semibold text-content">{config.name}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {hasExcludedItems && (
        <div className="rounded-lg border-2 border-semantic-warning/50 bg-semantic-warning/5">
          <button
            type="button"
            onClick={() => setShowExcluded(!showExcluded)}
            className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-semantic-warning/10"
          >
            <span className="flex items-center gap-2 text-sm">
              <svg className="h-5 w-5 shrink-0 text-semantic-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-status-highlight/80">
                We have excluded some items from your offer.{' '}
                <span className="text-status-highlight underline">Click here for more information</span>
              </span>
            </span>
            <svg className={`h-5 w-5 shrink-0 text-semantic-warning transition-transform ${showExcluded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showExcluded && (
            <div className="space-y-4 border-t border-semantic-warning/30 p-4">
              <div className="text-sm text-content-secondary">
                The following items have not been included in the shown appraisal and can be safely
                removed from your buyback contract.
              </div>

              {result.excludedItems.length > 0 && (
                <ExcludedSection
                  title="We are not accepting Apparel or SKINs"
                  items={result.excludedItems}
                  color="orange"
                  description="Please exclude these items from your contract"
                  footer="If you believe this is an error, please contact us."
                />
              )}

              {result.unmatchedItems.length > 0 && (
                <ExcludedSection
                  title="We're unable to recognize some of your items"
                  items={result.unmatchedItems}
                  color="red"
                  footer="If you believe this is an error, please let us know."
                />
              )}

              {result.lowVolumeItems.length > 0 && (
                <ExcludedSection
                  title="Some items have low volume or unreliable price history"
                  items={result.lowVolumeItems}
                  color="pink"
                  footer="We're unable to offer an appropriate quote for these items due to insufficient market data."
                />
              )}

              {result.unprofitableItems.length > 0 && (
                <ExcludedSection
                  title="m³/Value Exclusions"
                  items={result.unprofitableItems}
                  color="purple"
                  footer="Due to the high m³/low value, these items are not profitable to transport."
                />
              )}

              {result.excludedCrystals.length > 0 && (
                <ExcludedSection
                  title="Crystal Ammunition Not Accepted"
                  items={result.excludedCrystals}
                  color="gray"
                  footer="We cannot determine from all paste formats whether crystals are tradeable, so we do not buy crystal ammunition."
                />
              )}

              {result.excludedRigs.length > 0 && (
                <ExcludedSection
                  title="Rigs have been excluded"
                  items={result.excludedRigs}
                  color="blue"
                  footer="Rigs are generally destroyed on repackage. If you believe this is a mistake (rigs not applied to hull/T3C), please contact us."
                />
              )}

              {result.excludedCapitals.length > 0 && (
                <ExcludedSection
                  title="Capital ships are not accepted"
                  items={result.excludedCapitals}
                  color="cyan"
                  footer={config.name.toLowerCase().includes('high') ? 'We do not purchase capitals in high security space.' : 'We are not accepting capitals at this time.'}
                />
              )}

              {result.blueprintCopies.length > 0 && (
                <ExcludedSection
                  title="Blueprint copies cannot be valued"
                  items={result.blueprintCopies}
                  color="indigo"
                  footer="We are unable to determine the value of blueprint copies. Please do not include them in your contract."
                />
              )}

              {(result.unpricedCapitals?.length || 0) > 0 && (
                <ExcludedSection
                  title="Unable to price some capital ships"
                  items={result.unpricedCapitals || []}
                  color="amber"
                  footer="These capitals do not have at least 5 completed sales in the last 60 days. We are unable to offer a price without sufficient market data."
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface-secondary/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-content">Accepted Items Summary</h2>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-content-secondary">Items</div>
            <div className="font-medium text-content">{totals.profitableCount} accepted</div>
          </div>
          <div>
            <div className="text-content-secondary">Total Volume</div>
            <div className="font-medium text-content">{formatVolume(totals.totalVolume)}</div>
          </div>
          <div>
            <div className="text-content-secondary">Jita Buy</div>
            <div className="font-medium text-content">{formatISKFull(totals.jitaBuyTotal)}</div>
          </div>
          <div>
            <div className="text-content-secondary">Jita Sell</div>
            <div className="font-medium text-content">{formatISKFull(totals.jitaSellTotal)}</div>
          </div>
          {totals.capitalValue > 0 && (
            <div>
              <div className="text-content-secondary">Capital Value</div>
              <div className="font-medium text-content">{formatISKFull(totals.capitalValue)}</div>
            </div>
          )}
          {totals.assetSafetyCost > 0 && (
            <div>
              <div className="text-content-secondary">Asset Safety Fee</div>
              <div className="font-medium text-status-warning">-{formatISKFull(totals.assetSafetyCost)}</div>
            </div>
          )}
        </div>
      </div>

      {displayItems.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-secondary">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-content-secondary">Item</th>
                  <th className="px-4 py-3 text-right font-medium text-content-secondary">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {displayItems.map((item, index) => (
                  <tr key={`${item.itemName}-${index}`} className="text-content">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {item.typeId ? (
                          <img
                            src={getItemImageUrl(item.typeId, item.itemName) || ''}
                            alt=""
                            width={32}
                            height={32}
                            className="shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 shrink-0 rounded bg-surface-tertiary" />
                        )}
                        <span className="truncate">{item.itemName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {item.quantity.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ExcludedSection({
  title,
  items,
  color,
  description,
  footer,
}: {
  title: string
  items: string[]
  color: 'orange' | 'red' | 'pink' | 'purple' | 'gray' | 'blue' | 'cyan' | 'indigo' | 'amber'
  description?: string
  footer: string
}) {
  const colorClasses = {
    orange: 'border-category-orange/30 bg-category-orange/10 text-category-orange',
    red: 'border-category-red/30 bg-category-red/10 text-category-red',
    pink: 'border-category-pink/30 bg-category-pink/10 text-category-pink',
    purple: 'border-category-purple/30 bg-category-purple/10 text-category-purple',
    gray: 'border-border bg-surface-tertiary/50 text-content-secondary',
    blue: 'border-category-blue/30 bg-category-blue/10 text-category-blue',
    cyan: 'border-category-cyan/30 bg-category-cyan/10 text-category-cyan',
    indigo: 'border-category-indigo/30 bg-category-indigo/10 text-category-indigo',
    amber: 'border-category-amber/30 bg-category-amber/10 text-category-amber',
  }

  const textClasses = {
    orange: 'text-category-orange/80',
    red: 'text-category-red/80',
    pink: 'text-category-pink/80',
    purple: 'text-category-purple/80',
    gray: 'text-content-secondary/80',
    blue: 'text-category-blue/80',
    cyan: 'text-category-cyan/80',
    indigo: 'text-category-indigo/80',
    amber: 'text-category-amber/80',
  }

  const footerClasses = {
    orange: 'text-category-orange/60',
    red: 'text-category-red/60',
    pink: 'text-category-pink/60',
    purple: 'text-category-purple/60',
    gray: 'text-content-secondary/60',
    blue: 'text-category-blue/60',
    cyan: 'text-category-cyan/60',
    indigo: 'text-category-indigo/60',
    amber: 'text-category-amber/60',
  }

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="mb-1 font-medium">{title}</div>
      {description && <div className={`mb-2 text-sm ${textClasses[color]}`}>{description}</div>}
      <div className={`mb-2 text-sm ${textClasses[color]}`}>{items.join(', ')}</div>
      <div className={`text-xs ${footerClasses[color]}`}>{footer}</div>
    </div>
  )
}
