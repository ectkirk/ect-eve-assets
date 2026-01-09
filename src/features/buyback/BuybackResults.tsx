import { useState, useMemo } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { formatFullNumber, formatVolume } from '@/lib/utils'
import type { RuntimeSecurityConfig } from './config'

function generateRef(): string {
  const num = Math.floor(Math.random() * 900000) + 100000
  return `EEA-${num}`
}

interface BuybackResultsProps {
  result: BuybackResult
  config: RuntimeSecurityConfig
}

function CopyButton({
  text,
  label,
  t,
}: {
  text: string
  label: string
  t: (key: string) => string
}) {
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
      title={t('buyback.clickToCopy')}
    >
      {text}
      {copied ? (
        <svg
          className="h-3.5 w-3.5 text-status-positive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  )
}

function getItemImageUrl(
  typeId: number | null,
  itemName: string
): string | null {
  if (!typeId) return null
  const isBPC = itemName.includes('(Copy)')
  const isBP = itemName.toLowerCase().includes('blueprint') && !isBPC
  const variation = isBPC ? 'bpc' : isBP ? 'bp' : 'icon'
  return `https://images.evetech.net/types/${typeId}/${variation}?size=32`
}

export function BuybackResults({ result, config }: BuybackResultsProps) {
  const { t } = useTranslation('tools')
  const { t: tc } = useTranslation('common')
  const { items, totals } = result
  const [showExcluded, setShowExcluded] = useState(totals.buybackValue === 0)
  const quoteRef = useMemo(() => generateRef(), [])

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
  const displayItems = items.filter(
    (item) => !excludedFromList.has(item.itemName)
  )

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
          <div className="text-lg font-medium text-status-negative">
            {t('buyback.noValidItems')}
          </div>
          <div className="mt-1 text-sm text-status-negative/80">
            {t('buyback.noValidItemsDescription')}
          </div>
        </div>
      )}

      {totals.buybackValue > 0 && (
        <div className="rounded-lg border border-semantic-success/30 bg-semantic-success/10 p-6">
          <div className="mb-4 text-center">
            <div className="text-3xl font-bold text-status-positive">
              {formatFullNumber(totals.buybackValue)}
            </div>
            <div className="text-sm text-status-positive/80">
              {t('buyback.totalBuybackValue')}
            </div>
          </div>
          <div className="rounded-lg border border-semantic-success/20 bg-surface-secondary/50 p-4">
            <div className="text-sm text-content-secondary">
              <p>
                <Trans
                  i18nKey="buyback.sendContract"
                  t={t}
                  values={{
                    corp: 'ECTrade',
                    value: formatFullNumber(totals.buybackValue),
                  }}
                  components={{
                    bold: <span className="font-semibold text-content" />,
                    corp: <CopyButton text="ECTrade" label="corp" t={t} />,
                    value: (
                      <CopyButton
                        text={formatFullNumber(totals.buybackValue)}
                        label="value"
                        t={t}
                      />
                    ),
                  }}
                />
              </p>
              <p className="mt-1 text-content-secondary">
                <Trans
                  i18nKey="buyback.setReason"
                  t={t}
                  values={{ ref: quoteRef }}
                  components={{
                    ref: <CopyButton text={quoteRef} label="ref" t={t} />,
                  }}
                />
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
              <svg
                className="h-5 w-5 shrink-0 text-semantic-warning"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="text-status-highlight/80">
                {t('buyback.excludedItemsWarning')}{' '}
                <span className="text-status-highlight underline">
                  {t('buyback.clickForInfo')}
                </span>
              </span>
            </span>
            <svg
              className={`h-5 w-5 shrink-0 text-semantic-warning transition-transform ${showExcluded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showExcluded && (
            <div className="space-y-4 border-t border-semantic-warning/30 p-4">
              <div className="text-sm text-content-secondary">
                {t('buyback.excludedItemsDescription')}
              </div>

              {result.excludedItems.length > 0 && (
                <ExcludedSection
                  title={t('buyback.excludedApparel')}
                  items={result.excludedItems}
                  color="orange"
                  description={t('buyback.excludedApparelDescription')}
                  footer={t('buyback.excludedApparelFooter')}
                />
              )}

              {result.unmatchedItems.length > 0 && (
                <ExcludedSection
                  title={t('buyback.unmatchedItems')}
                  items={result.unmatchedItems}
                  color="red"
                  footer={t('buyback.unmatchedItemsFooter')}
                />
              )}

              {result.lowVolumeItems.length > 0 && (
                <ExcludedSection
                  title={t('buyback.lowVolumeItems')}
                  items={result.lowVolumeItems}
                  color="pink"
                  footer={t('buyback.lowVolumeItemsFooter')}
                />
              )}

              {result.unprofitableItems.length > 0 && (
                <ExcludedSection
                  title={t('buyback.unprofitableItems')}
                  items={result.unprofitableItems}
                  color="purple"
                  footer={t('buyback.unprofitableItemsFooter')}
                />
              )}

              {result.excludedCrystals.length > 0 && (
                <ExcludedSection
                  title={t('buyback.excludedCrystals')}
                  items={result.excludedCrystals}
                  color="gray"
                  footer={t('buyback.excludedCrystalsFooter')}
                />
              )}

              {result.excludedRigs.length > 0 && (
                <ExcludedSection
                  title={t('buyback.excludedRigs')}
                  items={result.excludedRigs}
                  color="blue"
                  footer={t('buyback.excludedRigsFooter')}
                />
              )}

              {result.excludedCapitals.length > 0 && (
                <ExcludedSection
                  title={t('buyback.excludedCapitals')}
                  items={result.excludedCapitals}
                  color="cyan"
                  footer={
                    config.name.toLowerCase().includes('high')
                      ? t('buyback.excludedCapitalsHighSec')
                      : t('buyback.excludedCapitalsGeneral')
                  }
                />
              )}

              {result.blueprintCopies.length > 0 && (
                <ExcludedSection
                  title={t('buyback.blueprintCopies')}
                  items={result.blueprintCopies}
                  color="indigo"
                  footer={t('buyback.blueprintCopiesFooter')}
                />
              )}

              {(result.unpricedCapitals?.length || 0) > 0 && (
                <ExcludedSection
                  title={t('buyback.unpricedCapitals')}
                  items={result.unpricedCapitals || []}
                  color="amber"
                  footer={t('buyback.unpricedCapitalsFooter')}
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface-secondary/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-content">
          {t('buyback.acceptedItemsSummary')}
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-content-secondary">{tc('columns.items')}</div>
            <div className="font-medium text-content">
              {t('buyback.itemsAccepted', { count: totals.profitableCount })}
            </div>
          </div>
          <div>
            <div className="text-content-secondary">
              {t('buyback.totalVolume')}
            </div>
            <div className="font-medium text-content">
              {formatVolume(totals.totalVolume, { suffix: true })}
            </div>
          </div>
          <div>
            <div className="text-content-secondary">{t('buyback.jitaBuy')}</div>
            <div className="font-medium text-content">
              {formatFullNumber(totals.jitaBuyTotal)}
            </div>
          </div>
          <div>
            <div className="text-content-secondary">
              {t('buyback.jitaSell')}
            </div>
            <div className="font-medium text-content">
              {formatFullNumber(totals.jitaSellTotal)}
            </div>
          </div>
          {totals.capitalValue > 0 && (
            <div>
              <div className="text-content-secondary">
                {t('buyback.capitalValue')}
              </div>
              <div className="font-medium text-content">
                {formatFullNumber(totals.capitalValue)}
              </div>
            </div>
          )}
          {totals.assetSafetyCost > 0 && (
            <div>
              <div className="text-content-secondary">
                {t('buyback.assetSafetyFee')}
              </div>
              <div className="font-medium text-status-warning">
                -{formatFullNumber(totals.assetSafetyCost)}
              </div>
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
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-content-secondary"
                  >
                    {tc('columns.item')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-medium text-content-secondary"
                  >
                    {tc('columns.qty')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {displayItems.map((item, index) => (
                  <tr
                    key={`${item.itemName}-${index}`}
                    className="text-content"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {item.typeId ? (
                          <img
                            src={
                              getItemImageUrl(item.typeId, item.itemName) || ''
                            }
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
                      {formatFullNumber(item.quantity)}
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
  color:
    | 'orange'
    | 'red'
    | 'pink'
    | 'purple'
    | 'gray'
    | 'blue'
    | 'cyan'
    | 'indigo'
    | 'amber'
  description?: string
  footer: string
}) {
  const colorClasses = {
    orange:
      'border-category-orange/30 bg-category-orange/10 text-category-orange',
    red: 'border-category-red/30 bg-category-red/10 text-category-red',
    pink: 'border-category-pink/30 bg-category-pink/10 text-category-pink',
    purple:
      'border-category-purple/30 bg-category-purple/10 text-category-purple',
    gray: 'border-border bg-surface-tertiary/50 text-content-secondary',
    blue: 'border-category-blue/30 bg-category-blue/10 text-category-blue',
    cyan: 'border-category-cyan/30 bg-category-cyan/10 text-category-cyan',
    indigo:
      'border-category-indigo/30 bg-category-indigo/10 text-category-indigo',
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
      {description && (
        <div className={`mb-2 text-sm ${textClasses[color]}`}>
          {description}
        </div>
      )}
      <div className={`mb-2 text-sm ${textClasses[color]}`}>
        {items.join(', ')}
      </div>
      <div className={`text-xs ${footerClasses[color]}`}>{footer}</div>
    </div>
  )
}
