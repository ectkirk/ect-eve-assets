import { INSURGENCIES_REFRESH_INTERVAL_MS } from './insurgencies-store'

let insurgenciesInterval: ReturnType<typeof setInterval> | null = null

export function startInsurgenciesRefreshTimer(
  fetchFn: () => Promise<void>
): void {
  if (insurgenciesInterval) return
  fetchFn()
  insurgenciesInterval = setInterval(fetchFn, INSURGENCIES_REFRESH_INTERVAL_MS)
}

export function stopInsurgenciesRefreshTimer(): void {
  if (insurgenciesInterval) {
    clearInterval(insurgenciesInterval)
    insurgenciesInterval = null
  }
}
