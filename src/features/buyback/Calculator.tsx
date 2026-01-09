import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatNumber, formatVolume, formatFullNumber } from '@/lib/utils'
import type { SortDirection } from '@/hooks'

type SortField =
  | 'itemName'
  | 'quantity'
  | 'totalVolume'
  | 'groupName'
  | 'totalJitaBuy'
  | 'totalJitaSell'

interface CalculatorProps {
  result: BuybackCalculatorResult
}

function getItemImageUrl(typeId: number, itemName: string): string {
  const isBPC = itemName.includes('(Copy)')
  const isBP = itemName.toLowerCase().includes('blueprint') && !isBPC
  const variation = isBPC ? 'bpc' : isBP ? 'bp' : 'icon'
  return `https://images.evetech.net/types/${typeId}/${variation}?size=32`
}

function SortIcon({
  field,
  sortField,
  sortDirection,
}: {
  field: SortField
  sortField: SortField
  sortDirection: SortDirection
}) {
  if (sortField !== field) {
    return <span className="ml-1 text-content-muted">↕</span>
  }
  return (
    <span className="ml-1 text-status-info">
      {sortDirection === 'asc' ? '↑' : '↓'}
    </span>
  )
}

export function Calculator({ result }: CalculatorProps) {
  const { t } = useTranslation('tools')
  const { t: tc } = useTranslation('common')
  const [sortField, setSortField] = useState<SortField>('totalJitaSell')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sortedItems = useMemo(() => {
    return [...result.items].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }
      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })
  }, [result.items, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-surface-secondary/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-content">
          {t('calculator.overview')}
        </h2>

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-surface-tertiary/50 p-4">
            <div className="text-xs text-content-secondary">
              {t('calculator.totalVolume')}
            </div>
            <div className="text-lg font-semibold text-content">
              {formatVolume(result.totals.totalVolume)}
            </div>
          </div>
          <div className="rounded-lg bg-surface-tertiary/50 p-4">
            <div className="text-xs text-content-secondary">
              {t('calculator.jitaBuy')}
            </div>
            <div className="text-lg font-semibold text-status-info">
              {formatNumber(result.totals.totalJitaBuy)}
            </div>
            <div className="text-xs text-content-muted">
              {formatFullNumber(result.totals.totalJitaBuy)}
            </div>
          </div>
          <div className="rounded-lg bg-surface-tertiary/50 p-4">
            <div className="text-xs text-content-secondary">
              {t('calculator.jitaSell')}
            </div>
            <div className="text-lg font-semibold text-status-positive">
              {formatNumber(result.totals.totalJitaSell)}
            </div>
            <div className="text-xs text-content-muted">
              {formatFullNumber(result.totals.totalJitaSell)}
            </div>
          </div>
          <div className="rounded-lg bg-surface-tertiary/50 p-4">
            <div className="text-xs text-content-secondary">
              {t('calculator.items')}
            </div>
            <div className="text-lg font-semibold text-content">
              {result.totals.itemCount}
            </div>
          </div>
        </div>
      </div>

      {result.unmatchedItems.length > 0 && (
        <div className="rounded-lg border border-semantic-danger/50 bg-semantic-danger/20 p-4">
          <h3 className="mb-2 font-medium text-status-negative">
            {t('calculator.unmatchedItems', {
              count: result.unmatchedItems.length,
            })}
          </h3>
          <p className="mb-2 text-sm text-content-secondary">
            {t('calculator.unmatchedItemsDescription')}
          </p>
          <ul className="list-inside list-disc text-sm text-status-negative/80">
            {result.unmatchedItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {result.lowVolumeItems?.length > 0 && (
        <div className="rounded-lg border border-semantic-warning/50 bg-semantic-warning/20 p-4">
          <h3 className="mb-2 font-medium text-status-highlight">
            {t('calculator.lowVolumeItems', {
              count: result.lowVolumeItems.length,
            })}
          </h3>
          <p className="mb-2 text-sm text-content-secondary">
            {t('calculator.lowVolumeItemsDescription')}
          </p>
          <ul className="list-inside list-disc text-sm text-status-highlight/80">
            {result.lowVolumeItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface-secondary/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content">
            {t('calculator.itemsCount', { count: result.items.length })}
          </h2>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-row-warning"></span>
              <span className="text-content-secondary">
                {t('calculator.lowSalesVolume')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-row-danger"></span>
              <span className="text-content-secondary">
                {t('calculator.noMarketData')}
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-content-secondary">
                <th
                  scope="col"
                  className="cursor-pointer pb-3 pr-4 hover:text-content"
                  onClick={() => handleSort('itemName')}
                >
                  {tc('columns.item')}
                  <SortIcon
                    field="itemName"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </th>
                <th
                  scope="col"
                  className="cursor-pointer pb-3 pr-4 text-right hover:text-content"
                  onClick={() => handleSort('quantity')}
                >
                  {tc('columns.qty')}
                  <SortIcon
                    field="quantity"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </th>
                <th
                  scope="col"
                  className="cursor-pointer pb-3 pr-4 text-right hover:text-content"
                  onClick={() => handleSort('totalVolume')}
                >
                  m³
                  <SortIcon
                    field="totalVolume"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </th>
                <th
                  scope="col"
                  className="cursor-pointer pb-3 pr-4 hover:text-content"
                  onClick={() => handleSort('groupName')}
                >
                  {tc('columns.group')}
                  <SortIcon
                    field="groupName"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </th>
                <th
                  scope="col"
                  className="cursor-pointer pb-3 pr-4 text-right hover:text-content"
                  onClick={() => handleSort('totalJitaBuy')}
                >
                  {t('calculator.jitaBuy')}
                  <SortIcon
                    field="totalJitaBuy"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </th>
                <th
                  scope="col"
                  className="cursor-pointer pb-3 text-right hover:text-content"
                  onClick={() => handleSort('totalJitaSell')}
                >
                  {t('calculator.jitaSell')}
                  <SortIcon
                    field="totalJitaSell"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, idx) => (
                <ItemRow key={`${item.typeId}-${idx}`} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ItemRow({ item }: { item: BuybackCalculatorItem }) {
  const { t } = useTranslation('tools')
  const rowClass =
    item.priceStatus === 'no_price'
      ? 'bg-row-danger'
      : item.priceStatus === 'no_average'
        ? 'bg-row-warning'
        : ''

  return (
    <tr
      className={`border-b border-border/50 hover:bg-surface-tertiary/30 ${rowClass}`}
    >
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <img
            src={getItemImageUrl(item.typeId, item.itemName)}
            alt=""
            width={32}
            height={32}
            className="rounded"
          />
          <div>
            <div className="flex items-center gap-2">
              <a
                href={`https://edencom.net/ref/items/${item.typeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link hover:underline"
              >
                {item.itemName}
              </a>
              {item.capitalSellPricing && (
                <span className="rounded bg-status-time/20 px-1.5 py-0.5 text-xs text-status-time">
                  {t('calculator.salesInfo', {
                    period: item.capitalSellPricing.period,
                    count: item.capitalSellPricing.saleCount,
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-right font-mono text-content-secondary">
        {formatFullNumber(item.quantity)}
      </td>
      <td className="py-3 pr-4 text-right font-mono text-content-secondary">
        {formatVolume(item.totalVolume)}
      </td>
      <td className="py-3 pr-4 text-content-secondary">{item.groupName}</td>
      <td className="py-3 pr-4 text-right">
        <div className="font-mono text-status-info">
          {formatFullNumber(item.totalJitaBuy)}
        </div>
        <div className="text-xs text-content-muted">
          @{formatFullNumber(item.jitaBuyPrice)}/u
        </div>
      </td>
      <td className="py-3 text-right">
        <div className="font-mono text-status-positive">
          {formatFullNumber(item.totalJitaSell)}
        </div>
        <div className="text-xs text-content-muted">
          @{formatFullNumber(item.jitaSellPrice)}/u
        </div>
      </td>
    </tr>
  )
}
