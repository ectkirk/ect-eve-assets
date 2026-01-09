import { useTranslation } from 'react-i18next'
import { LazySection } from './LazySection'
import { TypeItemList } from './TypeItemList'
import { formatDuration, formatFullNumber } from '@/lib/utils'
import { getLanguage } from '@/store/settings-store'
import type { RefTypeBlueprintResult } from '../../../../shared/electron-api-types'

interface BlueprintSourcesSectionProps {
  typeId: number
  onNavigate?: (typeId: number) => void
}

async function fetchBlueprint(typeId: number): Promise<RefTypeBlueprintResult> {
  if (!window.electronAPI) throw new Error('API not available')
  return window.electronAPI.refTypeBlueprint(typeId, { language: getLanguage() })
}

function hasBlueprintData(data: RefTypeBlueprintResult): boolean {
  return !!(
    data.blueprint?.activities?.manufacturing ||
    (data.blueprintTypes?.materials &&
      data.blueprintTypes.materials.length > 0) ||
    (data.blueprintTypes?.products &&
      data.blueprintTypes.products.length > 0) ||
    (data.producedBy && data.producedBy.length > 0) ||
    (data.materials && data.materials.length > 0)
  )
}

function getMaterialQuantity(
  blueprint: RefTypeBlueprintResult['blueprint'],
  typeId: number,
  kind: 'materials' | 'products'
): number {
  return (
    blueprint?.activities?.manufacturing?.[kind]?.find(
      (m) => m.typeID === typeId
    )?.quantity ?? 1
  )
}

export function BlueprintSourcesSection({
  typeId,
  onNavigate,
}: BlueprintSourcesSectionProps) {
  const { t } = useTranslation('tools')
  return (
    <LazySection
      title={t('reference.blueprintSources')}
      typeId={typeId}
      fetcher={fetchBlueprint}
      hasData={hasBlueprintData}
    >
      {(data) => (
        <div className="space-y-4">
          {data.blueprint?.activities?.manufacturing && (
            <div>
              <div className="mb-2 text-sm font-medium text-content">
                {t('reference.manufacturing')}
              </div>
              <div className="flex flex-wrap gap-6">
                {data.blueprint.activities.manufacturing.time != null && (
                  <div>
                    <div className="text-xs text-content-muted">
                      {t('reference.productionTime')}
                    </div>
                    <div className="font-semibold text-content">
                      {formatDuration(
                        data.blueprint.activities.manufacturing.time
                      )}
                    </div>
                  </div>
                )}
                {data.blueprint.maxProductionLimit != null && (
                  <div>
                    <div className="text-xs text-content-muted">
                      {t('reference.maxRuns')}
                    </div>
                    <div className="font-semibold text-content">
                      {formatFullNumber(data.blueprint.maxProductionLimit)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {data.blueprintTypes?.materials &&
            data.blueprintTypes.materials.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium text-content">
                  {t('reference.requiredMaterials')}
                </div>
                <TypeItemList
                  items={data.blueprintTypes.materials.map((mat) => ({
                    id: mat.id,
                    name: mat.name,
                    categoryId: mat.categoryId,
                    quantity: getMaterialQuantity(
                      data.blueprint,
                      mat.id,
                      'materials'
                    ),
                  }))}
                  onNavigate={onNavigate}
                  showQuantity
                />
              </div>
            )}

          {data.blueprintTypes?.products &&
            data.blueprintTypes.products.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium text-content">
                  {t('reference.produces')}
                </div>
                <TypeItemList
                  items={data.blueprintTypes.products.map((prod) => ({
                    id: prod.id,
                    name: prod.name,
                    categoryId: prod.categoryId,
                    quantity: getMaterialQuantity(
                      data.blueprint,
                      prod.id,
                      'products'
                    ),
                  }))}
                  onNavigate={onNavigate}
                  showQuantity
                  iconSize="lg"
                />
              </div>
            )}

          {data.producedBy && data.producedBy.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium text-content">
                {t('reference.producedBy')}
              </div>
              <TypeItemList
                items={data.producedBy.map((bp) => ({
                  id: bp.id,
                  name: bp.name,
                  categoryId: bp.categoryId,
                }))}
                onNavigate={onNavigate}
              />
            </div>
          )}

          {data.materials && data.materials.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium text-content">
                {t('reference.materials')}
              </div>
              <TypeItemList
                items={data.materials.map((m) => ({
                  id: m.typeId,
                  name: m.name,
                  categoryId: m.categoryId,
                  quantity: m.quantity,
                }))}
                onNavigate={onNavigate}
                showQuantity
              />
            </div>
          )}
        </div>
      )}
    </LazySection>
  )
}
