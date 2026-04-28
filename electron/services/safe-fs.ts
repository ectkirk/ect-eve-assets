import { createRequire } from 'node:module'
import path from 'node:path'
import type * as Fs from 'node:fs'

const requireNode = createRequire(import.meta.url)
const nodeFs = requireNode('node:fs') as typeof Fs

function assertPath(value: string): string {
  if (value.includes('\0')) {
    throw new Error('File path contains a null byte')
  }
  return path.resolve(value)
}

export function resolveSafePath(
  basePath: string,
  ...segments: string[]
): string {
  const base = assertPath(basePath)
  const target = assertPath(path.resolve(base, ...segments))
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Resolved path escapes base directory: ${target}`)
  }
  return target
}

export function pathExists(filePath: string): boolean {
  return nodeFs.existsSync(assertPath(filePath))
}

export function ensureDirectory(dirPath: string): void {
  nodeFs.mkdirSync(assertPath(dirPath), { recursive: true })
}

export function readTextFile(filePath: string): string {
  return nodeFs.readFileSync(assertPath(filePath), 'utf-8')
}

export function readBinaryFile(filePath: string): Buffer {
  return nodeFs.readFileSync(assertPath(filePath))
}

export function writeTextFile(
  filePath: string,
  data: string,
  options?: Fs.WriteFileOptions
): void {
  nodeFs.writeFileSync(assertPath(filePath), data, options)
}

export function writeBinaryFile(
  filePath: string,
  data: NodeJS.ArrayBufferView,
  options?: Fs.WriteFileOptions
): void {
  nodeFs.writeFileSync(assertPath(filePath), data, options)
}

export async function writeTextFileAsync(
  filePath: string,
  data: string
): Promise<void> {
  await nodeFs.promises.writeFile(assertPath(filePath), data)
}

export function appendTextFile(filePath: string, data: string): void {
  nodeFs.appendFileSync(assertPath(filePath), data, 'utf-8')
}

export function getFileStats(filePath: string): Fs.Stats {
  return nodeFs.statSync(assertPath(filePath))
}

export function renameFile(fromPath: string, toPath: string): void {
  nodeFs.renameSync(assertPath(fromPath), assertPath(toPath))
}

export function listDirectory(dirPath: string): string[] {
  return nodeFs.readdirSync(assertPath(dirPath))
}

export function removeFile(filePath: string): void {
  nodeFs.unlinkSync(assertPath(filePath))
}

export function createTextReadStream(filePath: string): Fs.ReadStream {
  return nodeFs.createReadStream(assertPath(filePath), { encoding: 'utf-8' })
}
