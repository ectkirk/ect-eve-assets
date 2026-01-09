import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth-store'
import { useSkillsStore } from '@/store/skills-store'
import { useTabControls } from '@/context'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { CharacterPanel } from '@/components/ui/character-panel'
import { CharacterSkillsPanel } from './CharacterSkillsPanel'
import { formatSP } from './skill-utils'

export function SkillsTab() {
  const { t } = useTranslation('common')
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
    setSearchPlaceholder(t('search.placeholder'))
    return () => setSearchPlaceholder(null)
  }, [setSearchPlaceholder, t])

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
          characterId={charData.owner.characterId}
          characterName={charData.owner.name}
          subtitle={`${formatSP(charData.skills.total_sp)} SP`}
        >
          <CharacterSkillsPanel data={charData} filter={search} />
        </CharacterPanel>
      ))}
    </div>
  )
}
