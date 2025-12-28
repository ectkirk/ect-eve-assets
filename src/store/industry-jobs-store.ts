import type { StoreApi, UseBoundStore } from 'zustand'
import { type Owner, findOwnerByKey } from './auth-store'
import { usePriceStore } from './price-store'
import { esi } from '@/api/esi'
import { ESIIndustryJobSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { isIndustryJobBpcProduct } from '@/lib/eve-constants'
import {
  createVisibilityStore,
  type StoredItem,
  type SourceOwner,
  type VisibilityStore,
} from './create-visibility-store'
import { z } from 'zod'

export type ESIIndustryJob = z.infer<typeof ESIIndustryJobSchema>

export interface StoredJob extends StoredItem<ESIIndustryJob> {
  item: ESIIndustryJob
  sourceOwner: SourceOwner
}

export interface OwnerJobs {
  owner: Owner
  jobs: ESIIndustryJob[]
}

interface IndustryJobsExtras {
  getTotal: (
    selectedOwnerIds: string[],
    state?: {
      itemsById: Map<number, StoredJob>
      visibilityByOwner: Map<string, Set<number>>
    }
  ) => number
  getJobsByOwner: (state?: {
    itemsById: Map<number, StoredJob>
    visibilityByOwner: Map<string, Set<number>>
  }) => OwnerJobs[]
}

export type IndustryJobsStore = UseBoundStore<
  StoreApi<VisibilityStore<StoredJob>>
> &
  IndustryJobsExtras

function getEndpoint(owner: Owner): string {
  return owner.type === 'corporation'
    ? `/corporations/${owner.id}/industry/jobs`
    : `/characters/${owner.characterId}/industry/jobs`
}

async function fetchJobsForOwner(owner: Owner): Promise<{
  data: ESIIndustryJob[]
  expiresAt: number
  etag: string | null
}> {
  const endpoint = getEndpoint(owner)

  if (owner.type === 'corporation') {
    return esi.fetchPaginatedWithMeta<ESIIndustryJob>(endpoint, {
      characterId: owner.characterId,
      schema: ESIIndustryJobSchema,
    })
  }

  return esi.fetchWithMeta<ESIIndustryJob[]>(endpoint, {
    characterId: owner.characterId,
    schema: z.array(ESIIndustryJobSchema),
  })
}

async function fetchProductPrices(
  jobsById: Map<number, StoredJob>
): Promise<void> {
  const priceStore = usePriceStore.getState()
  const typeIds: number[] = []

  for (const { item: job } of jobsById.values()) {
    if (job.product_type_id) {
      typeIds.push(job.product_type_id)
    }
  }

  if (typeIds.length === 0) return

  try {
    await priceStore.ensureJitaPrices(typeIds)
  } catch (err) {
    logger.error(
      'Failed to fetch industry job prices',
      err instanceof Error ? err : undefined,
      { module: 'IndustryJobsStore' }
    )
  }
}

const baseStore = createVisibilityStore<ESIIndustryJob, StoredJob>({
  name: 'industry jobs',
  moduleName: 'IndustryJobsStore',
  endpointPattern: '/industry/jobs',
  dbName: 'ecteveassets-industry-jobs-v2',
  itemStoreName: 'jobs',
  itemKeyName: 'jobId',
  getEndpoint,
  getItemId: (job) => job.job_id,
  fetchData: fetchJobsForOwner,
  toStoredItem: (owner, job) => ({
    item: job,
    sourceOwner: {
      type: owner.type,
      id: owner.id,
      characterId: owner.characterId,
    },
  }),
  shouldUpdateExisting: true,
  onAfterInit: fetchProductPrices,
  onAfterBatchUpdate: fetchProductPrices,
})

export const useIndustryJobsStore: IndustryJobsStore = Object.assign(
  baseStore,
  {
    getTotal(
      selectedOwnerIds: string[],
      stateOverride?: {
        itemsById: Map<number, StoredJob>
        visibilityByOwner: Map<string, Set<number>>
      }
    ): number {
      const { itemsById, visibilityByOwner } =
        stateOverride ?? baseStore.getState()
      const selectedSet = new Set(selectedOwnerIds)

      const visibleJobIds = new Set<number>()
      for (const [key, jobIds] of visibilityByOwner) {
        if (selectedSet.has(key)) {
          for (const id of jobIds) visibleJobIds.add(id)
        }
      }

      const priceStore = usePriceStore.getState()
      let total = 0
      for (const jobId of visibleJobIds) {
        const stored = itemsById.get(jobId)
        if (!stored) continue

        const { item: job } = stored
        if (job.status !== 'active' && job.status !== 'ready') continue

        const productTypeId = job.product_type_id ?? job.blueprint_type_id
        total +=
          priceStore.getItemPrice(productTypeId, {
            isBlueprintCopy: isIndustryJobBpcProduct(job.activity_id),
          }) * job.runs
      }
      return total
    },

    getJobsByOwner(stateOverride?: {
      itemsById: Map<number, StoredJob>
      visibilityByOwner: Map<string, Set<number>>
    }): OwnerJobs[] {
      const { itemsById, visibilityByOwner } =
        stateOverride ?? baseStore.getState()
      const result: OwnerJobs[] = []

      for (const [ownerKeyStr, jobIds] of visibilityByOwner) {
        const owner = findOwnerByKey(ownerKeyStr)
        if (!owner) continue

        const jobs: ESIIndustryJob[] = []
        for (const jobId of jobIds) {
          const stored = itemsById.get(jobId)
          if (stored) jobs.push(stored.item)
        }

        result.push({ owner, jobs })
      }

      return result
    },
  }
)
