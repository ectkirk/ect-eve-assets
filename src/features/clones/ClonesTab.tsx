import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, User, Home, MapPin } from 'lucide-react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useClonesStore } from '@/store/clones-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import {
  useColumnSettings,
  useCacheVersion,
  useExpandCollapse,
  type ColumnConfig,
} from '@/hooks'
import {
  hasType,
  getType,
  getLocation,
  getStructure,
} from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { cn } from '@/lib/utils'
import { TypeIcon, CharacterPortrait } from '@/components/ui/type-icon'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from '@/components/ui/table'

interface ImplantInfo {
  typeId: number
  name: string
  slot: number
}

interface CloneInfo {
  id: number
  name: string
  locationId: number
  locationName: string
  locationType: 'station' | 'structure'
  implants: ImplantInfo[]
  isHome?: boolean
  isActive?: boolean
}

interface CharacterClones {
  ownerName: string
  ownerId: number
  homeLocation: { locationId: number; locationName: string } | null
  activeClone: CloneInfo
  jumpClones: CloneInfo[]
}

function getImplantSlot(typeId: number): number {
  const type = hasType(typeId) ? getType(typeId) : undefined
  if (!type) return 99

  if (type.implantSlot !== undefined) return type.implantSlot

  const name = type.name.toLowerCase()
  for (let i = 1; i <= 10; i++) {
    if (name.includes(`slot ${i}`) || name.includes(`- ${i}`)) return i
  }
  return 99
}

function ImplantList({ implants }: { implants: ImplantInfo[] }) {
  if (implants.length === 0) {
    return (
      <span className="text-content-muted text-sm italic">No implants</span>
    )
  }

  const sorted = [...implants].sort((a, b) => a.slot - b.slot)

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-16">Slot</TableHead>
          <TableHead>Implant</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((implant) => (
          <TableRow key={implant.typeId}>
            <TableCell className="py-1 text-content-secondary tabular-nums">
              {implant.slot <= 10 ? implant.slot : '-'}
            </TableCell>
            <TableCell className="py-1">
              <div className="flex items-center gap-2">
                <TypeIcon typeId={implant.typeId} />
                <span className="truncate" title={implant.name}>
                  {implant.name}
                </span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function CloneCard({
  clone,
  isActive,
}: {
  clone: CloneInfo
  isActive?: boolean
}) {
  const [expanded, setExpanded] = useState(isActive)

  return (
    <div
      className={cn(
        'border rounded-lg',
        isActive
          ? 'border-accent bg-accent/10'
          : 'border-border bg-surface-secondary/30'
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-secondary/50"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-content-secondary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-content-secondary" />
        )}
        <MapPin
          className={cn(
            'h-4 w-4',
            isActive ? 'text-status-info' : 'text-content-secondary'
          )}
        />
        <span className={cn('flex-1', isActive && 'text-status-info')}>
          {clone.name || clone.locationName}
        </span>
        {isActive && (
          <span className="text-xs bg-accent/20 text-status-info px-2 py-0.5 rounded">
            Active
          </span>
        )}
        {clone.isHome && (
          <span title="Home Station">
            <Home className="h-4 w-4 text-status-positive" />
          </span>
        )}
        <span className="text-xs text-content-muted">
          {clone.implants.length} implants
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-border/50">
          <div className="text-xs text-content-muted mb-2">
            {clone.locationName}
          </div>
          <ImplantList implants={clone.implants} />
        </div>
      )}
    </div>
  )
}

function CharacterClonesSection({
  data,
  isExpanded,
  onToggle,
}: {
  data: CharacterClones
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-secondary/50 text-left text-sm"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-content-secondary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-content-secondary" />
        )}
        <CharacterPortrait characterId={data.ownerId} size="lg" />
        <span className="font-medium flex-1">{data.ownerName}</span>
        <span className="text-sm text-content-secondary">
          {data.jumpClones.length} jump clone
          {data.jumpClones.length !== 1 ? 's' : ''}
        </span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <h4 className="text-xs uppercase text-content-muted mb-2 flex items-center gap-1">
              <User className="h-3 w-3" />
              Active Clone
            </h4>
            <CloneCard clone={data.activeClone} isActive />
          </div>

          {data.jumpClones.length > 0 && (
            <div>
              <h4 className="text-xs uppercase text-content-muted mb-2">
                Jump Clones
              </h4>
              <div className="space-y-2">
                {data.jumpClones.map((clone) => (
                  <CloneCard key={clone.id} clone={clone} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ClonesTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const clonesByOwner = useClonesStore((s) => s.dataByOwner)
  const clonesUpdating = useClonesStore((s) => s.isUpdating)
  const updateError = useClonesStore((s) => s.updateError)
  const init = useClonesStore((s) => s.init)
  const update = useClonesStore((s) => s.update)
  const initialized = useClonesStore((s) => s.initialized)

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || clonesUpdating

  useEffect(() => {
    init().then(() => update())
  }, [init, update])

  const cacheVersion = useCacheVersion()

  const { setExpandCollapse, search, setResultCount, setColumns } =
    useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const CLONE_COLUMNS: ColumnConfig[] = useMemo(
    () => [
      { id: 'character', label: 'Character' },
      { id: 'location', label: 'Location' },
      { id: 'implants', label: 'Implants' },
    ],
    []
  )

  const { getColumnsForDropdown } = useColumnSettings('clones', CLONE_COLUMNS)

  const characterClones = useMemo(() => {
    void cacheVersion

    const getLocationName = (
      locationId: number,
      locationType: 'station' | 'structure'
    ): string => {
      if (locationType === 'structure') {
        return getStructure(locationId)?.name ?? `Structure ${locationId}`
      }
      return getLocation(locationId)?.name ?? `Location ${locationId}`
    }

    const result: CharacterClones[] = []

    const filteredClonesByOwner = clonesByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.characterId))
    )

    for (const { owner, clones, activeImplants } of filteredClonesByOwner) {
      const homeLocationId = clones.home_location?.location_id
      const homeLocationType = clones.home_location?.location_type ?? 'station'
      const homeLocation = homeLocationId
        ? {
            locationId: homeLocationId,
            locationName: getLocationName(homeLocationId, homeLocationType),
          }
        : null

      const activeImplantInfos: ImplantInfo[] = activeImplants.map((typeId) => {
        const type = hasType(typeId) ? getType(typeId) : undefined
        return {
          typeId,
          name: type?.name ?? `Unknown Type ${typeId}`,
          slot: getImplantSlot(typeId),
        }
      })

      const activeClone: CloneInfo = {
        id: 0,
        name: 'Active Clone',
        locationId: homeLocationId ?? 0,
        locationName: homeLocation?.locationName ?? 'Unknown',
        locationType: homeLocationType,
        implants: activeImplantInfos,
        isActive: true,
        isHome: true,
      }

      const jumpClones: CloneInfo[] = clones.jump_clones.map((jc) => {
        const implants: ImplantInfo[] = jc.implants.map((typeId) => {
          const type = hasType(typeId) ? getType(typeId) : undefined
          return {
            typeId,
            name: type?.name ?? `Unknown Type ${typeId}`,
            slot: getImplantSlot(typeId),
          }
        })

        return {
          id: jc.jump_clone_id,
          name: jc.name ?? '',
          locationId: jc.location_id,
          locationName: getLocationName(jc.location_id, jc.location_type),
          locationType: jc.location_type,
          implants,
          isHome: jc.location_id === homeLocationId,
        }
      })

      result.push({
        ownerName: owner.name,
        ownerId: owner.characterId,
        homeLocation,
        activeClone,
        jumpClones,
      })
    }

    let sorted = result.sort((a, b) => a.ownerName.localeCompare(b.ownerName))

    if (search) {
      const searchLower = search.toLowerCase()
      sorted = sorted.filter(
        (char) =>
          char.ownerName.toLowerCase().includes(searchLower) ||
          char.activeClone.locationName.toLowerCase().includes(searchLower) ||
          char.activeClone.implants.some((i) =>
            i.name.toLowerCase().includes(searchLower)
          ) ||
          char.jumpClones.some(
            (jc) =>
              jc.locationName.toLowerCase().includes(searchLower) ||
              jc.name.toLowerCase().includes(searchLower) ||
              jc.implants.some((i) =>
                i.name.toLowerCase().includes(searchLower)
              )
          )
      )
    }

    return sorted
  }, [clonesByOwner, cacheVersion, search, selectedSet])

  const expandableIds = useMemo(
    () => characterClones.map((c) => c.ownerId),
    [characterClones]
  )
  const { isExpanded, toggle } = useExpandCollapse(
    expandableIds,
    setExpandCollapse
  )

  useEffect(() => {
    setResultCount({
      showing: characterClones.length,
      total: clonesByOwner.length,
    })
    return () => setResultCount(null)
  }, [characterClones.length, clonesByOwner.length, setResultCount])

  useEffect(() => {
    setColumns(getColumnsForDropdown())
    return () => setColumns([])
  }, [getColumnsForDropdown, setColumns])

  const loadingState = TabLoadingState({
    dataType: 'clones',
    initialized,
    isUpdating,
    hasData: clonesByOwner.length > 0,
    hasOwners: owners.length > 0,
    updateError,
  })
  if (loadingState) return loadingState

  return (
    <div className="h-full rounded-lg border border-border bg-surface-secondary/30 overflow-auto">
      {characterClones.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-content-secondary">No clone data available.</p>
        </div>
      ) : (
        characterClones.map((data) => (
          <CharacterClonesSection
            key={data.ownerId}
            data={data}
            isExpanded={isExpanded(data.ownerId)}
            onToggle={() => toggle(data.ownerId)}
          />
        ))
      )}
    </div>
  )
}
