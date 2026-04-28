export function getRecordValue<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return new Map(Object.entries(record)).get(key)
}

export function setRecordValue<T>(
  record: Readonly<Record<string, T>>,
  key: string,
  value: NoInfer<T>,
): Record<string, T> {
  return Object.fromEntries([
    ...Object.entries(record).filter(([existingKey]) => existingKey !== key),
    [key, value],
  ])
}

export function removeRecordValue<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([existingKey]) => existingKey !== key),
  )
}
