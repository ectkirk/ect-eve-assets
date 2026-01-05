import { saveAbyssalPricesToDB, saveJitaPricesToDB } from './price-db'

interface PriceState {
  jitaPrices: Map<number, number>
  abyssalPrices: Map<number, number>
  priceVersion: number
}

type StoreSet = (
  partial: Partial<PriceState> | ((state: PriceState) => Partial<PriceState>)
) => void

type StoreGet = () => PriceState

export async function storeAndPersistPrices(
  fetched: Map<number, number>,
  abyssalIdSet: Set<number>,
  set: StoreSet,
  get: StoreGet
): Promise<Map<number, number>> {
  const stored = new Map<number, number>()
  if (fetched.size === 0) return stored

  const jitaPriceUpdates: Array<{ typeId: number; price: number }> = []
  const abyssalUpdates: Array<{ itemId: number; price: number }> = []

  for (const [id, price] of fetched) {
    if (abyssalIdSet.has(id)) {
      abyssalUpdates.push({ itemId: id, price })
    } else {
      jitaPriceUpdates.push({ typeId: id, price })
      stored.set(id, price)
    }
  }

  if (abyssalUpdates.length > 0) {
    set((state) => {
      const merged = new Map(state.abyssalPrices)
      for (const { itemId, price } of abyssalUpdates) {
        const existing = merged.get(itemId)
        if (price > 0 || existing === undefined || existing === 0) {
          merged.set(itemId, price)
        }
      }
      return { abyssalPrices: merged }
    })

    for (const { itemId } of abyssalUpdates) {
      const actualPrice = get().abyssalPrices.get(itemId)
      if (actualPrice !== undefined && actualPrice > 0) {
        stored.set(itemId, actualPrice)
      }
    }

    const recordsToSave = abyssalUpdates.filter(({ itemId, price }) => {
      return get().abyssalPrices.get(itemId) === price
    })

    if (recordsToSave.length > 0) {
      await saveAbyssalPricesToDB(recordsToSave)
    }
  }

  if (jitaPriceUpdates.length > 0) {
    set((state) => {
      const merged = new Map(state.jitaPrices)
      for (const { typeId, price } of jitaPriceUpdates) {
        merged.set(typeId, price)
      }
      return { jitaPrices: merged, priceVersion: state.priceVersion + 1 }
    })

    await saveJitaPricesToDB(jitaPriceUpdates)
  }

  return stored
}
