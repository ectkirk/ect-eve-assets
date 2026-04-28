import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { AbyssalPreview } from '@/components/ui/abyssal-preview'
import { SortButton } from '@/components/ui/sortable-header'
import { formatNumber, formatFullNumber, cn } from '@/lib/utils'
import type { AssetRow } from './types'
import { DISPLAY_FLAGS, formatVolume } from './types'
import type { SortDirection } from '@/hooks'

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

interface AssetHeaderContext {
  isSorted: false | SortDirection
  toggleSorting: (desc?: boolean) => void
}

interface AssetCellContext {
  row: AssetRow
  getValue: (columnId: string) => unknown
}

export interface AssetColumn {
  id: keyof AssetRow & string
  size: number
  noFlex?: boolean
  header: (context: AssetHeaderContext) => ReactNode
  cell: (context: AssetCellContext) => ReactNode
}

function getCellValue(row: AssetRow, columnId: string): unknown {
  return row[columnId as keyof AssetRow]
}

export function renderAssetCell(column: AssetColumn, row: AssetRow): ReactNode {
  return column.cell({
    row,
    getValue: (columnId) => getCellValue(row, columnId),
  })
}

export const columns: AssetColumn[] = [
  {
    id: 'ownerName',
    size: 40,
    noFlex: true,
    header: () => <OwnerHeader />,
    cell: ({ row, getValue }) => {
      const ownerId = row.ownerId
      const name = getValue('ownerName') as string
      const ownerType = row.ownerType
      return (
        <span title={name}>
          <OwnerIcon ownerId={ownerId} ownerType={ownerType} size="lg" />
        </span>
      )
    },
  },
  {
    id: 'typeName',
    size: 450,
    header: ({ isSorted, toggleSorting }) => (
      <SortButton
        label="columns.name"
        isActive={!!isSorted}
        sortDirection={isSorted || 'asc'}
        onClick={() => toggleSorting(isSorted === 'asc')}
      />
    ),
    cell: ({ row, getValue }) => {
      const typeId = row.typeId
      const typeName = getValue('typeName') as string
      const isBpc = row.isBlueprintCopy
      const categoryId = row.categoryId
      const modeFlags = row.modeFlags
      const isAbyssalResolved = row.isAbyssalResolved
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
            <AbyssalPreview itemId={row.itemId}>{nameSpan}</AbyssalPreview>
          ) : (
            nameSpan
          )}
          <AssetBadges modeFlags={modeFlags} />
        </div>
      )
    },
  },
  {
    id: 'quantity',
    size: 140,
    header: ({ isSorted, toggleSorting }) => (
      <SortButton
        label="columns.quantity"
        isActive={!!isSorted}
        sortDirection={isSorted || 'asc'}
        onClick={() => toggleSorting(isSorted === 'asc')}
        align="right"
      />
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums text-right w-full">
        {formatFullNumber(getValue('quantity') as number)}
      </span>
    ),
  },
  {
    id: 'price',
    size: 130,
    header: ({ isSorted, toggleSorting }) => (
      <SortButton
        label="columns.price"
        isActive={!!isSorted}
        sortDirection={isSorted || 'asc'}
        onClick={() => toggleSorting(isSorted === 'asc')}
        align="right"
      />
    ),
    cell: ({ getValue }) => {
      const price = getValue('price') as number
      return (
        <span className="tabular-nums text-right w-full">
          {price > 0 ? formatNumber(price) : '-'}
        </span>
      )
    },
  },
  {
    id: 'totalValue',
    size: 130,
    header: ({ isSorted, toggleSorting }) => (
      <SortButton
        label="columns.value"
        isActive={!!isSorted}
        sortDirection={isSorted || 'asc'}
        onClick={() => toggleSorting(isSorted === 'asc')}
        align="right"
      />
    ),
    cell: ({ getValue }) => {
      const value = getValue('totalValue') as number
      return (
        <span className="tabular-nums text-right w-full text-status-positive">
          {value > 0 ? formatNumber(value) : '-'}
        </span>
      )
    },
  },
  {
    id: 'totalVolume',
    size: 130,
    header: ({ isSorted, toggleSorting }) => (
      <SortButton
        label="columns.volume"
        isActive={!!isSorted}
        sortDirection={isSorted || 'asc'}
        onClick={() => toggleSorting(isSorted === 'asc')}
        align="right"
      />
    ),
    cell: ({ getValue }) => (
      <span className="tabular-nums text-right w-full text-content-secondary">
        {formatVolume(getValue('totalVolume') as number)}
      </span>
    ),
  },
  {
    id: 'locationName',
    size: 450,
    header: ({ isSorted, toggleSorting }) => (
      <SortButton
        label="columns.location"
        isActive={!!isSorted}
        sortDirection={isSorted || 'asc'}
        onClick={() => toggleSorting(isSorted === 'asc')}
        align="right"
      />
    ),
    cell: ({ getValue }) => (
      <span className="text-right w-full">
        {getValue('locationName') as string}
      </span>
    ),
  },
  {
    id: 'locationFlag',
    size: 140,
    noFlex: true,
    header: ({ isSorted, toggleSorting }) => (
      <SortButton
        label="columns.flag"
        isActive={!!isSorted}
        sortDirection={isSorted || 'asc'}
        onClick={() => toggleSorting(isSorted === 'asc')}
        align="right"
      />
    ),
    cell: ({ getValue }) => (
      <LocationFlagCell flag={getValue('locationFlag') as string} />
    ),
  },
]
