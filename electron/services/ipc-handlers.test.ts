import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { IpcMainInvokeEvent, BrowserWindow } from 'electron'

interface WindowContext {
  getMainWindow: () => BrowserWindow | null
  toggleMaximize: () => void
  isMaximized: () => boolean
  characterTokens: Map<number, string>
  readStorage: () => Record<string, unknown> | null
  writeStorage: (data: Record<string, unknown>) => void
}

const mocks = vi.hoisted(() => ({
  ipcMain: {
    handle: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
  },
  session: {
    defaultSession: {
      clearStorageData: vi.fn(),
    },
  },
  app: {
    relaunch: vi.fn(),
    exit: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  startAuth: vi.fn(),
  refreshAccessToken: vi.fn(),
  revokeToken: vi.fn(),
  cancelAuth: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    getLogDir: vi.fn(() => '/test/logs'),
  },
  installUpdate: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: mocks.ipcMain,
  shell: mocks.shell,
  session: mocks.session,
  app: mocks.app,
  BrowserWindow: mocks.BrowserWindow,
}))

vi.mock('./auth.js', () => ({
  startAuth: mocks.startAuth,
  refreshAccessToken: mocks.refreshAccessToken,
  revokeToken: mocks.revokeToken,
  cancelAuth: mocks.cancelAuth,
}))

vi.mock('./logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('./updater.js', () => ({
  installUpdate: mocks.installUpdate,
}))

import {
  registerAuthHandlers,
  registerStorageHandlers,
  registerLoggingHandlers,
  registerBugReportHandler,
  registerWindowControlHandlers,
  registerUpdaterHandler,
} from './ipc-handlers'

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

function getRegisteredHandler(channel: string): IpcHandler {
  const call = mocks.ipcMain.handle.mock.calls.find(
    (c: unknown[]) => c[0] === channel
  )
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as IpcHandler
}

const mockEvent = {} as IpcMainInvokeEvent

describe('IPC Handlers', () => {
  let mockWindow: {
    minimize: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    setTitleBarOverlay: ReturnType<typeof vi.fn>
  }
  let mockCtx: WindowContext

  beforeEach(() => {
    vi.clearAllMocks()

    mockWindow = {
      minimize: vi.fn(),
      close: vi.fn(),
      setTitleBarOverlay: vi.fn(),
    }

    mockCtx = {
      getMainWindow: () => mockWindow as unknown as Electron.BrowserWindow,
      toggleMaximize: vi.fn(),
      isMaximized: vi.fn(() => false),
      characterTokens: new Map(),
      readStorage: vi.fn(() => ({ test: 'data' })),
      writeStorage: vi.fn(),
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('registerAuthHandlers', () => {
    beforeEach(() => {
      registerAuthHandlers(mockCtx)
    })

    describe('auth:refresh', () => {
      it('validates refresh token is a string', async () => {
        const handler = getRegisteredHandler('auth:refresh')
        const result = await handler(mockEvent, 123, 12345678)
        expect(result).toEqual({
          success: false,
          error: 'Invalid refresh token',
        })
      })

      it('rejects empty refresh token', async () => {
        const handler = getRegisteredHandler('auth:refresh')
        const result = await handler(mockEvent, '', 12345678)
        expect(result).toEqual({
          success: false,
          error: 'Invalid refresh token',
        })
      })

      it('rejects too long refresh token', async () => {
        const handler = getRegisteredHandler('auth:refresh')
        const longToken = 'a'.repeat(4001)
        const result = await handler(mockEvent, longToken, 12345678)
        expect(result).toEqual({
          success: false,
          error: 'Invalid refresh token',
        })
      })

      it('validates character ID is a positive integer', async () => {
        const handler = getRegisteredHandler('auth:refresh')

        expect(await handler(mockEvent, 'token', 'not-a-number')).toEqual({
          success: false,
          error: 'Invalid character ID',
        })

        expect(await handler(mockEvent, 'token', -1)).toEqual({
          success: false,
          error: 'Invalid character ID',
        })

        expect(await handler(mockEvent, 'token', 0)).toEqual({
          success: false,
          error: 'Invalid character ID',
        })

        expect(await handler(mockEvent, 'token', 1.5)).toEqual({
          success: false,
          error: 'Invalid character ID',
        })
      })

      it('calls refreshAccessToken with valid inputs', async () => {
        mocks.refreshAccessToken.mockResolvedValue({
          success: true,
          accessToken: 'new-token',
          refreshToken: 'new-refresh',
          characterId: 12345678,
        })

        const handler = getRegisteredHandler('auth:refresh')
        await handler(mockEvent, 'valid-token', 12345678)

        expect(mocks.refreshAccessToken).toHaveBeenCalledWith('valid-token')
      })

      it('stores new refresh token on success', async () => {
        mocks.refreshAccessToken.mockResolvedValue({
          success: true,
          refreshToken: 'new-refresh-token',
        })

        const handler = getRegisteredHandler('auth:refresh')
        await handler(mockEvent, 'old-token', 12345678)

        expect(mockCtx.characterTokens.get(12345678)).toBe('new-refresh-token')
      })
    })

    describe('auth:logout', () => {
      it('validates character ID when provided', async () => {
        const handler = getRegisteredHandler('auth:logout')
        const result = await handler(mockEvent, 'not-a-number')
        expect(result).toEqual({
          success: false,
          error: 'Invalid character ID',
        })
      })

      it('revokes and removes token for specific character', async () => {
        mocks.revokeToken.mockResolvedValue(true)
        mockCtx.characterTokens.set(12345678, 'stored-token')

        const handler = getRegisteredHandler('auth:logout')
        await handler(mockEvent, 12345678)

        expect(mocks.revokeToken).toHaveBeenCalledWith('stored-token')
        expect(mockCtx.characterTokens.has(12345678)).toBe(false)
      })

      it('revokes all tokens when no character ID provided', async () => {
        mocks.revokeToken.mockResolvedValue(true)
        mockCtx.characterTokens.set(1, 'token1')
        mockCtx.characterTokens.set(2, 'token2')

        const handler = getRegisteredHandler('auth:logout')
        await handler(mockEvent, undefined)

        expect(mocks.revokeToken).toHaveBeenCalledTimes(2)
        expect(mockCtx.characterTokens.size).toBe(0)
      })
    })

    describe('auth:start', () => {
      it('converts non-boolean to false', async () => {
        mocks.startAuth.mockResolvedValue({ success: false })

        const handler = getRegisteredHandler('auth:start')
        await handler(mockEvent, 'true')

        expect(mocks.startAuth).toHaveBeenCalledWith(false)
      })

      it('passes boolean value through', async () => {
        mocks.startAuth.mockResolvedValue({ success: false })

        const handler = getRegisteredHandler('auth:start')
        await handler(mockEvent, true)

        expect(mocks.startAuth).toHaveBeenCalledWith(true)
      })
    })
  })

  describe('registerStorageHandlers', () => {
    beforeEach(() => {
      registerStorageHandlers(mockCtx)
    })

    describe('storage:set', () => {
      it('rejects non-object data', async () => {
        const handler = getRegisteredHandler('storage:set')

        expect(await handler(mockEvent, 'string')).toBe(false)
        expect(await handler(mockEvent, 123)).toBe(false)
        expect(await handler(mockEvent, null)).toBe(false)
        expect(await handler(mockEvent, [1, 2, 3])).toBe(false)
      })

      it('rejects data exceeding size limit', async () => {
        const handler = getRegisteredHandler('storage:set')
        const largeData = { data: 'x'.repeat(6 * 1024 * 1024) }
        const result = await handler(mockEvent, largeData)
        expect(result).toBe(false)
      })

      it('rejects non-serializable data', async () => {
        const handler = getRegisteredHandler('storage:set')
        const circular: Record<string, unknown> = {}
        circular.self = circular
        const result = await handler(mockEvent, circular)
        expect(result).toBe(false)
      })

      it('writes valid data', async () => {
        const handler = getRegisteredHandler('storage:set')
        const data = { key: 'value' }
        const result = await handler(mockEvent, data)
        expect(result).toBe(true)
        expect(mockCtx.writeStorage).toHaveBeenCalledWith(data)
      })
    })

    describe('storage:get', () => {
      it('returns stored data', async () => {
        const handler = getRegisteredHandler('storage:get')
        const result = await handler(mockEvent)
        expect(result).toEqual({ test: 'data' })
      })
    })
  })

  describe('registerLoggingHandlers', () => {
    beforeEach(() => {
      registerLoggingHandlers()
    })

    describe('log:write', () => {
      it('validates log level', async () => {
        const handler = getRegisteredHandler('log:write')

        expect(await handler(mockEvent, 'INVALID', 'msg')).toEqual({
          success: false,
          error: 'Invalid log level',
        })

        expect(await handler(mockEvent, 123, 'msg')).toEqual({
          success: false,
          error: 'Invalid log level',
        })
      })

      it('validates message is string', async () => {
        const handler = getRegisteredHandler('log:write')
        const result = await handler(mockEvent, 'INFO', 123)
        expect(result).toEqual({ success: false, error: 'Invalid message' })
      })

      it('validates context is object', async () => {
        const handler = getRegisteredHandler('log:write')

        expect(await handler(mockEvent, 'INFO', 'msg', 'string')).toEqual({
          success: false,
          error: 'Invalid context',
        })

        expect(await handler(mockEvent, 'INFO', 'msg', [1, 2])).toEqual({
          success: false,
          error: 'Invalid context',
        })

        expect(await handler(mockEvent, 'INFO', 'msg', null)).toEqual({
          success: false,
          error: 'Invalid context',
        })
      })

      it('rejects oversized context', async () => {
        const handler = getRegisteredHandler('log:write')
        const largeContext = { data: 'x'.repeat(60000) }
        const result = await handler(mockEvent, 'INFO', 'msg', largeContext)
        expect(result).toEqual({ success: false, error: 'Context too large' })
      })

      it('truncates long messages', async () => {
        const handler = getRegisteredHandler('log:write')
        const longMessage = 'x'.repeat(15000)
        await handler(mockEvent, 'INFO', longMessage)

        const loggedMessage = mocks.logger.info.mock.calls[0]![0]
        expect(loggedMessage.length).toBe(10000)
      })

      it('calls correct logger method', async () => {
        const handler = getRegisteredHandler('log:write')

        await handler(mockEvent, 'INFO', 'info message')
        expect(mocks.logger.info).toHaveBeenCalledWith(
          'info message',
          expect.objectContaining({ source: 'renderer' })
        )

        await handler(mockEvent, 'WARN', 'warn message')
        expect(mocks.logger.warn).toHaveBeenCalled()

        await handler(mockEvent, 'ERROR', 'error message')
        expect(mocks.logger.error).toHaveBeenCalled()
      })

      it('does not log DEBUG level', async () => {
        const handler = getRegisteredHandler('log:write')
        await handler(mockEvent, 'DEBUG', 'debug message')

        expect(mocks.logger.info).not.toHaveBeenCalled()
        expect(mocks.logger.warn).not.toHaveBeenCalled()
        expect(mocks.logger.error).not.toHaveBeenCalled()
      })
    })

    describe('log:getDir', () => {
      it('returns log directory', async () => {
        const handler = getRegisteredHandler('log:getDir')
        const result = await handler(mockEvent)
        expect(result).toBe('/test/logs')
      })
    })
  })

  describe('registerBugReportHandler', () => {
    it('returns error when webhook not configured', async () => {
      registerBugReportHandler()
      const handler = getRegisteredHandler('bug:report')

      const result = await handler(mockEvent, 'Name', 'Description')
      expect(result).toEqual({
        success: false,
        error: 'Bug reporting not configured',
      })
    })
  })

  describe('registerUpdaterHandler', () => {
    it('calls installUpdate', async () => {
      registerUpdaterHandler()
      const handler = getRegisteredHandler('updater:install')
      await handler(mockEvent)
      expect(mocks.installUpdate).toHaveBeenCalled()
    })
  })

  describe('registerWindowControlHandlers', () => {
    beforeEach(() => {
      registerWindowControlHandlers(mockCtx)
    })

    describe('window:minimize', () => {
      it('minimizes the window', async () => {
        const handler = getRegisteredHandler('window:minimize')
        await handler(mockEvent)
        expect(mockWindow.minimize).toHaveBeenCalled()
      })
    })

    describe('window:maximize', () => {
      it('toggles maximize', async () => {
        const handler = getRegisteredHandler('window:maximize')
        await handler(mockEvent)
        expect(mockCtx.toggleMaximize).toHaveBeenCalled()
      })
    })

    describe('window:close', () => {
      it('closes the window', async () => {
        const handler = getRegisteredHandler('window:close')
        await handler(mockEvent)
        expect(mockWindow.close).toHaveBeenCalled()
      })
    })

    describe('window:isMaximized', () => {
      it('returns maximized state', async () => {
        ;(mockCtx.isMaximized as ReturnType<typeof vi.fn>).mockReturnValue(true)
        const handler = getRegisteredHandler('window:isMaximized')
        const result = await handler(mockEvent)
        expect(result).toBe(true)
      })
    })

    describe('window:getPlatform', () => {
      it('returns process platform', async () => {
        const handler = getRegisteredHandler('window:getPlatform')
        const result = await handler(mockEvent)
        expect(result).toBe(process.platform)
      })
    })

    describe('window:setTitleBarOverlay', () => {
      it('rejects non-object options', async () => {
        const handler = getRegisteredHandler('window:setTitleBarOverlay')
        await handler(mockEvent, 'string')
        expect(mockWindow.setTitleBarOverlay).not.toHaveBeenCalled()
      })

      it('sets overlay with valid options', async () => {
        const originalPlatform = process.platform
        Object.defineProperty(process, 'platform', { value: 'win32' })

        const handler = getRegisteredHandler('window:setTitleBarOverlay')
        await handler(mockEvent, {
          color: '#fff',
          symbolColor: '#000',
          height: 30,
        })

        expect(mockWindow.setTitleBarOverlay).toHaveBeenCalledWith({
          color: '#fff',
          symbolColor: '#000',
          height: 30,
        })

        Object.defineProperty(process, 'platform', { value: originalPlatform })
      })
    })
  })
})
