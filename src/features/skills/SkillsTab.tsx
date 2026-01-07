import { useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { useSkillsStore, type CharacterSkillsData } from '@/store/skills-store'
import { useTabControls } from '@/context'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { CharacterPortrait } from '@/components/ui/type-icon'
import { CharacterSkillsPanel } from './CharacterSkillsPanel'
import { formatSP } from './skill-utils'

export function SkillsTab() {
  const hasCharacters = useAuthStore((s) =>
    Object.values(s.owners).some((o) => o.type === 'character')
  )

  const skillsByOwner = useSkillsStore((s) => s.dataByOwner)
  const isUpdating = useSkillsStore((s) => s.isUpdating)
  const updateError = useSkillsStore((s) => s.updateError)
  const init = useSkillsStore((s) => s.init)
  const update = useSkillsStore((s) => s.update)
  const initialized = useSkillsStore((s) => s.initialized)

  const { search, setSearchPlaceholder, setRefreshAction } = useTabControls()

  useEffect(() => {
    init().then(() => update())
  }, [init, update])

  const handleRefresh = useCallback(() => {
    update(true)
  }, [update])

  useEffect(() => {
    setSearchPlaceholder('Search skills...')
    return () => setSearchPlaceholder(null)
  }, [setSearchPlaceholder])

  useEffect(() => {
    setRefreshAction({ onRefresh: handleRefresh, isRefreshing: isUpdating })
    return () => setRefreshAction(null)
  }, [setRefreshAction, handleRefresh, isUpdating])

  const loadingState = TabLoadingState({
    dataType: 'skills',
    initialized,
    isUpdating,
    hasData: skillsByOwner.length > 0,
    hasOwners: hasCharacters,
    updateError,
  })

  if (loadingState) return loadingState

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-1">
      {skillsByOwner.map((charData) => (
        <CharacterPanel
          key={charData.owner.characterId}
          data={charData}
          filter={search}
        />
      ))}
    </div>
  )
}

function CharacterPanel({
  data,
  filter,
}: {
  data: CharacterSkillsData
  filter: string
}) {
  return (
    <div className="flex h-full w-80 shrink-0 flex-col rounded-lg border border-border bg-surface-secondary/30">
      <div className="flex items-center gap-3 border-b border-border bg-surface-secondary px-3 py-2">
        <CharacterPortrait characterId={data.owner.characterId} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{data.owner.name}</div>
          <div className="text-xs text-content-secondary">
            {formatSP(data.skills.total_sp)} SP
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <CharacterSkillsPanel data={data} filter={filter} />
      </div>
    </div>
  )
}
