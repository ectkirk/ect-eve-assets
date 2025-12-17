import { create } from 'zustand'
import { useAuthStore, type Owner, ownerKey, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { useToastStore } from './toast-store'
import {
  getContractItems as fetchContractItemsFromESI,
  getCorporationContractItems,
  type ESIContract,
  type ESIContractItem,
} from '@/api/endpoints/contracts'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESIContractSchema } from '@/api/schemas'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'
import { formatNumber } from '@/lib/utils'
import { triggerResolution } from '@/lib/data-resolver'
import {
  hasContractItems,
  getContractItems as getContractItemsFromCache,
  saveContractItems,
  type CachedContractItems,
} from './reference-cache'

const ENDPOINT_PATTERN = '/contracts/'

export interface ContractWithItems {
  contract: ESIContract
}

export interface OwnerContracts {
  owner: Owner
  contracts: ContractWithItems[]
}

interface ContractsState {
  contractsByOwner: OwnerContracts[]
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
  updateCounter: number
}

interface ContractsActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  fetchItemsForContract: (contractId: number) => Promise<ESIContractItem[] | undefined>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

type ContractsStore = ContractsState & ContractsActions

const db = createOwnerDB<ContractWithItems[]>({
  dbName: 'ecteveassets-contracts',
  storeName: 'contracts',
  dataKey: 'contracts',
  metaStoreName: 'meta',
  moduleName: 'ContractsStore',
})

function getContractsEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/contracts/`
  }
  return `/characters/${owner.characterId}/contracts/`
}

async function fetchOwnerContractsWithMeta(owner: Owner): Promise<ESIResponseMeta<ESIContract[]>> {
  const endpoint = getContractsEndpoint(owner)
  const result = await esi.fetchPaginatedWithMeta<ESIContract>(endpoint, {
    characterId: owner.characterId,
    schema: ESIContractSchema,
  })
  if (owner.type === 'character') {
    result.data = result.data.filter((c) => !c.for_corporation)
  }
  return result
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

const ACTIVE_STATUSES = new Set(['outstanding', 'in_progress'])
const FINISHED_STATUSES = new Set(['finished', 'finished_issuer', 'finished_contractor'])

function canFetchItems(contract: ESIContract): boolean {
  if (contract.type !== 'item_exchange' && contract.type !== 'auction') return false

  if (ACTIVE_STATUSES.has(contract.status)) {
    return true
  }

  if (FINISHED_STATUSES.has(contract.status)) {
    const refTime = new Date(contract.date_completed ?? contract.date_expired).getTime()
    return Date.now() - refTime < THIRTY_DAYS_MS
  }

  return false
}

async function fetchAndCacheContractItems(
  owner: Owner,
  contracts: ESIContract[]
): Promise<void> {
  if (contracts.length === 0) return

  const fetchedItems = await esi.fetchBatch(
    contracts,
    async (contract) => {
      if (contract.for_corporation && owner.corporationId) {
        return getCorporationContractItems(owner.characterId, owner.corporationId, contract.contract_id)
      }
      return fetchContractItemsFromESI(owner.characterId, contract.contract_id)
    },
    { batchSize: 20 }
  )

  for (const [contract, items] of fetchedItems) {
    if (items) {
      await saveContractItems(contract.contract_id, items as CachedContractItems['items'])
    }
  }
}

export const useContractsStore = create<ContractsStore>((set, get) => ({
  contractsByOwner: [],
  isUpdating: false,
  updateError: null,
  initialized: false,
  updateCounter: 0,

  init: async () => {
    if (get().initialized) return

    try {
      const loaded = await db.loadAll()
      let migratedItems = 0

      for (const { data } of loaded) {
        for (const cwi of data) {
          const oldItems = (cwi as { items?: ESIContractItem[] }).items
          if (oldItems && oldItems.length > 0 && !hasContractItems(cwi.contract.contract_id)) {
            await saveContractItems(cwi.contract.contract_id, oldItems as CachedContractItems['items'])
            migratedItems++
          }
        }
      }

      const contractsByOwner = loaded.map((d) => ({
        owner: d.owner,
        contracts: d.data.map((cwi) => ({ contract: cwi.contract })),
      }))

      set({ contractsByOwner, initialized: true })
      if (contractsByOwner.length > 0) {
        triggerResolution()
      }
      logger.info('Contracts store initialized', {
        module: 'ContractsStore',
        owners: contractsByOwner.length,
        contracts: contractsByOwner.reduce((sum, o) => sum + o.contracts.length, 0),
        migratedItems,
      })
    } catch (err) {
      logger.error('Failed to load contracts from DB', err instanceof Error ? err : undefined, {
        module: 'ContractsStore',
      })
      set({ initialized: true })
    }
  },

  update: async (force = false) => {
    const state = get()
    if (!state.initialized) {
      await get().init()
    }
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
          const endpoint = getContractsEndpoint(owner)
          return expiryCacheStore.isExpired(key, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need contracts update', { module: 'ContractsStore' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existingContracts = new Map(
        state.contractsByOwner.map((oc) => [`${oc.owner.type}-${oc.owner.id}`, oc])
      )

      for (const owner of ownersToUpdate) {
        const currentOwnerKey = ownerKey(owner.type, owner.id)
        const endpoint = getContractsEndpoint(owner)

        try {
          logger.info('Fetching contracts', { module: 'ContractsStore', owner: owner.name })

          const { data: contracts, expiresAt, etag } = await fetchOwnerContractsWithMeta(owner)

          const activeToFetch = contracts.filter((contract) => {
            if (!canFetchItems(contract)) return false
            const isActive = contract.status === 'outstanding' || contract.status === 'in_progress'
            return isActive && !hasContractItems(contract.contract_id)
          })

          if (activeToFetch.length > 0) {
            logger.info('Fetching contract items', {
              module: 'ContractsStore',
              owner: owner.name,
              toFetch: activeToFetch.length,
            })
            await fetchAndCacheContractItems(owner, activeToFetch)
          }

          const contractsWithItems: ContractWithItems[] = contracts.map((contract) => ({ contract }))

          await db.save(currentOwnerKey, owner, contractsWithItems)
          existingContracts.set(currentOwnerKey, { owner, contracts: contractsWithItems })

          useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag, contracts.length === 0)
        } catch (err) {
          logger.error('Failed to fetch contracts', err instanceof Error ? err : undefined, {
            module: 'ContractsStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingContracts.values())

      set((s) => ({
        contractsByOwner: results,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any contracts' : null,
        updateCounter: s.updateCounter + 1,
      }))

      triggerResolution()

      logger.info('Contracts updated', {
        module: 'ContractsStore',
        owners: ownersToUpdate.length,
        totalContracts: results.reduce((sum, r) => sum + r.contracts.length, 0),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Contracts update failed', err instanceof Error ? err : undefined, {
        module: 'ContractsStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    const state = get()
    if (!state.initialized) {
      await get().init()
    }

    try {
      const currentOwnerKey = ownerKey(owner.type, owner.id)
      const endpoint = getContractsEndpoint(owner)

      const previousContracts = state.contractsByOwner.find(
        (oc) => `${oc.owner.type}-${oc.owner.id}` === currentOwnerKey
      )?.contracts ?? []
      const previousStatusMap = new Map(
        previousContracts.map((c) => [c.contract.contract_id, c.contract.status])
      )

      logger.info('Fetching contracts for owner', { module: 'ContractsStore', owner: owner.name })

      const { data: contracts, expiresAt, etag } = await fetchOwnerContractsWithMeta(owner)

      const activeToFetch = contracts.filter((contract) => {
        if (!canFetchItems(contract)) return false
        const isActive = contract.status === 'outstanding' || contract.status === 'in_progress'
        return isActive && !hasContractItems(contract.contract_id)
      })

      if (activeToFetch.length > 0) {
        await fetchAndCacheContractItems(owner, activeToFetch)
      }

      const contractsWithItems: ContractWithItems[] = contracts.map((contract) => ({ contract }))

      const toastStore = useToastStore.getState()
      const ownerId = owner.type === 'corporation' ? owner.id : owner.characterId
      const allOwners = Object.values(useAuthStore.getState().owners).filter((o): o is Owner => !!o)
      const allOwnerIds = new Set(allOwners.map((o) => o.type === 'corporation' ? o.id : o.characterId))

      for (const contract of contracts) {
        const prevStatus = previousStatusMap.get(contract.contract_id)
        const isNewContract = !previousStatusMap.has(contract.contract_id)
        const wasActive = prevStatus === 'outstanding' || prevStatus === 'in_progress'

        const weAreIssuer = owner.type === 'corporation'
          ? contract.issuer_corporation_id === owner.id
          : contract.issuer_id === owner.characterId
        const weAreAssignee = contract.assignee_id === ownerId
        const issuerIsOurOwner = allOwnerIds.has(contract.issuer_id)

        if (isNewContract && weAreAssignee && !issuerIsOurOwner && contract.status === 'outstanding') {
          const price = contract.price ?? 0
          toastStore.addToast(
            'contract-accepted',
            'New Contract Assigned',
            price > 0 ? `${formatNumber(price)} ISK` : 'Item exchange'
          )
          logger.info('New contract assigned', {
            module: 'ContractsStore',
            owner: owner.name,
            contractId: contract.contract_id,
          })
        }

        if (wasActive && contract.status === 'finished' && weAreIssuer && !allOwnerIds.has(contract.acceptor_id)) {
          const price = contract.price ?? 0
          toastStore.addToast(
            'contract-accepted',
            'Contract Completed',
            price > 0 ? `${formatNumber(price)} ISK` : 'Item exchange'
          )
          logger.info('Contract completed', {
            module: 'ContractsStore',
            owner: owner.name,
            contractId: contract.contract_id,
          })
        }
      }

      logger.debug('Saving contracts to DB', { module: 'ContractsStore', owner: owner.name, count: contractsWithItems.length })
      await db.save(currentOwnerKey, owner, contractsWithItems)
      logger.debug('Contracts saved to DB', { module: 'ContractsStore', owner: owner.name })
      useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag, contracts.length === 0)

      const updated = get().contractsByOwner.filter(
        (oc) => `${oc.owner.type}-${oc.owner.id}` !== currentOwnerKey
      )
      updated.push({ owner, contracts: contractsWithItems })

      set((s) => ({ contractsByOwner: updated, updateCounter: s.updateCounter + 1 }))

      triggerResolution()

      logger.info('Contracts updated for owner', {
        module: 'ContractsStore',
        owner: owner.name,
        contracts: contractsWithItems.length,
      })
    } catch (err) {
      logger.error('Failed to fetch contracts for owner', err instanceof Error ? err : undefined, {
        module: 'ContractsStore',
        owner: owner.name,
      })
    }
  },

  fetchItemsForContract: async (contractId: number) => {
    if (hasContractItems(contractId)) {
      return getContractItemsFromCache(contractId) as Promise<ESIContractItem[] | undefined>
    }

    const state = get()
    let targetOwner: Owner | undefined
    let targetContract: ESIContract | undefined

    for (const { owner, contracts } of state.contractsByOwner) {
      for (const { contract } of contracts) {
        if (contract.contract_id === contractId) {
          targetOwner = owner
          targetContract = contract
          break
        }
      }
      if (targetContract) break
    }

    if (!targetOwner || !targetContract) {
      logger.warn('Contract not found for items fetch', { module: 'ContractsStore', contractId })
      return undefined
    }

    if (!canFetchItems(targetContract)) {
      logger.debug('Contract items not fetchable', { module: 'ContractsStore', contractId })
      return undefined
    }

    try {
      logger.debug('Fetching items for contract', { module: 'ContractsStore', contractId })

      let items: ESIContractItem[]
      if (targetContract.for_corporation && targetOwner.corporationId) {
        items = await getCorporationContractItems(targetOwner.characterId, targetOwner.corporationId, contractId)
      } else {
        items = await fetchContractItemsFromESI(targetOwner.characterId, contractId)
      }

      await saveContractItems(contractId, items as CachedContractItems['items'])
      set((s) => ({ updateCounter: s.updateCounter + 1 }))
      triggerResolution()

      return items
    } catch (err) {
      logger.error('Failed to fetch contract items', err instanceof Error ? err : undefined, {
        module: 'ContractsStore',
        contractId,
      })
      await saveContractItems(contractId, [])
      return undefined
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const currentOwnerKey = `${ownerType}-${ownerId}`
    const updated = state.contractsByOwner.filter(
      (oc) => `${oc.owner.type}-${oc.owner.id}` !== currentOwnerKey
    )

    if (updated.length === state.contractsByOwner.length) return

    await db.delete(currentOwnerKey)
    set({ contractsByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(currentOwnerKey)

    logger.info('Contracts removed for owner', { module: 'ContractsStore', ownerKey: currentOwnerKey })
  },

  clear: async () => {
    await db.clear()
    set({
      contractsByOwner: [],
      updateError: null,
      initialized: false,
    })
  },
}))

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
  const owner = findOwnerByKey(ownerKeyStr)
  if (!owner) {
    logger.warn('Owner not found for refresh', { module: 'ContractsStore', ownerKey: ownerKeyStr })
    return
  }
  await useContractsStore.getState().updateForOwner(owner)
})
