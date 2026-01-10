import { esi } from '../esi'

export function postAutopilotWaypoint(
  characterId: number,
  destinationId: number,
  options?: { addToBeginning?: boolean; clearOthers?: boolean }
): void {
  const addToBeginning = options?.addToBeginning ?? false
  const clearOthers = options?.clearOthers ?? false
  const params = new URLSearchParams({
    add_to_beginning: String(addToBeginning),
    clear_other_waypoints: String(clearOthers),
    destination_id: String(destinationId),
  })
  esi.fetch<void>(`/ui/autopilot/waypoint?${params}`, {
    method: 'POST',
    characterId,
    fireAndForget: true,
  })
}

export function postOpenContract(
  characterId: number,
  contractId: number
): void {
  const params = new URLSearchParams({ contract_id: String(contractId) })
  esi.fetch<void>(`/ui/openwindow/contract?${params}`, {
    method: 'POST',
    characterId,
    fireAndForget: true,
  })
}

export function postOpenMarketDetails(
  characterId: number,
  typeId: number
): void {
  const params = new URLSearchParams({ type_id: String(typeId) })
  esi.fetch<void>(`/ui/openwindow/marketdetails?${params}`, {
    method: 'POST',
    characterId,
    fireAndForget: true,
  })
}
