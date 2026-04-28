import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { matchesSearchLower } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { isAbyssalTypeId, getMutamarketUrl } from '@/api/mutamarket-client'
import {
  CategoryIds,
  getType,
  useReferenceCacheStore,
} from '@/store/reference-cache'
import { useAuthStore } from '@/store/auth-store'
import { usePriceStore } from '@/store/price-store'
import { useResolvedAssets } from '@/hooks/useResolvedAssets'
import { useRowSelection } from '@/hooks'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { IngameActionModal } from '@/components/dialogs/IngameActionModal'
import { cn } from '@/lib/utils'
import { useTabControls } from '@/context'
import {
  matchesAssetTypeFilter,
  matchesSearch,
  getAssetDisplayNames,
} from '@/lib/resolved-asset'
import { useBlueprintsStore } from '@/store/blueprints-store'
import { useRegionalMarketActionStore } from '@/store/regional-market-action-store'
import { useContractsSearchActionStore } from '@/store/contracts-search-action-store'
import { useReferenceActionStore } from '@/store/reference-action-store'
import { useFixedVirtualRows } from '@/hooks/use-fixed-virtual-rows'
import {
  type AssetRow,
  type AssetSorting,
  COLUMN_LABELS,
  TOGGLEABLE_COLUMNS,
  getDisplayFlag,
  loadColumnVisibility,
  saveColumnVisibility,
  createAssetRow,
} from './types'
import { columns, renderAssetCell } from './columns'

function getAssetSortValue(row: AssetRow, columnId: string): string | number {
  const value = row[columnId as keyof AssetRow]
  if (typeof value === 'number' || typeof value === 'string') return value
  return ''
}

function compareAssetRows(
  a: AssetRow,
  b: AssetRow,
  sorting: AssetSorting[]
): number {
  for (const sort of sorting) {
    const aValue = getAssetSortValue(a, sort.id)
    const bValue = getAssetSortValue(b, sort.id)
    const direction = sort.desc ? -1 : 1

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      const result = aValue - bValue
      if (result !== 0) return result * direction
      continue
    }

    const result = String(aValue).localeCompare(String(bValue))
    if (result !== 0) return result * direction
  }

  return 0
}

export function AssetsTab() {
  const { t } = useTranslation('assets')
  const { t: tCommon } = useTranslation('common')
  const {
    selectedResolvedAssets,
    owners,
    isLoading,
    hasData,
    hasError,
    errorMessage,
    updateProgress,
  } = useResolvedAssets()
  const types = useReferenceCacheStore((s) => s.types)
  const abyssalPrices = usePriceStore((s) => s.abyssalPrices)

  const [sorting, setSorting] = useState<AssetSorting[]>([
    { id: 'totalValue', desc: true },
  ])
  const [columnVisibility, setColumnVisibility] = useState(loadColumnVisibility)
  const [categoryFilterValue, setCategoryFilterValue] = useState('')
  const [groupFilterValue, setGroupFilterValue] = useState('')
  const [assetTypeFilterValue, setAssetTypeFilterValue] = useState('')
  const [ingameAction, setIngameAction] = useState<{
    action: 'market' | 'autopilot' | 'contract'
    targetId: number
    targetName?: string
    eligibleCharacterIds?: number[]
  } | null>(null)

  const {
    setColumns,
    search,
    setSearchPlaceholder,
    setCategoryFilter,
    setGroupFilter,
    setAssetTypeFilter,
    setResultCount,
    setTotalValue,
  } = useTabControls()

  useEffect(() => {
    setSearchPlaceholder(tCommon('search.placeholder'))
    return () => {
      setSearchPlaceholder(null)
    }
  }, [setSearchPlaceholder, tCommon])

  useEffect(() => {
    saveColumnVisibility(columnVisibility)
  }, [columnVisibility])

  const blueprintsByItemId = useBlueprintsStore((s) => s.blueprintsByItemId)
  const navigateToType = useRegionalMarketActionStore((s) => s.navigateToType)
  const navigateToContracts = useContractsSearchActionStore(
    (s) => s.navigateToContracts
  )
  const navigateToReference = useReferenceActionStore((s) => s.navigateToType)
  const authOwners = useAuthStore((s) => s.owners)
  const ownerHasDirectorRole = useAuthStore((s) => s.ownerHasDirectorRole)

  const getContractEligibleCharacterIds = useCallback(
    (issuerId: number, issuerCorporationId: number): number[] => {
      const characterOwners = Object.values(authOwners).filter(
        (o) => o.type === 'character'
      )
      const issuerOwner = characterOwners.find((o) => o.id === issuerId)
      if (issuerOwner) return [issuerOwner.id]

      const corpDirectors = characterOwners.filter(
        (o) =>
          o.corporationId === issuerCorporationId &&
          ownerHasDirectorRole(`corporation-${o.corporationId}`)
      )
      return corpDirectors.map((o) => o.id)
    },
    [authOwners, ownerHasDirectorRole]
  )

  const { data, categories, groups } = useMemo(() => {
    void types

    const aggregated = new Map<string, AssetRow>()
    const cats = new Set<string>()
    const grps = new Set<string>()

    for (const ra of selectedResolvedAssets) {
      const displayFlag = getDisplayFlag(ra.modeFlags, ra.asset.location_flag)

      const isBlueprint = ra.categoryId === CategoryIds.BLUEPRINT
      const isAbyssal = isAbyssalTypeId(ra.typeId)
      const isAbyssalResolved = isAbyssal && abyssalPrices.has(ra.asset.item_id)
      const names = getAssetDisplayNames(ra)

      if (names.categoryName) cats.add(names.categoryName)
      if (names.groupName) grps.add(names.groupName)

      if (isAbyssal || (ra.asset.is_singleton && !isBlueprint)) {
        aggregated.set(
          `unique-${ra.asset.item_id}`,
          createAssetRow(ra, displayFlag, isAbyssal, isAbyssalResolved)
        )
        continue
      }

      let bpSuffix = ''
      if (isBlueprint && ra.isBlueprintCopy) {
        const bp = blueprintsByItemId.get(ra.asset.item_id)
        if (bp) {
          bpSuffix = `-${bp.runs}/${bp.materialEfficiency}/${bp.timeEfficiency}`
        }
      }

      const key = `${ra.owner.id}-${ra.typeId}-${ra.asset.location_id}-${displayFlag}-${ra.rootLocationId}${bpSuffix}`
      const existing = aggregated.get(key)
      if (existing) {
        existing.quantity += ra.asset.quantity
        existing.totalValue += ra.totalValue
        existing.totalVolume += ra.totalVolume
      } else {
        aggregated.set(
          key,
          createAssetRow(ra, displayFlag, isAbyssal, isAbyssalResolved)
        )
      }
    }

    return {
      data: Array.from(aggregated.values()),
      categories: Array.from(cats).sort(),
      groups: Array.from(grps).sort(),
    }
  }, [selectedResolvedAssets, types, blueprintsByItemId, abyssalPrices])

  const filteredGroups = useMemo(() => {
    if (!categoryFilterValue) return groups
    const grpSet = new Set<string>()
    for (const row of data) {
      if (row.categoryName === categoryFilterValue && row.groupName) {
        grpSet.add(row.groupName)
      }
    }
    return Array.from(grpSet).sort()
  }, [groups, data, categoryFilterValue])

  const { filteredData, filteredTotalValue, sourceCount } = useMemo(() => {
    const searchLower = search.toLowerCase()
    let sourceShowing = 0

    for (const ra of selectedResolvedAssets) {
      if (!matchesAssetTypeFilter(ra.modeFlags, assetTypeFilterValue)) continue
      const names = getAssetDisplayNames(ra)
      if (categoryFilterValue && names.categoryName !== categoryFilterValue)
        continue
      if (groupFilterValue && names.groupName !== groupFilterValue) continue
      if (search && !matchesSearch(ra, search)) continue
      sourceShowing++
    }

    const filtered = data.filter((row) => {
      if (!matchesAssetTypeFilter(row.modeFlags, assetTypeFilterValue))
        return false
      if (categoryFilterValue && row.categoryName !== categoryFilterValue)
        return false
      if (groupFilterValue && row.groupName !== groupFilterValue) return false
      if (
        search &&
        !matchesSearchLower(
          searchLower,
          row.typeName,
          row.groupName,
          row.locationName,
          row.systemName,
          row.regionName
        )
      )
        return false
      return true
    })
    const totalValue = filtered.reduce((sum, row) => {
      if (
        row.modeFlags.isOwnedStructure ||
        row.modeFlags.isMarketOrder ||
        row.modeFlags.isContract
      ) {
        return sum
      }
      return sum + row.totalValue
    }, 0)

    return {
      filteredData: filtered,
      filteredTotalValue: totalValue,
      sourceCount: {
        showing: sourceShowing,
        total: selectedResolvedAssets.length,
      },
    }
  }, [
    data,
    selectedResolvedAssets,
    assetTypeFilterValue,
    categoryFilterValue,
    groupFilterValue,
    search,
  ])

  const visibleColumns = useMemo(
    () => columns.filter((col) => columnVisibility[col.id] !== false),
    [columnVisibility]
  )

  const sortedData = useMemo(
    () => [...filteredData].sort((a, b) => compareAssetRows(a, b, sorting)),
    [filteredData, sorting]
  )

  const toggleSorting = useCallback((columnId: string, desc?: boolean) => {
    setSorting((current) => {
      const existing = current[0]
      if (existing?.id === columnId) {
        return [{ id: columnId, desc: desc ?? !existing.desc }]
      }
      return [{ id: columnId, desc: desc ?? false }]
    })
  }, [])

  useEffect(() => {
    const cols = columns
      .filter((col) => TOGGLEABLE_COLUMNS.has(col.id))
      .map((col) => {
        const visible = columnVisibility[col.id] !== false
        return {
          id: col.id,
          label: COLUMN_LABELS[col.id] ?? col.id,
          visible,
          toggle: () => {
            setColumnVisibility((current) => ({
              ...current,
              [col.id]: !visible,
            }))
          },
        }
      })
    setColumns(cols)
    return () => {
      setColumns([])
    }
  }, [columnVisibility, setColumns])

  useEffect(() => {
    setCategoryFilter({
      categories,
      value: categoryFilterValue,
      onChange: (value: string) => {
        setCategoryFilterValue(value)
        setGroupFilterValue('')
      },
    })
    return () => {
      setCategoryFilter(null)
    }
  }, [categories, categoryFilterValue, setCategoryFilter])

  useEffect(() => {
    setGroupFilter({
      groups: filteredGroups,
      value: groupFilterValue,
      onChange: setGroupFilterValue,
    })
    return () => {
      setGroupFilter(null)
    }
  }, [filteredGroups, groupFilterValue, setGroupFilter])

  useEffect(() => {
    setAssetTypeFilter({
      value: assetTypeFilterValue,
      onChange: setAssetTypeFilterValue,
    })
    return () => {
      setAssetTypeFilter(null)
    }
  }, [assetTypeFilterValue, setAssetTypeFilter])

  useEffect(() => {
    setResultCount(sourceCount)
    return () => {
      setResultCount(null)
    }
  }, [sourceCount, setResultCount])

  useEffect(() => {
    setTotalValue({ value: filteredTotalValue })
    return () => {
      setTotalValue(null)
    }
  }, [filteredTotalValue, setTotalValue])

  const tableContainerRef = useRef<HTMLDivElement>(null)
  const getRowId = useCallback(
    (row: AssetRow) => `${row.itemId}-${row.locationId}`,
    []
  )
  const getCopyData = useCallback(
    (row: AssetRow) => {
      const baseName = getType(row.typeId)?.name ?? row.typeName
      let blueprintSuffix: string | undefined
      if (row.categoryId === CategoryIds.BLUEPRINT) {
        const bpInfo = blueprintsByItemId.get(row.itemId)
        if (bpInfo) {
          blueprintSuffix = bpInfo.isCopy
            ? `(ME${bpInfo.materialEfficiency} TE${bpInfo.timeEfficiency} R${bpInfo.runs})`
            : `(ME${bpInfo.materialEfficiency} TE${bpInfo.timeEfficiency})`
        }
      }
      return {
        name: baseName,
        quantity: row.quantity,
        isItem: true,
        blueprintSuffix,
      }
    },
    [blueprintsByItemId]
  )
  const { selectedIds, handleRowClick } = useRowSelection({
    items: sortedData,
    getId: getRowId,
    getCopyData,
    containerRef: tableContainerRef,
  })

  const getScrollElement = useCallback(() => tableContainerRef.current, [])
  const { virtualRows, paddingStart, paddingEnd } = useFixedVirtualRows({
    count: sortedData.length,
    getScrollElement,
    rowHeight: 41,
    overscan: 10,
  })

  const gridTemplateColumns = useMemo(() => {
    return visibleColumns
      .map((col) => {
        return col.noFlex ? `${col.size}px` : `minmax(${col.size}px, 1fr)`
      })
      .join(' ')
  }, [visibleColumns])

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-content-secondary">{t('noCharacters')}</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto" />
          <p className="mt-2 text-content-secondary">
            {updateProgress
              ? t('loading.fetching', {
                  current: updateProgress.current + 1,
                  total: updateProgress.total,
                })
              : t('loading.assets')}
          </p>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {hasError && (
            <>
              <p className="text-semantic-danger">{t('error.loadFailed')}</p>
              <p className="text-sm text-content-secondary">{errorMessage}</p>
            </>
          )}
          {!hasError && <p className="text-content-secondary">{t('noData')}</p>}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <div
          ref={tableContainerRef}
          tabIndex={0}
          className="flex-1 min-h-0 rounded-lg border border-border bg-surface-secondary/30 overflow-auto outline-none focus:ring-1 focus:ring-accent/50"
        >
          <div
            role="grid"
            aria-label="Assets"
            className="grid"
            style={{ gridTemplateColumns }}
          >
            <div role="rowgroup" className="contents">
              <div role="row" className="contents">
                {visibleColumns.map((column) => {
                  const sort = sorting[0]
                  const isSorted =
                    sort?.id === column.id
                      ? sort.desc
                        ? 'desc'
                        : 'asc'
                      : false
                  return (
                    <div
                      key={column.id}
                      role="columnheader"
                      className={`sticky top-0 z-10 bg-surface-secondary py-3 text-left text-sm font-medium text-content-secondary border-b border-border ${column.id === 'ownerName' ? 'px-2' : 'px-4'}`}
                    >
                      {column.header({
                        isSorted,
                        toggleSorting: (desc) => {
                          toggleSorting(column.id, desc)
                        },
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
            {sortedData.length ? (
              <div role="rowgroup" className="contents">
                {virtualRows.length > 0 && (
                  <div
                    aria-hidden="true"
                    style={{
                      height: paddingStart,
                      gridColumn: `1 / -1`,
                    }}
                  />
                )}
                {virtualRows.map((virtualRow) => {
                  const row = sortedData[virtualRow.index]
                  if (!row) return null
                  const modeFlags = row.modeFlags
                  const isAbyssalResolved = row.isAbyssalResolved
                  const isMarketItem = !!getType(row.typeId)?.marketGroupId
                  const rowId = getRowId(row)
                  const isRowSelected = selectedIds.has(rowId)
                  const rowContent = (
                    <div
                      key={rowId}
                      role="row"
                      aria-selected={isRowSelected}
                      data-index={virtualRow.index}
                      className="contents group cursor-pointer select-none"
                      onClick={(e) => {
                        handleRowClick(rowId, e)
                      }}
                    >
                      {visibleColumns.map((column) => (
                        <div
                          key={`${rowId}-${column.id}`}
                          role="gridcell"
                          className={cn(
                            'py-2 text-sm border-b border-border/50 group-hover:bg-surface-tertiary/50 flex items-center',
                            column.id === 'ownerName' ? 'px-2' : 'px-4',
                            isRowSelected && 'bg-accent/20',
                            !isRowSelected &&
                              modeFlags.isActiveShip &&
                              'bg-row-active-ship',
                            !isRowSelected &&
                              modeFlags.isContract &&
                              'bg-row-contract',
                            !isRowSelected &&
                              modeFlags.isMarketOrder &&
                              'bg-row-order',
                            !isRowSelected &&
                              modeFlags.isIndustryJob &&
                              'bg-row-industry',
                            !isRowSelected &&
                              modeFlags.isOwnedStructure &&
                              'bg-row-structure'
                          )}
                        >
                          {renderAssetCell(column, row)}
                        </div>
                      ))}
                    </div>
                  )
                  return (
                    <ContextMenu key={rowId}>
                      <ContextMenuTrigger asChild>
                        {rowContent}
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          onClick={() => {
                            navigateToContracts(row.typeId, row.typeName)
                          }}
                        >
                          {t('contextMenu.viewContracts')}
                        </ContextMenuItem>
                        {isMarketItem && (
                          <ContextMenuItem
                            onClick={() => {
                              navigateToType(row.typeId)
                            }}
                          >
                            {tCommon('contextMenu.viewInMarket')}
                          </ContextMenuItem>
                        )}
                        {isMarketItem && (
                          <ContextMenuItem
                            onClick={() => {
                              setIngameAction({
                                action: 'market',
                                targetId: row.typeId,
                                targetName: row.typeName,
                              })
                            }}
                          >
                            {tCommon('contextMenu.openMarketIngame')}
                          </ContextMenuItem>
                        )}
                        {row.locationId && (
                          <ContextMenuItem
                            onClick={() => {
                              setIngameAction({
                                action: 'autopilot',
                                targetId: row.locationId,
                                targetName: row.locationName,
                              })
                            }}
                          >
                            {tCommon('contextMenu.setWaypoint')}
                          </ContextMenuItem>
                        )}
                        {row.contractInfo && (
                          <ContextMenuItem
                            onClick={() => {
                              const ci = row.contractInfo!
                              setIngameAction({
                                action: 'contract',
                                targetId: ci.contractId,
                                eligibleCharacterIds:
                                  getContractEligibleCharacterIds(
                                    ci.issuerId,
                                    ci.issuerCorporationId
                                  ),
                              })
                            }}
                          >
                            {tCommon('contextMenu.openContractIngame')}
                          </ContextMenuItem>
                        )}
                        {isAbyssalResolved && (
                          <ContextMenuItem
                            onClick={() =>
                              window.open(
                                getMutamarketUrl(row.typeName, row.itemId),
                                '_blank'
                              )
                            }
                          >
                            {t('contextMenu.openMutamarket')}
                          </ContextMenuItem>
                        )}
                        <ContextMenuItem
                          onClick={() => {
                            navigateToReference(row.typeId)
                          }}
                        >
                          {tCommon('contextMenu.viewDetails')}
                        </ContextMenuItem>
                        {row.parentTypeId && (
                          <ContextMenuItem
                            onClick={() => {
                              navigateToReference(row.parentTypeId!)
                            }}
                          >
                            {tCommon('contextMenu.viewParent', {
                              name:
                                row.parentCustomName && row.parentTypeName
                                  ? `${row.parentTypeName} (${row.parentCustomName})`
                                  : row.parentTypeName,
                            })}
                          </ContextMenuItem>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
                {virtualRows.length > 0 && (
                  <div
                    aria-hidden="true"
                    style={{
                      height: paddingEnd,
                      gridColumn: `1 / -1`,
                    }}
                  />
                )}
              </div>
            ) : (
              <div
                className="h-24 flex items-center justify-center text-content-secondary"
                style={{ gridColumn: `1 / -1` }}
              >
                {t('empty')}
              </div>
            )}
          </div>
        </div>
      </div>
      <IngameActionModal
        open={ingameAction !== null}
        onOpenChange={(open) => !open && setIngameAction(null)}
        action={ingameAction?.action ?? 'market'}
        targetId={ingameAction?.targetId ?? 0}
        targetName={ingameAction?.targetName}
        eligibleCharacterIds={ingameAction?.eligibleCharacterIds}
      />
    </>
  )
}
