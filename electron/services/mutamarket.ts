import { app, ipcMain } from 'electron'
import { logger } from './logger.js'
import { fetchWithTimeout, isAbortError } from './fetch-utils.js'
import { isValidCharacterId } from './validation.js'

const MUTAMARKET_API_BASE = 'https://mutamarket.com/api'
const MUTAMARKET_TIMEOUT_MS = 5000

export function registerMutamarketHandlers(): void {
  ipcMain.handle(
    'mutamarket:module',
    async (_event, itemId: unknown, typeId?: unknown) => {
      if (!isValidCharacterId(itemId)) {
        return { error: 'Invalid item ID' }
      }

      const headers = {
        'User-Agent': `ECTEVEAssets/${app.getVersion()} (ecteveassets@edencom.net)`,
        'Content-Type': 'application/json',
      }

      try {
        const getResponse = await fetchWithTimeout(
          `${MUTAMARKET_API_BASE}/modules/${itemId}`,
          { headers, timeoutMs: MUTAMARKET_TIMEOUT_MS }
        )

        if (getResponse.ok) {
          return await getResponse.json()
        }

        if (getResponse.status !== 404) {
          return {
            error: `HTTP ${getResponse.status}`,
            status: getResponse.status,
          }
        }

        if (!isValidCharacterId(typeId)) {
          return { error: 'HTTP 404', status: 404 }
        }

        const postResponse = await fetchWithTimeout(
          `${MUTAMARKET_API_BASE}/modules`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ type_id: typeId, item_id: itemId }),
            timeoutMs: MUTAMARKET_TIMEOUT_MS,
          }
        )

        if (!postResponse.ok) {
          return {
            error: `HTTP ${postResponse.status}`,
            status: postResponse.status,
          }
        }
        return await postResponse.json()
      } catch (err) {
        if (isAbortError(err)) {
          return { error: 'Timeout' }
        }
        logger.error('mutamarket:module fetch failed', err, {
          module: 'Mutamarket',
          itemId,
        })
        return { error: String(err) }
      }
    }
  )
}
