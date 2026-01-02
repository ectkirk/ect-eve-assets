import { ipcMain, shell, session, app, BrowserWindow } from 'electron'
import {
  startAuth,
  refreshAccessToken,
  revokeToken,
  cancelAuth,
} from './auth.js'
import { logger, type LogLevel, type LogContext } from './logger.js'
import { installUpdate } from './updater.js'
import { isValidCharacterId, isValidObject } from './validation.js'

const BUG_REPORT_WEBHOOK = process.env.DISCORD_BUG_WEBHOOK || ''

const VALID_LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const
const MAX_LOG_MESSAGE_LENGTH = 10000
const MAX_LOG_CONTEXT_SIZE = 50000
const MAX_STORAGE_SIZE = 5 * 1024 * 1024
const MAX_REFRESH_TOKEN_LENGTH = 4000
const MAX_BUG_DESCRIPTION_LENGTH = 1024

interface WindowContext {
  getMainWindow: () => BrowserWindow | null
  toggleMaximize: () => void
  isMaximized: () => boolean
  characterTokens: Map<number, string>
  readStorage: () => Record<string, unknown> | null
  writeStorage: (data: Record<string, unknown>) => void
}

export function registerAuthHandlers(ctx: WindowContext): void {
  ipcMain.handle(
    'auth:start',
    async (_event, includeCorporationScopes: unknown) => {
      const includeCorpScopes =
        typeof includeCorporationScopes === 'boolean'
          ? includeCorporationScopes
          : false
      const result = await startAuth(includeCorpScopes)
      if (result.success && result.refreshToken && result.characterId) {
        ctx.characterTokens.set(result.characterId, result.refreshToken)
      }
      return result
    }
  )

  ipcMain.handle('auth:cancel', () => {
    cancelAuth()
  })

  ipcMain.handle(
    'auth:refresh',
    async (_event, refreshToken: unknown, characterId: unknown) => {
      if (
        typeof refreshToken !== 'string' ||
        refreshToken.length === 0 ||
        refreshToken.length > MAX_REFRESH_TOKEN_LENGTH
      ) {
        return { success: false, error: 'Invalid refresh token' }
      }
      if (!isValidCharacterId(characterId)) {
        return { success: false, error: 'Invalid character ID' }
      }
      const result = await refreshAccessToken(refreshToken)
      if (result.success && result.refreshToken && characterId) {
        ctx.characterTokens.set(characterId, result.refreshToken)
      }
      return result
    }
  )

  ipcMain.handle('auth:logout', async (_event, characterId: unknown) => {
    if (characterId !== undefined) {
      if (!isValidCharacterId(characterId)) {
        return { success: false, error: 'Invalid character ID' }
      }
      const token = ctx.characterTokens.get(characterId)
      if (token) {
        await revokeToken(token)
        ctx.characterTokens.delete(characterId)
      }
    } else {
      const tokens = [...ctx.characterTokens.entries()]
      await Promise.all(tokens.map(([, token]) => revokeToken(token)))
      ctx.characterTokens.clear()
    }
    return { success: true }
  })
}

export function registerStorageHandlers(ctx: WindowContext): void {
  ipcMain.handle('storage:get', () => {
    return ctx.readStorage()
  })

  ipcMain.handle('storage:set', (_event, data: unknown) => {
    if (!isValidObject(data)) {
      logger.error('Invalid storage data type', undefined, {
        module: 'Storage',
      })
      return false
    }
    try {
      const json = JSON.stringify(data)
      if (json.length > MAX_STORAGE_SIZE) {
        logger.error('Storage data exceeds size limit', undefined, {
          module: 'Storage',
        })
        return false
      }
    } catch {
      logger.error('Storage data not serializable', undefined, {
        module: 'Storage',
      })
      return false
    }
    ctx.writeStorage(data as Record<string, unknown>)
    return true
  })
}

export function registerLoggingHandlers(): void {
  ipcMain.handle(
    'log:write',
    (_event, level: unknown, message: unknown, context: unknown) => {
      if (
        typeof level !== 'string' ||
        !VALID_LOG_LEVELS.includes(level as LogLevel)
      ) {
        return { success: false, error: 'Invalid log level' }
      }
      if (typeof message !== 'string') {
        return { success: false, error: 'Invalid message' }
      }
      const truncatedMessage = message.slice(0, MAX_LOG_MESSAGE_LENGTH)

      let validContext: LogContext | undefined
      if (context !== undefined) {
        if (!isValidObject(context)) {
          return { success: false, error: 'Invalid context' }
        }
        try {
          const contextJson = JSON.stringify(context)
          if (contextJson.length > MAX_LOG_CONTEXT_SIZE) {
            return { success: false, error: 'Context too large' }
          }
          validContext = context as LogContext
        } catch {
          return { success: false, error: 'Context not serializable' }
        }
      }

      const logContext = { ...validContext, source: 'renderer' }
      switch (level as LogLevel) {
        case 'DEBUG':
          break
        case 'INFO':
          logger.info(truncatedMessage, logContext)
          break
        case 'WARN':
          logger.warn(truncatedMessage, logContext)
          break
        case 'ERROR':
          logger.error(truncatedMessage, undefined, logContext)
          break
      }
      return { success: true }
    }
  )

  ipcMain.handle('log:getDir', () => {
    return logger.getLogDir()
  })

  ipcMain.handle('log:openFolder', () => {
    const logDir = logger.getLogDir()
    shell.openPath(logDir)
  })
}

export function registerBugReportHandler(): void {
  ipcMain.handle(
    'bug:report',
    async (_event, characterName: unknown, description: unknown) => {
      if (!BUG_REPORT_WEBHOOK) {
        return { success: false, error: 'Bug reporting not configured' }
      }
      if (typeof description !== 'string' || !description.trim()) {
        return { success: false, error: 'Description is required' }
      }

      try {
        const response = await fetch(BUG_REPORT_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [
              {
                title: 'Bug Report',
                color: 0xed4245,
                fields: [
                  {
                    name: 'Contact',
                    value:
                      typeof characterName === 'string' && characterName.trim()
                        ? characterName.trim()
                        : 'Not provided',
                    inline: true,
                  },
                  {
                    name: 'Description',
                    value: description
                      .trim()
                      .substring(0, MAX_BUG_DESCRIPTION_LENGTH),
                  },
                ],
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        })

        if (!response.ok) {
          return { success: false, error: 'Failed to submit report' }
        }

        return { success: true }
      } catch (err) {
        logger.error('Bug report submission failed', err, {
          module: 'BugReport',
        })
        return { success: false, error: 'Failed to submit report' }
      }
    }
  )
}

export function registerUpdaterHandler(): void {
  ipcMain.handle('updater:install', () => {
    installUpdate()
  })
}

export function registerWindowControlHandlers(ctx: WindowContext): void {
  ipcMain.handle('window:minimize', () => {
    ctx.getMainWindow()?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    ctx.toggleMaximize()
  })

  ipcMain.handle('window:close', () => {
    ctx.getMainWindow()?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return ctx.isMaximized()
  })

  ipcMain.handle('window:getPlatform', () => {
    return process.platform
  })

  ipcMain.handle('window:setTitleBarOverlay', (_event, options: unknown) => {
    const mainWindow = ctx.getMainWindow()
    if (process.platform === 'darwin' || !mainWindow) return
    if (typeof options !== 'object' || options === null) return
    const opts = options as Record<string, unknown>
    const overlayOptions: Electron.TitleBarOverlayOptions = {}
    if (typeof opts.color === 'string') overlayOptions.color = opts.color
    if (typeof opts.symbolColor === 'string')
      overlayOptions.symbolColor = opts.symbolColor
    if (typeof opts.height === 'number') overlayOptions.height = opts.height
    mainWindow.setTitleBarOverlay(overlayOptions)
  })

  ipcMain.handle('window:clearStorageAndRestart', async () => {
    logger.info('Clearing all storage data and restarting', {
      module: 'Window',
    })
    try {
      await session.defaultSession.clearStorageData()
      app.relaunch()
      app.exit(0)
    } catch (err) {
      logger.error('Failed to clear storage', err, { module: 'Window' })
      throw err
    }
  })
}
