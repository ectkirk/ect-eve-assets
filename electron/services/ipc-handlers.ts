import { ipcMain, shell, screen, BrowserWindow } from 'electron'
import {
  startAuth,
  refreshAccessToken,
  revokeToken,
  cancelAuth,
} from './auth.js'
import { logger, type LogLevel, type LogContext } from './logger.js'
import { installUpdate } from './updater.js'

const BUG_REPORT_WEBHOOK = process.env.DISCORD_BUG_WEBHOOK || ''

const VALID_LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const
const MAX_LOG_MESSAGE_LENGTH = 10000
const MAX_LOG_CONTEXT_SIZE = 50000
const MAX_STORAGE_SIZE = 5 * 1024 * 1024

interface WindowContext {
  getMainWindow: () => BrowserWindow | null
  getManualMaximized: () => boolean
  setManualMaximized: (value: boolean) => void
  getRestoreBounds: () => Electron.Rectangle | null
  setRestoreBounds: (bounds: Electron.Rectangle | null) => void
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
        refreshToken.length > 4000
      ) {
        return { success: false, error: 'Invalid refresh token' }
      }
      if (
        typeof characterId !== 'number' ||
        !Number.isInteger(characterId) ||
        characterId <= 0
      ) {
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
      if (
        typeof characterId !== 'number' ||
        !Number.isInteger(characterId) ||
        characterId <= 0
      ) {
        return { success: false, error: 'Invalid character ID' }
      }
      const token = ctx.characterTokens.get(characterId)
      if (token) {
        await revokeToken(token)
        ctx.characterTokens.delete(characterId)
      }
    } else {
      for (const [id, token] of ctx.characterTokens) {
        await revokeToken(token)
        ctx.characterTokens.delete(id)
      }
    }
    return { success: true }
  })
}

export function registerStorageHandlers(ctx: WindowContext): void {
  ipcMain.handle('storage:get', () => {
    return ctx.readStorage()
  })

  ipcMain.handle('storage:set', (_event, data: unknown) => {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
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
        if (
          typeof context !== 'object' ||
          context === null ||
          Array.isArray(context)
        ) {
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
                    value: description.trim().substring(0, 1024),
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

function getValidBounds(bounds: Electron.Rectangle): Electron.Rectangle {
  const displays = screen.getAllDisplays()
  for (const display of displays) {
    const { x, y, width, height } = display.workArea
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    if (
      centerX >= x &&
      centerX < x + width &&
      centerY >= y &&
      centerY < y + height
    ) {
      return bounds
    }
  }
  const primary = screen.getPrimaryDisplay().workArea
  return {
    x: primary.x + Math.round((primary.width - bounds.width) / 2),
    y: primary.y + Math.round((primary.height - bounds.height) / 2),
    width: Math.min(bounds.width, primary.width),
    height: Math.min(bounds.height, primary.height),
  }
}

export function registerWindowControlHandlers(ctx: WindowContext): void {
  ipcMain.handle('window:minimize', () => {
    ctx.getMainWindow()?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const mainWindow = ctx.getMainWindow()
    if (!mainWindow) return

    if (ctx.getManualMaximized()) {
      const restoreBounds = ctx.getRestoreBounds()
      if (restoreBounds) {
        mainWindow.setBounds(getValidBounds(restoreBounds))
      }
      ctx.setManualMaximized(false)
      mainWindow.webContents.send('window:maximizeChange', false)
    } else {
      ctx.setRestoreBounds(mainWindow.getBounds())
      const display = screen.getDisplayMatching(mainWindow.getBounds())
      mainWindow.setBounds(display.workArea)
      ctx.setManualMaximized(true)
      mainWindow.webContents.send('window:maximizeChange', true)
    }
  })

  ipcMain.handle('window:close', () => {
    ctx.getMainWindow()?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return ctx.getManualMaximized()
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
}
