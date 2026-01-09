import { esi } from '../esi'

export async function postAutopilotWaypoint(
  characterId: number,
  destinationId: number,
  options?: { addToBeginning?: boolean; clearOthers?: boolean }
): Promise<void> {
  const addToBeginning = options?.addToBeginning ?? false
  const clearOthers = options?.clearOthers ?? false
  const params = new URLSearchParams({
    add_to_beginning: String(addToBeginning),
    clear_other_waypoints: String(clearOthers),
    destination_id: String(destinationId),
  })
  await esi.fetch<void>(`/ui/autopilot/waypoint?${params}`, {
    method: 'POST',
    characterId,
  })
}

export async function postOpenContract(
  characterId: number,
  contractId: number
): Promise<void> {
  const params = new URLSearchParams({ contract_id: String(contractId) })
  await esi.fetch<void>(`/ui/openwindow/contract?${params}`, {
    method: 'POST',
    characterId,
  })
}

export async function postOpenMarketDetails(
  characterId: number,
  typeId: number
): Promise<void> {
  const params = new URLSearchParams({ type_id: String(typeId) })
  await esi.fetch<void>(`/ui/openwindow/marketdetails?${params}`, {
    method: 'POST',
    characterId,
  })
}
