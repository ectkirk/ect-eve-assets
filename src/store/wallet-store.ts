import { create } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESICorporationWalletDivisionSchema } from '@/api/schemas'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESICorporationWalletDivision = z.infer<typeof ESICorporationWalletDivisionSchema>

const ENDPOINT_PATTERN = '/wallet'

interface WalletData {
  balance?: number
  divisions?: ESICorporationWalletDivision[]
}

export interface CharacterWallet {
  owner: Owner
  balance: number
}

export interface CorporationWallet {
  owner: Owner
  divisions: ESICorporationWalletDivision[]
}

export type OwnerWallet = CharacterWallet | CorporationWallet

export function isCorporationWallet(wallet: OwnerWallet): wallet is CorporationWallet {
  return wallet.owner.type === 'corporation'
}

interface WalletState {
  walletsByOwner: OwnerWallet[]
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface WalletActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
  getTotalBalance: () => number
}

type WalletStore = WalletState & WalletActions

const db = createOwnerDB<WalletData>({
  dbName: 'ecteveassets-wallet',
  storeName: 'wallet',
  metaStoreName: 'meta',
  moduleName: 'WalletStore',
  serialize: (data) => {
    if (data.divisions) return { divisions: data.divisions }
    return { balance: data.balance }
  },
  deserialize: (stored) => ({
    balance: stored.balance as number | undefined,
    divisions: stored.divisions as ESICorporationWalletDivision[] | undefined,
  }),
})

function getWalletEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/wallets/`
  }
  return `/characters/${owner.characterId}/wallet/`
}

async function fetchOwnerWalletWithMeta(owner: Owner): Promise<ESIResponseMeta<CharacterWallet | CorporationWallet>> {
  if (owner.type === 'corporation') {
    const result = await esi.fetchWithMeta<ESICorporationWalletDivision[]>(
      `/corporations/${owner.id}/wallets/`,
      { characterId: owner.characterId, schema: z.array(ESICorporationWalletDivisionSchema) }
    )
    return {
      data: { owner, divisions: result.data } as CorporationWallet,
      expiresAt: result.expiresAt,
      etag: result.etag,
      notModified: result.notModified,
    }
  }
  const result = await esi.fetchWithMeta<number>(
    `/characters/${owner.characterId}/wallet/`,
    { characterId: owner.characterId, schema: z.number() }
  )
  return {
    data: { owner, balance: result.data } as CharacterWallet,
    expiresAt: result.expiresAt,
    etag: result.etag,
    notModified: result.notModified,
  }
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  walletsByOwner: [],
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const loaded = await db.loadAll()
      const walletsByOwner: OwnerWallet[] = loaded.map((d) => {
        if (d.data.divisions) {
          return { owner: d.owner, divisions: d.data.divisions }
        }
        return { owner: d.owner, balance: d.data.balance ?? 0 }
      })
      set({ walletsByOwner, initialized: true })
      logger.info('Wallet store initialized', {
        module: 'WalletStore',
        owners: walletsByOwner.length,
      })
    } catch (err) {
      logger.error('Failed to load wallet from DB', err instanceof Error ? err : undefined, {
        module: 'WalletStore',
      })
      set({ initialized: true })
    }
  },

  getTotalBalance: () => {
    const { walletsByOwner } = get()
    let total = 0
    for (const wallet of walletsByOwner) {
      if (isCorporationWallet(wallet)) {
        for (const div of wallet.divisions) {
          total += div.balance
        }
      } else {
        total += wallet.balance
      }
    }
    return total
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const owners = Object.values(useAuthStore.getState().owners)
    if (owners.length === 0) {
      set({ updateError: 'No owners logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? owners.filter((o): o is Owner => o !== undefined && !o.authFailed)
      : owners.filter((owner): owner is Owner => {
          if (!owner || owner.authFailed) return false
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getWalletEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need wallet update', { module: 'WalletStore' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existingWallets = new Map(
        state.walletsByOwner.map((ow) => [`${ow.owner.type}-${ow.owner.id}`, ow])
      )

      for (const owner of ownersToUpdate) {
        const ownerKey = `${owner.type}-${owner.id}`
        const endpoint = getWalletEndpoint(owner)

        try {
          logger.info('Fetching wallet', { module: 'WalletStore', owner: owner.name })
          const { data: walletData, expiresAt, etag } = await fetchOwnerWalletWithMeta(owner)

          const dataToSave: WalletData = isCorporationWallet(walletData)
            ? { divisions: walletData.divisions }
            : { balance: walletData.balance }
          await db.save(ownerKey, owner, dataToSave)
          existingWallets.set(ownerKey, walletData)

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)
        } catch (err) {
          logger.error('Failed to fetch wallet', err instanceof Error ? err : undefined, {
            module: 'WalletStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingWallets.values())

      set({
        walletsByOwner: results,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any wallets' : null,
      })

      logger.info('Wallet updated', {
        module: 'WalletStore',
        owners: ownersToUpdate.length,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Wallet update failed', err instanceof Error ? err : undefined, {
        module: 'WalletStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    const state = get()

    try {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getWalletEndpoint(owner)

      logger.info('Fetching wallet for owner', { module: 'WalletStore', owner: owner.name })
      const { data: walletData, expiresAt, etag } = await fetchOwnerWalletWithMeta(owner)

      const dataToSave: WalletData = isCorporationWallet(walletData)
        ? { divisions: walletData.divisions }
        : { balance: walletData.balance }
      await db.save(ownerKey, owner, dataToSave)
      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)

      const updated = state.walletsByOwner.filter(
        (ow) => `${ow.owner.type}-${ow.owner.id}` !== ownerKey
      )
      updated.push(walletData)

      set({ walletsByOwner: updated })

      logger.info('Wallet updated for owner', {
        module: 'WalletStore',
        owner: owner.name,
      })
    } catch (err) {
      logger.error('Failed to fetch wallet for owner', err instanceof Error ? err : undefined, {
        module: 'WalletStore',
        owner: owner.name,
      })
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.walletsByOwner.filter(
      (ow) => `${ow.owner.type}-${ow.owner.id}` !== ownerKey
    )

    if (updated.length === state.walletsByOwner.length) return

    await db.delete(ownerKey)
    set({ walletsByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Wallet removed for owner', { module: 'WalletStore', ownerKey })
  },

  clear: async () => {
    await db.clear()
    set({
      walletsByOwner: [],
      updateError: null,
      initialized: false,
    })
  },
}))

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
  const owner = findOwnerByKey(ownerKeyStr)
  if (!owner) {
    logger.warn('Owner not found for refresh', { module: 'WalletStore', ownerKey: ownerKeyStr })
    return
  }
  await useWalletStore.getState().updateForOwner(owner)
})
