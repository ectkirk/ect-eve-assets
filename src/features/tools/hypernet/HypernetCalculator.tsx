import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getTypeIconUrl } from '@/components/ui/type-icon'
import {
  formatNumber,
  formatFullNumber,
  parseLocalizedNumber,
} from '@/lib/utils'

const HYPERCORE_RATE = 0.0000001063187
const MIN_HYPERCORES = 1
const MAX_HYPERCORES = 1_063_187
const MIN_TOTAL_PRICE = 1_000
const MAX_TOTAL_PRICE = 10_000_000_000_000
const RELAY_FEE_RATE = 0.05
const SUGGESTED_PRICE_MULTIPLIER = 1.399
const HYPERNODE_OPTIONS = [8, 16, 48, 512] as const

interface HypernetCalculatorProps {
  typeId: number
  typeName: string
  categoryId: number
  averagePrice: number
  hypercorePrice: number
}

function calculateHypercores(totalPrice: number): number {
  if (totalPrice < MIN_TOTAL_PRICE) return MIN_HYPERCORES
  const cores = Math.floor(totalPrice * HYPERCORE_RATE)
  return Math.min(MAX_HYPERCORES, Math.max(MIN_HYPERCORES, cores))
}

export function HypernetCalculator({
  typeId,
  typeName,
  categoryId,
  averagePrice,
  hypercorePrice,
}: HypernetCalculatorProps) {
  const { t } = useTranslation('tools')
  const [totalPriceRaw, setTotalPriceRaw] = useState(
    Math.round(averagePrice * SUGGESTED_PRICE_MULTIPLIER)
  )
  const [hypernodeCount, setHypernodeCount] =
    useState<(typeof HYPERNODE_OPTIONS)[number]>(48)
  const [nodesPurchased, setNodesPurchased] = useState(0)

  const iconUrl = getTypeIconUrl(typeId, { categoryId, imageSize: 64 })

  const totalPrice = useMemo(() => {
    if (totalPriceRaw < MIN_TOTAL_PRICE) return MIN_TOTAL_PRICE
    if (totalPriceRaw > MAX_TOTAL_PRICE) return MAX_TOTAL_PRICE
    return totalPriceRaw
  }, [totalPriceRaw])

  const calculations = useMemo(() => {
    const hypercores = calculateHypercores(totalPrice)
    const hypernodePrice = totalPrice / hypernodeCount
    const relayFee = totalPrice * RELAY_FEE_RATE
    const hypercoreCost = hypercores * hypercorePrice
    const nodesPurchasedCost = nodesPurchased * hypernodePrice
    const payout = totalPrice - relayFee - hypercoreCost - nodesPurchasedCost

    return {
      hypercores,
      hypernodePrice,
      relayFee,
      hypercoreCost,
      nodesPurchasedCost,
      payout,
    }
  }, [totalPrice, hypernodeCount, hypercorePrice, nodesPurchased])

  const handlePriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseLocalizedNumber(e.target.value)
      if (!isNaN(parsed)) {
        setTotalPriceRaw(Math.round(parsed))
      } else if (e.target.value === '') {
        setTotalPriceRaw(0)
      }
    },
    []
  )

  const handleNodesPurchasedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10)
      if (!isNaN(parsed)) {
        setNodesPurchased(Math.min(parsed, hypernodeCount))
      } else if (e.target.value === '') {
        setNodesPurchased(0)
      }
    },
    [hypernodeCount]
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col items-center border-b border-border p-6">
        <div className="mb-3 rounded border-2 border-border bg-black p-1">
          {iconUrl && (
            <img src={iconUrl} alt="" className="h-16 w-16 object-contain" />
          )}
        </div>
        <h3 className="text-lg font-semibold text-content">{typeName}</h3>
        <p className="mt-1 text-sm text-content-secondary">
          {t('hypernet.estimatedValue', {
            value: formatNumber(Math.round(averagePrice)),
          })}
        </p>
        <p className="mt-1 text-sm text-status-success">
          {t('hypernet.greenPrice', {
            value: formatFullNumber(
              Math.round(averagePrice * SUGGESTED_PRICE_MULTIPLIER)
            ),
          })}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex gap-6">
          <div className="flex-1 space-y-4">
            <div>
              <label className="mb-1 block text-xs text-content-muted">
                {t('hypernet.totalPrice')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={formatFullNumber(totalPriceRaw)}
                  onChange={handlePriceChange}
                  className="w-full rounded border border-border bg-surface-tertiary px-3 py-2 text-right font-mono text-sm text-content focus:border-accent focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-content-muted">
                {t('hypernet.hypernodes')}
              </label>
              <select
                value={hypernodeCount}
                onChange={(e) =>
                  setHypernodeCount(
                    Number(e.target.value) as (typeof HYPERNODE_OPTIONS)[number]
                  )
                }
                className="w-full rounded border border-border bg-surface-tertiary px-3 py-2 text-sm text-content focus:border-accent focus:outline-hidden"
              >
                {HYPERNODE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-content-muted">
                {t('hypernet.nodesPurchased')}
              </label>
              <input
                type="text"
                value={nodesPurchased}
                onChange={handleNodesPurchasedChange}
                className="w-full rounded border border-border bg-surface-tertiary px-3 py-2 text-right font-mono text-sm text-content focus:border-accent focus:outline-hidden"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-content-muted">
                {t('hypernet.hypercoresRequired')}
              </label>
              <div className="px-3 py-2 font-mono text-sm text-content">
                {formatFullNumber(calculations.hypercores)}
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-3">
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-xs text-content-muted">
                {t('hypernet.hypernodes')}
              </span>
              <span className="font-mono text-sm text-content">
                {hypernodeCount}
              </span>
            </div>

            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-xs text-content-muted">
                {t('hypernet.hypernodePrice')}
              </span>
              <span className="font-mono text-sm text-content">
                {formatFullNumber(Math.round(calculations.hypernodePrice))}
              </span>
            </div>

            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-xs text-content-muted">
                {t('hypernet.totalPrice')}
              </span>
              <span className="font-mono text-sm text-content">
                {formatFullNumber(Math.round(totalPrice))}
              </span>
            </div>

            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-xs text-content-muted">
                {t('hypernet.relayFee')}
              </span>
              <span className="font-mono text-sm text-status-error">
                -{formatFullNumber(Math.round(calculations.relayFee))}
              </span>
            </div>

            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-xs text-content-muted">
                {t('hypernet.hypercoreCost')}
              </span>
              <span className="font-mono text-sm">
                <span className="text-status-error">
                  -{formatFullNumber(Math.round(calculations.hypercoreCost))}
                </span>
                <span className="ml-2 text-content-secondary">
                  @ {formatFullNumber(Math.round(hypercorePrice))}
                </span>
              </span>
            </div>

            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-xs text-content-muted">
                {t('hypernet.nodesPurchased')}
              </span>
              <span className="font-mono text-sm">
                <span className="text-status-error">
                  -
                  {formatFullNumber(
                    Math.round(calculations.nodesPurchasedCost)
                  )}
                </span>
                <span className="ml-2 text-content-secondary">
                  @ {formatFullNumber(Math.round(calculations.hypernodePrice))}
                </span>
              </span>
            </div>

            <div className="flex justify-between pt-1">
              <span className="text-sm font-medium text-content">
                {t('hypernet.payout')}
              </span>
              <span className="font-mono text-sm font-medium text-status-success">
                {formatFullNumber(Math.round(calculations.payout))}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <img src="/degen.png" alt="" className="w-full max-w-[800px]" />
        </div>
      </div>
    </div>
  )
}
