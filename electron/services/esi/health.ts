import { logger } from '../logger.js'
import {
  ESI_BASE_URL,
  ESI_COMPATIBILITY_DATE,
  ESI_CONFIG,
  makeUserAgent,
  type ESIRouteHealth,
  type ESIRouteStatus,
  type ESIHealthStatus,
} from './types'
import { isAbortError } from '../fetch-utils.js'

interface HealthApiResponse {
  routes: Array<{
    method: string
    path: string
    status: string
  }>
}

export class ESIHealthChecker {
  private cache: ESIHealthStatus | null = null
  private fetchPromise: Promise<ESIHealthStatus> | null = null
  private userAgent: string
  private baseHealthMap: Map<string, ESIRouteStatus> = new Map()

  constructor(appVersion: string) {
    this.userAgent = makeUserAgent(appVersion)
  }

  async ensureHealthy(
    endpoint: string
  ): Promise<{ healthy: boolean; error?: string }> {
    const status = await this.getHealthStatus()

    if (status.status === 'down') {
      return { healthy: false, error: 'ESI service unavailable' }
    }

    const base = this.extractBase(endpoint)
    const baseStatus = this.baseHealthMap.get(base)

    if (baseStatus === 'Down' || baseStatus === 'Unknown') {
      return {
        healthy: false,
        error: `ESI ${base} endpoints are ${baseStatus.toLowerCase()}`,
      }
    }

    return { healthy: true }
  }

  async getHealthStatus(): Promise<ESIHealthStatus> {
    if (
      this.cache &&
      Date.now() - this.cache.fetchedAt < ESI_CONFIG.healthCacheTtlMs
    ) {
      return this.cache
    }

    if (this.fetchPromise) {
      return this.fetchPromise
    }

    this.fetchPromise = this.fetchHealthStatus()
    try {
      const result = await this.fetchPromise
      return result
    } finally {
      this.fetchPromise = null
    }
  }

  getCachedStatus(): ESIHealthStatus | null {
    return this.cache
  }

  private async fetchHealthStatus(): Promise<ESIHealthStatus> {
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      ESI_CONFIG.healthRequestTimeoutMs
    )

    try {
      const response = await fetch(`${ESI_BASE_URL}/meta/status`, {
        headers: {
          'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        logger.warn('ESI health check failed', {
          module: 'ESI',
          status: response.status,
        })
        return this.createUnknownStatus()
      }

      const data = (await response.json()) as HealthApiResponse
      if (!data.routes || !Array.isArray(data.routes)) {
        logger.warn('ESI health check returned invalid data', { module: 'ESI' })
        return this.createUnknownStatus()
      }

      const routes: ESIRouteHealth[] = data.routes.map((r) => ({
        method: r.method,
        path: r.path,
        status: this.parseStatus(r.status),
      }))

      this.buildBaseHealthMap(routes)
      const overallStatus = this.calculateOverallStatus(routes)
      this.cache = {
        healthy: overallStatus === 'healthy' || overallStatus === 'degraded',
        status: overallStatus,
        routes,
        fetchedAt: Date.now(),
      }

      if (overallStatus === 'down') {
        logger.warn('ESI is down', { module: 'ESI' })
      } else if (overallStatus === 'degraded') {
        logger.info('ESI is degraded', { module: 'ESI' })
      }

      return this.cache
    } catch (err) {
      clearTimeout(timeoutId)
      const message = isAbortError(err)
        ? 'Health check timeout'
        : err instanceof Error
          ? err.message
          : 'Unknown error'
      logger.warn('ESI health check error', { module: 'ESI', error: message })
      return this.createUnknownStatus()
    }
  }

  private parseStatus(status: string): ESIRouteStatus {
    switch (status) {
      case 'OK':
        return 'OK'
      case 'Degraded':
        return 'Degraded'
      case 'Down':
        return 'Down'
      case 'Recovering':
        return 'Recovering'
      default:
        return 'Unknown'
    }
  }

  private calculateOverallStatus(
    routes: ESIRouteHealth[]
  ): 'healthy' | 'degraded' | 'down' | 'unknown' {
    if (routes.length === 0) return 'unknown'

    let downCount = 0
    let degradedCount = 0
    let unknownCount = 0

    for (const route of routes) {
      if (route.status === 'Down') downCount++
      else if (route.status === 'Degraded') degradedCount++
      else if (route.status === 'Unknown') unknownCount++
    }

    const downRatio = downCount / routes.length
    if (downRatio > 0.5) return 'down'
    if (downCount > 0 || degradedCount > 0) return 'degraded'
    if (unknownCount > routes.length * 0.5) return 'unknown'
    return 'healthy'
  }

  private extractBase(endpoint: string): string {
    const path = endpoint.split('?')[0] ?? endpoint
    const segments = path.split('/').filter(Boolean)
    return segments[0] ? `/${segments[0]}/` : '/'
  }

  private buildBaseHealthMap(routes: ESIRouteHealth[]): void {
    const baseWorst = new Map<string, ESIRouteStatus>()
    const statusPriority: Record<ESIRouteStatus, number> = {
      Down: 4,
      Unknown: 3,
      Degraded: 2,
      Recovering: 1,
      OK: 0,
    }

    for (const route of routes) {
      const base = this.extractBase(route.path)
      const current = baseWorst.get(base)
      if (!current || statusPriority[route.status] > statusPriority[current]) {
        baseWorst.set(base, route.status)
      }
    }

    this.baseHealthMap = baseWorst
  }

  private createUnknownStatus(): ESIHealthStatus {
    if (
      this.cache &&
      Date.now() - this.cache.fetchedAt < ESI_CONFIG.healthCacheTtlMs * 5
    ) {
      return this.cache
    }
    return {
      healthy: true,
      status: 'unknown',
      routes: [],
      fetchedAt: Date.now(),
    }
  }
}
