import { setRecordValue } from './record-utils'

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function parseJsonRecord(value: string | null): Record<string, unknown> {
  if (!value) return {}

  const parsed: unknown = JSON.parse(value)
  if (!isJsonRecord(parsed)) return {}

  return parsed
}

export function parseBooleanRecord(
  value: string | null,
): Record<string, boolean> {
  const parsed = parseJsonRecord(value)
  let result: Record<string, boolean> = {}

  for (const [key, item] of Object.entries(parsed)) {
    if (typeof item === 'boolean') {
      result = setRecordValue(result, key, item)
    }
  }

  return result
}

export function parseJsonString(value: string | null): string | null {
  if (!value) return null

  const parsed: unknown = JSON.parse(value)
  return typeof parsed === 'string' ? parsed : null
}
