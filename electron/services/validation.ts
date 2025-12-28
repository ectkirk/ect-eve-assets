export function isValidCharacterId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

export function isValidIdArray(
  ids: unknown,
  maxLength: number
): ids is number[] {
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= maxLength &&
    ids.every((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)
  )
}

export function isValidEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) {
    return false
  }
  if (!value.startsWith('/')) return false
  if (value.includes('..')) return false
  if (value.includes('//')) return false
  if (value.includes('\0')) return false
  return true
}

export function isValidString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isValidNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
