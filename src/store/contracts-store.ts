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
  getTotal: (prices: Map<number, number>, selectedOwnerIds: string[]) => number
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
let previousContracts: Map<number, ESIContract> | undefined
let pendingItemFetches = new Map<number, SourceOwner>()
let pendingItemDeletes = new Set<number>()

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
  rebuildExtraState: () => ({ itemsByContractId: new Map() }),

  onAfterInit: async () => {
    baseStore.setState({ itemsByContractId: await loadAllItems() })
  },

  onBeforeOwnerUpdate: (_owner, previousVisibility, itemsById) => {
    previousContracts = new Map()
    for (const id of previousVisibility) {
      const stored = itemsById.get(id)
      if (stored) previousContracts.set(id, stored.item)
    }
  },

  onAfterOwnerUpdate: ({ owner, newItems, previousVisibility, itemsById }) => {
    const prev = previousContracts ?? new Map()
    previousContracts = undefined

    const ownerId =
      owner.type === 'corporation' ? owner.id : owner.characterId
    const allOwners = Object.values(useAuthStore.getState().owners).filter(
      (o): o is Owner => !!o
    )
    const allOwnerIds = new Set(
      allOwners.map((o) => (o.type === 'corporation' ? o.id : o.characterId))
    )

    const toastStore = useToastStore.getState()
    const currentItems = baseStore.getState().itemsByContractId

    for (const contract of newItems) {
      const prevContract = prev.get(contract.contract_id)

      if (!prevContract) {
        // New contract - check if needs item fetch
        if (
          isActiveItemExchange(contract) &&
          !currentItems.has(contract.contract_id) &&
          !pendingItemFetches.has(contract.contract_id)
        ) {
          const stored = itemsById.get(contract.contract_id)
          if (stored) {
            pendingItemFetches.set(contract.contract_id, stored.sourceOwner)
          }
        }

        // Toast for new contract assigned to us
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

    // Collect contract IDs that this owner lost visibility to
    const currentIds = new Set(newItems.map((c) => c.contract_id))
    for (const id of previousVisibility) {
      if (!currentIds.has(id)) {
        pendingItemDeletes.add(id)
      }
    }
  },

  onAfterBatchUpdate: async (updatedItemsById) => {
    const toFetch = pendingItemFetches
    const toDelete = pendingItemDeletes
    pendingItemFetches = new Map<number, SourceOwner>()
    pendingItemDeletes = new Set<number>()

    if (toFetch.size === 0 && toDelete.size === 0) return

    const currentItems = new Map(baseStore.getState().itemsByContractId)
    let hasChanges = false

    if (toFetch.size > 0) {
      const results = await Promise.allSettled(
        Array.from(toFetch.entries()).map(async ([contractId, sourceOwner]) => {
          const items = await fetchItemsFromAPI(sourceOwner, contractId)
          return { contractId, items }
        })
      )

      const toSave: Array<{ contractId: number; items: ESIContractItem[] }> = []
      for (const result of results) {
        if (result.status === 'fulfilled') {
          currentItems.set(result.value.contractId, result.value.items)
          toSave.push(result.value)
          hasChanges = true
        } else {
          logger.error('Failed to fetch contract items', result.reason, {
            module: 'ContractsStore',
          })
        }
      }

      if (toSave.length > 0) {
        await saveItemsBatch(toSave)
      }
    }

    if (toDelete.size > 0) {
      const actualDeletes: number[] = []
      for (const id of toDelete) {
        if (!updatedItemsById.has(id) && currentItems.has(id)) {
          currentItems.delete(id)
          actualDeletes.push(id)
          hasChanges = true
        }
      }
      if (actualDeletes.length > 0) {
        await deleteItems(actualDeletes)
      }
    }

    if (hasChanges) {
      baseStore.setState({ itemsByContractId: currentItems })
      triggerResolution()
    }
  },
})

const originalClear = baseStore.getState().clear
baseStore.setState({
  clear: async () => {
    await originalClear()
    await clearItemsDb()
    pendingItemFetches = new Map<number, SourceOwner>()
    pendingItemDeletes = new Set<number>()
  },
})

export const useContractsStore: ContractsStore = Object.assign(baseStore, {
  getTotal(prices: Map<number, number>, selectedOwnerIds: string[]): number {
    const state = baseStore.getState()
    const selectedSet = new Set(selectedOwnerIds)
    const allOwners = Object.values(useAuthStore.getState().owners).filter(
      (o): o is Owner => !!o
    )
    const ownerCharIds = new Set(allOwners.map((o) => o.characterId))
    const ownerCorpIds = new Set(
      allOwners.filter((o) => o.corporationId).map((o) => o.corporationId)
    )

    const visibleIds = new Set<number>()
    for (const [key, ids] of state.visibilityByOwner) {
      if (selectedSet.has(key)) {
        for (const id of ids) visibleIds.add(id)
      }
    }

    let total = 0
    for (const contractId of visibleIds) {
      const stored = state.itemsById.get(contractId)
      if (!stored || !ACTIVE_STATUSES.has(stored.item.status)) continue

      total += stored.item.collateral ?? 0

      const items = state.itemsByContractId.get(contractId)
      if (stored.item.status === 'outstanding' && items) {
        const isIssuer =
          ownerCharIds.has(stored.item.issuer_id) ||
          ownerCorpIds.has(stored.item.issuer_corporation_id)
        if (isIssuer) {
          for (const item of items) {
            if (item.is_included) {
              total += (prices.get(item.type_id) ?? 0) * item.quantity
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
