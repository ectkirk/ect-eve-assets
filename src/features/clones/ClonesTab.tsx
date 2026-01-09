import { useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useClonesStore } from '@/store/clones-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import {
  getType,
  getTypeName,
  getLocation,
  getStructure,
  useReferenceCacheStore,
} from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { getLocale } from '@/lib/utils'
import { CharacterPanel } from '@/components/ui/character-panel'
import {
  CharacterClonesPanel,
  type CloneInfo,
  type CharacterClonesData,
} from './CharacterClonesPanel'

interface ImplantInfo {
  typeId: number
  name: string
  slot: number
}

interface CharacterClones {
  ownerName: string
  ownerId: number
  clonesData: CharacterClonesData
  jumpCloneCount: number
}

function getImplantSlot(typeId: number): number {
  const type = getType(typeId)
  if (!type) return 99

  if (type.implantSlot !== undefined) return type.implantSlot

  const name = type.name.toLowerCase()
  for (let i = 1; i <= 10; i++) {
    if (name.includes(`slot ${i}`) || name.includes(`- ${i}`)) return i
  }
  return 99
}

export function ClonesTab() {
  const { t } = useTranslation('clones')
  const { t: tc } = useTranslation('common')
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

  const { search, setSearchPlaceholder, setRefreshAction } = useTabControls()

  useEffect(() => {
    init().then(() => update())
  }, [init, update])

  const handleRefresh = useCallback(() => {
    update(true)
  }, [update])

  useEffect(() => {
    setSearchPlaceholder(tc('search.placeholder'))
    return () => setSearchPlaceholder(null)
  }, [setSearchPlaceholder, tc])

  useEffect(() => {
    setRefreshAction({ onRefresh: handleRefresh, isRefreshing: isUpdating })
    return () => setRefreshAction(null)
  }, [setRefreshAction, handleRefresh, isUpdating])

  const types = useReferenceCacheStore((s) => s.types)
  const structures = useReferenceCacheStore((s) => s.structures)

  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const characterClones = useMemo(() => {
    void structures

    const getLocationName = (
      locationId: number,
      locationType: 'station' | 'structure'
    ): string => {
      if (locationType === 'structure') {
        return (
          getStructure(locationId)?.name ??
          t('fallback.structure', { id: locationId })
        )
      }
      return (
        getLocation(locationId)?.name ??
        t('fallback.location', { id: locationId })
      )
    }

    const result: CharacterClones[] = []

    const filteredClonesByOwner = clonesByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.characterId))
    )

    for (const { owner, clones, activeImplants } of filteredClonesByOwner) {
      const homeLocationId = clones.home_location?.location_id
      const homeLocationType = clones.home_location?.location_type ?? 'station'
      const homeLocationName = homeLocationId
        ? getLocationName(homeLocationId, homeLocationType)
        : t('fallback.unknown')

      const activeImplantInfos: ImplantInfo[] = activeImplants.map(
        (typeId) => ({
          typeId,
          name: getTypeName(typeId),
          slot: getImplantSlot(typeId),
        })
      )

      const activeClone: CloneInfo = {
        id: 0,
        name: t('activeClone'),
        locationId: homeLocationId ?? 0,
        locationName: homeLocationName,
        locationType: homeLocationType,
        implants: activeImplantInfos,
        isActive: true,
      }

      const jumpClones: CloneInfo[] = clones.jump_clones.map((jc) => {
        const implants: ImplantInfo[] = jc.implants.map((typeId) => ({
          typeId,
          name: getTypeName(typeId),
          slot: getImplantSlot(typeId),
        }))

        return {
          id: jc.jump_clone_id,
          name: jc.name ?? '',
          locationId: jc.location_id,
          locationName: getLocationName(jc.location_id, jc.location_type),
          locationType: jc.location_type,
          implants,
        }
      })

      result.push({
        ownerName: owner.name,
        ownerId: owner.characterId,
        clonesData: { activeClone, jumpClones },
        jumpCloneCount: jumpClones.length,
      })
    }

    return result.sort((a, b) =>
      a.ownerName.localeCompare(b.ownerName, getLocale())
    )
  }, [clonesByOwner, types, structures, selectedSet, t])

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
    <div className="flex h-full gap-4 overflow-x-auto p-1">
      {characterClones.map((char) => (
        <CharacterPanel
          key={char.ownerId}
          characterId={char.ownerId}
          characterName={char.ownerName}
          subtitle={t('subtitle', { count: char.jumpCloneCount })}
        >
          <CharacterClonesPanel data={char.clonesData} filter={search} />
        </CharacterPanel>
      ))}
    </div>
  )
}
