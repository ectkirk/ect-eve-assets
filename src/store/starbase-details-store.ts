import { create } from 'zustand'
import { getStarbaseDetail, type ESIStarbaseDetail } from '@/api/endpoints/starbases'
import { logger } from '@/lib/logger'

interface StarbaseDetailKey {
  corporationId: number
  starbaseId: number
  systemId: number
  characterId: number
}

interface StarbaseDetailsState {
  details: Map<number, ESIStarbaseDetail>
  loading: Set<number>
  failed: Set<number>
}

interface StarbaseDetailsActions {
  fetchDetail: (key: StarbaseDetailKey) => Promise<ESIStarbaseDetail | null>
  getDetail: (starbaseId: number) => ESIStarbaseDetail | undefined
  clear: () => void
}

type StarbaseDetailsStore = StarbaseDetailsState & StarbaseDetailsActions

export const useStarbaseDetailsStore = create<StarbaseDetailsStore>((set, get) => ({
  details: new Map(),
  loading: new Set(),
  failed: new Set(),

  fetchDetail: async ({ corporationId, starbaseId, systemId, characterId }) => {
    const state = get()
    if (state.details.has(starbaseId) || state.loading.has(starbaseId)) {
      return state.details.get(starbaseId) ?? null
    }

    set((s) => ({ loading: new Set(s.loading).add(starbaseId) }))

    try {
      const detail = await getStarbaseDetail(characterId, corporationId, starbaseId, systemId)
      set((s) => {
        const newDetails = new Map(s.details)
        newDetails.set(starbaseId, detail)
        const newLoading = new Set(s.loading)
        newLoading.delete(starbaseId)
        return { details: newDetails, loading: newLoading }
      })
      return detail
    } catch (err) {
      logger.error('Failed to fetch starbase detail', err instanceof Error ? err : undefined, {
        module: 'StarbaseDetailsStore',
        starbaseId,
      })
      set((s) => {
        const newLoading = new Set(s.loading)
        newLoading.delete(starbaseId)
        const newFailed = new Set(s.failed)
        newFailed.add(starbaseId)
        return { loading: newLoading, failed: newFailed }
      })
      return null
    }
  },

  getDetail: (starbaseId) => get().details.get(starbaseId),

  clear: () => set({ details: new Map(), loading: new Set(), failed: new Set() }),
}))

const FUEL_BLOCK_TYPE_IDS = new Set([4051, 4246, 4247, 4312])
const STRONTIUM_TYPE_ID = 16275

export function calculateFuelHours(
  detail: ESIStarbaseDetail | undefined,
  towerSize: number | undefined,
  fuelTier: number | undefined
): number | null {
  if (!detail?.fuels || towerSize === undefined) return null

  const fuelBlocks = detail.fuels.find((f) => FUEL_BLOCK_TYPE_IDS.has(f.type_id))
  if (!fuelBlocks) return null

  const baseRate = towerSize * 10
  const discount = (fuelTier ?? 0) * 0.1
  const effectiveRate = baseRate * (1 - discount)

  if (effectiveRate <= 0) return null

  return fuelBlocks.quantity / effectiveRate
}

export function calculateStrontHours(
  detail: ESIStarbaseDetail | undefined,
  towerSize: number | undefined
): number | null {
  if (!detail?.fuels || towerSize === undefined) return null

  const stront = detail.fuels.find((f) => f.type_id === STRONTIUM_TYPE_ID)
  if (!stront) return null

  const rate = towerSize * 100
  return stront.quantity / rate
}
