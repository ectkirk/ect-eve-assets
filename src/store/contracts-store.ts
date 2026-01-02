import type { StoreApi, UseBoundStore } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import {
  getContractItems,
  getCorporationContractItems,
  type ESIContract,
  type ESIContractItem,
} from '@/api/endpoints/contracts'
import { esi } from '@/api/esi'
import { ESIContractSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { ownerEndpoint } from '@/lib/owner-utils'
import { triggerResolution } from '@/lib/data-resolver'
import {
  createVisibilityStore,
  type StoredItem,
  type SourceOwner,
  type VisibilityStore,
} from './create-visibility-store'
import { usePriceStore, isAbyssalTypeId } from './price-store'
import { DB } from '@/lib/db-constants'
import {
  openDatabase,
  idbGetAll,
  idbPutBatch,
  idbDeleteBatch,
  idbClear,
} from '@/lib/idb-utils'

function isContractItemBpc(item: ESIContractItem): boolean {
  return item.is_blueprint_copy === true || item.raw_quantity === -2
}

export interface StoredContract extends StoredItem<ESIContract> {
  item: ESIContract
  sourceOwner: SourceOwner
}

export interface ContractWithItems {
  contract: ESIContract
  items?: ESIContractItem[]
}

export interface OwnerContracts {
  owner: Owner
  contracts: ContractWithItems[]
}

interface ContractsExtraState {
  itemsByContractId: Map<number, ESIContractItem[]>
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

function isActiveItemExchange(contract: ESIContract): boolean {
  return (
    contract.type === 'item_exchange' && ACTIVE_STATUSES.has(contract.status)
  )
}

function getEndpoint(owner: Owner): string {
  return ownerEndpoint(owner, 'contracts')
}

async function fetchItemsFromAPI(
  sourceOwner: SourceOwner,
  contractId: number
): Promise<ESIContractItem[]> {
  return sourceOwner.type === 'corporation'
    ? getCorporationContractItems(
        sourceOwner.characterId,
        sourceOwner.id,
        contractId
      )
    : getContractItems(sourceOwner.characterId, contractId)
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

function collectContractsToFetch(
  contractsById: Map<number, StoredContract>,
  itemsState: Map<number, ESIContractItem[]>
): Map<number, SourceOwner> {
  const toFetch = new Map<number, SourceOwner>()
  for (const [contractId, stored] of contractsById) {
    if (
      isActiveItemExchange(stored.item) &&
      !itemsState.has(contractId) &&
      !pendingItemFetches.has(contractId)
    ) {
      toFetch.set(contractId, stored.sourceOwner)
      pendingItemFetches.add(contractId)
    }
  }
  return toFetch
}

async function fetchAndSaveItems(
  toFetch: Map<number, SourceOwner>
): Promise<Array<{ contractId: number; items: ESIContractItem[] }>> {
  if (toFetch.size === 0) return []

  const results = await Promise.allSettled(
    Array.from(toFetch.entries()).map(async ([contractId, sourceOwner]) => {
      const items = await fetchItemsFromAPI(sourceOwner, contractId)
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

function clearPendingFetches(toFetch: Map<number, SourceOwner>): void {
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

  extraState: { itemsByContractId: new Map() },
  rebuildExtraState: undefined,

  onAfterInit: async () => {
    const loadedItems = await loadAllItems()
    baseStore.setState({ itemsByContractId: loadedItems })

    const typeIds = new Set<number>()
    const abyssalItemIds: number[] = []
    for (const items of loadedItems.values()) {
      if (items) {
        for (const item of items) {
          typeIds.add(item.type_id)
          if (item.item_id && isAbyssalTypeId(item.type_id)) {
            abyssalItemIds.push(item.item_id)
          }
        }
      }
    }

    if (typeIds.size > 0 || abyssalItemIds.length > 0) {
      const { usePriceStore } = await import('./price-store')
      await usePriceStore
        .getState()
        .ensureJitaPrices(Array.from(typeIds), abyssalItemIds)
      triggerResolution()
    }
  },

  onAfterOwnerUpdate: ({ itemsById }) => {
    fetchItemsForContracts(itemsById)
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
                isBlueprintCopy: isContractItemBpc(item),
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
    const result: OwnerContracts[] = []

    for (const [ownerKey, contractIds] of state.visibilityByOwner) {
      const owner = findOwnerByKey(ownerKey)
      if (!owner) continue

      const contracts: ContractWithItems[] = []
      for (const contractId of contractIds) {
        const stored = state.itemsById.get(contractId)
        if (stored) {
          contracts.push({
            contract: stored.item,
            items: state.itemsByContractId.get(contractId),
          })
        }
      }
      result.push({ owner, contracts })
    }
    return result
  },
})
