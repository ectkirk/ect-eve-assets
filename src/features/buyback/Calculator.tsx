import { useState, useMemo } from 'react'
import { formatNumber } from '@/lib/utils'

type SortField =
  | 'itemName'
  | 'quantity'
  | 'totalVolume'
  | 'groupName'
  | 'totalJitaBuy'
  | 'totalJitaSell'
type SortDirection = 'asc' | 'desc'

interface CalculatorProps {
  result: BuybackCalculatorResult
}

function formatISKFull(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function formatVolume(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
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
        <h2 className="mb-4 text-lg font-semibold text-content">Overview</h2>

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-surface-tertiary/50 p-4">
            <div className="text-xs text-content-secondary">Total m³</div>
            <div className="text-lg font-semibold text-content">
              {formatVolume(result.totals.totalVolume)}
            </div>
          </div>
          <div className="rounded-lg bg-surface-tertiary/50 p-4">
            <div className="text-xs text-content-secondary">Jita Buy</div>
            <div className="text-lg font-semibold text-status-info">
              {formatNumber(result.totals.totalJitaBuy)}
            </div>
            <div className="text-xs text-content-muted">
              {formatISKFull(result.totals.totalJitaBuy)} ISK
            </div>
          </div>
          <div className="rounded-lg bg-surface-tertiary/50 p-4">
            <div className="text-xs text-content-secondary">Jita Sell</div>
            <div className="text-lg font-semibold text-status-positive">
              {formatNumber(result.totals.totalJitaSell)}
            </div>
            <div className="text-xs text-content-muted">
              {formatISKFull(result.totals.totalJitaSell)} ISK
            </div>
          </div>
          <div className="rounded-lg bg-surface-tertiary/50 p-4">
            <div className="text-xs text-content-secondary">Items</div>
            <div className="text-lg font-semibold text-content">
              {result.totals.itemCount}
            </div>
          </div>
        </div>
      </div>

      {result.unmatchedItems.length > 0 && (
        <div className="rounded-lg border border-semantic-danger/50 bg-semantic-danger/20 p-4">
          <h3 className="mb-2 font-medium text-status-negative">
            Unmatched Items ({result.unmatchedItems.length})
          </h3>
          <p className="mb-2 text-sm text-content-secondary">
            These items could not be found in the database:
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
            Low Volume Items ({result.lowVolumeItems.length})
          </h3>
          <p className="mb-2 text-sm text-content-secondary">
            These items have market orders but unreliable price history:
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
            Items ({result.items.length})
          </h2>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-row-warning"></span>
              <span className="text-content-secondary">Low sales volume</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-row-danger"></span>
              <span className="text-content-secondary">No market data</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-content-secondary">
                <th
                  className="cursor-pointer pb-3 pr-4 hover:text-content"
                  onClick={() => handleSort('itemName')}
                >
                  Item
                  <SortIcon
                    field="itemName"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </th>
                <th
                  className="cursor-pointer pb-3 pr-4 text-right hover:text-content"
                  onClick={() => handleSort('quantity')}
                >
                  Qty
                  <SortIcon
                    field="quantity"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </th>
                <th
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
                  className="cursor-pointer pb-3 pr-4 hover:text-content"
                  onClick={() => handleSort('groupName')}
                >
                  Group
                  <SortIcon
                    field="groupName"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </th>
                <th
                  className="cursor-pointer pb-3 pr-4 text-right hover:text-content"
                  onClick={() => handleSort('totalJitaBuy')}
                >
                  Jita Buy
                  <SortIcon
                    field="totalJitaBuy"
                    sortField={sortField}
                    sortDirection={sortDirection}
                  />
                </th>
                <th
                  className="cursor-pointer pb-3 text-right hover:text-content"
                  onClick={() => handleSort('totalJitaSell')}
                >
                  Jita Sell
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
                  {item.capitalSellPricing.period} ·{' '}
                  {item.capitalSellPricing.saleCount} sales
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-right font-mono text-content-secondary">
        {item.quantity.toLocaleString()}
      </td>
      <td className="py-3 pr-4 text-right font-mono text-content-secondary">
        {formatVolume(item.totalVolume)}
      </td>
      <td className="py-3 pr-4 text-content-secondary">{item.groupName}</td>
      <td className="py-3 pr-4 text-right">
        <div className="font-mono text-status-info">
          {formatISKFull(item.totalJitaBuy)}
        </div>
        <div className="text-xs text-content-muted">
          @{formatISKFull(item.jitaBuyPrice)}/u
        </div>
      </td>
      <td className="py-3 text-right">
        <div className="font-mono text-status-positive">
          {formatISKFull(item.totalJitaSell)}
        </div>
        <div className="text-xs text-content-muted">
          @{formatISKFull(item.jitaSellPrice)}/u
        </div>
      </td>
    </tr>
  )
}
