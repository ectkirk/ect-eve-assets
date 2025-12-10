import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Loader2,
  ChevronRight,
  ChevronDown,
  User,
  Home,
  MapPin,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth-store'
import { useClonesStore } from '@/store/clones-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import {
  hasType,
  getType,
  hasLocation,
  getLocation,
  hasStructure,
  getStructure,
  subscribe,
} from '@/store/reference-cache'
import { resolveTypes, resolveLocations } from '@/api/ref-client'
import { resolveStructures } from '@/api/endpoints/universe'
import { cn } from '@/lib/utils'
import { TypeIcon, CharacterPortrait } from '@/components/ui/type-icon'

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

  const name = type.name.toLowerCase()
  for (let i = 1; i <= 10; i++) {
    if (name.includes(`slot ${i}`) || name.includes(`- ${i}`)) return i
  }
  return 99
}

function ImplantList({ implants }: { implants: ImplantInfo[] }) {
  if (implants.length === 0) {
    return <span className="text-slate-500 text-sm italic">No implants</span>
  }

  const sorted = [...implants].sort((a, b) => a.slot - b.slot)

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {sorted.map((implant) => (
        <div key={implant.typeId} className="flex items-center gap-2">
          <TypeIcon typeId={implant.typeId} />
          <span className="text-sm truncate" title={implant.name}>
            {implant.name}
          </span>
        </div>
      ))}
    </div>
  )
}

function CloneCard({ clone, isActive }: { clone: CloneInfo; isActive?: boolean }) {
  const [expanded, setExpanded] = useState(isActive)

  return (
    <div
      className={cn(
        'border rounded-lg',
        isActive ? 'border-blue-500 bg-blue-950/20' : 'border-slate-700 bg-slate-800/30'
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/50"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
        <MapPin className={cn('h-4 w-4', isActive ? 'text-blue-400' : 'text-slate-400')} />
        <span className={cn('flex-1', isActive && 'text-blue-300')}>
          {clone.name || clone.locationName}
        </span>
        {isActive && (
          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">Active</span>
        )}
        {clone.isHome && (
          <span title="Home Station">
            <Home className="h-4 w-4 text-green-400" />
          </span>
        )}
        <span className="text-xs text-slate-500">{clone.implants.length} implants</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-slate-700/50">
          <div className="text-xs text-slate-500 mb-2">{clone.locationName}</div>
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
    <div className="border-b border-slate-700 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
        <CharacterPortrait characterId={data.ownerId} size="lg" />
        <span className="font-medium flex-1">{data.ownerName}</span>
        <span className="text-sm text-slate-400">
          {data.jumpClones.length} jump clone{data.jumpClones.length !== 1 ? 's' : ''}
        </span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <h4 className="text-xs uppercase text-slate-500 mb-2 flex items-center gap-1">
              <User className="h-3 w-3" />
              Active Clone
            </h4>
            <CloneCard clone={data.activeClone} isActive />
          </div>

          {data.jumpClones.length > 0 && (
            <div>
              <h4 className="text-xs uppercase text-slate-500 mb-2">Jump Clones</h4>
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

  const clonesByOwner = useClonesStore((s) => s.clonesByOwner)
  const clonesLastUpdated = useClonesStore((s) => s.lastUpdated)
  const clonesUpdating = useClonesStore((s) => s.isUpdating)
  const updateError = useClonesStore((s) => s.updateError)
  const init = useClonesStore((s) => s.init)
  const initialized = useClonesStore((s) => s.initialized)

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || clonesUpdating

  useEffect(() => {
    init()
  }, [init])

  const [cacheVersion, setCacheVersion] = useState(0)
  useEffect(() => subscribe(() => setCacheVersion((v) => v + 1)), [])

  useEffect(() => {
    if (clonesByOwner.length === 0) return

    const unresolvedTypeIds = new Set<number>()
    const unknownLocationIds = new Set<number>()
    const structureToCharacter = new Map<number, number>()

    const needsResolution = (typeId: number) => {
      const type = getType(typeId)
      return !type || type.name.startsWith('Unknown Type ')
    }

    for (const { owner, clones, activeImplants } of clonesByOwner) {
      for (const implantId of activeImplants) {
        if (needsResolution(implantId)) unresolvedTypeIds.add(implantId)
      }

      if (clones.home_location) {
        const { location_id, location_type } = clones.home_location
        if (location_type === 'structure') {
          if (!hasStructure(location_id)) {
            structureToCharacter.set(location_id, owner.characterId)
          }
        } else if (!hasLocation(location_id)) {
          unknownLocationIds.add(location_id)
        }
      }

      for (const jumpClone of clones.jump_clones) {
        const { location_id, location_type } = jumpClone
        if (location_type === 'structure') {
          if (!hasStructure(location_id)) {
            structureToCharacter.set(location_id, owner.characterId)
          }
        } else if (!hasLocation(location_id)) {
          unknownLocationIds.add(location_id)
        }
        for (const implantId of jumpClone.implants) {
          if (needsResolution(implantId)) unresolvedTypeIds.add(implantId)
        }
      }
    }

    if (unresolvedTypeIds.size > 0) {
      resolveTypes(Array.from(unresolvedTypeIds)).catch(() => {})
    }
    if (unknownLocationIds.size > 0) {
      resolveLocations(Array.from(unknownLocationIds)).catch(() => {})
    }
    if (structureToCharacter.size > 0) {
      resolveStructures(structureToCharacter).catch(() => {})
    }
  }, [clonesByOwner])

  const [expandedCharacters, setExpandedCharacters] = useState<Set<number>>(new Set())

  const characterClones = useMemo(() => {
    void cacheVersion

    const getLocationName = (
      locationId: number,
      locationType: 'station' | 'structure'
    ): string => {
      if (locationType === 'structure') {
        const structure = hasStructure(locationId) ? getStructure(locationId) : undefined
        return structure?.name ?? `Structure ${locationId}`
      }
      const location = hasLocation(locationId) ? getLocation(locationId) : undefined
      return location?.name ?? `Location ${locationId}`
    }

    const result: CharacterClones[] = []

    for (const { owner, clones, activeImplants } of clonesByOwner) {
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

    return result.sort((a, b) => a.ownerName.localeCompare(b.ownerName))
  }, [clonesByOwner, cacheVersion])

  const toggleCharacter = useCallback((ownerId: number) => {
    setExpandedCharacters((prev) => {
      const next = new Set(prev)
      if (next.has(ownerId)) next.delete(ownerId)
      else next.add(ownerId)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const allIds = characterClones.map((c) => c.ownerId)
    setExpandedCharacters(new Set(allIds))
  }, [characterClones])

  const collapseAll = useCallback(() => {
    setExpandedCharacters(new Set())
  }, [])

  const { setExpandCollapse } = useTabControls()

  const expandableIds = useMemo(() => characterClones.map((c) => c.ownerId), [characterClones])
  const isAllExpanded = expandableIds.length > 0 && expandableIds.every((id) => expandedCharacters.has(id))

  useEffect(() => {
    if (expandableIds.length === 0) {
      setExpandCollapse(null)
      return
    }

    setExpandCollapse({
      isExpanded: isAllExpanded,
      toggle: () => {
        if (isAllExpanded) {
          collapseAll()
        } else {
          expandAll()
        }
      },
    })

    return () => setExpandCollapse(null)
  }, [expandableIds, isAllExpanded, expandAll, collapseAll, setExpandCollapse])

  const totals = useMemo(() => {
    let totalJumpClones = 0
    let totalImplants = 0

    for (const char of characterClones) {
      totalJumpClones += char.jumpClones.length
      totalImplants += char.activeClone.implants.length
      for (const jc of char.jumpClones) {
        totalImplants += jc.implants.length
      }
    }

    return { totalJumpClones, totalImplants, characters: characterClones.length }
  }, [characterClones])

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">No characters logged in. Add a character to view clones.</p>
      </div>
    )
  }

  if (!initialized || (isUpdating && clonesByOwner.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
          <p className="mt-2 text-slate-400">Loading clones...</p>
        </div>
      </div>
    )
  }

  if (clonesByOwner.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {updateError && (
            <>
              <p className="text-red-500">Failed to load clones</p>
              <p className="text-sm text-slate-400 mb-4">{updateError}</p>
            </>
          )}
          {!updateError && (
            <p className="text-slate-400">No clone data loaded. Use the Update button in the header to fetch from ESI.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-slate-400">Characters: </span>
          <span className="font-medium">{totals.characters}</span>
        </div>
        <div>
          <span className="text-slate-400">Jump Clones: </span>
          <span className="font-medium text-blue-400">{totals.totalJumpClones}</span>
        </div>
        <div>
          <span className="text-slate-400">Total Implants: </span>
          <span className="font-medium text-purple-400">{totals.totalImplants}</span>
        </div>
      </div>

      <div
        className="rounded-lg border border-slate-700 overflow-auto"
        style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}
      >
        {characterClones.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400">No clone data available.</p>
          </div>
        ) : (
          characterClones.map((data) => (
            <CharacterClonesSection
              key={data.ownerId}
              data={data}
              isExpanded={expandedCharacters.has(data.ownerId)}
              onToggle={() => toggleCharacter(data.ownerId)}
            />
          ))
        )}
      </div>

      {clonesLastUpdated && (
        <p className="text-xs text-slate-500 text-right">
          Last updated: {new Date(clonesLastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  )
}
