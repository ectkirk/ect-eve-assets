import { esi } from '../esi'
import { logger } from '@/lib/logger'
import { showToast } from '@/store/toast-store'
import { ESIError } from '../../../shared/esi-types'
import { i18n } from '@/i18n'

let uiRateLimitedUntil = 0

function checkRateLimit(): boolean {
  if (Date.now() < uiRateLimitedUntil) {
    const remainingSec = Math.ceil((uiRateLimitedUntil - Date.now()) / 1000)
    showToast(
      'error',
      i18n.t('common:ui.rateLimited', { seconds: remainingSec })
    )
    return true
  }
  return false
}

function executeUiAction(
  endpoint: string,
  characterId: number,
  logContext: Record<string, unknown>,
  failureKey: string
): void {
  logger.info(`${logContext.action}`, {
    module: 'UI',
    characterId,
    ...logContext,
  })
  esi
    .fetch<void>(endpoint, { method: 'POST', characterId })
    .then(() => {
      logger.info(`${logContext.action} succeeded`, {
        module: 'UI',
        characterId,
        ...logContext,
      })
    })
    .catch((err) => {
      logger.error(`${logContext.action} failed`, err, {
        module: 'UI',
        characterId,
        ...logContext,
      })
      if (
        err instanceof ESIError &&
        (err.status === 420 || err.status === 429)
      ) {
        const waitSec = err.retryAfter ?? 60
        uiRateLimitedUntil = Date.now() + waitSec * 1000
        showToast(
          'error',
          i18n.t('common:ui.rateLimited', { seconds: waitSec })
        )
      } else {
        showToast('error', i18n.t(failureKey))
      }
    })
}

export function postAutopilotWaypoint(
  characterId: number,
  destinationId: number,
  options?: { addToBeginning?: boolean; clearOthers?: boolean }
): void {
  if (checkRateLimit()) return
  const params = new URLSearchParams({
    add_to_beginning: String(options?.addToBeginning ?? false),
    clear_other_waypoints: String(options?.clearOthers ?? false),
    destination_id: String(destinationId),
  })
  executeUiAction(
    `/ui/autopilot/waypoint?${params}`,
    characterId,
    { action: 'Setting autopilot waypoint', destinationId },
    'common:ui.failedWaypoint'
  )
}

export function postOpenContract(
  characterId: number,
  contractId: number
): void {
  if (checkRateLimit()) return
  const params = new URLSearchParams({ contract_id: String(contractId) })
  executeUiAction(
    `/ui/openwindow/contract?${params}`,
    characterId,
    { action: 'Opening contract window', contractId },
    'common:ui.failedContract'
  )
}

export function postOpenMarketDetails(
  characterId: number,
  typeId: number
): void {
  if (checkRateLimit()) return
  const params = new URLSearchParams({ type_id: String(typeId) })
  executeUiAction(
    `/ui/openwindow/marketdetails?${params}`,
    characterId,
    { action: 'Opening market window', typeId },
    'common:ui.failedMarket'
  )
}
