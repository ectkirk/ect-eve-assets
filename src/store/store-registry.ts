/**
 * Store Registry - Centralized management for owner-aware stores
 *
 * Provides unified operations for:
 * - Removing data for a specific owner across all stores
 * - Clearing all store data
 * - Checking aggregate updating status
 * - Accessing individual store operations by name
 *
 * Stores register themselves on creation, eliminating the need to
 * manually update cleanup logic when adding new stores.
 */

import { create } from 'zustand'
import { logger } from '@/lib/logger'

export interface RegisteredStore {
  name: string
  removeForOwner?: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
  getIsUpdating: () => boolean
  init?: () => Promise<void>
  update?: (force?: boolean) => Promise<void>
}

interface StoreRegistryState {
  stores: Map<string, RegisteredStore>
}

interface StoreRegistryActions {
  register: (store: RegisteredStore) => void
  unregister: (name: string) => void
  getStore: (name: string) => RegisteredStore | undefined
  getStoreNames: () => string[]
  removeForOwnerAll: (ownerType: string, ownerId: number) => Promise<void>
  clearAll: () => Promise<void>
  clearByNames: (names: string[]) => Promise<void>
  initAll: (exclude?: string[]) => Promise<void>
  refetchByNames: (names: string[]) => Promise<void>
  isAnyUpdating: () => boolean
}

type StoreRegistry = StoreRegistryState & StoreRegistryActions

export const useStoreRegistry = create<StoreRegistry>((set, get) => ({
  stores: new Map(),

  register: (store) => {
    set((state) => {
      const stores = new Map(state.stores)
      stores.set(store.name, store)
      return { stores }
    })
  },

  unregister: (name) => {
    set((state) => {
      const stores = new Map(state.stores)
      stores.delete(name)
      return { stores }
    })
  },

  getStore: (name) => {
    return get().stores.get(name)
  },

  getStoreNames: () => {
    return Array.from(get().stores.keys())
  },

  removeForOwnerAll: async (ownerType, ownerId) => {
    const { stores } = get()
    const results = await Promise.allSettled(
      Array.from(stores.values())
        .filter((store) => store.removeForOwner)
        .map((store) => store.removeForOwner!(ownerType, ownerId))
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Store removeForOwner failed', result.reason, {
          module: 'StoreRegistry',
        })
      }
    }
  },

  clearAll: async () => {
    const { stores } = get()
    const results = await Promise.allSettled(
      Array.from(stores.values()).map((store) => store.clear())
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Store clear failed', result.reason, {
          module: 'StoreRegistry',
        })
      }
    }
  },

  clearByNames: async (names) => {
    const { stores } = get()
    const results = await Promise.allSettled(
      names.map((name) => {
        const store = stores.get(name)
        return store?.clear()
      })
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Store clear failed', result.reason, {
          module: 'StoreRegistry',
        })
      }
    }
  },

  initAll: async (exclude = []) => {
    const { stores } = get()
    const excludeSet = new Set(exclude)
    const results = await Promise.allSettled(
      Array.from(stores.values())
        .filter((store) => !excludeSet.has(store.name) && store.init)
        .map((store) => store.init!())
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Store init failed', result.reason, {
          module: 'StoreRegistry',
        })
      }
    }
  },

  refetchByNames: async (names) => {
    const { stores } = get()
    for (const name of names) {
      const store = stores.get(name)
      try {
        if (store?.init) await store.init()
        if (store?.update) await store.update(true)
      } catch (err) {
        logger.error('Store refetch failed', err, {
          module: 'StoreRegistry',
          storeName: name,
        })
      }
    }
  },

  isAnyUpdating: () => {
    const { stores } = get()
    for (const store of stores.values()) {
      if (store.getIsUpdating()) return true
    }
    return false
  },
}))
