import type {
  AuthResult as AuthResultType,
  BuybackAssetSafetyRates as BuybackAssetSafetyRatesType,
  BuybackCalculatorItem as BuybackCalculatorItemType,
  BuybackCalculatorResult as BuybackCalculatorResultType,
  BuybackConfig as BuybackConfigType,
  BuybackFAQItem as BuybackFAQItemType,
  BuybackInfoResult as BuybackInfoResultType,
  BuybackItem as BuybackItemType,
  BuybackResult as BuybackResultType,
  BuybackSecurityConfig as BuybackSecurityConfigType,
  BuybackTotals as BuybackTotalsType,
  ContractSearchContract as ContractSearchContractType,
  ContractSearchItem as ContractSearchItemType,
  ContractSearchParams as ContractSearchParamsType,
  ContractSearchResult as ContractSearchResultType,
  CorporationRoles as CorporationRolesType,
  ElectronAPI as ElectronAPIType,
  ESIAPI as ESIAPIType,
  ESIRateLimitInfo as ESIRateLimitInfoType,
  ESIRequestOptions as ESIRequestOptionsType,
  ESIResponseMeta as ESIResponseMetaType,
  LogContext as LogContextType,
  LogLevel as LogLevelType,
  MutamarketResult as MutamarketResultType,
  RefApiResult as RefApiResultType,
  RefMarketContractItem as RefMarketContractItemType,
  RefMarketGroupsResult as RefMarketGroupsResultType,
  RefMarketJitaParams as RefMarketJitaParamsType,
  RefMarketJitaResult as RefMarketJitaResultType,
  RefMoonsResult as RefMoonsResultType,
  RefRegionsResult as RefRegionsResultType,
  RefStationsResult as RefStationsResultType,
  RefStructuresPageParams as RefStructuresPageParamsType,
  RefStructuresPageResult as RefStructuresPageResultType,
  RefSystemsResult as RefSystemsResultType,
  RefTypesPageParams as RefTypesPageParamsType,
  RefTypesPageResult as RefTypesPageResultType,
  ShippingCalculateResult as ShippingCalculateResultType,
  ShippingInfoResult as ShippingInfoResultType,
  ShippingManualCollateralItem as ShippingManualCollateralItemType,
  ShippingPackage as ShippingPackageType,
  ShippingPackageItem as ShippingPackageItemType,
  ShippingTier as ShippingTierType,
  ShippingUnshippableItem as ShippingUnshippableItemType,
} from '../../shared/electron-api-types'

declare global {
  type AuthResult = AuthResultType
  type BuybackAssetSafetyRates = BuybackAssetSafetyRatesType
  type BuybackCalculatorItem = BuybackCalculatorItemType
  type BuybackCalculatorResult = BuybackCalculatorResultType
  type BuybackConfig = BuybackConfigType
  type BuybackFAQItem = BuybackFAQItemType
  type BuybackInfoResult = BuybackInfoResultType
  type BuybackItem = BuybackItemType
  type BuybackResult = BuybackResultType
  type BuybackSecurityConfig = BuybackSecurityConfigType
  type BuybackTotals = BuybackTotalsType
  type ContractSearchContract = ContractSearchContractType
  type ContractSearchItem = ContractSearchItemType
  type ContractSearchParams = ContractSearchParamsType
  type ContractSearchResult = ContractSearchResultType
  type CorporationRoles = CorporationRolesType
  type ElectronAPI = ElectronAPIType
  type ESIAPI = ESIAPIType
  type ESIRateLimitInfo = ESIRateLimitInfoType
  type ESIRequestOptions = ESIRequestOptionsType
  type ESIResponseMeta<T> = ESIResponseMetaType<T>
  type LogContext = LogContextType
  type LogLevel = LogLevelType
  type MutamarketResult = MutamarketResultType
  type RefApiResult = RefApiResultType
  type RefMarketContractItem = RefMarketContractItemType
  type RefMarketGroupsResult = RefMarketGroupsResultType
  type RefMarketJitaParams = RefMarketJitaParamsType
  type RefMarketJitaResult = RefMarketJitaResultType
  type RefMoonsResult = RefMoonsResultType
  type RefRegionsResult = RefRegionsResultType
  type RefStationsResult = RefStationsResultType
  type RefStructuresPageParams = RefStructuresPageParamsType
  type RefStructuresPageResult = RefStructuresPageResultType
  type RefSystemsResult = RefSystemsResultType
  type RefTypesPageParams = RefTypesPageParamsType
  type RefTypesPageResult = RefTypesPageResultType
  type ShippingCalculateResult = ShippingCalculateResultType
  type ShippingInfoResult = ShippingInfoResultType
  type ShippingManualCollateralItem = ShippingManualCollateralItemType
  type ShippingPackage = ShippingPackageType
  type ShippingPackageItem = ShippingPackageItemType
  type ShippingTier = ShippingTierType
  type ShippingUnshippableItem = ShippingUnshippableItemType

  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
