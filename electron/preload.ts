const { contextBridge, ipcRenderer } = require('electron')

export type {
  AuthResult,
  BuybackCalculatorItem,
  BuybackCalculatorResult,
  BuybackConfig,
  BuybackFAQItem,
  BuybackInfoResult,
  BuybackItem,
  BuybackAssetSafetyRates,
  BuybackResult,
  BuybackSecurityConfig,
  BuybackTotals,
  ContractSearchContract,
  ContractSearchItem,
  ContractSearchParams,
  ContractSearchResult,
  CorporationRoles,
  ElectronAPI,
  ESIAPI,
  ESIRateLimitInfo,
  ESIRequestOptions,
  ESIResponseMeta,
  LogContext,
  LogLevel,
  MutamarketResult,
  RefApiResult,
  RefMarketContractItem,
  RefMarketGroupsResult,
  RefMarketJitaParams,
  RefMarketJitaResult,
  RefMoonsResult,
  RefRegionsResult,
  RefStationsResult,
  RefStructuresPageParams,
  RefStructuresPageResult,
  RefSystemsResult,
  RefTypesPageParams,
  RefTypesPageResult,
  ShippingCalculateResult,
  ShippingInfoResult,
  ShippingManualCollateralItem,
  ShippingPackage,
  ShippingPackageItem,
  ShippingTier,
  ShippingUnshippableItem,
} from './preload-types'

import type {
  BuybackConfig,
  ContractSearchParams,
  ElectronAPI,
  ESIAPI,
  ESIRequestOptions,
  ESIResponseMeta,
  LanguageParams,
  LogContext,
  LogLevel,
  RefMarketJitaParams,
  RefStructuresPageParams,
  RefTypesPageParams,
} from './preload-types'

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
  fetchPaginatedWithProgress: <T>(
    endpoint: string,
    options?: ESIRequestOptions,
    progressChannel?: string
  ) =>
    ipcRenderer.invoke(
      'esi:fetchPaginatedWithProgress',
      endpoint,
      options,
      progressChannel
    ) as Promise<ESIResponseMeta<T[]>>,
  onPaginatedProgress: (
    channel: string,
    callback: (progress: { current: number; total: number }) => void
  ) => {
    const handler = (
      _event: unknown,
      progress: { current: number; total: number }
    ) => callback(progress)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
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
  pause: () => ipcRenderer.invoke('esi:pause'),
  resume: () => ipcRenderer.invoke('esi:resume'),
  isPaused: () => ipcRenderer.invoke('esi:isPaused') as Promise<boolean>,
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
  refCategories: (params?: LanguageParams) =>
    ipcRenderer.invoke('ref:categories', params),
  refGroups: (params?: LanguageParams) =>
    ipcRenderer.invoke('ref:groups', params),
  refUniverseRegions: (params?: LanguageParams) =>
    ipcRenderer.invoke('ref:universe-regions', params),
  refUniverseSystems: (params?: LanguageParams) =>
    ipcRenderer.invoke('ref:universe-systems', params),
  refUniverseStations: (params?: LanguageParams) =>
    ipcRenderer.invoke('ref:universe-stations', params),
  refUniverseStargates: () => ipcRenderer.invoke('ref:universe-stargates'),
  refUniverseStructuresPage: (params?: RefStructuresPageParams) =>
    ipcRenderer.invoke('ref:universe-structures-page', params),
  refMoons: (ids: number[], params?: LanguageParams) =>
    ipcRenderer.invoke('ref:moons', ids, params),
  refMarketGroups: (params?: LanguageParams) =>
    ipcRenderer.invoke('ref:marketGroups', params),
  refCorporations: (params?: LanguageParams) =>
    ipcRenderer.invoke('ref:corporations', params),
  refMarketJita: (params: RefMarketJitaParams) =>
    ipcRenderer.invoke('ref:marketJita', params),
  refBuybackCalculate: (text: string, config: BuybackConfig) =>
    ipcRenderer.invoke('ref:buybackCalculate', text, config),
  refBuybackInfo: (params?: LanguageParams) =>
    ipcRenderer.invoke('ref:buybackInfo', params),
  refShippingInfo: (params?: LanguageParams) =>
    ipcRenderer.invoke('ref:shippingInfo', params),
  refShippingCalculate: (text: string, nullSec?: boolean) =>
    ipcRenderer.invoke('ref:shippingCalculate', text, nullSec),
  refContractsSearch: (params: ContractSearchParams) =>
    ipcRenderer.invoke('ref:contractsSearch', params),
  refTypeDetail: (typeId: number, params?: LanguageParams) =>
    ipcRenderer.invoke('ref:type-detail', typeId, params),
  refTypeCore: (typeId: number, params?: LanguageParams) =>
    ipcRenderer.invoke('ref:type-core', typeId, params),
  refTypeDogma: (typeId: number, params?: LanguageParams) =>
    ipcRenderer.invoke('ref:type-dogma', typeId, params),
  refTypeMarket: (typeId: number, params?: LanguageParams) =>
    ipcRenderer.invoke('ref:type-market', typeId, params),
  refTypeSkills: (typeId: number, params?: LanguageParams) =>
    ipcRenderer.invoke('ref:type-skills', typeId, params),
  refTypeVariations: (typeId: number, params?: LanguageParams) =>
    ipcRenderer.invoke('ref:type-variations', typeId, params),
  refTypeBlueprint: (typeId: number, params?: LanguageParams) =>
    ipcRenderer.invoke('ref:type-blueprint', typeId, params),
  refDogmaUnits: (params?: LanguageParams) =>
    ipcRenderer.invoke('ref:dogma-units', params),
  refDogmaAttributeCategories: (params?: LanguageParams) =>
    ipcRenderer.invoke('ref:dogma-attribute-categories', params),
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
  clearStorageAndRestart: () =>
    ipcRenderer.invoke('window:clearStorageAndRestart'),
  esi,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
