import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

import { logger, initLogger } from './services/logger.js'
import { initUpdater, stopUpdater } from './services/updater.js'
import {
  createWindow,
  readStorage,
  writeStorage,
  toggleMaximize,
  type WindowManager,
} from './services/window.js'
import {
  registerAuthHandlers,
  registerStorageHandlers,
  registerLoggingHandlers,
  registerBugReportHandler,
  registerUpdaterHandler,
  registerWindowControlHandlers,
} from './services/ipc-handlers.js'
import { registerRefAPIHandlers } from './services/ref-api.js'
import { registerMutamarketHandlers } from './services/mutamarket.js'
import {
  setupESIService,
  registerESIHandlers,
} from './services/esi-handlers.js'
import { getESIService } from './services/esi/index.js'

const APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(APP_ROOT, 'dist')
export const VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(APP_ROOT, 'public')
  : RENDERER_DIST

const characterTokens = new Map<number, string>()
const windowManager: WindowManager = {
  mainWindow: null,
  manualMaximized: false,
  restoreBounds: null,
  normalBounds: null,
  isToggling: false,
}

const windowContext = {
  getMainWindow: () => windowManager.mainWindow,
  toggleMaximize: () => toggleMaximize(windowManager),
  isMaximized: () => windowManager.manualMaximized,
  characterTokens,
  readStorage,
  writeStorage,
}

function registerAllHandlers(): void {
  registerAuthHandlers(windowContext)
  registerStorageHandlers(windowContext)
  registerLoggingHandlers()
  registerBugReportHandler()
  registerUpdaterHandler()
  registerWindowControlHandlers(windowContext)
  registerRefAPIHandlers()
  registerMutamarketHandlers()
  setupESIService(() => windowManager.mainWindow)
  registerESIHandlers()
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  const handleShutdownSignal = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`, {
      module: 'Main',
    })
    getESIService().saveImmediately()
    app.quit()
  }

  process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'))
  process.on('SIGINT', () => handleShutdownSignal('SIGINT'))
  app.on('second-instance', () => {
    if (windowManager.mainWindow) {
      if (windowManager.mainWindow.isMinimized()) {
        windowManager.mainWindow.restore()
      }
      windowManager.mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    initLogger()
    logger.info('App starting', { module: 'Main', version: app.getVersion() })

    registerAllHandlers()

    createWindow(
      VITE_DEV_SERVER_URL,
      RENDERER_DIST,
      VITE_PUBLIC,
      path.join(__dirname, 'preload.cjs'),
      windowManager
    )
    logger.info('Main window created', { module: 'Main' })

    if (app.isPackaged && windowManager.mainWindow) {
      initUpdater(windowManager.mainWindow)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(
          VITE_DEV_SERVER_URL,
          RENDERER_DIST,
          VITE_PUBLIC,
          path.join(__dirname, 'preload.cjs'),
          windowManager
        )
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    stopUpdater()
    getESIService().saveImmediately()
  })
}
