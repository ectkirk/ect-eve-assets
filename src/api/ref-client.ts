export {
  loadReferenceData,
  _resetForTests,
  type ReferenceDataProgress,
} from './ref-data-loader'

export {
  loadUniverseData,
  loadRefStructures,
  resolveTypes,
  resolveLocations,
} from './ref-universe-loader'

export {
  fetchPrices,
  queuePriceRefresh,
  fetchMarketComparison,
  fetchImplantSlots,
  type MarketBulkItem,
  type MarketComparisonPrices,
} from './ref-market'

import { RefTypeSchema } from './schemas'
import { z } from 'zod'
export type RefType = z.infer<typeof RefTypeSchema>
