import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const files = new Map<string, Buffer | string>()
  return {
    files,
    safeStorage: {
      isAsyncEncryptionAvailable: vi.fn(() => Promise.resolve(true)),
      encryptStringAsync: vi.fn((text: string) =>
        Promise.resolve(Buffer.from(`enc:${text}`)),
      ),
      decryptStringAsync: vi.fn((data: Buffer) =>
        Promise.resolve({
          result: data.toString().replace(/^enc:/, ''),
          shouldReEncrypt: false,
        }),
      ),
    },
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  }
})

vi.mock('electron', () => ({
  app: { getPath: () => '/user-data', isPackaged: false },
  BrowserWindow: vi.fn(),
  shell: {},
  screen: {},
  safeStorage: mocks.safeStorage,
}))
vi.mock('./logger.js', () => ({ logger: mocks.logger }))
vi.mock('./fetch-utils.js', () => ({ getErrorMessage: String }))
vi.mock('./esi/index.js', () => ({ getESIService: vi.fn() }))
vi.mock('./safe-fs.js', () => ({
  resolveSafePath: (base: string, name: string) => `${base}/${name}`,
  ensureDirectory: vi.fn(),
  pathExists: (p: string) => mocks.files.has(p),
  readBinaryFile: (p: string) => mocks.files.get(p),
  readTextFile: (p: string) => String(mocks.files.get(p)),
  removeFile: (p: string) => mocks.files.delete(p),
  writeBinaryFile: (p: string, data: Buffer) => mocks.files.set(p, data),
  writeTextFile: (p: string, data: string) => mocks.files.set(p, data),
}))

const STORAGE = '/user-data/auth-storage.json'

async function load() {
  vi.resetModules()
  return import('./window')
}

describe('window storage', () => {
  beforeEach(() => {
    mocks.files.clear()
    vi.clearAllMocks()
  })

  it('round-trips encrypted data', async () => {
    const { writeStorage, readStorage } = await load()
    await writeStorage({ token: 'abc' })
    expect(String(mocks.files.get(STORAGE))).toBe('enc:{"token":"abc"}')
    expect(await readStorage()).toEqual({ token: 'abc' })
  })

  it('coalesces rapid writes and keeps the latest data', async () => {
    const { writeStorage } = await load()
    const writes = [
      writeStorage({ n: 1 }),
      writeStorage({ n: 2 }),
      writeStorage({ n: 3 }),
    ]
    await Promise.all(writes)
    expect(String(mocks.files.get(STORAGE))).toBe('enc:{"n":3}')
    expect(mocks.safeStorage.encryptStringAsync.mock.calls.length).toBe(2)
    expect(mocks.safeStorage.isAsyncEncryptionAvailable).toHaveBeenCalledTimes(
      1,
    )
  })

  it('re-encrypts on key rotation without overwriting a newer write', async () => {
    const { writeStorage, readStorage } = await load()
    mocks.files.set(STORAGE, Buffer.from('enc:{"n":"old"}'))
    mocks.safeStorage.decryptStringAsync.mockResolvedValueOnce({
      result: '{"n":"old"}',
      shouldReEncrypt: true,
    })

    const newer = writeStorage({ n: 'new' })
    expect(await readStorage()).toEqual({ n: 'old' })
    await newer
    await Promise.resolve()

    expect(String(mocks.files.get(STORAGE))).toBe('enc:{"n":"new"}')
  })

  it('re-encrypts on key rotation when nothing else is pending', async () => {
    const { readStorage } = await load()
    mocks.files.set(STORAGE, Buffer.from('enc:{"n":"old"}'))
    mocks.safeStorage.decryptStringAsync.mockResolvedValueOnce({
      result: '{"n":"old"}',
      shouldReEncrypt: true,
    })

    expect(await readStorage()).toEqual({ n: 'old' })
    await vi.waitFor(() => {
      expect(mocks.safeStorage.encryptStringAsync).toHaveBeenCalledWith(
        '{"n":"old"}',
      )
    })
  })

  it('falls back to plaintext and warns once when encryption is unavailable', async () => {
    mocks.safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false)
    const { writeStorage, readStorage } = await load()
    await writeStorage({ a: 1 })
    expect(JSON.parse(String(mocks.files.get(STORAGE)))).toEqual({ a: 1 })
    mocks.files.set(STORAGE, Buffer.from(String(mocks.files.get(STORAGE))))
    expect(await readStorage()).toEqual({ a: 1 })
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1)
    mocks.safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(true)
  })
})
