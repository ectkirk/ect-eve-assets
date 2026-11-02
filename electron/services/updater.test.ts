import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (arg: unknown) => void>()
  return {
    listeners,
    autoUpdater: {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      allowPrerelease: true,
      on: vi.fn((event: string, cb: (arg: unknown) => void) => {
        listeners.set(event, cb)
      }),
      removeAllListeners: vi.fn(),
      checkForUpdates: vi.fn(() => Promise.resolve()),
      quitAndInstall: vi.fn(),
    },
    openExternal: vi.fn(() => Promise.resolve()),
    send: vi.fn(),
  }
})

vi.mock('electron-updater', () => ({ autoUpdater: mocks.autoUpdater }))
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  shell: { openExternal: mocks.openExternal },
}))
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

const originalPlatform = process.platform

async function loadUpdater(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.resetModules()
  const updater = await import('./updater')
  const mainWindow = {
    isDestroyed: () => false,
    webContents: { send: mocks.send },
  }
  updater.initUpdater(mainWindow as never)
  return updater
}

function announce(version: string) {
  mocks.listeners.get('update-available')?.({ version })
}

describe('updater', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listeners.clear()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('auto-downloads and installs on Windows and Linux', async () => {
    const updater = await loadUpdater('win32')
    expect(mocks.autoUpdater.autoDownload).toBe(true)
    expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(true)

    announce('3.0.1')
    expect(mocks.send).not.toHaveBeenCalledWith(
      'updater:manual-update-available',
      expect.anything(),
    )

    updater.installUpdate()
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalled()
    expect(mocks.openExternal).not.toHaveBeenCalled()
    updater.stopUpdater()
  })

  it('on macOS, announces a manual update and opens its release page', async () => {
    const updater = await loadUpdater('darwin')
    expect(mocks.autoUpdater.autoDownload).toBe(false)
    expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(false)

    announce('3.0.1')
    expect(mocks.send).toHaveBeenCalledWith(
      'updater:manual-update-available',
      '3.0.1',
    )

    updater.installUpdate()
    expect(mocks.openExternal).toHaveBeenCalledWith(
      'https://github.com/ectkirk/ect-eve-assets/releases/tag/v3.0.1',
    )
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    updater.stopUpdater()
  })

  it('falls back to the latest release page for unexpected versions', async () => {
    const { releasePageUrl } = await loadUpdater('darwin')
    expect(releasePageUrl('3.1.0-beta.1')).toBe(
      'https://github.com/ectkirk/ect-eve-assets/releases/tag/v3.1.0-beta.1',
    )
    expect(releasePageUrl('../../evil')).toBe(
      'https://github.com/ectkirk/ect-eve-assets/releases/latest',
    )
    expect(releasePageUrl(null)).toBe(
      'https://github.com/ectkirk/ect-eve-assets/releases/latest',
    )
  })
})
