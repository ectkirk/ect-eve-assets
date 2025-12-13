import { create, type StateCreator, type StoreApi, type UseBoundStore } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { createOwnerDB, type OwnerDBConfig } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'

export interface OwnerData<T> {
  owner: Owner
  data: T
}

export interface BaseState<TOwnerData> {
  dataByOwner: TOwnerData[]
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

export interface BaseActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

export interface OwnerStoreConfig<
  TDBData,
  TOwnerData extends { owner: Owner },
  TExtraState extends object = object,
  TExtraActions extends object = object,
> {
  name: string
  moduleName: string
  endpointPattern: string
  dbConfig: Omit<OwnerDBConfig<TDBData>, 'moduleName'>
  ownerFilter?: 'all' | 'character' | 'corporation'
  getEndpoint: (owner: Owner) => string
  fetchData: (owner: Owner) => Promise<{
    data: TDBData
    expiresAt: number
    etag?: string | null
  }>
  toOwnerData: (owner: Owner, data: TDBData) => TOwnerData
  isEmpty?: (data: TDBData) => boolean
  extraState?: TExtraState
  rebuildExtraState?: (dataByOwner: TOwnerData[]) => Partial<TExtraState>
  extraActions?: (
    set: (partial: Partial<BaseState<TOwnerData> & TExtraState>) => void,
    get: () => BaseState<TOwnerData> & TExtraState & BaseActions & TExtraActions
  ) => TExtraActions
  onAfterBatchUpdate?: (results: TOwnerData[]) => Promise<void>
  onBeforeOwnerUpdate?: (owner: Owner, state: BaseState<TOwnerData> & TExtraState) => {
    previousData?: TDBData
  }
  onAfterOwnerUpdate?: (params: {
    owner: Owner
    newData: TDBData
    previousData?: TDBData
    state: BaseState<TOwnerData> & TExtraState
  }) => void
}

export type OwnerStore<
  TOwnerData extends { owner: Owner },
  TExtraState extends object = object,
  TExtraActions extends object = object,
> = BaseState<TOwnerData> & BaseActions & TExtraState & TExtraActions

export function createOwnerStore<
  TDBData,
  TOwnerData extends { owner: Owner },
  TExtraState extends object = object,
  TExtraActions extends object = object,
>(
  config: OwnerStoreConfig<TDBData, TOwnerData, TExtraState, TExtraActions>
): UseBoundStore<StoreApi<OwnerStore<TOwnerData, TExtraState, TExtraActions>>> {
  const {
    name,
    moduleName,
    endpointPattern,
    dbConfig,
    ownerFilter = 'all',
    getEndpoint,
    fetchData,
    toOwnerData,
    isEmpty,
    extraState,
    rebuildExtraState,
    extraActions,
    onAfterBatchUpdate,
    onBeforeOwnerUpdate,
    onAfterOwnerUpdate,
  } = config

  const db = createOwnerDB<TDBData>({ ...dbConfig, moduleName })

  const filterOwners = (owners: (Owner | undefined)[]): Owner[] => {
    return owners.filter((o): o is Owner => {
      if (!o || o.authFailed) return false
      if (ownerFilter === 'character') return o.type === 'character'
      if (ownerFilter === 'corporation') return o.type === 'corporation'
      return true
    })
  }

  const storeCreator: StateCreator<OwnerStore<TOwnerData, TExtraState, TExtraActions>> = (
    set,
    get
  ) => {
    const baseSet = (partial: Partial<BaseState<TOwnerData> & TExtraState>) =>
      set(partial as Partial<OwnerStore<TOwnerData, TExtraState, TExtraActions>>)

    const extras = extraActions
      ? extraActions(
          baseSet,
          get as () => BaseState<TOwnerData> & TExtraState & BaseActions & TExtraActions
        )
      : ({} as TExtraActions)

    return {
      dataByOwner: [],
      isUpdating: false,
      updateError: null,
      initialized: false,
      ...(extraState ?? ({} as TExtraState)),
      ...extras,

      init: async () => {
        if (get().initialized) return

        try {
          const loaded = await db.loadAll()
          const dataByOwner = loaded.map((d) => toOwnerData(d.owner, d.data))
          const extra = rebuildExtraState ? rebuildExtraState(dataByOwner) : {}
          set({ dataByOwner, initialized: true, ...extra } as Partial<
            OwnerStore<TOwnerData, TExtraState, TExtraActions>
          >)
          logger.info(`${name} store initialized`, {
            module: moduleName,
            owners: dataByOwner.length,
          })
        } catch (err) {
          logger.error(`Failed to load ${name} from DB`, err instanceof Error ? err : undefined, {
            module: moduleName,
          })
          set({ initialized: true } as Partial<OwnerStore<TOwnerData, TExtraState, TExtraActions>>)
        }
      },

      update: async (force = false) => {
        const state = get()
        if (state.isUpdating) return

        const allOwners = Object.values(useAuthStore.getState().owners)
        const filtered = filterOwners(allOwners)

        if (filtered.length === 0) {
          if (ownerFilter === 'all') {
            set({ updateError: 'No owners logged in' } as Partial<
              OwnerStore<TOwnerData, TExtraState, TExtraActions>
            >)
          } else {
            logger.debug(`No ${ownerFilter} owners for ${name} update`, { module: moduleName })
          }
          return
        }

        const expiryCacheStore = useExpiryCacheStore.getState()
        const ownersToUpdate = force
          ? filtered
          : filtered.filter((owner) => {
              const ownerKey = `${owner.type}-${owner.id}`
              const endpoint = getEndpoint(owner)
              return expiryCacheStore.isExpired(ownerKey, endpoint)
            })

        if (ownersToUpdate.length === 0) {
          logger.debug(`No owners need ${name} update`, { module: moduleName })
          return
        }

        set({ isUpdating: true, updateError: null } as Partial<
          OwnerStore<TOwnerData, TExtraState, TExtraActions>
        >)

        try {
          const existing = new Map<string, TOwnerData>(
            state.dataByOwner.map((d: TOwnerData) => [`${d.owner.type}-${d.owner.id}`, d])
          )

          for (const owner of ownersToUpdate) {
            const ownerKey = `${owner.type}-${owner.id}`
            const endpoint = getEndpoint(owner)

            try {
              logger.info(`Fetching ${name}`, { module: moduleName, owner: owner.name })
              const { data, expiresAt, etag } = await fetchData(owner)

              await db.save(ownerKey, owner, data)
              existing.set(ownerKey, toOwnerData(owner, data))

              const isDataEmpty = isEmpty ? isEmpty(data) : false
              useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag, isDataEmpty)
            } catch (err) {
              logger.error(`Failed to fetch ${name}`, err instanceof Error ? err : undefined, {
                module: moduleName,
                owner: owner.name,
              })
            }
          }

          const results = Array.from(existing.values())
          const extra = rebuildExtraState ? rebuildExtraState(results) : {}

          if (onAfterBatchUpdate) {
            await onAfterBatchUpdate(results)
          }

          set({
            dataByOwner: results,
            isUpdating: false,
            updateError: results.length === 0 ? `Failed to fetch any ${name}` : null,
            ...extra,
          } as Partial<OwnerStore<TOwnerData, TExtraState, TExtraActions>>)

          logger.info(`${name} updated`, {
            module: moduleName,
            owners: ownersToUpdate.length,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          set({ isUpdating: false, updateError: message } as Partial<
            OwnerStore<TOwnerData, TExtraState, TExtraActions>
          >)
          logger.error(`${name} update failed`, err instanceof Error ? err : undefined, {
            module: moduleName,
          })
        }
      },

      updateForOwner: async (owner: Owner) => {
        if (ownerFilter === 'character' && owner.type !== 'character') return
        if (ownerFilter === 'corporation' && owner.type !== 'corporation') return

        const state = get()
        const preHookResult = onBeforeOwnerUpdate
          ? onBeforeOwnerUpdate(owner, state as BaseState<TOwnerData> & TExtraState)
          : {}

        try {
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getEndpoint(owner)

          logger.info(`Fetching ${name} for owner`, { module: moduleName, owner: owner.name })
          const { data, expiresAt, etag } = await fetchData(owner)

          if (onAfterOwnerUpdate) {
            onAfterOwnerUpdate({
              owner,
              newData: data,
              previousData: preHookResult.previousData,
              state: state as BaseState<TOwnerData> & TExtraState,
            })
          }

          await db.save(ownerKey, owner, data)
          const isDataEmpty = isEmpty ? isEmpty(data) : false
          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag, isDataEmpty)

          const updated = (get().dataByOwner as TOwnerData[]).filter(
            (d: TOwnerData) => `${d.owner.type}-${d.owner.id}` !== ownerKey
          )
          updated.push(toOwnerData(owner, data))

          const extra = rebuildExtraState ? rebuildExtraState(updated) : {}
          set({ dataByOwner: updated, ...extra } as Partial<
            OwnerStore<TOwnerData, TExtraState, TExtraActions>
          >)

          logger.info(`${name} updated for owner`, {
            module: moduleName,
            owner: owner.name,
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
        const ownerKey = `${ownerType}-${ownerId}`
        const updated = (state.dataByOwner as TOwnerData[]).filter(
          (d: TOwnerData) => `${d.owner.type}-${d.owner.id}` !== ownerKey
        )

        if (updated.length === state.dataByOwner.length) return

        await db.delete(ownerKey)
        const extra = rebuildExtraState ? rebuildExtraState(updated) : {}
        set({ dataByOwner: updated, ...extra } as Partial<
          OwnerStore<TOwnerData, TExtraState, TExtraActions>
        >)

        useExpiryCacheStore.getState().clearForOwner(ownerKey)
        logger.info(`${name} removed for owner`, { module: moduleName, ownerKey })
      },

      clear: async () => {
        await db.clear()
        const extra = extraState ? { ...extraState } : {}
        set({
          dataByOwner: [],
          updateError: null,
          initialized: false,
          ...extra,
        } as Partial<OwnerStore<TOwnerData, TExtraState, TExtraActions>>)
      },
    }
  }

  const store = create<OwnerStore<TOwnerData, TExtraState, TExtraActions>>(storeCreator)

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
