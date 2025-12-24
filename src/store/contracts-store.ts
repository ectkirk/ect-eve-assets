import type { StoreApi, UseBoundStore } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import { useToastStore } from './toast-store'
import {
  getContractItems,
  getCorporationContractItems,
  type ESIContract,
  type ESIContractItem,
} from '@/api/endpoints/contracts'
import { esi } from '@/api/esi'
import { ESIContractSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { formatNumber } from '@/lib/utils'
import { triggerResolution } from '@/lib/data-resolver'
import {
  createVisibilityStore,
  type StoredItem,
  type SourceOwner,
  type VisibilityStore,
} from './create-visibility-store'
import { usePriceStore, isAbyssalTypeId } from './price-store'

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
  return owner.type === 'corporation'
    ? `/corporations/${owner.id}/contracts/`
    : `/characters/${owner.characterId}/contracts/`
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

// Items DB with cached connection
const ITEMS_DB_NAME = 'ecteveassets-contract-items-v1'
let itemsDbConnection: IDBDatabase | null = null

async function getItemsDb(): Promise<IDBDatabase> {
  if (itemsDbConnection) return itemsDbConnection
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ITEMS_DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      itemsDbConnection = request.result
      resolve(itemsDbConnection)
    }
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('items')) {
        db.createObjectStore('items', { keyPath: 'contractId' })
      }
    }
  })
}

async function loadAllItems(): Promise<Map<number, ESIContractItem[]>> {
  const db = await getItemsDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['items'], 'readonly')
    const request = tx.objectStore('items').getAll()
    tx.oncomplete = () => {
      const map = new Map<number, ESIContractItem[]>()
      for (const r of request.result) map.set(r.contractId, r.items)
      resolve(map)
    }
    tx.onerror = () => reject(tx.error)
  })
}

async function saveItemsBatch(
  items: Array<{ contractId: number; items: ESIContractItem[] }>
): Promise<void> {
  if (items.length === 0) return
  const db = await getItemsDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['items'], 'readwrite')
    const store = tx.objectStore('items')
    for (const { contractId, items: contractItems } of items) {
      store.put({ contractId, items: contractItems })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteItems(contractIds: number[]): Promise<void> {
  if (contractIds.length === 0) return
  const db = await getItemsDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['items'], 'readwrite')
    const store = tx.objectStore('items')
    for (const id of contractIds) store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearItemsDb(): Promise<void> {
  const db = await getItemsDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['items'], 'readwrite')
    tx.objectStore('items').clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Module state for hook coordination
const previousContractsByOwner = new Map<string, Map<number, ESIContract>>()
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
      const currentItems = new Map(baseStore.getState().itemsByContractId)
      const typeIds = new Set<number>()
      for (const { contractId, items } of fetched) {
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
  endpointPattern: '/contracts/',
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

  onBeforeOwnerUpdate: (owner, previousVisibility, itemsById) => {
    const ownerKey = `${owner.type}-${owner.id}`
    previousContractsByOwner.delete(ownerKey)
    const prev = new Map<number, ESIContract>()
    for (const id of previousVisibility) {
      const stored = itemsById.get(id)
      if (stored) prev.set(id, stored.item)
    }
    previousContractsByOwner.set(ownerKey, prev)
  },

  onAfterOwnerUpdate: ({ owner, newItems, itemsById }) => {
    const ownerKey = `${owner.type}-${owner.id}`
    const prev = previousContractsByOwner.get(ownerKey) ?? new Map()
    previousContractsByOwner.delete(ownerKey)

    const ownerId = owner.type === 'corporation' ? owner.id : owner.characterId
    const allOwners = Object.values(useAuthStore.getState().owners).filter(
      (o): o is Owner => !!o
    )
    const allOwnerIds = new Set(
      allOwners.map((o) => (o.type === 'corporation' ? o.id : o.characterId))
    )

    const toastStore = useToastStore.getState()

    for (const contract of newItems) {
      const prevContract = prev.get(contract.contract_id)

      if (!prevContract) {
        if (
          contract.assignee_id === ownerId &&
          !allOwnerIds.has(contract.issuer_id) &&
          contract.status === 'outstanding'
        ) {
          toastStore.addToast(
            'contract-accepted',
            'New Contract Assigned',
            contract.price
              ? `${formatNumber(contract.price)} ISK`
              : 'Item exchange'
          )
        }
      } else if (
        (prevContract.status === 'outstanding' ||
          prevContract.status === 'in_progress') &&
        contract.status === 'finished' &&
        (owner.type === 'corporation'
          ? contract.issuer_corporation_id === owner.id
          : contract.issuer_id === owner.characterId) &&
        !allOwnerIds.has(contract.acceptor_id)
      ) {
        toastStore.addToast(
          'contract-accepted',
          'Contract Completed',
          contract.price
            ? `${formatNumber(contract.price)} ISK`
            : 'Item exchange'
        )
      }
    }

    // Fetch items for single-owner updates (updateForOwner doesn't call onAfterBatchUpdate)
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
                isBlueprintCopy: item.is_blueprint_copy,
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
