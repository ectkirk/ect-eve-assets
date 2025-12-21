import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { useAuthStore, type Owner, type OwnerType, ownerKey as makeOwnerKey, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { logger } from '@/lib/logger'
import { triggerResolution } from '@/lib/data-resolver'

export interface SourceOwner {
  type: OwnerType
  id: number
  characterId: number
}

export interface StoredItem<T> {
  item: T
  sourceOwner: SourceOwner
}

interface VisibilityRecord {
  ownerKey: string
  itemIds: number[]
}

export interface VisibilityStoreConfig<TItem, TStoredItem extends StoredItem<TItem>> {
  name: string
  moduleName: string
  endpointPattern: string
  dbName: string
  itemStoreName: string
  itemKeyName: string
  getEndpoint: (owner: Owner) => string
  getItemId: (item: TItem) => number
  fetchData: (owner: Owner) => Promise<{ data: TItem[]; expiresAt: number; etag: string | null }>
  toStoredItem: (owner: Owner, item: TItem) => TStoredItem
  isEmpty?: (items: TItem[]) => boolean
  onAfterInit?: (itemsById: Map<number, TStoredItem>) => void
  onBeforeOwnerUpdate?: (owner: Owner, previousVisibility: Set<number>, itemsById: Map<number, TStoredItem>) => void
  onAfterOwnerUpdate?: (params: {
    owner: Owner
    newItems: TItem[]
    previousVisibility: Set<number>
    itemsById: Map<number, TStoredItem>
  }) => void
  onAfterBatchUpdate?: (itemsById: Map<number, TStoredItem>) => void
  shouldDeleteStaleItems?: boolean
}

export interface VisibilityState<TStoredItem> {
  itemsById: Map<number, TStoredItem>
  visibilityByOwner: Map<string, Set<number>>
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
  updateCounter: number
}

export interface VisibilityActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

export type VisibilityStore<TStoredItem> = VisibilityState<TStoredItem> & VisibilityActions

interface DBContext {
  db: IDBDatabase | null
  dbName: string
  itemStoreName: string
  visibilityStoreName: string
  itemKeyName: string
  moduleName: string
}

async function openDB(ctx: DBContext): Promise<IDBDatabase> {
  if (ctx.db) return ctx.db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ctx.dbName, 1)

    request.onerror = () => {
      logger.error(`Failed to open ${ctx.itemStoreName} DB`, request.error, { module: ctx.moduleName })
      reject(request.error)
    }

    request.onsuccess = () => {
      ctx.db = request.result
      resolve(ctx.db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(ctx.itemStoreName)) {
        database.createObjectStore(ctx.itemStoreName, { keyPath: ctx.itemKeyName })
      }
      if (!database.objectStoreNames.contains(ctx.visibilityStoreName)) {
        database.createObjectStore(ctx.visibilityStoreName, { keyPath: 'ownerKey' })
      }
    }
  })
}

async function loadFromDB<TStoredItem>(
  ctx: DBContext,
  toStoredItem: (record: Record<string, unknown>) => TStoredItem,
  getItemId: (stored: TStoredItem) => number
): Promise<{ items: Map<number, TStoredItem>; visibility: Map<string, Set<number>> }> {
  const database = await openDB(ctx)

  return new Promise((resolve, reject) => {
    const tx = database.transaction([ctx.itemStoreName, ctx.visibilityStoreName], 'readonly')
    const itemsStore = tx.objectStore(ctx.itemStoreName)
    const visibilityStore = tx.objectStore(ctx.visibilityStoreName)

    const itemsRequest = itemsStore.getAll()
    const visibilityRequest = visibilityStore.getAll()

    tx.oncomplete = () => {
      const items = new Map<number, TStoredItem>()
      for (const record of itemsRequest.result) {
        const stored = toStoredItem(record)
        items.set(getItemId(stored), stored)
      }

      const visibility = new Map<string, Set<number>>()
      for (const record of visibilityRequest.result as VisibilityRecord[]) {
        visibility.set(record.ownerKey, new Set(record.itemIds))
      }

      resolve({ items, visibility })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveItemsToDB<TStoredItem>(
  ctx: DBContext,
  items: Array<{ id: number; stored: TStoredItem }>,
  toRecord: (id: number, stored: TStoredItem) => Record<string, unknown>
): Promise<void> {
  if (items.length === 0) return
  const database = await openDB(ctx)

  return new Promise((resolve, reject) => {
    const tx = database.transaction([ctx.itemStoreName], 'readwrite')
    const store = tx.objectStore(ctx.itemStoreName)
    for (const { id, stored } of items) {
      store.put(toRecord(id, stored))
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteItemsFromDB(ctx: DBContext, itemIds: number[]): Promise<void> {
  if (itemIds.length === 0) return
  const database = await openDB(ctx)

  return new Promise((resolve, reject) => {
    const tx = database.transaction([ctx.itemStoreName], 'readwrite')
    const store = tx.objectStore(ctx.itemStoreName)
    for (const id of itemIds) {
      store.delete(id)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function saveVisibilityToDB(ctx: DBContext, ownerKeyStr: string, itemIds: Set<number>): Promise<void> {
  const database = await openDB(ctx)

  return new Promise((resolve, reject) => {
    const tx = database.transaction([ctx.visibilityStoreName], 'readwrite')
    const store = tx.objectStore(ctx.visibilityStoreName)
    store.put({ ownerKey: ownerKeyStr, itemIds: [...itemIds] } as VisibilityRecord)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteVisibilityFromDB(ctx: DBContext, ownerKeyStr: string): Promise<void> {
  const database = await openDB(ctx)

  return new Promise((resolve, reject) => {
    const tx = database.transaction([ctx.visibilityStoreName], 'readwrite')
    const store = tx.objectStore(ctx.visibilityStoreName)
    store.delete(ownerKeyStr)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(ctx: DBContext): Promise<void> {
  const database = await openDB(ctx)

  return new Promise((resolve, reject) => {
    const tx = database.transaction([ctx.itemStoreName, ctx.visibilityStoreName], 'readwrite')
    tx.objectStore(ctx.itemStoreName).clear()
    tx.objectStore(ctx.visibilityStoreName).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function collectVisibleItemIds(visibilityByOwner: Map<string, Set<number>>): Set<number> {
  const visible = new Set<number>()
  for (const itemIds of visibilityByOwner.values()) {
    for (const id of itemIds) visible.add(id)
  }
  return visible
}

function removeStaleItems<TStoredItem>(
  itemsById: Map<number, TStoredItem>,
  visibleIds: Set<number>
): number[] {
  const staleIds: number[] = []
  for (const itemId of itemsById.keys()) {
    if (!visibleIds.has(itemId)) {
      staleIds.push(itemId)
      itemsById.delete(itemId)
    }
  }
  return staleIds
}

export function createVisibilityStore<TItem, TStoredItem extends StoredItem<TItem>>(
  config: VisibilityStoreConfig<TItem, TStoredItem>
): UseBoundStore<StoreApi<VisibilityStore<TStoredItem>>> {
  const {
    name,
    moduleName,
    endpointPattern,
    dbName,
    itemStoreName,
    itemKeyName,
    getEndpoint,
    getItemId,
    fetchData,
    toStoredItem,
    isEmpty,
    onAfterInit,
    onBeforeOwnerUpdate,
    onAfterOwnerUpdate,
    onAfterBatchUpdate,
    shouldDeleteStaleItems = true,
  } = config

  const dbCtx: DBContext = {
    db: null,
    dbName,
    itemStoreName,
    visibilityStoreName: 'visibility',
    itemKeyName,
    moduleName,
  }

  const toRecord = (id: number, stored: TStoredItem): Record<string, unknown> => ({
    [itemKeyName]: id,
    item: stored.item,
    sourceOwner: stored.sourceOwner,
  })

  const fromRecord = (record: Record<string, unknown>): TStoredItem => ({
    item: record.item as TItem,
    sourceOwner: record.sourceOwner as SourceOwner,
  }) as TStoredItem

  const store = create<VisibilityStore<TStoredItem>>((set, get) => ({
    itemsById: new Map(),
    visibilityByOwner: new Map(),
    isUpdating: false,
    updateError: null,
    initialized: false,
    updateCounter: 0,

    init: async () => {
      if (get().initialized) return

      try {
        const { items, visibility } = await loadFromDB(dbCtx, fromRecord, (s) => getItemId(s.item))

        set((s) => ({
          itemsById: items,
          visibilityByOwner: visibility,
          initialized: true,
          updateCounter: s.updateCounter + 1,
        }))

        if (items.size > 0) {
          triggerResolution()
          onAfterInit?.(items)
        }

        logger.info(`${name} store initialized`, {
          module: moduleName,
          items: items.size,
          owners: visibility.size,
        })
      } catch (err) {
        logger.error(`Failed to load ${name} from DB`, err instanceof Error ? err : undefined, {
          module: moduleName,
        })
        set({ initialized: true })
      }
    },

    update: async (force = false) => {
      const state = get()
      if (!state.initialized) await get().init()
      if (get().isUpdating) return

      const allOwners = Object.values(useAuthStore.getState().owners)
      if (allOwners.length === 0) {
        set({ updateError: 'No owners logged in' })
        return
      }

      const expiryCacheStore = useExpiryCacheStore.getState()
      const ownersToUpdate = force
        ? allOwners.filter((o): o is Owner => o !== undefined && !o.authFailed)
        : allOwners.filter((owner): owner is Owner => {
            if (!owner || owner.authFailed) return false
            const key = `${owner.type}-${owner.id}`
            return expiryCacheStore.isExpired(key, getEndpoint(owner))
          })

      if (ownersToUpdate.length === 0) return

      set({ isUpdating: true, updateError: null })

      try {
        const itemsById = new Map(get().itemsById)
        const visibilityByOwner = new Map(get().visibilityByOwner)
        const itemBatch: Array<{ id: number; stored: TStoredItem }> = []

        for (const owner of ownersToUpdate) {
          const currentOwnerKey = makeOwnerKey(owner.type, owner.id)
          const endpoint = getEndpoint(owner)

          try {
            logger.info(`Fetching ${name}`, { module: moduleName, owner: owner.name })
            const { data: items, expiresAt, etag } = await fetchData(owner)

            const ownerVisibility = new Set<number>()
            for (const item of items) {
              const itemId = getItemId(item)
              ownerVisibility.add(itemId)

              if (!itemsById.has(itemId)) {
                const stored = toStoredItem(owner, item)
                itemsById.set(itemId, stored)
                itemBatch.push({ id: itemId, stored })
              }
            }

            visibilityByOwner.set(currentOwnerKey, ownerVisibility)
            await saveVisibilityToDB(dbCtx, currentOwnerKey, ownerVisibility)

            const isDataEmpty = isEmpty ? isEmpty(items) : items.length === 0
            useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag, isDataEmpty)
          } catch (err) {
            logger.error(`Failed to fetch ${name}`, err instanceof Error ? err : undefined, {
              module: moduleName,
              owner: owner.name,
            })
          }
        }

        await saveItemsToDB(dbCtx, itemBatch, toRecord)

        if (shouldDeleteStaleItems) {
          const visibleIds = collectVisibleItemIds(visibilityByOwner)
          const staleIds = removeStaleItems(itemsById, visibleIds)
          if (staleIds.length > 0) {
            await deleteItemsFromDB(dbCtx, staleIds)
            logger.info(`Cleaned up stale ${name}`, { module: moduleName, count: staleIds.length })
          }
        }

        onAfterBatchUpdate?.(itemsById)

        set((s) => ({
          itemsById,
          visibilityByOwner,
          isUpdating: false,
          updateError: itemsById.size === 0 ? `Failed to fetch any ${name}` : null,
          updateCounter: s.updateCounter + 1,
        }))

        triggerResolution()

        logger.info(`${name} updated`, {
          module: moduleName,
          owners: ownersToUpdate.length,
          totalItems: itemsById.size,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        set({ isUpdating: false, updateError: message })
        logger.error(`${name} update failed`, err instanceof Error ? err : undefined, { module: moduleName })
      }
    },

    updateForOwner: async (owner: Owner) => {
      const state = get()
      if (!state.initialized) await get().init()

      try {
        const currentOwnerKey = makeOwnerKey(owner.type, owner.id)
        const endpoint = getEndpoint(owner)
        const previousVisibility = state.visibilityByOwner.get(currentOwnerKey) ?? new Set()

        onBeforeOwnerUpdate?.(owner, previousVisibility, state.itemsById)

        logger.info(`Fetching ${name} for owner`, { module: moduleName, owner: owner.name })
        const { data: items, expiresAt, etag } = await fetchData(owner)

        const itemsById = new Map(state.itemsById)
        const visibilityByOwner = new Map(state.visibilityByOwner)
        const itemBatch: Array<{ id: number; stored: TStoredItem }> = []

        const ownerVisibility = new Set<number>()
        for (const item of items) {
          const itemId = getItemId(item)
          ownerVisibility.add(itemId)

          const stored = toStoredItem(owner, item)
          itemsById.set(itemId, stored)
          itemBatch.push({ id: itemId, stored })
        }

        await saveItemsToDB(dbCtx, itemBatch, toRecord)
        visibilityByOwner.set(currentOwnerKey, ownerVisibility)
        await saveVisibilityToDB(dbCtx, currentOwnerKey, ownerVisibility)

        onAfterOwnerUpdate?.({ owner, newItems: items, previousVisibility, itemsById })

        if (shouldDeleteStaleItems) {
          const visibleIds = collectVisibleItemIds(visibilityByOwner)
          const staleIds = removeStaleItems(itemsById, visibleIds)
          if (staleIds.length > 0) {
            await deleteItemsFromDB(dbCtx, staleIds)
            logger.info(`Cleaned up stale ${name}`, { module: moduleName, count: staleIds.length })
          }
        }

        const isDataEmpty = isEmpty ? isEmpty(items) : items.length === 0
        useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag, isDataEmpty)

        set((s) => ({
          itemsById,
          visibilityByOwner,
          updateCounter: s.updateCounter + 1,
        }))

        triggerResolution()

        logger.info(`${name} updated for owner`, {
          module: moduleName,
          owner: owner.name,
          items: items.length,
        })
      } catch (err) {
        logger.error(`Failed to fetch ${name} for owner`, err instanceof Error ? err : undefined, {
          module: moduleName,
          owner: owner.name,
        })
      }
    },

    removeForOwner: async (ownerType: string, ownerId: number) => {
      const state = get()
      const currentOwnerKey = `${ownerType}-${ownerId}`

      if (!state.visibilityByOwner.has(currentOwnerKey)) return

      const visibilityByOwner = new Map(state.visibilityByOwner)
      visibilityByOwner.delete(currentOwnerKey)

      await deleteVisibilityFromDB(dbCtx, currentOwnerKey)

      const itemsById = new Map(state.itemsById)
      if (shouldDeleteStaleItems) {
        const visibleIds = collectVisibleItemIds(visibilityByOwner)
        const staleIds = removeStaleItems(itemsById, visibleIds)
        if (staleIds.length > 0) {
          await deleteItemsFromDB(dbCtx, staleIds)
        }
      }

      set({ itemsById, visibilityByOwner })

      useExpiryCacheStore.getState().clearForOwner(currentOwnerKey)

      logger.info(`${name} removed for owner`, { module: moduleName, ownerKey: currentOwnerKey })
    },

    clear: async () => {
      await clearDB(dbCtx)
      set({
        itemsById: new Map(),
        visibilityByOwner: new Map(),
        updateError: null,
        initialized: false,
      })
    },
  }))

  useExpiryCacheStore.getState().registerRefreshCallback(endpointPattern, async (ownerKeyStr) => {
    const owner = findOwnerByKey(ownerKeyStr)
    if (!owner) {
      logger.warn('Owner not found for refresh', { module: moduleName, ownerKey: ownerKeyStr })
      return
    }
    await store.getState().updateForOwner(owner)
  })

  return store
}
