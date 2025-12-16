import { type Owner } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { useAssetStore } from './asset-store'
import { esi } from '@/api/esi'
import { ESIIndustryJobSchema } from '@/api/schemas'
import { fetchPrices } from '@/api/ref-client'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESIIndustryJob = z.infer<typeof ESIIndustryJobSchema>

export interface OwnerJobs {
  owner: Owner
  jobs: ESIIndustryJob[]
}

function getEndpoint(owner: Owner): string {
  return owner.type === 'corporation'
    ? `/corporations/${owner.id}/industry/jobs/`
    : `/characters/${owner.characterId}/industry/jobs/`
}

async function fetchJobsForOwner(owner: Owner) {
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

async function fetchProductPrices(jobs: ESIIndustryJob[]) {
  const productTypeIds = new Set<number>()
  for (const job of jobs) {
    if (job.product_type_id) {
      productTypeIds.add(job.product_type_id)
    }
  }

  if (productTypeIds.size === 0) return

  try {
    const prices = await fetchPrices(Array.from(productTypeIds))
    if (prices.size > 0) {
      await useAssetStore.getState().setPrices(prices)
    }
  } catch (err) {
    logger.error('Failed to fetch industry job prices', err instanceof Error ? err : undefined, {
      module: 'IndustryJobsStore',
    })
  }
}

export const useIndustryJobsStore = createOwnerStore<ESIIndustryJob[], OwnerJobs>({
  name: 'industry jobs',
  moduleName: 'IndustryJobsStore',
  endpointPattern: '/industry/jobs/',
  dbConfig: {
    dbName: 'ecteveassets-industry-jobs',
    storeName: 'jobs',
    dataKey: 'jobs',
    metaStoreName: 'meta',
  },
  disableAutoRefresh: true,
  getEndpoint,
  fetchData: async (owner) => {
    const result = await fetchJobsForOwner(owner)
    await fetchProductPrices(result.data)
    return { data: result.data, expiresAt: result.expiresAt, etag: result.etag }
  },
  toOwnerData: (owner, data) => ({ owner, jobs: data }),
  isEmpty: (data) => data.length === 0,
})
