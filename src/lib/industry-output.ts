import type { ESIIndustryJob } from '@/api/endpoints/industry'
import { getType } from '@/store/reference-cache'

export function getIndustryJobOutputQuantity(job: ESIIndustryJob): number {
  const quantityPerRun = job.product_type_id
    ? (getType(job.product_type_id)?.portionSize ?? 1)
    : 1

  return job.runs * quantityPerRun
}
