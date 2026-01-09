import type {
  InsurgencyCampaign,
  InsurgencyResult,
} from '../../../shared/electron-api-types'

export async function getInsurgencies(): Promise<InsurgencyCampaign[]> {
  const result: InsurgencyResult = await window.electronAPI!.insurgencyGet()
  if (result.error || !result.data) {
    throw new Error(result.error ?? 'Failed to fetch insurgencies')
  }
  return result.data
}
