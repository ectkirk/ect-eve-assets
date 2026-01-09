import { createAsyncCache } from '@/lib/async-cache'
import { getLanguage } from '@/store/settings-store'
import type {
  RefTypeCoreResult,
  RefTypeDogmaResult,
  RefTypeMarketResult,
  DogmaUnit,
  DogmaAttributeCategory,
} from '../../../../shared/electron-api-types'

export interface CombinedTypeData {
  core: RefTypeCoreResult
  dogma: RefTypeDogmaResult
  market: RefTypeMarketResult
}

const TYPE_DATA_CACHE_SIZE = 50
const typeDataCache = new Map<number, CombinedTypeData>()

export function getCachedTypeData(
  typeId: number
): CombinedTypeData | undefined {
  const cached = typeDataCache.get(typeId)
  if (cached) {
    typeDataCache.delete(typeId)
    typeDataCache.set(typeId, cached)
  }
  return cached
}

export function setCachedTypeData(
  typeId: number,
  data: CombinedTypeData
): void {
  typeDataCache.delete(typeId)
  if (typeDataCache.size >= TYPE_DATA_CACHE_SIZE) {
    const oldest = typeDataCache.keys().next().value
    if (oldest !== undefined) typeDataCache.delete(oldest)
  }
  typeDataCache.set(typeId, data)
}

const dogmaUnitsCache = createAsyncCache<Record<string, DogmaUnit>>(
  async () => {
    const result = await window.electronAPI?.refDogmaUnits({
      language: getLanguage(),
    })
    return result?.items ?? null
  }
)

const attrCategoriesCache = createAsyncCache<
  Record<string, DogmaAttributeCategory>
>(async () => {
  const result = await window.electronAPI?.refDogmaAttributeCategories({
    language: getLanguage(),
  })
  return result?.items ?? null
})

export const getDogmaUnits = dogmaUnitsCache.get
export const getAttributeCategories = attrCategoriesCache.get
