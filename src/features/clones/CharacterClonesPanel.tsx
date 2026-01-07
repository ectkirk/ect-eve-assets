import { useState, useCallback } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { TypeIcon } from '@/components/ui/type-icon'
import { matchesSearchLower } from '@/lib/utils'

interface ImplantInfo {
  typeId: number
  name: string
  slot: number
}

export interface CloneInfo {
  id: number
  name: string
  locationId: number
  locationName: string
  locationType: 'station' | 'structure'
  implants: ImplantInfo[]
  isActive?: boolean
}

export interface CharacterClonesData {
  activeClone: CloneInfo
  jumpClones: CloneInfo[]
}

interface CharacterClonesPanelProps {
  data: CharacterClonesData
  filter: string
}

function CloneRow({
  clone,
  isExpanded,
  onToggle,
}: {
  clone: CloneInfo
  isExpanded: boolean
  onToggle: () => void
}) {
  const sortedImplants = [...clone.implants].sort((a, b) => a.slot - b.slot)
  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded bg-surface-tertiary px-2 py-1.5 text-left hover:bg-surface-tertiary/70"
      >
        <ChevronIcon className="h-4 w-4 shrink-0 text-content-secondary" />
        {clone.isActive ? (
          <span className="flex-1 truncate text-sm">
            <span className="font-medium">Active Clone</span>
            <span className="ml-2 text-xs text-content-muted">
              {clone.locationName}
            </span>
          </span>
        ) : (
          <span className="flex-1 truncate text-sm">
            {clone.name || clone.locationName}
          </span>
        )}
        <span className="text-xs text-content-muted">
          {clone.implants.length}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-1 space-y-1 pl-4">
          {sortedImplants.length === 0 ? (
            <div className="px-2 py-1 text-sm italic text-content-muted">
              No implants
            </div>
          ) : (
            sortedImplants.map((implant) => (
              <div
                key={implant.typeId}
                className="flex items-center gap-2 rounded bg-surface-tertiary/50 p-2"
              >
                <TypeIcon typeId={implant.typeId} size="sm" />
                <span className="flex-1 truncate text-sm">{implant.name}</span>
                <span className="text-xs tabular-nums text-content-muted">
                  {implant.slot <= 10 ? `Slot ${implant.slot}` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function CharacterClonesPanel({
  data,
  filter,
}: CharacterClonesPanelProps) {
  const [expandedClones, setExpandedClones] = useState<Set<number>>(() => {
    return new Set([0])
  })

  const toggleClone = useCallback((cloneId: number) => {
    setExpandedClones((prev) => {
      const next = new Set(prev)
      if (next.has(cloneId)) {
        next.delete(cloneId)
      } else {
        next.add(cloneId)
      }
      return next
    })
  }, [])

  const filterLower = filter.toLowerCase()

  const matchesFilter = (clone: CloneInfo) => {
    if (!filter) return true
    return matchesSearchLower(
      filterLower,
      clone.locationName,
      clone.name,
      ...clone.implants.map((i) => i.name)
    )
  }

  const activeMatches = matchesFilter(data.activeClone)
  const filteredJumpClones = data.jumpClones.filter(matchesFilter)

  if (!activeMatches && filteredJumpClones.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-content-muted">
        {filter ? 'No clones match' : 'No clones'}
      </div>
    )
  }

  const allClones = [
    ...(activeMatches ? [data.activeClone] : []),
    ...filteredJumpClones,
  ]

  return (
    <div className="space-y-1 p-2">
      {allClones.map((clone) => {
        const isExpanded = expandedClones.has(clone.id) || !!filter
        return (
          <CloneRow
            key={clone.id}
            clone={clone}
            isExpanded={isExpanded}
            onToggle={() => toggleClone(clone.id)}
          />
        )
      })}
    </div>
  )
}
