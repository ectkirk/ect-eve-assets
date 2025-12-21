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

export interface RegisteredStore {
  name: string
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
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
    await Promise.all(
      Array.from(stores.values()).map((store) =>
        store.removeForOwner(ownerType, ownerId)
      )
    )
  },

  clearAll: async () => {
    const { stores } = get()
    await Promise.all(
      Array.from(stores.values()).map((store) => store.clear())
    )
  },

  clearByNames: async (names) => {
    const { stores } = get()
    await Promise.all(
      names.map((name) => {
        const store = stores.get(name)
        return store?.clear()
      })
    )
  },

  initAll: async (exclude = []) => {
    const { stores } = get()
    const excludeSet = new Set(exclude)
    await Promise.all(
      Array.from(stores.values())
        .filter((store) => !excludeSet.has(store.name) && store.init)
        .map((store) => store.init!())
    )
  },

  refetchByNames: async (names) => {
    const { stores } = get()
    for (const name of names) {
      const store = stores.get(name)
      if (store?.init) await store.init()
      if (store?.update) await store.update(true)
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
