export interface CorporationRoles {
  roles: string[]
  roles_at_hq?: string[] | undefined
  roles_at_base?: string[] | undefined
  roles_at_other?: string[] | undefined
}

export interface AuthResult {
  success: boolean
  accessToken?: string | undefined
  refreshToken?: string | undefined
  expiresAt?: number | undefined
  characterId?: number | undefined
  characterName?: string | undefined
  corporationId?: number | undefined
  allianceId?: number | undefined
  scopes?: string[] | undefined
  corporationRoles?: CorporationRoles | null | undefined
  error?: string | undefined
  isAuthFailure?: boolean | undefined
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

export interface LanguageParams {
  language?: string | undefined
}

export interface RefTypesPageParams {
  after?: number | undefined
  language?: string | undefined
}

export interface RefTypesPageResult {
  items?: Record<
    string,
    {
      id: number
      name: string
      groupId?: number | null | undefined
      marketGroupId?: number | null | undefined
      volume?: number | null | undefined
      packagedVolume?: number | null | undefined
      portionSize?: number | null | undefined
      isPublished?: number | undefined
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
      securityStatus?: number | null | undefined
      position2D?: { x: number; y: number } | null | undefined
    }
  >
  error?: string
}

export interface RefStationsResult {
  items?: Record<string, { id: number; name: string; systemId: number }>
  error?: string
}

export interface RefStargatesResult {
  items?: Record<string, { id: number; from: number; to: number }>
  error?: string
}

export interface RefStructuresPageParams {
  after?: string | undefined
}

export interface RefStructuresPageResult {
  items?: Record<
    string,
    { id: string; name: string; systemId?: number | null | undefined }
  >
  pagination?: {
    total: number
    limit: number
    nextCursor?: string | null | undefined
    hasMore: boolean
  }
  error?: string
}

export interface RefMoonsResult {
  items?: Record<string, { id: number; name: string; systemId: number }>
  error?: string
}

export interface RefMarketGroupsResult {
  items?: Record<
    string,
    {
      id: number
      name: string
      parentGroupId: number | null
      hasTypes: boolean
      iconId: number | null
    }
  >
  total?: number | undefined
  error?: string
}

export interface RefCorporationsResult {
  items?: Record<
    string,
    {
      id: number
      name: string
      tickerName: string
      factionId?: number | null | undefined
    }
  >
  error?: string
}

export interface MutamarketResult {
  estimated_value?: number | null | undefined
  error?: string | undefined
  status?: number | undefined
}

export interface InsurgencySolarSystem {
  id: number
  name: string
  security: number
  securityBand: string
  occupierFactionId?: number | null
  ownerFactionId?: number | null
}

export interface InsurgencySystem {
  corruptionDate: string | null
  corruptionPercentage: number
  corruptionState: number
  suppressionDate: string | null
  suppressionPercentage: number
  suppressionState: number
  solarSystem: InsurgencySolarSystem
}

export interface InsurgencyCampaign {
  campaignId: number
  pirateFactionId: number
  corruptionThresHold: number
  suppressionThresHold: number
  state: string
  startDateTime: string
  endDateTime: string | null
  originSolarSystem: InsurgencySolarSystem
  insurgencies: InsurgencySystem[]
}

export interface InsurgencyResult {
  data?: InsurgencyCampaign[] | undefined
  error?: string | undefined
  status?: number | undefined
}

export interface RefMarketContractItem {
  price: number | null
  salesCount: number
  timeWindow: string
  hasSufficientData: boolean
}

export interface RefMarketJitaParams {
  typeIds?: number[] | undefined
  itemIds?: number[] | undefined
  contractTypeIds?: number[] | undefined
  includePlex?: boolean | undefined
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
  searchText?: string | undefined
  regionId?: number | null | undefined
  systemId?: number | null | undefined
  contractType?:
    | 'want_to_sell'
    | 'want_to_buy'
    | 'auction'
    | 'exclude_want_to_buy'
  categoryId?: number | null | undefined
  groupId?: number | null | undefined
  typeId?: number | null | undefined
  excludeMultiple?: boolean | undefined
  priceMin?: number | null | undefined
  priceMax?: number | null | undefined
  securityHigh?: boolean | undefined
  securityLow?: boolean | undefined
  securityNull?: boolean | undefined
  issuer?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
  sortBy?: 'price' | 'dateIssued' | 'dateExpired'
  sortDirection?: 'asc' | 'desc'
  cursor?: string | undefined
  destRegionId?: number | null | undefined
  collateralMin?: number | null | undefined
  collateralMax?: number | null | undefined
  maxVolume?: number | null | undefined
  maxJumps?: number | null | undefined
}

export interface ContractSearchItem {
  typeId: number
  itemId?: number | undefined
  typeName: string
  quantity: number
  isBlueprintCopy?: boolean | undefined
  materialEfficiency?: number | undefined
  timeEfficiency?: number | undefined
  runs?: number | undefined
}

export interface ContractSearchContract {
  contractId: number
  type: 'item_exchange' | 'auction' | 'courier'
  price: number
  buyout?: number | undefined
  reward?: number | undefined
  collateral?: number | undefined
  volume?: number | undefined
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
  items: ContractSearchItem[]
  requestedItems?: ContractSearchItem[] | undefined
  startLocationId?: number | null | undefined
  endLocationId?: number | null | undefined
  startSystemId?: number | null | undefined
  destination?: {
    regionName: string
    systemName: string
    systemId: number
    securityStatus: number | null
    structureName?: string | undefined
  }
  routeInfo?:
    | {
        directJumps: number | null
        safeJumps: number | null
      }
    | undefined
  daysToComplete?: number | undefined
}

export interface ContractSearchResult {
  contracts?: ContractSearchContract[]
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
  nextCursor?: string | null
  hasMore?: boolean
  error?: string
}

export interface BuybackConfig {
  buyRate: number
  iskPerM3: number
  acceptCapitals: boolean
  assetSafetyRate?: number | undefined
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
  assetSafetyCost?: number | undefined
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

export interface ShippingTier {
  name: string
  volumeCapacity: number
  maxCollateral: number
  cost: number
  delivery: string
  expiration: string
  description: string
  nullSecAllowed: boolean
}

export interface ShippingInfoResult {
  service?: {
    name: string
    corporation: string
    ticker: string
    website: string
    forumUrl: string
    deliveryTimesUrl: string
  }
  tiers?: ShippingTier[]
  limits?: {
    maxVolumePerPackage: number
    maxCollateral: number
    maxItemsPerRequest: number
  }
  contractSettings?: { corporation: string; expiration: string }
  excludedItems?: Array<{ type: string; reason: string }>
  faq?: Array<{ question: string; answer: string }>
  error?: string
}

export interface ShippingPackageItem {
  itemName: string
  quantity: number
  typeId: number
  unitVolume: number
  totalVolume: number
  unitValue: number
  totalValue: number
  groupName: string
}

export interface ShippingPackage {
  packageNumber: number
  tier: ShippingTier
  items: ShippingPackageItem[]
  totalVolume: number
  totalValue: number
  volumeUtilization: number
  cost: number
}

export interface ShippingUnshippableItem {
  itemName: string
  quantity: number
  typeId: number
  totalVolume: number
  totalValue: number
  reason: 'volume_exceeds_capacity' | 'value_exceeds_collateral'
}

export interface ShippingManualCollateralItem {
  itemName: string
  quantity: number
  typeId: number
  unitVolume: number
  totalVolume: number
  groupName: string
  reason: string
  isBlueprint: boolean
}

export interface ShippingCalculateResult {
  items?: ShippingPackageItem[]
  unmatchedItems?: string[]
  manualCollateralItems?: ShippingManualCollateralItem[]
  shippingPlan?: {
    packages: ShippingPackage[]
    unshippableItems: ShippingUnshippableItem[]
    summary: {
      totalPackages: number
      totalShippingCost: number
      totalCargoVolume: number
      totalCargoValue: number
      costBreakdown: Array<{
        tierName: string
        count: number
        subtotal: number
      }>
    }
  }
  serviceTiers?: ShippingTier[]
  error?: string
}

export interface RefTypeDetailResult {
  type?: {
    _key: number
    group_id: number | null
    name: { en: string; [key: string]: string }
    description?: { en: string; [key: string]: string } | null
    mass?: number | null
    volume?: number | null
    packaged_volume?: number | null
    capacity?: number | null
    portion_size?: number | null
    race_id?: number | null
    base_price?: number | null
    published?: boolean
    market_group_id?: number | null
    icon_id?: number | null
    graphic_id?: number | null
    meta_group_id?: number | null
    variation_parent_type_id?: number | null
  }
  group?: {
    _key: number
    name: { en: string; [key: string]: string }
    category_id: number
    published?: boolean
    anchorable?: boolean
    anchored?: boolean
    fittableNonSingleton?: boolean
    useBasePrice?: boolean
  }
  category?: {
    _key: number
    name: { en: string; [key: string]: string }
    published?: boolean
  }
  blueprint?: {
    id: number
    blueprintTypeId: number
    maxProductionLimit?: number | null
    activities?: {
      manufacturing?: {
        time?: number
        materials?: Array<{ typeID: number; quantity: number }>
        products?: Array<{ typeID: number; quantity: number }>
      }
      copying?: { time?: number }
      research_time?: { time?: number }
      research_material?: { time?: number }
    }
  } | null
  blueprintTypes?: {
    materials?: Array<{ id: number; name: string; categoryId: number }>
    products?: Array<{ id: number; name: string; categoryId: number }>
  }
  producedBy?: Array<{ id: number; name: string; categoryId: number }>
  materials?: Array<{
    typeId: number
    name: string
    quantity: number
    categoryId: number
  }>
  dogma?: {
    attributes?: Array<{ value: number; attributeID: number }>
    attributeDefinitions?: Record<
      string,
      {
        name: string
        displayName: string | null
        unitId: number | null
        categoryId: number | null
        published: boolean
      }
    >
    computedAttributes?: Record<string, number | null>
  }
  bonuses?: {
    roleBonuses?: Array<{
      bonus?: number
      unitID?: number
      bonusText: { en: string }
      importance: number
    }>
    types?: Array<{
      _key: number
      _value: Array<{
        bonus: number
        bonusText: { en: string }
        importance: number
        unitID: number | null
      }>
    }>
  } | null
  market?: {
    price?: { averagePrice: string; adjustedPrice: string } | null
    groupPath?: Array<{ id: number; name: string }>
  }
  skills?: {
    required?: Array<{
      skillId: number
      skillName: string
      level: number
      children: Array<{
        skillId: number
        skillName: string
        level: number
        children: unknown[]
      }>
    }>
    blueprintRequired?: unknown[]
  }
  variations?: Array<{ id: number; name: string; metaGroupId: number | null }>
  error?: string
}

export interface RefTypeCoreResult {
  type?: {
    _key: number
    group_id: number | null
    name: { en: string; [key: string]: string }
    description?: { en: string; [key: string]: string } | null
    mass?: number | null
    volume?: number | null
    capacity?: number | null
    portion_size?: number | null
    race_id?: number | null
    base_price?: number | null
    published?: boolean
    market_group_id?: number | null
    meta_group_id?: number | null
    variation_parent_type_id?: number | null
    icon_id?: number | null
    sound_id?: number | null
    graphic_id?: number | null
    radius?: number | null
  }
  group?: {
    id: number
    name: { en: string; [key: string]: string }
    categoryId: number
  }
  category?: {
    id: number
    name: { en: string; [key: string]: string }
  }
  error?: string
}

export interface RefTypeSkillNode {
  skillId: number
  skillName: string
  level: number
  children: RefTypeSkillNode[]
}

export interface RefTypeSkillsResult {
  required?: RefTypeSkillNode[]
  blueprintRequired?: RefTypeSkillNode[]
  error?: string
}

export interface RefTypeBlueprintResult {
  blueprint?: {
    id: number
    blueprintTypeId: number
    maxProductionLimit?: number | null
    activities?: {
      manufacturing?: {
        time?: number
        materials?: Array<{ typeID: number; quantity: number }>
        products?: Array<{ typeID: number; quantity: number }>
        skills?: Array<{ typeID: number; level: number }>
      }
      copying?: { time?: number }
      research_time?: { time?: number }
      research_material?: { time?: number }
    }
  } | null
  blueprintTypes?: {
    materials?: Array<{ id: number; name: string; categoryId: number }>
    products?: Array<{ id: number; name: string; categoryId: number }>
  }
  producedBy?: Array<{ id: number; name: string; categoryId: number }>
  materials?: Array<{
    typeId: number
    name: string
    quantity: number
    categoryId: number
  }>
  error?: string
}

export interface RefTypeDogmaResult {
  attributes?: Array<{ attributeID: number; value: number }>
  attributeDefinitions?: Record<
    string,
    {
      name: string
      displayName: string | null
      unitId: number | null
      categoryId: number | null
      published: boolean
    }
  >
  computedAttributes?: Record<string, number | null>
  bonuses?: {
    _key?: number
    roleBonuses?: Array<{
      bonus?: number
      unitID?: number
      bonusText: { en: string }
      importance: number
    }>
    types?: Array<{
      _key: number
      _value: Array<{
        bonus: number
        bonusText: { en: string }
        importance: number
        unitID: number | null
      }>
    }>
  } | null
  bonusSkillTypes?: Array<{ id: number; name: string }>
  fuelTypeNames?: Record<string, string> | null
  error?: string
}

export interface RefTypeMarketResult {
  price?: {
    averagePrice: number
    adjustedPrice: number
  } | null
  groupPath?: Array<{ id: number; name: string }>
  error?: string
}

export interface RefTypeVariationsResult {
  variations?: Array<{ id: number; name: string; metaGroupId: number | null }>
  error?: string
}

export interface DogmaUnit {
  id: number
  name: string
  displayName: string | null
  description: string | null
}

export interface DogmaUnitsResult {
  items?: Record<string, DogmaUnit>
  error?: string
}

export interface DogmaAttributeCategory {
  id: number
  name: string
  description: string | null
}

export interface DogmaAttributeCategoriesResult {
  items?: Record<string, DogmaAttributeCategory>
  error?: string
}

export type {
  ESIRequestOptions,
  ESIResponseMeta,
  ESIRateLimitInfo,
} from './esi-types.js'
import type {
  ESIRequestOptions,
  ESIResponseMeta,
  ESIRateLimitInfo,
} from './esi-types.js'

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
  fetchPaginatedWithProgress: <T>(
    endpoint: string,
    options?: ESIRequestOptions,
    progressChannel?: string
  ) => Promise<ESIResponseMeta<T[]>>
  onPaginatedProgress: (
    channel: string,
    callback: (progress: { current: number; total: number }) => void
  ) => () => void
  clearCache: () => Promise<void>
  clearCacheByPattern: (pattern: string) => Promise<number>
  getRateLimitInfo: () => Promise<ESIRateLimitInfo>
  provideToken: (characterId: number, token: string | null) => Promise<void>
  onRequestToken: (callback: (characterId: number) => void) => () => void
  pause: () => Promise<void>
  resume: () => Promise<void>
  isPaused: () => Promise<boolean>
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
  refCategories: (params?: LanguageParams) => Promise<RefApiResult>
  refGroups: (params?: LanguageParams) => Promise<RefApiResult>
  refUniverseRegions: (params?: LanguageParams) => Promise<RefRegionsResult>
  refUniverseSystems: (params?: LanguageParams) => Promise<RefSystemsResult>
  refUniverseStations: (params?: LanguageParams) => Promise<RefStationsResult>
  refUniverseStargates: () => Promise<RefStargatesResult>
  refUniverseStructuresPage: (
    params?: RefStructuresPageParams
  ) => Promise<RefStructuresPageResult>
  refMoons: (ids: number[], params?: LanguageParams) => Promise<RefMoonsResult>
  refMarketGroups: (params?: LanguageParams) => Promise<RefMarketGroupsResult>
  refCorporations: (params?: LanguageParams) => Promise<RefCorporationsResult>
  refMarketJita: (params: RefMarketJitaParams) => Promise<RefMarketJitaResult>
  refBuybackCalculate: (
    text: string,
    config: BuybackConfig
  ) => Promise<BuybackResult>
  refBuybackInfo: (params?: LanguageParams) => Promise<BuybackInfoResult>
  refShippingInfo: (params?: LanguageParams) => Promise<ShippingInfoResult>
  refShippingCalculate: (
    text: string,
    nullSec?: boolean
  ) => Promise<ShippingCalculateResult>
  refContractsSearch: (
    params: ContractSearchParams
  ) => Promise<ContractSearchResult>
  refTypeDetail: (
    typeId: number,
    params?: LanguageParams
  ) => Promise<RefTypeDetailResult>
  refTypeCore: (
    typeId: number,
    params?: LanguageParams
  ) => Promise<RefTypeCoreResult>
  refTypeDogma: (
    typeId: number,
    params?: LanguageParams
  ) => Promise<RefTypeDogmaResult>
  refTypeMarket: (
    typeId: number,
    params?: LanguageParams
  ) => Promise<RefTypeMarketResult>
  refTypeSkills: (
    typeId: number,
    params?: LanguageParams
  ) => Promise<RefTypeSkillsResult>
  refTypeVariations: (
    typeId: number,
    params?: LanguageParams
  ) => Promise<RefTypeVariationsResult>
  refTypeBlueprint: (
    typeId: number,
    params?: LanguageParams
  ) => Promise<RefTypeBlueprintResult>
  refDogmaUnits: (params?: LanguageParams) => Promise<DogmaUnitsResult>
  refDogmaAttributeCategories: (
    params?: LanguageParams
  ) => Promise<DogmaAttributeCategoriesResult>
  mutamarketModule: (
    itemId: number,
    typeId?: number
  ) => Promise<MutamarketResult>
  insurgencyGet: () => Promise<InsurgencyResult>
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
  clearStorageAndRestart: () => Promise<void>
  esi: ESIAPI
}
