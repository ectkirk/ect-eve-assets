import { type Owner } from './auth-store'
import {
  createOwnerStore,
  type BaseState,
  type BaseActions,
} from './create-owner-store'
import { esi } from '@/api/esi'
import { ESICorporationWalletDivisionSchema } from '@/api/schemas'
import { z } from 'zod'

export type ESICorporationWalletDivision = z.infer<
  typeof ESICorporationWalletDivisionSchema
>

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

export function isCorporationWallet(
  wallet: OwnerWallet
): wallet is CorporationWallet {
  return wallet.owner.type === 'corporation'
}

interface WalletExtraActions {
  getTotalBalance: () => number
}

export const useWalletStore = createOwnerStore<
  WalletData,
  OwnerWallet,
  object,
  WalletExtraActions
>({
  name: 'wallet',
  moduleName: 'WalletStore',
  endpointPattern: '/wallet',
  dbConfig: {
    dbName: 'ecteveassets-wallet',
    storeName: 'wallet',
    metaStoreName: 'meta',
    serialize: (data) => {
      if (data.divisions) return { divisions: data.divisions }
      return { balance: data.balance }
    },
    deserialize: (stored) => ({
      balance: stored.balance as number | undefined,
      divisions: stored.divisions as ESICorporationWalletDivision[] | undefined,
    }),
  },
  getEndpoint: (owner) =>
    owner.type === 'corporation'
      ? `/corporations/${owner.id}/wallets/`
      : `/characters/${owner.characterId}/wallet/`,
  fetchData: async (owner) => {
    if (owner.type === 'corporation') {
      const result = await esi.fetchWithMeta<ESICorporationWalletDivision[]>(
        `/corporations/${owner.id}/wallets/`,
        {
          characterId: owner.characterId,
          schema: z.array(ESICorporationWalletDivisionSchema),
        }
      )
      return {
        data: { divisions: result.data },
        expiresAt: result.expiresAt,
        etag: result.etag,
      }
    }
    const result = await esi.fetchWithMeta<number>(
      `/characters/${owner.characterId}/wallet/`,
      { characterId: owner.characterId, schema: z.number() }
    )
    return {
      data: { balance: result.data },
      expiresAt: result.expiresAt,
      etag: result.etag,
    }
  },
  toOwnerData: (owner, data) => {
    if (data.divisions) {
      return { owner, divisions: data.divisions } as CorporationWallet
    }
    return { owner, balance: data.balance ?? 0 } as CharacterWallet
  },
  extraActions: (_, get) => ({
    getTotalBalance: () => {
      const state = get() as BaseState<OwnerWallet> &
        BaseActions &
        WalletExtraActions
      let total = 0
      for (const wallet of state.dataByOwner) {
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
  }),
})
