import { useState, useMemo, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatNumber, formatVolume, formatFullNumber } from '@/lib/utils'
import { CopyButton } from '@/components/ui/copy-button'
import { useFreightInfoStore } from '@/store/freight-info-store'
import { DEFAULT_CORPORATION, getTierColors } from './constants'

function generateRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `ECT-${result}`
}

interface FreightResultsProps {
  result: ShippingCalculateResult
}

export function FreightResults({ result }: FreightResultsProps) {
  const { info } = useFreightInfoStore()
  const [expandedPackages, setExpandedPackages] = useState<Set<number>>(
    new Set()
  )

  const packageRefs = useMemo(() => {
    const refs = new Map<number, string>()
    result.shippingPlan?.packages.forEach((pkg) => {
      refs.set(pkg.packageNumber, generateRef())
    })
    return refs
  }, [result.shippingPlan?.packages])

  const togglePackage = useCallback((n: number) => {
    setExpandedPackages((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }, [])

  const plan = result.shippingPlan
  if (!plan) return null

  const corporation = info?.service?.corporation ?? DEFAULT_CORPORATION
  const hasUnmatched = (result.unmatchedItems?.length ?? 0) > 0
  const hasUnshippable = (plan.unshippableItems?.length ?? 0) > 0
  const hasManualCollateral = (result.manualCollateralItems?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-lg border border-border bg-surface-secondary/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-content">
          Shipping Summary
        </h2>
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-surface-tertiary p-4">
            <div className="text-xs text-content-secondary">Total Packages</div>
            <div className="text-2xl font-bold text-content">
              {plan.summary.totalPackages}
            </div>
          </div>
          <div className="rounded-lg bg-semantic-asset-safety/20 p-4">
            <div className="text-xs text-status-time">Total Shipping Cost</div>
            <div className="text-2xl font-bold text-status-time">
              {formatNumber(plan.summary.totalShippingCost)}
            </div>
            <div className="text-xs text-content-muted">
              {formatFullNumber(plan.summary.totalShippingCost)} ISK
            </div>
          </div>
          <div className="rounded-lg bg-surface-tertiary p-4">
            <div className="text-xs text-content-secondary">Total Volume</div>
            <div className="text-lg font-semibold text-content">
              {formatVolume(plan.summary.totalCargoVolume, { suffix: true })}
            </div>
          </div>
          <div className="rounded-lg bg-surface-tertiary p-4">
            <div className="text-xs text-content-secondary">
              Total Collateral
            </div>
            <div className="text-lg font-semibold text-status-info">
              {formatNumber(plan.summary.totalCargoValue)}
            </div>
            <div className="text-xs text-content-muted">
              {formatFullNumber(plan.summary.totalCargoValue)} ISK
            </div>
          </div>
        </div>

        {plan.summary.costBreakdown.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-content-secondary">
              Cost Breakdown
            </h3>
            <div className="flex flex-wrap gap-3">
              {plan.summary.costBreakdown.map((b) => {
                const colors = getTierColors(b.tierName)
                return (
                  <div
                    key={b.tierName}
                    className={`rounded-lg border ${colors.border} ${colors.bg} px-4 py-2`}
                  >
                    <span className={`font-medium ${colors.text}`}>
                      {b.tierName}
                    </span>
                    <span className="mx-2 text-content-muted">×</span>
                    <span className="text-content">{b.count}</span>
                    <span className="mx-2 text-content-muted">=</span>
                    <span className={colors.text}>
                      {formatNumber(b.subtotal)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Warnings */}
      {hasUnmatched && (
        <WarningSection
          title="Unmatched Items"
          items={result.unmatchedItems!}
          color="yellow"
          footer="These items could not be found in the database."
        />
      )}

      {hasUnshippable && (
        <WarningSection
          title="Cannot Ship"
          items={plan.unshippableItems.map((item) => {
            const reason =
              item.reason === 'volume_exceeds_capacity'
                ? `${formatVolume(item.totalVolume, { suffix: true })} exceeds 360k m³ limit`
                : `${formatNumber(item.totalValue)} exceeds 10B collateral limit`
            return `${item.itemName} × ${item.quantity.toLocaleString()} (${reason})`
          })}
          color="red"
          footer="These items exceed service limits and cannot be shipped."
        />
      )}

      {hasManualCollateral && (
        <WarningSection
          title="Manual Collateral Required"
          items={result.manualCollateralItems!.map(
            (item) =>
              `${item.itemName} × ${item.quantity.toLocaleString()} - ${item.reason}`
          )}
          color="amber"
          footer="Add these items to your contract manually with appropriate collateral."
        />
      )}

      {/* Packages */}
      {plan.packages.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-secondary/50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-content">
              Packages ({plan.packages.length})
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setExpandedPackages(
                    new Set(plan.packages.map((p) => p.packageNumber))
                  )
                }
                className="rounded px-3 py-1 text-xs text-content-secondary hover:bg-surface-tertiary hover:text-content"
              >
                Expand All
              </button>
              <button
                onClick={() => setExpandedPackages(new Set())}
                className="rounded px-3 py-1 text-xs text-content-secondary hover:bg-surface-tertiary hover:text-content"
              >
                Collapse All
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {plan.packages.map((pkg) => {
              const colors = getTierColors(pkg.tier.name)
              const isExpanded = expandedPackages.has(pkg.packageNumber)
              const ref = packageRefs.get(pkg.packageNumber) ?? ''

              return (
                <div
                  key={pkg.packageNumber}
                  className={`rounded-lg border ${colors.border} ${colors.bg}`}
                >
                  <button
                    onClick={() => togglePackage(pkg.packageNumber)}
                    className="flex w-full items-center justify-between p-4 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`rounded-lg border ${colors.border} px-3 py-1`}
                      >
                        <span className={`text-sm font-bold ${colors.text}`}>
                          #{pkg.packageNumber}
                        </span>
                      </div>
                      <div>
                        <span className={`font-medium ${colors.text}`}>
                          {pkg.tier.name}
                        </span>
                        <span className="ml-2 text-content-muted">·</span>
                        <span className="ml-2 text-content-secondary">
                          {pkg.items.length} item(s)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs text-content-secondary">
                          Volume
                        </div>
                        <div className="text-sm text-content">
                          {formatVolume(pkg.totalVolume, { suffix: true })}
                          <span className="ml-1 text-xs text-content-muted">
                            ({pkg.volumeUtilization.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 text-content-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 px-4 py-2 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-content-muted">Ref:</span>
                      <CopyButton
                        text={ref}
                        className="text-accent"
                        showValue
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-content-muted">Corp:</span>
                      <CopyButton
                        text={corporation}
                        className="text-status-info"
                        showValue
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-content-muted">Collateral:</span>
                      <CopyButton
                        text={formatFullNumber(pkg.totalValue)}
                        className="text-status-info"
                        showValue
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-content-muted">Reward:</span>
                      <CopyButton
                        text={formatFullNumber(pkg.cost)}
                        className="text-status-highlight"
                        showValue
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-content-muted">Expiry:</span>
                      <span className="font-mono text-content-secondary">
                        {pkg.tier.expiration}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-content-muted">Delivery:</span>
                      <span className="font-mono text-content-secondary">
                        {pkg.tier.delivery}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/50 p-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase text-content-muted">
                            <th scope="col" className="pb-2">
                              Item
                            </th>
                            <th scope="col" className="pb-2 text-right">
                              Qty
                            </th>
                            <th scope="col" className="pb-2 text-right">
                              Volume
                            </th>
                            <th scope="col" className="pb-2 text-right">
                              Value
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {pkg.items.map((item, idx) => (
                            <tr
                              key={`${item.typeId}-${idx}`}
                              className="border-t border-border/30"
                            >
                              <td className="py-2">
                                <div className="flex items-center gap-2">
                                  <img
                                    src={`https://images.evetech.net/types/${item.typeId}/icon?size=32`}
                                    alt=""
                                    width={24}
                                    height={24}
                                    className="rounded"
                                  />
                                  <span className="text-content">
                                    {item.itemName}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 text-right font-mono text-content-secondary">
                                {item.quantity.toLocaleString()}
                              </td>
                              <td className="py-2 text-right font-mono text-content-muted">
                                {formatVolume(item.totalVolume, {
                                  suffix: true,
                                })}
                              </td>
                              <td className="py-2 text-right font-mono text-status-info">
                                {formatNumber(item.totalValue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function WarningSection({
  title,
  items,
  color,
  footer,
}: {
  title: string
  items: string[]
  color: 'yellow' | 'red' | 'amber'
  footer: string
}) {
  const [expanded, setExpanded] = useState(items.length === 1)

  const colorClasses = {
    yellow: {
      border: 'border-semantic-warning/50',
      bg: 'bg-semantic-warning/10',
      text: 'text-status-highlight',
    },
    red: {
      border: 'border-semantic-danger/50',
      bg: 'bg-semantic-danger/10',
      text: 'text-status-negative',
    },
    amber: {
      border: 'border-category-amber/50',
      bg: 'bg-category-amber/10',
      text: 'text-category-amber',
    },
  }
  const colors = colorClasses[color]

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} p-4`}>
      <button
        onClick={() => items.length > 1 && setExpanded(!expanded)}
        className={`flex w-full items-center justify-between ${items.length > 1 ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <h3 className={`font-medium ${colors.text}`}>
          {title} ({items.length})
        </h3>
        {items.length > 1 && (
          <ChevronDown
            className={`h-5 w-5 ${colors.text} transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        )}
      </button>
      {(items.length === 1 || expanded) && (
        <>
          <ul className="mt-2 list-inside list-disc text-sm text-content-secondary">
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-content-muted">{footer}</p>
        </>
      )}
    </div>
  )
}
