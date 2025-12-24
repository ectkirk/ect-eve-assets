import { create, type StoreApi, type UseBoundStore } from 'zustand'
import {
  useAuthStore,
  type Owner,
  ownerKey as makeOwnerKey,
  findOwnerByKey,
} from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { logger } from '@/lib/logger'
import { triggerResolution } from '@/lib/data-resolver'
import {
  createVisibilityDB,
  type SourceOwner,
  type StoredItem,
} from '@/lib/visibility-indexed-db'
import { useStoreRegistry } from './store-registry'

export type { SourceOwner, StoredItem }

export interface VisibilityStoreConfig<
  TItem,
  TStoredItem extends StoredItem<TItem>,
  TExtraState extends object = object,
  TExtraActions extends object = object,
> {
  name: string
  moduleName: string
  endpointPattern: string
  dbName: string
  itemStoreName: string
  itemKeyName: string
  getEndpoint: (owner: Owner) => string
  getItemId: (item: TItem) => number
  fetchData: (
    owner: Owner
  ) => Promise<{ data: TItem[]; expiresAt: number; etag: string | null }>
  toStoredItem: (owner: Owner, item: TItem) => TStoredItem
  isEmpty?: (items: TItem[]) => boolean
  onAfterInit?: (itemsById: Map<number, TStoredItem>) => void
  onBeforeOwnerUpdate?: (
    owner: Owner,
    previousVisibility: Set<number>,
    itemsById: Map<number, TStoredItem>
  ) => void
  onAfterOwnerUpdate?: (params: {
    owner: Owner
    newItems: TItem[]
    previousVisibility: Set<number>
    itemsById: Map<number, TStoredItem>
  }) => void
  onAfterBatchUpdate?: (itemsById: Map<number, TStoredItem>) => void
  shouldDeleteStaleItems?: boolean
  shouldUpdateExisting?: boolean
  extraState?: TExtraState
  rebuildExtraState?: (
    itemsById: Map<number, TStoredItem>
  ) => Partial<TExtraState>
  extraActions?: (
    set: (partial: Partial<VisibilityState<TStoredItem> & TExtraState>) => void,
    get: () => VisibilityState<TStoredItem> &
      VisibilityActions &
      TExtraState &
      TExtraActions
  ) => TExtraActions
}

export interface VisibilityState<TStoredItem> {
  itemsById: Map<number, TStoredItem>
  visibilityByOwner: Map<string, Set<number>>
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

export interface VisibilityActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

export type VisibilityStore<
  TStoredItem,
  TExtraState extends object = object,
  TExtraActions extends object = object,
> = VisibilityState<TStoredItem> &
  VisibilityActions &
  TExtraState &
  TExtraActions

function collectVisibleItemIds(
  visibilityByOwner: Map<string, Set<number>>
): Set<number> {
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

export function createVisibilityStore<
  TItem,
  TStoredItem extends StoredItem<TItem>,
  TExtraState extends object = object,
  TExtraActions extends object = object,
>(
  config: VisibilityStoreConfig<TItem, TStoredItem, TExtraState, TExtraActions>
): UseBoundStore<
  StoreApi<VisibilityStore<TStoredItem, TExtraState, TExtraActions>>
> {
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
    shouldUpdateExisting = false,
    extraState,
    rebuildExtraState,
    extraActions,
  } = config

  const db = createVisibilityDB<TItem, TStoredItem>(
    { dbName, itemStoreName, itemKeyName, moduleName },
    (stored) => getItemId(stored.item)
  )

  type FullStore = VisibilityStore<TStoredItem, TExtraState, TExtraActions>
  type FullState = VisibilityState<TStoredItem> & TExtraState

  let initPromise: Promise<void> | null = null

  const store = create<FullStore>((set, get) => {
    const baseSet = (partial: Partial<FullState>) =>
      set(partial as Partial<FullStore>)

    const extras = extraActions
      ? extraActions(baseSet, get as () => FullStore)
      : ({} as TExtraActions)

    return {
      itemsById: new Map(),
      visibilityByOwner: new Map(),
      isUpdating: false,
      updateError: null,
      initialized: false,
      ...(extraState ?? ({} as TExtraState)),
      ...extras,

      init: async () => {
        if (get().initialized) return
        if (initPromise) return initPromise

        initPromise = (async () => {
          try {
            const { items, visibility } = await db.loadAll()
            const extra = rebuildExtraState ? rebuildExtraState(items) : {}

            set({
              itemsById: items,
              visibilityByOwner: visibility,
              initialized: true,
              ...extra,
            } as Partial<FullStore>)

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
            logger.error(
              `Failed to load ${name} from DB`,
              err instanceof Error ? err : undefined,
              { module: moduleName }
            )
            set({ initialized: true } as Partial<FullStore>)
          }
        })()

        return initPromise
      },

      update: async (force = false) => {
        const state = get()
        if (!state.initialized) await get().init()
        if (get().isUpdating) return

        const allOwners = Object.values(useAuthStore.getState().owners)
        if (allOwners.length === 0) {
          set({ updateError: 'No owners logged in' } as Partial<FullStore>)
          return
        }

        const expiryCacheStore = useExpiryCacheStore.getState()
        const ownersToUpdate = force
          ? allOwners.filter(
              (o): o is Owner => o !== undefined && !o.authFailed
            )
          : allOwners.filter((owner): owner is Owner => {
              if (!owner || owner.authFailed) return false
              const key = `${owner.type}-${owner.id}`
              return expiryCacheStore.isExpired(key, getEndpoint(owner))
            })

        if (ownersToUpdate.length === 0) return

        set({ isUpdating: true, updateError: null } as Partial<FullStore>)

        try {
          const itemsById = new Map(get().itemsById)
          const visibilityByOwner = new Map(get().visibilityByOwner)
          const itemBatch: Array<{ id: number; stored: TStoredItem }> = []

          for (const owner of ownersToUpdate) {
            const currentOwnerKey = makeOwnerKey(owner.type, owner.id)
            const endpoint = getEndpoint(owner)

            try {
              logger.info(`Fetching ${name}`, {
                module: moduleName,
                owner: owner.name,
              })
              const { data: items, expiresAt, etag } = await fetchData(owner)

              const ownerVisibility = new Set<number>()
              for (const item of items) {
                const itemId = getItemId(item)
                ownerVisibility.add(itemId)

                if (!itemsById.has(itemId) || shouldUpdateExisting) {
                  const stored = toStoredItem(owner, item)
                  itemsById.set(itemId, stored)
                  itemBatch.push({ id: itemId, stored })
                }
              }

              visibilityByOwner.set(currentOwnerKey, ownerVisibility)
              await db.saveVisibility(currentOwnerKey, ownerVisibility)

              const isDataEmpty = isEmpty ? isEmpty(items) : items.length === 0
              useExpiryCacheStore
                .getState()
                .setExpiry(
                  currentOwnerKey,
                  endpoint,
                  expiresAt,
                  etag,
                  isDataEmpty
                )
            } catch (err) {
              logger.error(
                `Failed to fetch ${name}`,
                err instanceof Error ? err : undefined,
                { module: moduleName, owner: owner.name }
              )
            }
          }

          await db.saveItems(itemBatch)

          if (shouldDeleteStaleItems) {
            const visibleIds = collectVisibleItemIds(visibilityByOwner)
            const staleIds = removeStaleItems(itemsById, visibleIds)
            if (staleIds.length > 0) {
              await db.deleteItems(staleIds)
              logger.info(`Cleaned up stale ${name}`, {
                module: moduleName,
                count: staleIds.length,
              })
            }
          }

          onAfterBatchUpdate?.(itemsById)

          const extra = rebuildExtraState ? rebuildExtraState(itemsById) : {}
          set({
            itemsById,
            visibilityByOwner,
            isUpdating: false,
            updateError:
              itemsById.size === 0 ? `Failed to fetch any ${name}` : null,
            ...extra,
          } as Partial<FullStore>)

          triggerResolution()

          logger.info(`${name} updated`, {
            module: moduleName,
            owners: ownersToUpdate.length,
            totalItems: itemsById.size,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          set({ isUpdating: false, updateError: message } as Partial<FullStore>)
          logger.error(
            `${name} update failed`,
            err instanceof Error ? err : undefined,
            { module: moduleName }
          )
        }
      },

      updateForOwner: async (owner: Owner) => {
        const state = get()
        if (!state.initialized) await get().init()

        try {
          const currentOwnerKey = makeOwnerKey(owner.type, owner.id)
          const endpoint = getEndpoint(owner)
          const previousVisibility =
            state.visibilityByOwner.get(currentOwnerKey) ?? new Set()

          onBeforeOwnerUpdate?.(owner, previousVisibility, state.itemsById)

          logger.info(`Fetching ${name} for owner`, {
            module: moduleName,
            owner: owner.name,
          })
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

          await db.saveItems(itemBatch)
          visibilityByOwner.set(currentOwnerKey, ownerVisibility)
          await db.saveVisibility(currentOwnerKey, ownerVisibility)

          onAfterOwnerUpdate?.({
            owner,
            newItems: items,
            previousVisibility,
            itemsById,
          })

          if (shouldDeleteStaleItems) {
            const visibleIds = collectVisibleItemIds(visibilityByOwner)
            const staleIds = removeStaleItems(itemsById, visibleIds)
            if (staleIds.length > 0) {
              await db.deleteItems(staleIds)
              logger.info(`Cleaned up stale ${name}`, {
                module: moduleName,
                count: staleIds.length,
              })
            }
          }

          const isDataEmpty = isEmpty ? isEmpty(items) : items.length === 0
          useExpiryCacheStore
            .getState()
            .setExpiry(currentOwnerKey, endpoint, expiresAt, etag, isDataEmpty)

          const extra = rebuildExtraState ? rebuildExtraState(itemsById) : {}
          set({
            itemsById,
            visibilityByOwner,
            ...extra,
          } as Partial<FullStore>)

          triggerResolution()

          logger.info(`${name} updated for owner`, {
            module: moduleName,
            owner: owner.name,
            items: items.length,
          })
        } catch (err) {
          logger.error(
            `Failed to fetch ${name} for owner`,
            err instanceof Error ? err : undefined,
            { module: moduleName, owner: owner.name }
          )
        }
      },

      removeForOwner: async (ownerType: string, ownerId: number) => {
        const state = get()
        const currentOwnerKey = `${ownerType}-${ownerId}`

        if (!state.visibilityByOwner.has(currentOwnerKey)) return

        const visibilityByOwner = new Map(state.visibilityByOwner)
        visibilityByOwner.delete(currentOwnerKey)

        await db.deleteVisibility(currentOwnerKey)

        const itemsById = new Map(state.itemsById)
        if (shouldDeleteStaleItems) {
          const visibleIds = collectVisibleItemIds(visibilityByOwner)
          const staleIds = removeStaleItems(itemsById, visibleIds)
          if (staleIds.length > 0) {
            await db.deleteItems(staleIds)
          }
        }

        const extra = rebuildExtraState ? rebuildExtraState(itemsById) : {}
        set({ itemsById, visibilityByOwner, ...extra } as Partial<FullStore>)

        useExpiryCacheStore.getState().clearForOwner(currentOwnerKey)

        logger.info(`${name} removed for owner`, {
          module: moduleName,
          ownerKey: currentOwnerKey,
        })
      },

      clear: async () => {
        await db.clear()
        initPromise = null
        const extra = extraState ? { ...extraState } : {}
        set({
          itemsById: new Map(),
          visibilityByOwner: new Map(),
          updateError: null,
          initialized: false,
          ...extra,
        } as Partial<FullStore>)
      },
    }
  })

  useExpiryCacheStore
    .getState()
    .registerRefreshCallback(endpointPattern, async (ownerKeyStr) => {
      const owner = findOwnerByKey(ownerKeyStr)
      if (!owner) {
        logger.warn('Owner not found for refresh', {
          module: moduleName,
          ownerKey: ownerKeyStr,
        })
        return
      }
      await store.getState().updateForOwner(owner)
    })

  useStoreRegistry.getState().register({
    name,
    removeForOwner: store.getState().removeForOwner,
    clear: store.getState().clear,
    getIsUpdating: () => store.getState().isUpdating,
    init: store.getState().init,
    update: store.getState().update,
  })

  return store
}
