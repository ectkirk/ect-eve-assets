import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { hasAbyssal } from '@/store/reference-cache'
import { TypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { AbyssalPreview } from '@/components/ui/abyssal-preview'
import { formatNumber, cn } from '@/lib/utils'
import type { AssetRow } from './types'
import { formatVolume } from './types'

export const columns: ColumnDef<AssetRow>[] = [
  {
    accessorKey: 'ownerName',
    size: 40,
    meta: { noFlex: true },
    header: () => <span className="sr-only">Owner</span>,
    cell: ({ row }) => {
      const ownerId = row.original.ownerId
      const name = row.getValue('ownerName') as string
      const ownerType = row.original.ownerType
      return (
        <span title={name}>
          <OwnerIcon ownerId={ownerId} ownerType={ownerType} size="lg" />
        </span>
      )
    },
  },
  {
    accessorKey: 'typeName',
    size: 450,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Name
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => {
      const typeId = row.original.typeId
      const typeName = row.getValue('typeName') as string
      const isBpc = row.original.isBlueprintCopy
      const categoryId = row.original.categoryId
      const modeFlags = row.original.modeFlags
      const isAbyssalResolved =
        row.original.isAbyssal && hasAbyssal(row.original.itemId)
      const nameSpan = (
        <span className={cn('truncate', isBpc && 'text-status-special')}>
          {typeName}
        </span>
      )

      return (
        <div className="flex flex-nowrap items-center gap-2 min-w-0">
          <TypeIcon
            typeId={typeId}
            categoryId={categoryId}
            isBlueprintCopy={isBpc}
            size="lg"
          />
          {isAbyssalResolved ? (
            <AbyssalPreview itemId={row.original.itemId}>
              {nameSpan}
            </AbyssalPreview>
          ) : (
            nameSpan
          )}
          {(modeFlags.isContract ||
            modeFlags.isMarketOrder ||
            modeFlags.isIndustryJob ||
            modeFlags.isOwnedStructure ||
            modeFlags.isActiveShip) && (
            <span className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap">
              {modeFlags.isActiveShip && (
                <span className="text-xs text-status-time bg-status-time/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                  Active Ship
                </span>
              )}
              {modeFlags.isContract && (
                <span className="text-xs text-status-corp bg-semantic-warning/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                  In Contract
                </span>
              )}
              {modeFlags.isMarketOrder && (
                <span className="text-xs text-status-info bg-accent/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                  Sell Order
                </span>
              )}
              {modeFlags.isIndustryJob && (
                <span className="text-xs text-status-positive bg-status-positive/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                  In Job
                </span>
              )}
              {modeFlags.isOwnedStructure && (
                <span className="text-xs text-status-special bg-status-special/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                  Structure
                </span>
              )}
            </span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'quantity',
    size: 140,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Quantity
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-right w-full">
        {(row.getValue('quantity') as number).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: 'price',
    size: 130,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Price
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => {
      const price = row.getValue('price') as number
      return (
        <span className="tabular-nums text-right w-full">
          {price > 0 ? formatNumber(price) + ' ISK' : '-'}
        </span>
      )
    },
  },
  {
    accessorKey: 'totalValue',
    size: 130,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Value
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => {
      const value = row.getValue('totalValue') as number
      return (
        <span className="tabular-nums text-right w-full text-status-positive">
          {value > 0 ? formatNumber(value) + ' ISK' : '-'}
        </span>
      )
    },
  },
  {
    accessorKey: 'totalVolume',
    size: 130,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Volume
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-right w-full text-content-secondary">
        {formatVolume(row.getValue('totalVolume') as number)}
      </span>
    ),
  },
  {
    accessorKey: 'locationName',
    size: 450,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Location
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-right w-full">
        {row.getValue('locationName') as string}
      </span>
    ),
  },
  {
    accessorKey: 'locationFlag',
    size: 140,
    meta: { noFlex: true },
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Flag
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <div className="w-full text-right">
        <span className="text-content-secondary text-xs">
          {row.getValue('locationFlag') as string}
        </span>
      </div>
    ),
  },
]
