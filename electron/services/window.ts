import path from 'node:path'
import fs from 'node:fs'
import { app, BrowserWindow, shell, safeStorage, screen } from 'electron'
import { logger } from './logger.js'
import { getErrorMessage } from './fetch-utils.js'
import { getESIService } from './esi/index.js'

const userDataPath = app.getPath('userData')
const storageFile = path.join(userDataPath, 'auth-storage.json')
const windowStateFile = path.join(userDataPath, 'window-state.json')

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1800,
  height: 900,
}

function loadWindowState(): WindowState {
  try {
    if (fs.existsSync(windowStateFile)) {
      const data = JSON.parse(fs.readFileSync(windowStateFile, 'utf-8'))
      if (data.width && data.height) {
        return data
      }
    }
  } catch (err) {
    logger.error('Failed to load window state', err, { module: 'Window' })
  }
  return DEFAULT_WINDOW_STATE
}

function saveWindowState(state: WindowState): void {
  try {
    fs.mkdirSync(userDataPath, { recursive: true })
    fs.writeFileSync(windowStateFile, JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    logger.error('Failed to save window state', err, { module: 'Window' })
  }
}

function canEncrypt(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function readStorage(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(storageFile)) return null

    const fileData = fs.readFileSync(storageFile)

    if (canEncrypt()) {
      try {
        const decrypted = safeStorage.decryptString(fileData)
        return JSON.parse(decrypted)
      } catch {
        logger.warn('Failed to decrypt storage, deleting corrupted file', {
          module: 'Storage',
        })
        fs.unlinkSync(storageFile)
        return null
      }
    } else {
      logger.warn('Encryption not available, using plaintext', {
        module: 'Storage',
      })
      return JSON.parse(fileData.toString('utf-8'))
    }
  } catch (err) {
    logger.error('Failed to read storage', err, { module: 'Storage' })
  }
  return null
}

export function writeStorage(data: Record<string, unknown>): void {
  try {
    fs.mkdirSync(userDataPath, { recursive: true })

    if (canEncrypt()) {
      const encrypted = safeStorage.encryptString(JSON.stringify(data))
      fs.writeFileSync(storageFile, encrypted, { mode: 0o600 })
    } else {
      logger.warn('Encryption not available, using plaintext', {
        module: 'Storage',
      })
      fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), {
        mode: 0o600,
        encoding: 'utf-8',
      })
    }
  } catch (err) {
    logger.error('Failed to write storage', err, { module: 'Storage' })
  }
}

function getValidatedWindowState(state: WindowState): WindowState {
  if (state.x === undefined || state.y === undefined) {
    return state
  }
  const displays = screen.getAllDisplays()
  const centerX = state.x + state.width / 2
  const centerY = state.y + state.height / 2
  for (const display of displays) {
    const { x, y, width, height } = display.workArea
    if (
      centerX >= x &&
      centerX < x + width &&
      centerY >= y &&
      centerY < y + height
    ) {
      return state
    }
  }
  const primary = screen.getPrimaryDisplay().workArea
  return {
    ...state,
    x: primary.x + Math.round((primary.width - state.width) / 2),
    y: primary.y + Math.round((primary.height - state.height) / 2),
    width: Math.min(state.width, primary.width),
    height: Math.min(state.height, primary.height),
  }
}

export interface WindowManager {
  mainWindow: BrowserWindow | null
  manualMaximized: boolean
  restoreBounds: Electron.Rectangle | null
  normalBounds: Electron.Rectangle | null
  isToggling: boolean
}

const DEFAULT_BOUNDS = { x: 100, y: 100, width: 1800, height: 900 }

function safeSend(
  manager: WindowManager,
  channel: string,
  ...args: unknown[]
): void {
  if (manager.mainWindow && !manager.mainWindow.isDestroyed()) {
    try {
      manager.mainWindow.webContents.send(channel, ...args)
    } catch {
      // Window may have been destroyed between check and send
    }
  }
}

export function toggleMaximize(manager: WindowManager): void {
  if (!manager.mainWindow || manager.isToggling) return

  manager.isToggling = true
  try {
    if (manager.manualMaximized) {
      const restoreBounds =
        manager.restoreBounds ?? manager.normalBounds ?? DEFAULT_BOUNDS
      const validBounds = getValidatedWindowState(restoreBounds)

      if (manager.mainWindow.isMaximized()) {
        manager.mainWindow.unmaximize()
      }
      manager.mainWindow.setBounds(validBounds)
      manager.manualMaximized = false
      manager.normalBounds = restoreBounds
      safeSend(manager, 'window:maximizeChange', false)
    } else {
      const currentBounds = manager.mainWindow.getBounds()
      manager.normalBounds = currentBounds
      manager.restoreBounds = currentBounds
      const display = screen.getDisplayMatching(currentBounds)
      const wa = display.workArea
      // On Windows, frameless windows have an invisible ~7px border for shadows
      // Compensate by expanding bounds slightly
      const isWindows = process.platform === 'win32'
      const offset = isWindows ? 7 : 0
      const adjustedBounds = {
        x: wa.x - offset,
        y: wa.y - offset,
        width: wa.width + offset * 2,
        height: wa.height + offset * 2,
      }
      const targetBounds = isWindows ? adjustedBounds : wa
      logger.debug('Maximize window', {
        module: 'Window',
        displayBounds: display.bounds,
        workArea: wa,
        targetBounds,
        windowsOffset: offset,
      })
      manager.mainWindow.setBounds(targetBounds)
      manager.manualMaximized = true
      safeSend(manager, 'window:maximizeChange', true)
    }
  } finally {
    manager.isToggling = false
  }
}

export function createWindow(
  VITE_DEV_SERVER_URL: string | undefined,
  RENDERER_DIST: string,
  VITE_PUBLIC: string,
  preloadPath: string,
  manager: WindowManager
): void {
  const savedState = getValidatedWindowState(loadWindowState())

  manager.mainWindow = new BrowserWindow({
    x: savedState.x,
    y: savedState.y,
    width: savedState.width,
    height: savedState.height,
    minWidth: 1024,
    minHeight: 768,
    frame: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    icon: path.join(VITE_PUBLIC, 'icon.png'),
    title: 'ECT EVE Assets',
    backgroundColor: '#0f172a',
  })

  manager.normalBounds = manager.mainWindow.getBounds()

  if (savedState.isMaximized) {
    const display = screen.getDisplayMatching(manager.mainWindow.getBounds())
    const wa = display.workArea
    const isWindows = process.platform === 'win32'
    const offset = isWindows ? 7 : 0
    const adjustedBounds = {
      x: wa.x - offset,
      y: wa.y - offset,
      width: wa.width + offset * 2,
      height: wa.height + offset * 2,
    }
    manager.restoreBounds = manager.normalBounds
    manager.mainWindow.setBounds(isWindows ? adjustedBounds : wa)
    manager.manualMaximized = true
  }

  let saveTimeout: NodeJS.Timeout | null = null

  const saveCurrentState = () => {
    if (!manager.mainWindow) return
    const isMax = manager.manualMaximized || manager.mainWindow.isMaximized()
    if (!isMax) {
      manager.normalBounds = manager.mainWindow.getBounds()
    }
    saveWindowState({
      ...(manager.normalBounds ?? DEFAULT_WINDOW_STATE),
      isMaximized: isMax,
    })
  }

  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(saveCurrentState, 300)
  }

  manager.mainWindow.on('close', () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveCurrentState()
  })
  manager.mainWindow.on('resize', () => {
    if (!manager.manualMaximized && !manager.mainWindow?.isMaximized())
      debouncedSave()
  })
  manager.mainWindow.on('move', () => {
    if (!manager.manualMaximized && !manager.mainWindow?.isMaximized())
      debouncedSave()
  })

  manager.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch (err) {
      logger.debug('Invalid URL in window open handler', {
        module: 'Window',
        url,
        error: getErrorMessage(err),
      })
    }
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    manager.mainWindow.loadURL(VITE_DEV_SERVER_URL)
    manager.mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    manager.mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  setupKeyboardShortcuts(manager.mainWindow)
  setupWindowEvents(manager)
}

function setupKeyboardShortcuts(mainWindow: BrowserWindow): void {
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!app.isPackaged) {
      if (input.key === 'F12') {
        mainWindow.webContents.toggleDevTools()
        event.preventDefault()
        return
      }
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow.webContents.toggleDevTools()
        event.preventDefault()
        return
      }
    }

    if (input.control && input.key.toLowerCase() === 'q') {
      app.quit()
      event.preventDefault()
      return
    }

    if (input.control && input.key.toLowerCase() === 'r' && !input.shift) {
      mainWindow.webContents.reload()
      event.preventDefault()
      return
    }

    if (input.control && input.shift && input.key.toLowerCase() === 'r') {
      mainWindow.webContents.reloadIgnoringCache()
      event.preventDefault()
      return
    }

    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
      event.preventDefault()
      return
    }

    if (input.control && (input.key === '+' || input.key === '=')) {
      const currentZoom = mainWindow.webContents.getZoomLevel()
      mainWindow.webContents.setZoomLevel(currentZoom + 0.5)
      event.preventDefault()
      return
    }

    if (input.control && input.key === '-') {
      const currentZoom = mainWindow.webContents.getZoomLevel()
      mainWindow.webContents.setZoomLevel(currentZoom - 0.5)
      event.preventDefault()
      return
    }

    if (input.control && input.key === '0') {
      mainWindow.webContents.setZoomLevel(0)
      event.preventDefault()
      return
    }
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process gone', undefined, {
      module: 'Window',
      reason: details.reason,
    })
  })
}

function setupWindowEvents(manager: WindowManager): void {
  if (!manager.mainWindow) return

  // Intercept native maximize (double-click titlebar) and use our custom maximize instead
  let ignoreNextUnmaximize = false

  manager.mainWindow.on('maximize', () => {
    if (manager.isToggling || !manager.mainWindow) return

    logger.debug('Native maximize event', {
      module: 'Window',
      manualMaximized: manager.manualMaximized,
    })

    // Undo native maximize and use our custom toggle
    manager.isToggling = true
    ignoreNextUnmaximize = true
    manager.mainWindow.unmaximize()
    setImmediate(() => {
      manager.isToggling = false
      toggleMaximize(manager)
      // Reset flag after a short delay to catch the async unmaximize event
      setTimeout(() => {
        ignoreNextUnmaximize = false
      }, 100)
    })
  })

  manager.mainWindow.on('unmaximize', () => {
    if (manager.isToggling || ignoreNextUnmaximize) return
    // User double-clicked while maximized - restore window
    if (manager.manualMaximized) {
      logger.debug('Native unmaximize - restoring window', { module: 'Window' })
      toggleMaximize(manager)
    }
  })

  manager.mainWindow.on('minimize', () => {
    logger.info('Window minimized, pausing API operations', {
      module: 'Window',
    })
    getESIService().pause()
    safeSend(manager, 'window:minimizeChange', true)
  })

  manager.mainWindow.on('restore', () => {
    logger.info('Window restored, resuming API operations', {
      module: 'Window',
    })
    getESIService().resume()
    safeSend(manager, 'window:minimizeChange', false)
  })
}
