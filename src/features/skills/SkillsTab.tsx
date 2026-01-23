import { useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useSkillsStore } from '@/store/skills-store'
import { useTabControls, type CharacterSortValue } from '@/context'
import { useLocalStorageSort } from '@/hooks/useLocalStorageSort'
import { getLocale } from '@/lib/utils'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { CharacterPanel } from '@/components/ui/character-panel'
import { CharacterSkillsPanel } from './CharacterSkillsPanel'
import { formatSP } from './skill-utils'

export function SkillsTab() {
  const { t } = useTranslation('common')
  const hasCharacters = useAuthStore((s) =>
    Object.values(s.owners).some((o) => o.type === 'character')
  )
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const skillsByOwner = useSkillsStore((s) => s.dataByOwner)
  const isUpdating = useSkillsStore((s) => s.isUpdating)
  const updateError = useSkillsStore((s) => s.updateError)
  const init = useSkillsStore((s) => s.init)
  const update = useSkillsStore((s) => s.update)
  const initialized = useSkillsStore((s) => s.initialized)

  const { search, setSearchPlaceholder, setRefreshAction, setCharacterSort } =
    useTabControls()

  const [sortBy, setSortBy] = useLocalStorageSort<CharacterSortValue>(
    'ecteve:sort:skills',
    'name'
  )

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

  useEffect(() => {
    setCharacterSort({
      options: [
        { value: 'name', label: t('sort.name') },
        { value: 'metric', label: t('sort.highestSP') },
      ],
      value: sortBy,
      onChange: setSortBy,
    })
    return () => setCharacterSort(null)
  }, [setCharacterSort, sortBy, t])

  const sortedSkillsByOwner = useMemo(
    () =>
      skillsByOwner
        .filter((data) =>
          selectedSet.has(ownerKey(data.owner.type, data.owner.characterId))
        )
        .sort((a, b) => {
          if (sortBy === 'metric') {
            const diff = b.skills.total_sp - a.skills.total_sp
            if (diff !== 0) return diff
          }
          return a.owner.name.localeCompare(b.owner.name, getLocale())
        }),
    [skillsByOwner, selectedSet, sortBy]
  )

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
      {sortedSkillsByOwner.map((charData) => (
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
