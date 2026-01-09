import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, ChevronRight } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import { TypeIcon, getTypeIconUrl } from '@/components/ui/type-icon'
import { getTypeName } from '@/store/reference-cache'
import { getLanguage, getLocalizedText } from '@/store/settings-store'
import {
  ShipFittingLayout,
  SHIP_STAT_ATTRS,
  RESISTANCE_ATTR_IDS as SHIP_RESISTANCE_ATTR_IDS,
  HP_ATTR_IDS as SHIP_HP_ATTR_IDS,
  SHIELD_RECHARGE_ATTR_ID as SHIP_SHIELD_RECHARGE_ATTR_ID,
} from './components'
import {
  getCachedTypeData,
  setCachedTypeData,
  getDogmaUnits,
  getAttributeCategories,
  type CombinedTypeData,
} from './item-detail-cache'
import {
  SHIP_CATEGORY_ID,
  STRUCTURE_CATEGORY_ID,
  META_GROUPS,
  ATTRIBUTE_CATEGORY_ORDER,
  UNIT_ID_TYPE_REF,
} from './item-detail-constants'
import {
  formatAttributeValue,
  type AttributeTranslations,
} from './attribute-formatters'
import { sanitizeDescription } from './eve-text-utils'
import { Section } from './Section'
import { BonusSection } from './BonusSection'
import { ItemVariations } from './ItemVariations'
import { RequiredSkillsSection } from './RequiredSkillsSection'
import { BlueprintSourcesSection } from './BlueprintSourcesSection'
import type {
  DogmaUnit,
  DogmaAttributeCategory,
} from '../../../../shared/electron-api-types'

interface ItemDetailPanelProps {
  typeId: number
  onNavigate?: (typeId: number) => void
  showUnpublished?: boolean
}

function getMetaGroupBadge(metaGroupId: number | null | undefined) {
  if (!metaGroupId) return null
  const meta = META_GROUPS[metaGroupId]
  if (!meta) return null
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  )
}

export function ItemDetailPanel({
  typeId,
  onNavigate,
  showUnpublished = false,
}: ItemDetailPanelProps) {
  const { t } = useTranslation('tools')
  const [data, setData] = useState<CombinedTypeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dogmaUnits, setDogmaUnits] = useState<Record<
    string,
    DogmaUnit
  > | null>(null)
  const [attrCategories, setAttrCategories] = useState<Record<
    string,
    DogmaAttributeCategory
  > | null>(null)

  const attrTranslations: AttributeTranslations = useMemo(
    () => ({
      sizeSmall: t('reference.attribute.sizeSmall'),
      sizeMedium: t('reference.attribute.sizeMedium'),
      sizeLarge: t('reference.attribute.sizeLarge'),
      sizeCapital: t('reference.attribute.sizeCapital'),
      yes: t('reference.attribute.yes'),
      no: t('reference.attribute.no'),
    }),
    [t]
  )

  useEffect(() => {
    let mounted = true
    getDogmaUnits().then((data) => mounted && setDogmaUnits(data))
    getAttributeCategories().then((data) => mounted && setAttrCategories(data))
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const cached = getCachedTypeData(typeId)
    if (cached) {
      setData(cached)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const fetchData = async () => {
      if (!window.electronAPI) {
        if (!cancelled) {
          setError('API not available')
          setLoading(false)
        }
        return
      }

      try {
        const lang = { language: getLanguage() }
        const [coreResult, dogmaResult, marketResult] = await Promise.all([
          window.electronAPI.refTypeCore(typeId, lang),
          window.electronAPI.refTypeDogma(typeId, lang),
          window.electronAPI.refTypeMarket(typeId, lang),
        ])

        if (cancelled) return

        const errors = [
          coreResult.error,
          dogmaResult.error,
          marketResult.error,
        ].filter(Boolean)
        if (errors.length > 0) {
          setError(errors.join('; '))
          return
        }

        const combined: CombinedTypeData = {
          core: coreResult,
          dogma: dogmaResult,
          market: marketResult,
        }

        setCachedTypeData(typeId, combined)
        setData(combined)
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [typeId])

  const type = data?.core.type
  const group = data?.core.group
  const category = data?.core.category
  const dogma = data?.dogma
  const market = data?.market

  const localizedDescription = getLocalizedText(type?.description)
  const sanitizedDescription = useMemo(
    () =>
      localizedDescription ? sanitizeDescription(localizedDescription) : null,
    [localizedDescription]
  )

  const categoryId = category?.id
  const isShipOrStructure =
    categoryId === SHIP_CATEGORY_ID || categoryId === STRUCTURE_CATEGORY_ID

  const excludedAttrIds = useMemo(() => {
    const ids = new Set<number>()

    if (isShipOrStructure) {
      Object.values(SHIP_STAT_ATTRS).forEach((id) => ids.add(id))
      Object.values(SHIP_RESISTANCE_ATTR_IDS).forEach((layer) =>
        Object.values(layer).forEach((id) => ids.add(id))
      )
      Object.values(SHIP_HP_ATTR_IDS).forEach((id) => ids.add(id))
      ids.add(SHIP_SHIELD_RECHARGE_ATTR_ID)
    }

    return ids
  }, [isShipOrStructure])

  const attributesByCategory = useMemo(() => {
    if (!dogma?.attributes || !dogma.attributeDefinitions) return []

    const grouped = new Map<
      number,
      Array<{
        attributeID: number
        value: number
        displayName: string
        unitId: number | null
      }>
    >()

    for (const attr of dogma.attributes) {
      if (excludedAttrIds.has(attr.attributeID)) continue
      const def = dogma.attributeDefinitions[String(attr.attributeID)]

      let displayName: string | null = null
      if (def?.displayName) {
        displayName = def.displayName
      } else if (showUnpublished) {
        displayName = def?.name ?? `attr_${attr.attributeID}`
      }
      if (!displayName) continue
      if (def?.published === false && !showUnpublished) continue

      const catId = def?.categoryId ?? 0
      if (!grouped.has(catId)) grouped.set(catId, [])
      grouped.get(catId)!.push({
        ...attr,
        displayName,
        unitId: def?.unitId ?? null,
      })
    }

    return ATTRIBUTE_CATEGORY_ORDER.filter((id) => grouped.has(id)).map(
      (catId) => ({
        categoryId: catId,
        categoryName:
          attrCategories?.[String(catId)]?.name ??
          t('reference.fallback.other'),
        attributes: grouped
          .get(catId)!
          .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      })
    )
  }, [
    dogma?.attributes,
    dogma?.attributeDefinitions,
    attrCategories,
    excludedAttrIds,
    showUnpublished,
  ])

  const shipFittingData = useMemo(() => {
    if (!type || !dogma) return null
    return {
      type,
      dogma: {
        attributes: dogma.attributes,
        attributeDefinitions: dogma.attributeDefinitions,
        computedAttributes: dogma.computedAttributes,
      },
    }
  }, [type, dogma])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <p className="text-status-error">{error}</p>
      </div>
    )
  }

  if (!type) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <p className="text-content-secondary">{t('reference.itemNotFound')}</p>
      </div>
    )
  }

  const metaBadge = getMetaGroupBadge(type.meta_group_id)
  const mainImageUrl = getTypeIconUrl(type._key, {
    categoryId,
    imageSize: 64,
  })

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex gap-4">
        {mainImageUrl && (
          <img
            src={mainImageUrl}
            alt=""
            className="h-16 w-16 rounded-lg bg-surface-tertiary"
          />
        )}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-content">
              {getLocalizedText(type.name)}
            </h2>
            {metaBadge}
            {type.published === false && (
              <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs italic text-content-secondary">
                {t('reference.unpublished')}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-content-secondary">ID: {type._key}</p>
          <div className="mt-1 flex items-center gap-2 text-sm">
            {category && (
              <span className="text-content-secondary">
                {getLocalizedText(category.name)}
              </span>
            )}
            {category && group && <span className="text-content-muted">→</span>}
            {group && (
              <span className="text-content-secondary">
                {getLocalizedText(group.name)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {market?.groupPath && market.groupPath.length > 0 && (
          <Section title={t('reference.marketGroup')}>
            <div className="flex flex-wrap items-center gap-1 text-sm">
              {market.groupPath.map((g, i) => (
                <span key={g.id} className="flex items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="h-3 w-3 text-content-muted" />
                  )}
                  <span className="text-content">{g.name}</span>
                </span>
              ))}
            </div>
          </Section>
        )}

        {sanitizedDescription && (
          <Section title={t('reference.description')}>
            <div
              className="whitespace-pre-wrap text-sm text-content-secondary [&_i]:italic [&_b]:font-bold [&_u]:underline"
              dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
            />
          </Section>
        )}

        {dogma?.bonuses && (
          <BonusSection bonuses={dogma.bonuses} onNavigate={onNavigate} />
        )}

        {(type.base_price != null || market?.price) && (
          <Section title={t('reference.prices')}>
            <div className="flex flex-wrap gap-6">
              {type.base_price != null && (
                <div>
                  <div className="text-xs text-content-muted">
                    {t('reference.basePrice')}
                  </div>
                  <div className="font-semibold text-content">
                    {formatNumber(type.base_price)}
                  </div>
                </div>
              )}
              {market?.price?.averagePrice != null && (
                <div>
                  <div className="text-xs text-content-muted">
                    {t('reference.marketAverage')}
                  </div>
                  <div className="font-semibold text-status-success">
                    {formatNumber(Math.round(market.price.averagePrice))}
                  </div>
                </div>
              )}
              {market?.price?.adjustedPrice != null && (
                <div>
                  <div className="text-xs text-content-muted">
                    {t('reference.adjustedPrice')}
                  </div>
                  <div className="font-semibold text-accent">
                    {formatNumber(Math.round(market.price.adjustedPrice))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {isShipOrStructure && shipFittingData && (
          <ShipFittingLayout data={shipFittingData} />
        )}

        {attributesByCategory.map((cat) => (
          <Section key={cat.categoryId} title={cat.categoryName}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {cat.attributes.map((attr) =>
                attr.unitId === UNIT_ID_TYPE_REF ? (
                  <div
                    key={attr.attributeID}
                    className="flex items-center justify-between gap-2 py-0.5"
                  >
                    <span className="text-sm text-content-secondary">
                      {attr.displayName}
                    </span>
                    <button
                      onClick={() => onNavigate?.(attr.value)}
                      className="flex items-center gap-1.5 text-accent hover:underline"
                    >
                      <TypeIcon typeId={attr.value} size="sm" />
                      <span className="text-sm">{getTypeName(attr.value)}</span>
                    </button>
                  </div>
                ) : (
                  <div
                    key={attr.attributeID}
                    className="flex items-baseline justify-between gap-2 py-0.5"
                  >
                    <span className="text-sm text-content-secondary">
                      {attr.displayName}
                    </span>
                    <span className="font-mono text-sm text-content">
                      {formatAttributeValue(
                        attr.value,
                        attr.unitId,
                        dogmaUnits,
                        attrTranslations
                      )}
                    </span>
                  </div>
                )
              )}
            </div>
          </Section>
        ))}

        <RequiredSkillsSection typeId={typeId} />
        <ItemVariations typeId={typeId} onNavigate={onNavigate} />
        <BlueprintSourcesSection typeId={typeId} onNavigate={onNavigate} />
      </div>
    </div>
  )
}
