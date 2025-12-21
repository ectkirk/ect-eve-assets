import { app, ipcMain } from 'electron'
import { logger } from './logger.js'

const MUTAMARKET_API_BASE = 'https://mutamarket.com/api'
const MUTAMARKET_TIMEOUT_MS = 5000

export function registerMutamarketHandlers(): void {
  ipcMain.handle(
    'mutamarket:module',
    async (_event, itemId: unknown, typeId?: unknown) => {
      if (
        typeof itemId !== 'number' ||
        !Number.isInteger(itemId) ||
        itemId <= 0
      ) {
        return { error: 'Invalid item ID' }
      }

      const headers = {
        'User-Agent': `ECTEVEAssets/${app.getVersion()} (ecteveassets@edencom.net)`,
        'Content-Type': 'application/json',
      }

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(
          () => controller.abort(),
          MUTAMARKET_TIMEOUT_MS
        )

        const getResponse = await fetch(
          `${MUTAMARKET_API_BASE}/modules/${itemId}`,
          {
            signal: controller.signal,
            headers,
          }
        )
        clearTimeout(timeoutId)

        if (getResponse.ok) {
          return await getResponse.json()
        }

        if (getResponse.status !== 404) {
          return {
            error: `HTTP ${getResponse.status}`,
            status: getResponse.status,
          }
        }

        if (
          typeof typeId !== 'number' ||
          !Number.isInteger(typeId) ||
          typeId <= 0
        ) {
          return { error: 'HTTP 404', status: 404 }
        }

        const postController = new AbortController()
        const postTimeoutId = setTimeout(
          () => postController.abort(),
          MUTAMARKET_TIMEOUT_MS
        )

        const postResponse = await fetch(`${MUTAMARKET_API_BASE}/modules`, {
          method: 'POST',
          signal: postController.signal,
          headers,
          body: JSON.stringify({ type_id: typeId, item_id: itemId }),
        })
        clearTimeout(postTimeoutId)

        if (!postResponse.ok) {
          return {
            error: `HTTP ${postResponse.status}`,
            status: postResponse.status,
          }
        }
        return await postResponse.json()
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
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
