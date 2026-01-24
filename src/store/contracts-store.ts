import type { StoreApi, UseBoundStore } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import {
  getContractItems,
  getCorporationContractItems,
  getPublicContractItems,
  getCharacterContractBids,
  getCorporationContractBids,
  getPublicContractBids,
  type ESIContract,
  type ESIContractItem,
  type ESIContractBid,
} from '@/api/endpoints/contracts'
import { esi } from '@/api/esi'
import { ESIContractSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { ownerEndpoint } from '@/lib/owner-utils'
import {
  triggerResolution,
  registerCollector,
  needsTypeResolution,
  hasLocation,
  hasStructure,
  hasName,
  PLAYER_STRUCTURE_ID_THRESHOLD,
  type ResolutionIds,
} from '@/lib/data-resolver'
import {
  createVisibilityStore,
  type StoredItem,
  type SourceOwner,
  type VisibilityStore,
} from './create-visibility-store'
import { usePriceStore, extractPriceableIds } from './price-store'
import { shouldValueBlueprintAtZero } from '@/lib/contract-items'
import { DB } from '@/lib/db-constants'
import {
  openDatabase,
  idbGetAll,
  idbPutBatch,
  idbDeleteBatch,
  idbClear,
} from '@/lib/idb-utils'

export interface StoredContract extends StoredItem<ESIContract> {
  item: ESIContract
  sourceOwner: SourceOwner
}

export interface ContractWithItems {
  contract: ESIContract
  items?: ESIContractItem[]
  highestBid?: number
}

export interface OwnerContracts {
  owner: Owner
  contracts: ContractWithItems[]
}

interface ContractsExtraState {
  itemsByContractId: Map<number, ESIContractItem[]>
  bidsByContractId: Map<number, number>
}

interface ContractsExtras {
  getTotal: (
    selectedOwnerIds: string[],
    state?: {
      itemsById: Map<number, StoredContract>
      visibilityByOwner: Map<string, Set<number>>
      itemsByContractId: Map<number, ESIContractItem[]>
    }
  ) => number
  getContractsByOwner: () => OwnerContracts[]
}

export type ContractsStore = UseBoundStore<
  StoreApi<VisibilityStore<StoredContract, ContractsExtraState>>
> &
  ContractsExtras

const ACTIVE_STATUSES = new Set(['outstanding', 'in_progress'])

export function buildOwnerContracts(
  visibilityByOwner: Map<string, Set<number>>,
  itemsById: Map<number, StoredContract>,
  itemsByContractId: Map<number, ESIContractItem[]>,
  bidsByContractId: Map<number, number> = new Map()
): OwnerContracts[] {
  const result: OwnerContracts[] = []
  for (const [key, contractIds] of visibilityByOwner) {
    const owner = findOwnerByKey(key)
    if (!owner) continue
    const contracts: ContractWithItems[] = []
    for (const contractId of contractIds) {
      const stored = itemsById.get(contractId)
      if (stored) {
        contracts.push({
          contract: stored.item,
          items: itemsByContractId.get(contractId),
          highestBid: bidsByContractId.get(contractId),
        })
      }
    }
    result.push({ owner, contracts })
  }
  return result
}

function shouldFetchItems(contract: ESIContract): boolean {
  return (
    (contract.type === 'item_exchange' || contract.type === 'auction') &&
    ACTIVE_STATUSES.has(contract.status)
  )
}

function shouldFetchBids(contract: ESIContract): boolean {
  return contract.type === 'auction' && ACTIVE_STATUSES.has(contract.status)
}

function getEndpoint(owner: Owner): string {
  return ownerEndpoint(owner, 'contracts')
}

async function fetchItemsFromAPI(
  sourceOwner: SourceOwner,
  contractId: number,
  isPublic: boolean
): Promise<ESIContractItem[]> {
  if (isPublic) {
    return getPublicContractItems(contractId)
  }
  return sourceOwner.type === 'corporation'
    ? getCorporationContractItems(
        sourceOwner.characterId,
        sourceOwner.id,
        contractId
      )
    : getContractItems(sourceOwner.characterId, contractId)
}

async function fetchBidsFromAPI(
  sourceOwner: SourceOwner,
  contractId: number,
  isPublic: boolean
): Promise<ESIContractBid[]> {
  if (isPublic) {
    return getPublicContractBids(contractId)
  }
  return sourceOwner.type === 'corporation'
    ? getCorporationContractBids(
        sourceOwner.characterId,
        sourceOwner.id,
        contractId
      )
    : getCharacterContractBids(sourceOwner.characterId, contractId)
}

function getHighestBid(bids: ESIContractBid[]): number | undefined {
  if (bids.length === 0) return undefined
  return Math.max(...bids.map((b) => b.amount))
}

const ITEMS_STORE = 'items'

interface StoredContractItems {
  contractId: number
  items: ESIContractItem[]
}

async function getItemsDb() {
  return openDatabase(DB.CONTRACT_ITEMS)
}

async function loadAllItems(): Promise<Map<number, ESIContractItem[]>> {
  const db = await getItemsDb()
  const records = await idbGetAll<StoredContractItems>(db, ITEMS_STORE)
  const map = new Map<number, ESIContractItem[]>()
  for (const r of records) {
    map.set(r.contractId, r.items)
  }
  return map
}

async function saveItemsBatch(
  items: Array<{ contractId: number; items: ESIContractItem[] }>
): Promise<void> {
  if (items.length === 0) return
  const db = await getItemsDb()
  await idbPutBatch(db, ITEMS_STORE, items)
}

async function deleteItems(contractIds: number[]): Promise<void> {
  if (contractIds.length === 0) return
  const db = await getItemsDb()
  await idbDeleteBatch(db, ITEMS_STORE, contractIds)
}

async function clearItemsDb(): Promise<void> {
  const db = await getItemsDb()
  await idbClear(db, ITEMS_STORE)
}

const pendingItemFetches = new Set<number>()

interface ContractFetchInfo {
  sourceOwner: SourceOwner
  isPublic: boolean
}

function collectContractsToFetch(
  contractsById: Map<number, StoredContract>,
  itemsState: Map<number, ESIContractItem[]>
): Map<number, ContractFetchInfo> {
  const toFetch = new Map<number, ContractFetchInfo>()
  for (const [contractId, stored] of contractsById) {
    if (
      shouldFetchItems(stored.item) &&
      !itemsState.has(contractId) &&
      !pendingItemFetches.has(contractId)
    ) {
      toFetch.set(contractId, {
        sourceOwner: stored.sourceOwner,
        isPublic: stored.item.availability === 'public',
      })
      pendingItemFetches.add(contractId)
    }
  }
  return toFetch
}

async function fetchAndSaveItems(
  toFetch: Map<number, ContractFetchInfo>
): Promise<Array<{ contractId: number; items: ESIContractItem[] }>> {
  if (toFetch.size === 0) return []

  const results = await Promise.allSettled(
    Array.from(toFetch.entries()).map(async ([contractId, info]) => {
      const items = await fetchItemsFromAPI(
        info.sourceOwner,
        contractId,
        info.isPublic
      )
      return { contractId, items }
    })
  )

  const fetched: Array<{ contractId: number; items: ESIContractItem[] }> = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      fetched.push(result.value)
    } else {
      logger.error('Failed to fetch contract items', result.reason, {
        module: 'ContractsStore',
      })
    }
  }

  if (fetched.length > 0) {
    await saveItemsBatch(fetched)
  }

  return fetched
}

function clearPendingFetches(toFetch: Map<number, ContractFetchInfo>): void {
  for (const contractId of toFetch.keys()) {
    pendingItemFetches.delete(contractId)
  }
}

async function fetchItemsForContracts(
  contractsById: Map<number, StoredContract>
): Promise<void> {
  const itemsState = baseStore.getState().itemsByContractId
  const toFetch = collectContractsToFetch(contractsById, itemsState)

  if (toFetch.size === 0) return

  try {
    const fetched = await fetchAndSaveItems(toFetch)

    if (fetched.length > 0) {
      const currentState = baseStore.getState()
      const currentItems = new Map(currentState.itemsByContractId)
      const typeIds = new Set<number>()
      for (const { contractId, items } of fetched) {
        if (!currentState.itemsById.has(contractId)) continue
        currentItems.set(contractId, items)
        if (items) {
          for (const item of items) {
            typeIds.add(item.type_id)
          }
        }
      }
      baseStore.setState({
        itemsByContractId: currentItems,
      })

      if (typeIds.size > 0) {
        const { usePriceStore } = await import('./price-store')
        await usePriceStore.getState().ensureJitaPrices(Array.from(typeIds))
      }

      triggerResolution()
    }
  } finally {
    clearPendingFetches(toFetch)
  }
}

const pendingBidFetches = new Set<number>()

function collectAuctionsToFetchBids(
  contractsById: Map<number, StoredContract>
): Map<number, ContractFetchInfo> {
  const toFetch = new Map<number, ContractFetchInfo>()
  for (const [contractId, stored] of contractsById) {
    if (shouldFetchBids(stored.item) && !pendingBidFetches.has(contractId)) {
      toFetch.set(contractId, {
        sourceOwner: stored.sourceOwner,
        isPublic: stored.item.availability === 'public',
      })
      pendingBidFetches.add(contractId)
    }
  }
  return toFetch
}

async function fetchBidsForAuctions(
  contractsById: Map<number, StoredContract>
): Promise<void> {
  const toFetch = collectAuctionsToFetchBids(contractsById)

  if (toFetch.size === 0) return

  try {
    const results = await Promise.allSettled(
      Array.from(toFetch.entries()).map(async ([contractId, info]) => {
        const bids = await fetchBidsFromAPI(
          info.sourceOwner,
          contractId,
          info.isPublic
        )
        return { contractId, highestBid: getHighestBid(bids) }
      })
    )

    const fetched: Array<{
      contractId: number
      highestBid: number | undefined
    }> = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        fetched.push(result.value)
      } else {
        logger.error('Failed to fetch contract bids', result.reason, {
          module: 'ContractsStore',
        })
      }
    }

    if (fetched.length > 0) {
      const currentState = baseStore.getState()
      const currentBids = new Map(currentState.bidsByContractId)
      for (const { contractId, highestBid } of fetched) {
        if (!currentState.itemsById.has(contractId)) continue
        if (highestBid !== undefined) {
          currentBids.set(contractId, highestBid)
        } else {
          currentBids.delete(contractId)
        }
      }
      baseStore.setState({ bidsByContractId: currentBids })
    }
  } finally {
    for (const contractId of toFetch.keys()) {
      pendingBidFetches.delete(contractId)
    }
  }
}

const baseStore = createVisibilityStore<
  ESIContract,
  StoredContract,
  ContractsExtraState
>({
  name: 'contracts',
  moduleName: 'ContractsStore',
  endpointPattern: '/contracts',
  dbName: 'ecteveassets-contracts-v3',
  itemStoreName: 'contracts',
  itemKeyName: 'contractId',
  getEndpoint,
  getItemId: (c) => c.contract_id,
  fetchData: async (owner) => {
    const result = await esi.fetchPaginatedWithMeta<ESIContract>(
      getEndpoint(owner),
      { characterId: owner.characterId, schema: ESIContractSchema }
    )
    if (owner.type === 'character') {
      result.data = result.data.filter((c) => !c.for_corporation)
    }
    return result
  },
  toStoredItem: (owner, contract) => ({
    item: contract,
    sourceOwner: {
      type: owner.type,
      id: owner.id,
      characterId: owner.characterId,
    },
  }),
  shouldUpdateExisting: true,
  shouldDeleteStaleItems: true,

  extraState: { itemsByContractId: new Map(), bidsByContractId: new Map() },
  rebuildExtraState: undefined,

  onAfterInit: async () => {
    const loadedItems = await loadAllItems()
    baseStore.setState({ itemsByContractId: loadedItems })

    const allItems = Array.from(loadedItems.values()).flat().filter(Boolean)
    const { typeIds, abyssalItemIds } = extractPriceableIds(allItems)

    if (typeIds.length > 0 || abyssalItemIds.length > 0) {
      const { usePriceStore } = await import('./price-store')
      await usePriceStore.getState().ensureJitaPrices(typeIds, abyssalItemIds)
      triggerResolution()
    }
  },

  onAfterOwnerUpdate: ({ itemsById }) => {
    fetchItemsForContracts(itemsById)
    fetchBidsForAuctions(itemsById)
  },

  onAfterBatchUpdate: async (updatedItemsById) => {
    const itemsState = baseStore.getState().itemsByContractId
    const toFetch = collectContractsToFetch(updatedItemsById, itemsState)

    const toDelete: number[] = []
    for (const contractId of itemsState.keys()) {
      if (!updatedItemsById.has(contractId)) {
        toDelete.push(contractId)
      }
    }

    if (toFetch.size === 0 && toDelete.length === 0) return

    try {
      const currentItems = new Map(baseStore.getState().itemsByContractId)
      let hasChanges = false
      const typeIds = new Set<number>()

      if (toFetch.size > 0) {
        const fetched = await fetchAndSaveItems(toFetch)
        for (const { contractId, items } of fetched) {
          currentItems.set(contractId, items)
          hasChanges = true
          if (items) {
            for (const item of items) {
              typeIds.add(item.type_id)
            }
          }
        }
      }

      if (toDelete.length > 0) {
        for (const id of toDelete) {
          currentItems.delete(id)
        }
        await deleteItems(toDelete)
        hasChanges = true
      }

      if (hasChanges) {
        baseStore.setState({
          itemsByContractId: currentItems,
        })

        if (typeIds.size > 0) {
          const { usePriceStore } = await import('./price-store')
          await usePriceStore.getState().ensureJitaPrices(Array.from(typeIds))
        }

        triggerResolution()
      }
    } finally {
      clearPendingFetches(toFetch)
    }
  },
})

const originalClear = baseStore.getState().clear
baseStore.setState({
  clear: async () => {
    pendingItemFetches.clear()
    pendingBidFetches.clear()
    await originalClear()
    await clearItemsDb()
  },
})

export const useContractsStore: ContractsStore = Object.assign(baseStore, {
  getTotal(
    selectedOwnerIds: string[],
    stateOverride?: {
      itemsById: Map<number, StoredContract>
      visibilityByOwner: Map<string, Set<number>>
      itemsByContractId: Map<number, ESIContractItem[]>
    }
  ): number {
    const { itemsById, visibilityByOwner, itemsByContractId } =
      stateOverride ?? baseStore.getState()
    const selectedSet = new Set(selectedOwnerIds)
    const allOwners = Object.values(useAuthStore.getState().owners).filter(
      (o): o is Owner => !!o
    )
    const ownerCharIds = new Set(allOwners.map((o) => o.characterId))
    const ownerCorpIds = new Set(
      allOwners.filter((o) => o.corporationId).map((o) => o.corporationId)
    )

    const visibleIds = new Set<number>()
    for (const [key, ids] of visibilityByOwner) {
      if (selectedSet.has(key)) {
        for (const id of ids) visibleIds.add(id)
      }
    }

    const priceStore = usePriceStore.getState()
    let total = 0
    for (const contractId of visibleIds) {
      const stored = itemsById.get(contractId)
      if (!stored || !ACTIVE_STATUSES.has(stored.item.status)) continue

      total += stored.item.collateral ?? 0

      const items = itemsByContractId.get(contractId)
      if (stored.item.status === 'outstanding' && items) {
        const isIssuer =
          ownerCharIds.has(stored.item.issuer_id) ||
          ownerCorpIds.has(stored.item.issuer_corporation_id)
        if (isIssuer) {
          for (const item of items) {
            if (item.is_included) {
              const price = priceStore.getItemPrice(item.type_id, {
                itemId: item.item_id,
                isBlueprintCopy: shouldValueBlueprintAtZero(
                  item,
                  stored.item.availability
                ),
              })
              total += price * item.quantity
            }
          }
        }
      }
    }
    return total
  },

  getContractsByOwner(): OwnerContracts[] {
    const state = baseStore.getState()
    return buildOwnerContracts(
      state.visibilityByOwner,
      state.itemsById,
      state.itemsByContractId,
      state.bidsByContractId
    )
  },
})

registerCollector('contracts', (ids: ResolutionIds) => {
  const contractsByOwner = useContractsStore.getContractsByOwner()

  const checkLocation = (
    locationId: number | undefined,
    characterId: number
  ) => {
    if (!locationId) return
    if (locationId >= PLAYER_STRUCTURE_ID_THRESHOLD) {
      if (!hasStructure(locationId)) {
        ids.structureToCharacter.set(locationId, characterId)
      }
    } else if (!hasLocation(locationId)) {
      ids.locationIds.add(locationId)
    }
  }

  for (const { owner, contracts } of contractsByOwner) {
    for (const { contract, items } of contracts) {
      checkLocation(contract.start_location_id, owner.characterId)
      checkLocation(contract.end_location_id, owner.characterId)

      if (!hasName(contract.issuer_id)) {
        ids.entityIds.add(contract.issuer_id)
      }
      if (contract.assignee_id && !hasName(contract.assignee_id)) {
        ids.entityIds.add(contract.assignee_id)
      }
      if (contract.acceptor_id && !hasName(contract.acceptor_id)) {
        ids.entityIds.add(contract.acceptor_id)
      }

      if (items) {
        for (const item of items) {
          if (needsTypeResolution(item.type_id)) {
            ids.typeIds.add(item.type_id)
          }
        }
      }
    }
  }
})
