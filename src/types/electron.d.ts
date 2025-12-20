declare global {
  interface AuthResult {
    success: boolean
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    characterId?: number
    characterName?: string
    corporationId?: number
    scopes?: string[]
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
    items?: Record<string, { id: number; name: string; groupId?: number | null; volume?: number | null; packagedVolume?: number | null }>
    pagination?: { total: number; limit: number; nextCursor?: number; hasMore: boolean }
    error?: string
  }

  interface RefRegionsResult {
    items?: Record<string, { id: number; name: string }>
    error?: string
  }

  interface RefSystemsResult {
    items?: Record<string, { id: number; name: string; regionId: number; securityStatus?: number | null }>
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
    items?: Record<string, { id: string; name: string; systemId?: number | null }>
    pagination?: { total: number; limit: number; nextCursor?: string | null; hasMore: boolean }
    error?: string
  }

  interface RefMoonResult {
    id?: number
    name?: string
    systemId?: number
    regionId?: number
    error?: string
  }

  interface MutamarketResult {
    estimated_value?: number | null
    error?: string
    status?: number
  }

  interface RefShipsResult {
    ships?: Record<number, {
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
    }>
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

  interface ManufacturingCostParams {
    product_id?: number
    blueprint_id?: number
    system_id: number
    me?: number
    te?: number
    runs?: number
    facility?: number
    facility_type_id?: number
    me_rig?: number
    te_rig?: number
    rig_type_id?: number
    rig_type_ids?: string
    security_status?: 'h' | 'l' | 'n'
    facility_tax?: number
    use_buy_orders?: boolean
    alpha_clone?: boolean
    system_cost_bonus?: number
    industry?: number
    advanced_industry?: number
  }

  interface ManufacturingMaterial {
    type_id: number
    type_name: string
    quantity: number
    volume_per_unit: number
    volume: number
    cost_per_unit: number
    cost: number
  }

  interface ManufacturingCostResult {
    productId?: number
    blueprintId?: number
    runs?: number
    me?: number
    te?: number
    units?: number
    unitsPerRun?: number
    time?: string
    timePerRun?: string
    timePerUnit?: string
    materials?: Record<string, ManufacturingMaterial>
    materialsVolume?: number
    productVolume?: number
    estimatedItemValue?: number
    systemCostIndex?: number
    systemCostBonuses?: number
    facilityTax?: number
    sccSurcharge?: number
    alphaCloneTax?: number
    totalJobCost?: number
    totalMaterialCost?: number
    totalCost?: number
    totalCostPerRun?: number
    totalCostPerUnit?: number
    error?: string
  }

  interface BlueprintResearchParams {
    blueprint_id: number
    system_id: number
    facility?: number
    metallurgy_level?: number
    research_level?: number
    science_level?: number
    advanced_industry_level?: number
    me_implant?: number
    te_implant?: number
    copy_implant?: number
    me_rig?: number
    te_rig?: number
    copy_rig?: number
    security_status?: 'h' | 'l' | 'n'
    facility_tax?: number
    faction_warfare_bonus?: boolean
    runs_per_copy?: number
  }

  interface BlueprintResearchResult {
    blueprint?: { id: number; name: string }
    systemId?: number
    facility?: string
    costIndices?: {
      researching_material_efficiency: number
      researching_time_efficiency: number
      copying: number
    }
    modifiers?: {
      facility: string
      skills: { metallurgy: number; research: number; science: number; advancedIndustry: number }
      implants: { me: number; te: number; copy: number }
      rigs: { me: string; te: string; copy: string }
      securityStatus: string
      factionWarfareBonus: boolean
    }
    meResearch?: Array<{
      level: number
      duration: number
      durationFormatted: string
      cost: number
      cumulativeDuration: number
      cumulativeDurationFormatted: string
      cumulativeCost: number
    }>
    teResearch?: Array<{
      level: number
      duration: number
      durationFormatted: string
      cost: number
      cumulativeDuration: number
      cumulativeDurationFormatted: string
      cumulativeCost: number
    }>
    copying?: {
      baseTime: number
      runsPerCopy: number
      duration: number
      durationFormatted: string
      installationCost: number
      materials: Array<{ typeId: number; name: string; quantity: number; price: number; total: number }>
      materialsCost: number
      totalCost: number
      maxRuns: number
      maxCopyDuration: number
      maxCopyDurationFormatted: string
      maxCopyInstallationCost: number
      maxCopyMaterialsCost: number
      maxCopyTotalCost: number
      exceeds30DayLimit: boolean
      copiesIn30Days: number
    }
    error?: string
  }

  interface BlueprintListItem {
    id: number
    name: string
    productId: number
    productName: string
  }

  type BlueprintsResult = BlueprintListItem[] | { error: string }

  interface SystemListItem {
    id: number
    name: string
    security: number
  }

  type SystemsResult = SystemListItem[] | { error: string }

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
      standard: { totalValue: number; count: number; period: string; saleCount: number }
      extended: { totalValue: number; count: number; period: string; saleCount: number }
    }
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
    queueLength: number
  }

  interface ESIAPI {
    fetch: <T>(endpoint: string, options?: ESIRequestOptions) => Promise<T>
    fetchWithMeta: <T>(endpoint: string, options?: ESIRequestOptions) => Promise<ESIResponseMeta<T>>
    fetchPaginated: <T>(endpoint: string, options?: ESIRequestOptions) => Promise<T[]>
    fetchPaginatedWithMeta: <T>(endpoint: string, options?: ESIRequestOptions) => Promise<ESIResponseMeta<T[]>>
    clearCache: () => Promise<void>
    clearCacheByPattern: (pattern: string) => Promise<number>
    getRateLimitInfo: () => Promise<ESIRateLimitInfo>
    provideToken: (characterId: number, token: string | null) => Promise<void>
    onRequestToken: (callback: (characterId: number) => void) => () => void
  }

  interface ElectronAPI {
    startAuth: (includeCorporationScopes?: boolean) => Promise<AuthResult>
    cancelAuth: () => Promise<void>
    refreshToken: (refreshToken: string, characterId: number) => Promise<AuthResult>
    logout: (characterId?: number) => Promise<{ success: boolean }>
    storageGet: () => Promise<Record<string, unknown> | null>
    storageSet: (data: Record<string, unknown>) => Promise<boolean>
    writeLog: (level: LogLevel, message: string, context?: LogContext) => Promise<void>
    getLogDir: () => Promise<string>
    openLogsFolder: () => Promise<void>
    submitBugReport: (characterName: string, description: string) => Promise<{ success: boolean; error?: string }>
    refTypesPage: (params?: RefTypesPageParams) => Promise<RefTypesPageResult>
    refCategories: () => Promise<RefApiResult>
    refGroups: () => Promise<RefApiResult>
    refUniverseRegions: () => Promise<RefRegionsResult>
    refUniverseSystems: () => Promise<RefSystemsResult>
    refUniverseStations: () => Promise<RefStationsResult>
    refUniverseStructuresPage: (params?: RefStructuresPageParams) => Promise<RefStructuresPageResult>
    refImplants: (ids: number[]) => Promise<RefApiResult>
    refMoon: (id: number) => Promise<RefMoonResult>
    refShipSlots: (ids: number[]) => Promise<RefShipsResult>
    refMarket: (params: RefMarketParams) => Promise<RefMarketResult>
    refMarketJita: (typeIds: number[]) => Promise<RefMarketJitaResult>
    refMarketPlex: () => Promise<RefMarketPlexResult>
    refMarketContracts: (typeIds: number[]) => Promise<RefMarketContractsResult>
    refManufacturingCost: (params: ManufacturingCostParams) => Promise<ManufacturingCostResult>
    refBlueprintResearch: (params: BlueprintResearchParams) => Promise<BlueprintResearchResult>
    refBlueprints: () => Promise<BlueprintsResult>
    refSystems: () => Promise<SystemsResult>
    refBuybackCalculate: (text: string, config: BuybackConfig) => Promise<BuybackResult>
    refBuybackCalculator: (text: string) => Promise<BuybackCalculatorResult>
    mutamarketModule: (itemId: number, typeId?: number) => Promise<MutamarketResult>
    onUpdateAvailable: (callback: (version: string) => void) => () => void
    onUpdateDownloadProgress: (callback: (percent: number) => void) => () => void
    onUpdateDownloaded: (callback: (version: string) => void) => () => void
    installUpdate: () => Promise<void>
    windowMinimize: () => Promise<void>
    windowMaximize: () => Promise<void>
    windowClose: () => Promise<void>
    windowIsMaximized: () => Promise<boolean>
    windowGetPlatform: () => Promise<string>
    windowSetTitleBarOverlay: (options: { color?: string; symbolColor?: string; height?: number }) => Promise<void>
    onWindowMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void
    onWindowMinimizeChange: (callback: (isMinimized: boolean) => void) => () => void
    esi: ESIAPI
  }

  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
