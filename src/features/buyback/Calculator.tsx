import { useState, useMemo } from 'react'
import { formatNumber } from '@/lib/utils'
import { SECURITY_CONFIGS } from './config'

type SortField = 'itemName' | 'quantity' | 'totalVolume' | 'groupName' | 'totalJitaBuy' | 'totalJitaSell'
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

function SortIcon({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: SortDirection }) {
  if (sortField !== field) {
    return <span className="ml-1 text-slate-600">↕</span>
  }
  return <span className="ml-1 text-blue-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
}

export function Calculator({ result }: CalculatorProps) {
  const [sortField, setSortField] = useState<SortField>('totalJitaSell')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sortedItems = useMemo(() => {
    return [...result.items].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
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
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Overview</h2>

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-700/50 p-4">
            <div className="text-xs text-slate-400">Total m³</div>
            <div className="text-lg font-semibold text-white">
              {formatVolume(result.totals.totalVolume)}
            </div>
          </div>
          <div className="rounded-lg bg-slate-700/50 p-4">
            <div className="text-xs text-slate-400">Jita Buy</div>
            <div className="text-lg font-semibold text-blue-400">
              {formatNumber(result.totals.totalJitaBuy)}
            </div>
            <div className="text-xs text-slate-500">
              {formatISKFull(result.totals.totalJitaBuy)} ISK
            </div>
          </div>
          <div className="rounded-lg bg-slate-700/50 p-4">
            <div className="text-xs text-slate-400">Jita Sell</div>
            <div className="text-lg font-semibold text-green-400">
              {formatNumber(result.totals.totalJitaSell)}
            </div>
            <div className="text-xs text-slate-500">
              {formatISKFull(result.totals.totalJitaSell)} ISK
            </div>
          </div>
          <div className="rounded-lg bg-slate-700/50 p-4">
            <div className="text-xs text-slate-400">Items</div>
            <div className="text-lg font-semibold text-white">{result.totals.itemCount}</div>
          </div>
        </div>

        <h3 className="mb-3 text-sm font-medium text-slate-300">Buyback Values</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(SECURITY_CONFIGS).map(([key, cfg]) => {
            const value = result.buybackValues[key as keyof typeof result.buybackValues] ?? 0
            const volumePenalty = result.totals.totalVolume * cfg.iskPerM3
            return (
              <div
                key={key}
                className={`rounded-lg border ${cfg.borderColor} ${cfg.bgColor} p-4`}
              >
                <div className={`text-xs ${cfg.textColor}`}>
                  {cfg.name} ({Math.round(cfg.buyRate * 100)}%)
                </div>
                <div className={`text-lg font-semibold ${cfg.textColor}`}>
                  {formatNumber(value)}
                </div>
                <div className="text-xs text-slate-500">
                  m³: -{formatNumber(volumePenalty)}
                  {key === 'assetsafety' && result.totals.assetSafetyFee > 0 && (
                    <> · Fee: -{formatNumber(result.totals.assetSafetyFee)}</>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {result.unmatchedItems.length > 0 && (
        <div className="rounded-lg border border-yellow-600/50 bg-yellow-900/20 p-4">
          <h3 className="mb-2 font-medium text-yellow-400">
            Unmatched Items ({result.unmatchedItems.length})
          </h3>
          <p className="mb-2 text-sm text-slate-400">
            These items could not be found in the database:
          </p>
          <ul className="list-inside list-disc text-sm text-yellow-300">
            {result.unmatchedItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Items ({result.items.length})</h2>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-700/50"></span>
              <span className="text-slate-400">Low sales volume</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-red-900/50"></span>
              <span className="text-slate-400">No market data</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase text-slate-400">
                <th
                  className="cursor-pointer pb-3 pr-4 hover:text-slate-200"
                  onClick={() => handleSort('itemName')}
                >
                  Item
                  <SortIcon field="itemName" sortField={sortField} sortDirection={sortDirection} />
                </th>
                <th
                  className="cursor-pointer pb-3 pr-4 text-right hover:text-slate-200"
                  onClick={() => handleSort('quantity')}
                >
                  Qty
                  <SortIcon field="quantity" sortField={sortField} sortDirection={sortDirection} />
                </th>
                <th
                  className="cursor-pointer pb-3 pr-4 text-right hover:text-slate-200"
                  onClick={() => handleSort('totalVolume')}
                >
                  m³
                  <SortIcon field="totalVolume" sortField={sortField} sortDirection={sortDirection} />
                </th>
                <th
                  className="cursor-pointer pb-3 pr-4 hover:text-slate-200"
                  onClick={() => handleSort('groupName')}
                >
                  Group
                  <SortIcon field="groupName" sortField={sortField} sortDirection={sortDirection} />
                </th>
                <th
                  className="cursor-pointer pb-3 pr-4 text-right hover:text-slate-200"
                  onClick={() => handleSort('totalJitaBuy')}
                >
                  Jita Buy
                  <SortIcon field="totalJitaBuy" sortField={sortField} sortDirection={sortDirection} />
                </th>
                <th
                  className="cursor-pointer pb-3 text-right hover:text-slate-200"
                  onClick={() => handleSort('totalJitaSell')}
                >
                  Jita Sell
                  <SortIcon field="totalJitaSell" sortField={sortField} sortDirection={sortDirection} />
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
      ? 'bg-red-900/20'
      : item.priceStatus === 'no_average'
        ? 'bg-amber-700/20'
        : ''

  return (
    <tr className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${rowClass}`}>
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
                href={`https://ref.edencom.net/items/${item.typeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                {item.itemName}
              </a>
              {item.capitalSellPricing && (
                <span className="rounded bg-violet-900/50 px-1.5 py-0.5 text-xs text-violet-300">
                  {item.capitalSellPricing.period} · {item.capitalSellPricing.saleCount} sales
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-right font-mono text-slate-300">
        {item.quantity.toLocaleString()}
      </td>
      <td className="py-3 pr-4 text-right font-mono text-slate-400">
        {formatVolume(item.totalVolume)}
      </td>
      <td className="py-3 pr-4 text-slate-400">{item.groupName}</td>
      <td className="py-3 pr-4 text-right">
        <div className="font-mono text-blue-400">{formatISKFull(item.totalJitaBuy)}</div>
        <div className="text-xs text-slate-500">@{formatISKFull(item.jitaBuyPrice)}/u</div>
      </td>
      <td className="py-3 text-right">
        <div className="font-mono text-green-400">{formatISKFull(item.totalJitaSell)}</div>
        <div className="text-xs text-slate-500">@{formatISKFull(item.jitaSellPrice)}/u</div>
      </td>
    </tr>
  )
}
