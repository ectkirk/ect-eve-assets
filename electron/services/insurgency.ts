import { app, ipcMain } from 'electron'
import { logger } from './logger.js'
import { fetchWithTimeout, isAbortError } from './fetch-utils.js'
import { makeUserAgent } from './esi/types.js'

const INSURGENCY_API_URL = 'https://www.eveonline.com/api/warzone/insurgency'
const INSURGENCY_TIMEOUT_MS = 10000

export function registerInsurgencyHandlers(): void {
  ipcMain.handle('insurgency:get', async () => {
    const headers = {
      'User-Agent': makeUserAgent(app.getVersion()),
      Accept: 'application/json',
    }

    try {
      const response = await fetchWithTimeout(INSURGENCY_API_URL, {
        headers,
        timeoutMs: INSURGENCY_TIMEOUT_MS,
      })

      if (!response.ok) {
        logger.warn('Insurgency API returned error', {
          module: 'Insurgency',
          status: response.status,
        })
        return { error: `HTTP ${response.status}`, status: response.status }
      }

      const data = await response.json()
      return { data }
    } catch (err) {
      if (isAbortError(err)) {
        return { error: 'Timeout' }
      }
      logger.error('insurgency:get fetch failed', err, { module: 'Insurgency' })
      return { error: String(err) }
    }
  })
}
