import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { usePriceStore } from '@/store/price-store'
import { TypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { AbyssalPreview } from '@/components/ui/abyssal-preview'
import { SortButton } from '@/components/ui/sortable-header'
import { formatNumber, formatFullNumber, cn } from '@/lib/utils'
import type { AssetRow } from './types'
import { DISPLAY_FLAGS, formatVolume } from './types'

function OwnerHeader() {
  const { t } = useTranslation('common')
  return <span className="sr-only">{t('columns.owner')}</span>
}

const FLAG_TRANSLATION_KEYS: Record<string, string> = {
  [DISPLAY_FLAGS.IN_CONTRACT]: 'flags.inContract',
  [DISPLAY_FLAGS.SELL_ORDER]: 'flags.sellOrder',
  [DISPLAY_FLAGS.INDUSTRY_JOB]: 'flags.industryJob',
  [DISPLAY_FLAGS.ACTIVE_SHIP]: 'flags.activeShip',
}

function LocationFlagCell({ flag }: { flag: string }) {
  const { t } = useTranslation('assets')
  const key = FLAG_TRANSLATION_KEYS[flag]
  return (
    <div className="w-full text-right">
      <span className="text-content-secondary text-xs">
        {key ? t(key) : flag}
      </span>
    </div>
  )
}

function AssetBadges({ modeFlags }: { modeFlags: AssetRow['modeFlags'] }) {
  const { t } = useTranslation('assets')

  if (
    !modeFlags.isContract &&
    !modeFlags.isMarketOrder &&
    !modeFlags.isIndustryJob &&
    !modeFlags.isOwnedStructure &&
    !modeFlags.isActiveShip
  ) {
    return null
  }

  return (
    <span className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap">
      {modeFlags.isActiveShip && (
        <span className="text-xs text-status-time bg-status-time/20 px-1.5 py-0.5 rounded whitespace-nowrap">
          {t('badges.activeShip')}
        </span>
      )}
      {modeFlags.isContract && (
        <span className="text-xs text-status-corp bg-semantic-warning/20 px-1.5 py-0.5 rounded whitespace-nowrap">
          {t('badges.inContract')}
        </span>
      )}
      {modeFlags.isMarketOrder && (
        <span className="text-xs text-status-info bg-accent/20 px-1.5 py-0.5 rounded whitespace-nowrap">
          {t('badges.sellOrder')}
        </span>
      )}
      {modeFlags.isIndustryJob && (
        <span className="text-xs text-status-positive bg-status-positive/20 px-1.5 py-0.5 rounded whitespace-nowrap">
          {t('badges.inJob')}
        </span>
      )}
      {modeFlags.isOwnedStructure && (
        <span className="text-xs text-status-special bg-status-special/20 px-1.5 py-0.5 rounded whitespace-nowrap">
          {t('badges.structure')}
        </span>
      )}
    </span>
  )
}

export const columns: ColumnDef<AssetRow>[] = [
  {
    accessorKey: 'ownerName',
    size: 40,
    meta: { noFlex: true },
    header: () => <OwnerHeader />,
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
      <SortButton
        label="columns.name"
        isActive={!!column.getIsSorted()}
        sortDirection={column.getIsSorted() || 'asc'}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      />
    ),
    cell: ({ row }) => {
      const typeId = row.original.typeId
      const typeName = row.getValue('typeName') as string
      const isBpc = row.original.isBlueprintCopy
      const categoryId = row.original.categoryId
      const modeFlags = row.original.modeFlags
      const isAbyssalResolved =
        row.original.isAbyssal &&
        usePriceStore.getState().hasAbyssalPrice(row.original.itemId)
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
          <AssetBadges modeFlags={modeFlags} />
        </div>
      )
    },
  },
  {
    accessorKey: 'quantity',
    size: 140,
    header: ({ column }) => (
      <SortButton
        label="columns.quantity"
        isActive={!!column.getIsSorted()}
        sortDirection={column.getIsSorted() || 'asc'}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        align="right"
      />
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-right w-full">
        {formatFullNumber(row.getValue('quantity') as number)}
      </span>
    ),
  },
  {
    accessorKey: 'price',
    size: 130,
    header: ({ column }) => (
      <SortButton
        label="columns.price"
        isActive={!!column.getIsSorted()}
        sortDirection={column.getIsSorted() || 'asc'}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        align="right"
      />
    ),
    cell: ({ row }) => {
      const price = row.getValue('price') as number
      return (
        <span className="tabular-nums text-right w-full">
          {price > 0 ? formatNumber(price) : '-'}
        </span>
      )
    },
  },
  {
    accessorKey: 'totalValue',
    size: 130,
    header: ({ column }) => (
      <SortButton
        label="columns.value"
        isActive={!!column.getIsSorted()}
        sortDirection={column.getIsSorted() || 'asc'}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        align="right"
      />
    ),
    cell: ({ row }) => {
      const value = row.getValue('totalValue') as number
      return (
        <span className="tabular-nums text-right w-full text-status-positive">
          {value > 0 ? formatNumber(value) : '-'}
        </span>
      )
    },
  },
  {
    accessorKey: 'totalVolume',
    size: 130,
    header: ({ column }) => (
      <SortButton
        label="columns.volume"
        isActive={!!column.getIsSorted()}
        sortDirection={column.getIsSorted() || 'asc'}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        align="right"
      />
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
      <SortButton
        label="columns.location"
        isActive={!!column.getIsSorted()}
        sortDirection={column.getIsSorted() || 'asc'}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        align="right"
      />
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
      <SortButton
        label="columns.flag"
        isActive={!!column.getIsSorted()}
        sortDirection={column.getIsSorted() || 'asc'}
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        align="right"
      />
    ),
    cell: ({ row }) => (
      <LocationFlagCell flag={row.getValue('locationFlag') as string} />
    ),
  },
]
