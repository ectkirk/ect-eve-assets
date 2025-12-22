declare global {
  interface CorporationRolesResult {
    roles: string[]
    roles_at_hq?: string[]
    roles_at_base?: string[]
    roles_at_other?: string[]
  }

  interface AuthResult {
    success: boolean
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    characterId?: number
    characterName?: string
    corporationId?: number
    scopes?: string[]
    corporationRoles?: CorporationRolesResult | null
    error?: string
  }

  type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

  interface LogContext {
    module?: string
    [key: string]: unknown
  }

  interface RefApiResult {
    items?: Record<string, unknown>
    error?: string
  }

  interface RefTypesPageParams {
    after?: number
  }

  interface RefTypesPageResult {
    items?: Record<
      string,
      {
        id: number
        name: string
        groupId?: number | null
        volume?: number | null
        packagedVolume?: number | null
      }
    >
    pagination?: {
      total: number
      limit: number
      nextCursor?: number
      hasMore: boolean
    }
    error?: string
  }

  interface RefRegionsResult {
    items?: Record<string, { id: number; name: string }>
    error?: string
  }

  interface RefSystemsResult {
    items?: Record<
      string,
      {
        id: number
        name: string
        regionId: number
        securityStatus?: number | null
      }
    >
    error?: string
  }

  interface RefStationsResult {
    items?: Record<string, { id: number; name: string; systemId: number }>
    error?: string
  }

  interface RefStructuresPageParams {
    after?: string
  }

  interface RefStructuresPageResult {
    items?: Record<
      string,
      { id: string; name: string; systemId?: number | null }
    >
    pagination?: {
      total: number
      limit: number
      nextCursor?: string | null
      hasMore: boolean
    }
    error?: string
  }

  interface RefMoonsResult {
    items?: Record<string, { id: number; name: string; systemId: number }>
    error?: string
  }

  interface MutamarketResult {
    estimated_value?: number | null
    error?: string
    status?: number
  }

  interface RefShipsResult {
    ships?: Record<
      number,
      {
        id: number
        name: string
        groupId: number
        groupName: string
        slots: {
          high: number
          mid: number
          low: number
          rig: number
          subsystem: number
          launcher: number
          turret: number
        }
      }
    >
    error?: string
  }

  interface RefMarketParams {
    regionId: number
    typeIds: number[]
    avg?: boolean
    buy?: boolean
    jita?: boolean
  }

  interface RefMarketItem {
    lowestSell: number | null
    averagePrice?: number | null
    avg30dPrice?: number | null
    avg30dVolume?: number | null
    highestBuy?: number | null
  }

  interface RefMarketResult {
    regionId?: number
    items?: Record<string, RefMarketItem>
    error?: string
  }

  interface RefMarketJitaResult {
    items?: Record<string, number | null>
    error?: string
  }

  interface RefMarketPlexResult {
    typeId?: number
    lowestSell?: number | null
    highestBuy?: number | null
    error?: string
  }

  interface RefMarketContractItem {
    price: number | null
    salesCount: number
    timeWindow: string
    hasSufficientData: boolean
  }

  interface RefMarketContractsResult {
    items?: Record<string, RefMarketContractItem>
    error?: string
  }

  interface BlueprintListItem {
    id: number
    name: string
    productId: number
    productName: string
  }

  type BlueprintsResult =
    | { items: Record<string, [number, number | null]> }
    | { error: string }

  interface BuybackConfig {
    buyRate: number
    iskPerM3: number
    acceptCapitals: boolean
    assetSafetyRate?: number
  }

  interface BuybackItem {
    itemName: string
    quantity: number
    typeId: number | null
    totalVolume: number
    jitaBuyPrice: number
    jitaSellPrice: number
    buybackValue: number
    matched: boolean
    profitable: boolean
    isCapital: boolean
    assetSafetyCost?: number
  }

  interface BuybackTotals {
    itemCount: number
    matchedCount: number
    profitableCount: number
    totalVolume: number
    jitaBuyTotal: number
    jitaSellTotal: number
    capitalValue: number
    assetSafetyCost: number
    buybackValue: number
  }

  interface BuybackResult {
    items: BuybackItem[]
    totals: BuybackTotals
    unmatchedItems: string[]
    lowVolumeItems: string[]
    excludedItems: string[]
    unprofitableItems: string[]
    excludedCrystals: string[]
    excludedRigs: string[]
    excludedCapitals: string[]
    blueprintCopies: string[]
    unpricedCapitals: string[]
    error?: string
  }

  interface BuybackCalculatorItem {
    itemName: string
    quantity: number
    typeId: number
    volume: number
    totalVolume: number
    groupId: number
    groupName: string
    jitaBuyPrice: number
    jitaSellPrice: number
    totalJitaBuy: number
    totalJitaSell: number
    averagePrice: number | null
    priceStatus: 'normal' | 'no_average' | 'no_price'
    capitalBuyPricing?: { period: string; saleCount: number }
    capitalSellPricing?: { period: string; saleCount: number }
  }

  interface BuybackCalculatorResult {
    items: BuybackCalculatorItem[]
    totals: {
      totalJitaBuy: number
      totalJitaSell: number
      totalVolume: number
      itemCount: number
      assetSafetyFee: number
    }
    unmatchedItems: string[]
    lowVolumeItems: string[]
    buybackValues: {
      highSec: number
      lowSec: number
      nullSec: number
      assetSafety: number
    }
    capitalPricing?: {
      standard: {
        totalValue: number
        count: number
        period: string
        saleCount: number
      }
      extended: {
        totalValue: number
        count: number
        period: string
        saleCount: number
      }
    }
    error?: string
  }

  interface BuybackSecurityConfig {
    name: string
    path: string
    description: string
    buyRate: number
    buyRatePercent: number
    iskPerM3: number
    acceptCapitals: boolean
  }

  interface BuybackAssetSafetyRates {
    highsec: { noNpcStation: number; npcStation: number; iskPerM3: number }
    lowsec: { noNpcStation: number; npcStation: number; iskPerM3: number }
    nullsec: { noNpcStation: number; npcStation: number; iskPerM3: number }
    feeRate: number
    npcStationFeeRate: number
  }

  interface BuybackFAQItem {
    question: string
    answer: string
  }

  interface BuybackInfoResult {
    service?: {
      name: string
      website: string
      discord: string
      corporation: string
    }
    securityConfigs?: Record<string, BuybackSecurityConfig>
    assetSafetyRates?: BuybackAssetSafetyRates
    specialItems?: { buyRate: number; groupIds: number[] }
    capitalShips?: { groupIds: number[] }
    excludedCategories?: Record<string, string>
    excludedGroups?: Record<string, string>
    priceAdjustments?: Record<
      string,
      { name: string; adjustment: number; adjustmentPercent: number }
    >
    alwaysExcluded?: string[]
    highsecIslands?: Array<{ region: string; systems: string[] }>
    faq?: BuybackFAQItem[]
    note?: string
    error?: string
  }

  interface ESIRequestOptions {
    method?: 'GET' | 'POST'
    body?: string
    characterId?: number
    requiresAuth?: boolean
    etag?: string
  }

  interface ESIResponseMeta<T> {
    data: T
    expiresAt: number
    etag: string | null
    notModified: boolean
  }

  interface ESIRateLimitInfo {
    globalRetryAfter: number | null
    activeRequests: number
  }

  interface ESIAPI {
    fetch: <T>(endpoint: string, options?: ESIRequestOptions) => Promise<T>
    fetchWithMeta: <T>(
      endpoint: string,
      options?: ESIRequestOptions
    ) => Promise<ESIResponseMeta<T>>
    fetchPaginated: <T>(
      endpoint: string,
      options?: ESIRequestOptions
    ) => Promise<T[]>
    fetchPaginatedWithMeta: <T>(
      endpoint: string,
      options?: ESIRequestOptions
    ) => Promise<ESIResponseMeta<T[]>>
    clearCache: () => Promise<void>
    clearCacheByPattern: (pattern: string) => Promise<number>
    getRateLimitInfo: () => Promise<ESIRateLimitInfo>
    provideToken: (characterId: number, token: string | null) => Promise<void>
    onRequestToken: (callback: (characterId: number) => void) => () => void
  }

  interface ElectronAPI {
    startAuth: (includeCorporationScopes?: boolean) => Promise<AuthResult>
    cancelAuth: () => Promise<void>
    refreshToken: (
      refreshToken: string,
      characterId: number
    ) => Promise<AuthResult>
    logout: (characterId?: number) => Promise<{ success: boolean }>
    storageGet: () => Promise<Record<string, unknown> | null>
    storageSet: (data: Record<string, unknown>) => Promise<boolean>
    writeLog: (
      level: LogLevel,
      message: string,
      context?: LogContext
    ) => Promise<void>
    getLogDir: () => Promise<string>
    openLogsFolder: () => Promise<void>
    submitBugReport: (
      characterName: string,
      description: string
    ) => Promise<{ success: boolean; error?: string }>
    refTypesPage: (params?: RefTypesPageParams) => Promise<RefTypesPageResult>
    refCategories: () => Promise<RefApiResult>
    refGroups: () => Promise<RefApiResult>
    refUniverseRegions: () => Promise<RefRegionsResult>
    refUniverseSystems: () => Promise<RefSystemsResult>
    refUniverseStations: () => Promise<RefStationsResult>
    refUniverseStructuresPage: (
      params?: RefStructuresPageParams
    ) => Promise<RefStructuresPageResult>
    refImplants: (ids: number[]) => Promise<RefApiResult>
    refMoons: (ids: number[]) => Promise<RefMoonsResult>
    refShipSlots: (ids: number[]) => Promise<RefShipsResult>
    refMarket: (params: RefMarketParams) => Promise<RefMarketResult>
    refMarketJita: (typeIds: number[]) => Promise<RefMarketJitaResult>
    refMarketPlex: () => Promise<RefMarketPlexResult>
    refMarketContracts: (typeIds: number[]) => Promise<RefMarketContractsResult>
    refBlueprints: () => Promise<BlueprintsResult>
    refBuybackCalculate: (
      text: string,
      config: BuybackConfig
    ) => Promise<BuybackResult>
    refBuybackCalculator: (text: string) => Promise<BuybackCalculatorResult>
    refBuybackInfo: () => Promise<BuybackInfoResult>
    mutamarketModule: (
      itemId: number,
      typeId?: number
    ) => Promise<MutamarketResult>
    onUpdateAvailable: (callback: (version: string) => void) => () => void
    onUpdateDownloadProgress: (
      callback: (percent: number) => void
    ) => () => void
    onUpdateDownloaded: (callback: (version: string) => void) => () => void
    installUpdate: () => Promise<void>
    windowMinimize: () => Promise<void>
    windowMaximize: () => Promise<void>
    windowClose: () => Promise<void>
    windowIsMaximized: () => Promise<boolean>
    windowGetPlatform: () => Promise<string>
    windowSetTitleBarOverlay: (options: {
      color?: string
      symbolColor?: string
      height?: number
    }) => Promise<void>
    onWindowMaximizeChange: (
      callback: (isMaximized: boolean) => void
    ) => () => void
    onWindowMinimizeChange: (
      callback: (isMinimized: boolean) => void
    ) => () => void
    esi: ESIAPI
  }

  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
