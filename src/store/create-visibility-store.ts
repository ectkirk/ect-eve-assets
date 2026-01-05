import { create, type StoreApi, type UseBoundStore } from 'zustand'
import {
  useAuthStore,
  type Owner,
  ownerKey as makeOwnerKey,
  findOwnerByKey,
} from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { isNotInCorporationError } from '../../shared/esi-types'
import { logger } from '@/lib/logger'
import { getErrorForLog, getUserFriendlyMessage } from '@/lib/errors'
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
  onAfterInit?: (itemsById: Map<number, TStoredItem>) => void | Promise<void>
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
  failedOwners: string[]
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
  const updatingOwners = new Set<string>()

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
      failedOwners: [],
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
              await onAfterInit?.(items)
            }

            logger.info(`${name} store initialized`, {
              module: moduleName,
              items: items.size,
              owners: visibility.size,
            })
          } catch (err) {
            logger.error(
              `Failed to load ${name} from DB`,
              getErrorForLog(err),
              {
                module: moduleName,
              }
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

        set({
          isUpdating: true,
          updateError: null,
          failedOwners: [],
        } as Partial<FullStore>)

        try {
          const itemsById = new Map(get().itemsById)
          const visibilityByOwner = new Map(get().visibilityByOwner)
          const itemBatch: Array<{ id: number; stored: TStoredItem }> = []
          const failedOwners: string[] = []

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
              if (
                owner.type === 'corporation' &&
                isNotInCorporationError(err)
              ) {
                logger.debug(`Skipping ${name} for removed corp`, {
                  module: moduleName,
                  owner: owner.name,
                })
              } else {
                failedOwners.push(currentOwnerKey)
                logger.error(`Failed to fetch ${name}`, getErrorForLog(err), {
                  module: moduleName,
                  owner: owner.name,
                })
              }
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
          const updateError =
            failedOwners.length === ownersToUpdate.length
              ? `Failed to fetch any ${name}`
              : failedOwners.length > 0
                ? `Failed to fetch ${name} for some owners`
                : null
          set({
            itemsById,
            visibilityByOwner,
            isUpdating: false,
            updateError,
            failedOwners,
            ...extra,
          } as Partial<FullStore>)

          triggerResolution()

          logger.info(`${name} updated`, {
            module: moduleName,
            owners: ownersToUpdate.length,
            totalItems: itemsById.size,
            failedOwners: failedOwners.length,
          })
        } catch (err) {
          set({
            isUpdating: false,
            updateError: getUserFriendlyMessage(err),
          } as Partial<FullStore>)
          logger.error(`${name} update failed`, getErrorForLog(err), {
            module: moduleName,
          })
        }
      },

      updateForOwner: async (owner: Owner) => {
        const state = get()
        if (!state.initialized) await get().init()

        const currentOwnerKey = makeOwnerKey(owner.type, owner.id)
        if (updatingOwners.has(currentOwnerKey)) {
          logger.info(
            `Skipping ${name} update for owner (already in progress)`,
            {
              module: moduleName,
              owner: owner.name,
            }
          )
          return
        }

        updatingOwners.add(currentOwnerKey)
        try {
          const endpoint = getEndpoint(owner)
          const previousVisibility =
            state.visibilityByOwner.get(currentOwnerKey) ?? new Set()

          onBeforeOwnerUpdate?.(owner, previousVisibility, state.itemsById)

          logger.info(`Fetching ${name} for owner`, {
            module: moduleName,
            owner: owner.name,
          })
          const { data: items, expiresAt, etag } = await fetchData(owner)

          const currentState = get()
          const itemsById = new Map(currentState.itemsById)
          const visibilityByOwner = new Map(currentState.visibilityByOwner)
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
          if (owner.type === 'corporation' && isNotInCorporationError(err)) {
            logger.debug(`Skipping ${name} for removed corp`, {
              module: moduleName,
              owner: owner.name,
            })
          } else {
            logger.error(
              `Failed to fetch ${name} for owner`,
              getErrorForLog(err),
              {
                module: moduleName,
                owner: owner.name,
              }
            )
          }
        } finally {
          updatingOwners.delete(currentOwnerKey)
        }
      },

      removeForOwner: async (ownerType: string, ownerId: number) => {
        const currentOwnerKey = `${ownerType}-${ownerId}`

        if (!get().visibilityByOwner.has(currentOwnerKey)) return

        await db.deleteVisibility(currentOwnerKey)

        let staleIds: number[] = []
        set((current) => {
          const visibilityByOwner = new Map(current.visibilityByOwner)
          visibilityByOwner.delete(currentOwnerKey)

          const itemsById = new Map(current.itemsById)
          if (shouldDeleteStaleItems) {
            const visibleIds = collectVisibleItemIds(visibilityByOwner)
            staleIds = removeStaleItems(itemsById, visibleIds)
          }

          const extra = rebuildExtraState ? rebuildExtraState(itemsById) : {}
          return {
            itemsById,
            visibilityByOwner,
            ...extra,
          } as Partial<FullStore>
        })

        if (staleIds.length > 0) {
          await db.deleteItems(staleIds)
        }

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
          failedOwners: [],
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
