import path from 'node:path'
import fs from 'node:fs'
import { app, BrowserWindow, shell, safeStorage, screen } from 'electron'
import { logger } from './logger.js'
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

  if (savedState.isMaximized) {
    const display = screen.getDisplayMatching(manager.mainWindow.getBounds())
    manager.restoreBounds = manager.mainWindow.getBounds()
    manager.mainWindow.setBounds(display.workArea)
    manager.manualMaximized = true
  }

  let normalBounds = manager.mainWindow.getBounds()
  let saveTimeout: NodeJS.Timeout | null = null

  const saveCurrentState = () => {
    if (!manager.mainWindow) return
    const isMax = manager.manualMaximized || manager.mainWindow.isMaximized()
    if (!isMax) {
      normalBounds = manager.mainWindow.getBounds()
    }
    saveWindowState({
      ...normalBounds,
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
    } catch {
      // Invalid URL, ignore
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

  const normalBounds = manager.mainWindow.getBounds()

  manager.mainWindow.on('maximize', () => {
    if (!manager.manualMaximized && manager.mainWindow) {
      manager.restoreBounds = normalBounds
    }
    manager.manualMaximized = true
    manager.mainWindow?.webContents.send('window:maximizeChange', true)
  })

  manager.mainWindow.on('unmaximize', () => {
    manager.manualMaximized = false
    manager.restoreBounds = null
    manager.mainWindow?.webContents.send('window:maximizeChange', false)
  })

  manager.mainWindow.on('minimize', () => {
    logger.info('Window minimized, pausing API operations', {
      module: 'Window',
    })
    getESIService().pause()
    manager.mainWindow?.webContents.send('window:minimizeChange', true)
  })

  manager.mainWindow.on('restore', () => {
    logger.info('Window restored, resuming API operations', {
      module: 'Window',
    })
    getESIService().resume()
    manager.mainWindow?.webContents.send('window:minimizeChange', false)
  })
}
