const { contextBridge, ipcRenderer } = require('electron')

export interface CorporationRoles {
  roles: string[]
  roles_at_hq?: string[]
  roles_at_base?: string[]
  roles_at_other?: string[]
}

export interface AuthResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  characterId?: number
  characterName?: string
  corporationId?: number
  scopes?: string[]
  corporationRoles?: CorporationRoles | null
  error?: string
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface LogContext {
  module?: string
  [key: string]: unknown
}

export interface RefApiResult {
  items?: Record<string, unknown>
  error?: string
}

export interface RefTypesPageParams {
  after?: number
}

export interface RefTypesPageResult {
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

export interface RefRegionsResult {
  items?: Record<string, { id: number; name: string }>
  error?: string
}

export interface RefSystemsResult {
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

export interface RefStationsResult {
  items?: Record<string, { id: number; name: string; systemId: number }>
  error?: string
}

export interface RefStructuresPageParams {
  after?: string
}

export interface RefStructuresPageResult {
  items?: Record<string, { id: string; name: string; systemId?: number | null }>
  pagination?: {
    total: number
    limit: number
    nextCursor?: string | null
    hasMore: boolean
  }
  error?: string
}

export interface RefMoonsResult {
  items?: Record<string, { id: number; name: string; systemId: number }>
  error?: string
}

export interface MutamarketResult {
  estimated_value?: number | null
  error?: string
  status?: number
}

export interface RefShipsResult {
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

export interface RefMarketParams {
  regionId: number
  typeIds: number[]
  avg?: boolean
  buy?: boolean
  jita?: boolean
}

export interface RefMarketItem {
  lowestSell: number | null
  averagePrice?: number | null
  avg30dPrice?: number | null
  avg30dVolume?: number | null
  highestBuy?: number | null
}

export interface RefMarketResult {
  regionId?: number
  items?: Record<string, RefMarketItem>
  error?: string
}

export interface RefMarketContractItem {
  price: number | null
  salesCount: number
  timeWindow: string
  hasSufficientData: boolean
}

export interface RefMarketJitaParams {
  typeIds: number[]
  itemIds?: number[]
  contractTypeIds?: number[]
  includePlex?: boolean
}

export interface RefMarketJitaResult {
  items?: Record<string, number | null>
  mutaItems?: Record<string, number | null>
  contractItems?: Record<string, RefMarketContractItem>
  plex?: {
    typeId: number
    lowestSell: number | null
    highestBuy: number | null
  }
  error?: string
}

export interface ContractSearchParams {
  mode: 'buySell' | 'courier'
  searchText?: string
  regionId?: number | null
  systemId?: number | null
  contractType?:
    | 'want_to_sell'
    | 'want_to_buy'
    | 'auction'
    | 'exclude_want_to_buy'
  categoryId?: number | null
  groupId?: number | null
  typeId?: number | null
  excludeMultiple?: boolean
  priceMin?: number | null
  priceMax?: number | null
  securityHigh?: boolean
  securityLow?: boolean
  securityNull?: boolean
  issuer?: string
  page?: number
  pageSize?: number
  sortBy?: 'price' | 'dateIssued' | 'dateExpired'
  sortDirection?: 'asc' | 'desc'
}

export interface ContractSearchItem {
  typeId: number
  typeName: string
  quantity: number
  isBlueprintCopy?: boolean
}

export interface ContractSearchContract {
  contractId: number
  type: 'item_exchange' | 'auction' | 'courier'
  price: number
  buyout?: number
  reward?: number
  collateral?: number
  volume?: number
  title: string
  issuerCharacterId: number
  issuerCorporationId: number
  regionName: string
  regionId: number
  systemName: string
  systemId: number
  securityStatus: number | null
  dateIssued: string
  dateExpired: string
  itemCount: number
  itemSummary: string
}

export interface ContractSearchResult {
  contracts?: ContractSearchContract[]
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
  error?: string
}

export interface BlueprintListItem {
  id: number
  name: string
  productId: number
  productName: string
}

export type BlueprintsResult =
  | { items: Record<string, [number, number | null]> }
  | { error: string }

export interface BuybackConfig {
  buyRate: number
  iskPerM3: number
  acceptCapitals: boolean
  assetSafetyRate?: number
}

export interface BuybackItem {
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

export interface BuybackTotals {
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

export interface BuybackResult {
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

export interface BuybackCalculatorItem {
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

export interface BuybackCalculatorResult {
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

export interface BuybackSecurityConfig {
  name: string
  path: string
  description: string
  buyRate: number
  buyRatePercent: number
  iskPerM3: number
  acceptCapitals: boolean
}

export interface BuybackAssetSafetyRates {
  highsec: { noNpcStation: number; npcStation: number; iskPerM3: number }
  lowsec: { noNpcStation: number; npcStation: number; iskPerM3: number }
  nullsec: { noNpcStation: number; npcStation: number; iskPerM3: number }
  feeRate: number
  npcStationFeeRate: number
}

export interface BuybackFAQItem {
  question: string
  answer: string
}

export interface BuybackInfoResult {
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

export interface ESIRequestOptions {
  method?: 'GET' | 'POST'
  body?: string
  characterId?: number
  requiresAuth?: boolean
  etag?: string
}

export interface ESIResponseMeta<T> {
  data: T
  expiresAt: number
  etag: string | null
  notModified: boolean
  xPages?: number
}

export interface ESIRateLimitInfo {
  globalRetryAfter: number | null
  activeRequests: number
}

export interface ESIAPI {
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

export interface ElectronAPI {
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
  refMarketJita: (params: RefMarketJitaParams) => Promise<RefMarketJitaResult>
  refBlueprints: () => Promise<BlueprintsResult>
  refBuybackCalculate: (
    text: string,
    config: BuybackConfig
  ) => Promise<BuybackResult>
  refBuybackCalculator: (text: string) => Promise<BuybackCalculatorResult>
  refBuybackInfo: () => Promise<BuybackInfoResult>
  refContractsSearch: (
    params: ContractSearchParams
  ) => Promise<ContractSearchResult>
  mutamarketModule: (
    itemId: number,
    typeId?: number
  ) => Promise<MutamarketResult>
  onUpdateAvailable: (callback: (version: string) => void) => () => void
  onUpdateDownloadProgress: (callback: (percent: number) => void) => () => void
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

const esi: ESIAPI = {
  fetch: <T>(endpoint: string, options?: ESIRequestOptions) =>
    ipcRenderer.invoke('esi:fetch', endpoint, options) as Promise<T>,
  fetchWithMeta: <T>(endpoint: string, options?: ESIRequestOptions) =>
    ipcRenderer.invoke('esi:fetchWithMeta', endpoint, options) as Promise<
      ESIResponseMeta<T>
    >,
  fetchPaginated: <T>(endpoint: string, options?: ESIRequestOptions) =>
    ipcRenderer.invoke('esi:fetchPaginated', endpoint, options) as Promise<T[]>,
  fetchPaginatedWithMeta: <T>(endpoint: string, options?: ESIRequestOptions) =>
    ipcRenderer.invoke(
      'esi:fetchPaginatedWithMeta',
      endpoint,
      options
    ) as Promise<ESIResponseMeta<T[]>>,
  clearCache: () => ipcRenderer.invoke('esi:clearCache'),
  clearCacheByPattern: (pattern: string) =>
    ipcRenderer.invoke('esi:clearCacheByPattern', pattern) as Promise<number>,
  getRateLimitInfo: () => ipcRenderer.invoke('esi:getRateLimitInfo'),
  provideToken: (characterId: number, token: string | null) =>
    ipcRenderer.invoke('esi:provideToken', characterId, token),
  onRequestToken: (callback: (characterId: number) => void) => {
    const handler = (_event: unknown, characterId: number) =>
      callback(characterId)
    ipcRenderer.on('esi:requestToken', handler)
    return () => ipcRenderer.removeListener('esi:requestToken', handler)
  },
}

const electronAPI: ElectronAPI = {
  startAuth: (includeCorporationScopes = false) =>
    ipcRenderer.invoke('auth:start', includeCorporationScopes),
  cancelAuth: () => ipcRenderer.invoke('auth:cancel'),
  refreshToken: (refreshToken: string, characterId: number) =>
    ipcRenderer.invoke('auth:refresh', refreshToken, characterId),
  logout: (characterId?: number) =>
    ipcRenderer.invoke('auth:logout', characterId),
  storageGet: () => ipcRenderer.invoke('storage:get'),
  storageSet: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('storage:set', data),
  writeLog: (level: LogLevel, message: string, context?: LogContext) =>
    ipcRenderer.invoke('log:write', level, message, context),
  getLogDir: () => ipcRenderer.invoke('log:getDir'),
  openLogsFolder: () => ipcRenderer.invoke('log:openFolder'),
  submitBugReport: (characterName: string, description: string) =>
    ipcRenderer.invoke('bug:report', characterName, description),
  refTypesPage: (params?: RefTypesPageParams) =>
    ipcRenderer.invoke('ref:types-page', params),
  refCategories: () => ipcRenderer.invoke('ref:categories'),
  refGroups: () => ipcRenderer.invoke('ref:groups'),
  refUniverseRegions: () => ipcRenderer.invoke('ref:universe-regions'),
  refUniverseSystems: () => ipcRenderer.invoke('ref:universe-systems'),
  refUniverseStations: () => ipcRenderer.invoke('ref:universe-stations'),
  refUniverseStructuresPage: (params?: RefStructuresPageParams) =>
    ipcRenderer.invoke('ref:universe-structures-page', params),
  refImplants: (ids: number[]) => ipcRenderer.invoke('ref:implants', ids),
  refMoons: (ids: number[]) => ipcRenderer.invoke('ref:moons', ids),
  refShipSlots: (ids: number[]) => ipcRenderer.invoke('ref:shipslots', ids),
  refMarket: (params: RefMarketParams) =>
    ipcRenderer.invoke('ref:market', params),
  refMarketJita: (params: RefMarketJitaParams) =>
    ipcRenderer.invoke('ref:marketJita', params),
  refBlueprints: () => ipcRenderer.invoke('ref:blueprints'),
  refBuybackCalculate: (text: string, config: BuybackConfig) =>
    ipcRenderer.invoke('ref:buybackCalculate', text, config),
  refBuybackCalculator: (text: string) =>
    ipcRenderer.invoke('ref:buybackCalculator', text),
  refBuybackInfo: () => ipcRenderer.invoke('ref:buybackInfo'),
  refContractsSearch: (params: ContractSearchParams) =>
    ipcRenderer.invoke('ref:contractsSearch', params),
  mutamarketModule: (itemId: number, typeId?: number) =>
    ipcRenderer.invoke('mutamarket:module', itemId, typeId),
  onUpdateAvailable: (callback: (version: string) => void) => {
    const handler = (_event: unknown, version: string) => callback(version)
    ipcRenderer.on('updater:update-available', handler)
    return () => ipcRenderer.removeListener('updater:update-available', handler)
  },
  onUpdateDownloadProgress: (callback: (percent: number) => void) => {
    const handler = (_event: unknown, percent: number) => callback(percent)
    ipcRenderer.on('updater:download-progress', handler)
    return () =>
      ipcRenderer.removeListener('updater:download-progress', handler)
  },
  onUpdateDownloaded: (callback: (version: string) => void) => {
    const handler = (_event: unknown, version: string) => callback(version)
    ipcRenderer.on('updater:update-downloaded', handler)
    return () =>
      ipcRenderer.removeListener('updater:update-downloaded', handler)
  },
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  windowGetPlatform: () => ipcRenderer.invoke('window:getPlatform'),
  windowSetTitleBarOverlay: (options: {
    color?: string
    symbolColor?: string
    height?: number
  }) => ipcRenderer.invoke('window:setTitleBarOverlay', options),
  onWindowMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: unknown, isMaximized: boolean) =>
      callback(isMaximized)
    ipcRenderer.on('window:maximizeChange', handler)
    return () => ipcRenderer.removeListener('window:maximizeChange', handler)
  },
  onWindowMinimizeChange: (callback: (isMinimized: boolean) => void) => {
    const handler = (_event: unknown, isMinimized: boolean) =>
      callback(isMinimized)
    ipcRenderer.on('window:minimizeChange', handler)
    return () => ipcRenderer.removeListener('window:minimizeChange', handler)
  },
  esi,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
