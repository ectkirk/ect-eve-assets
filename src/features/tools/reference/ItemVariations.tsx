import { useTranslation } from 'react-i18next'
import { TypeIcon } from '@/components/ui/type-icon'
import { LazySection } from './LazySection'
import { META_GROUPS } from './item-detail-constants'
import { getLanguage } from '@/store/settings-store'
import type { RefTypeVariationsResult } from '../../../../shared/electron-api-types'

interface ItemVariationsProps {
  typeId: number
  onNavigate?: (typeId: number) => void
}

async function fetchVariations(
  typeId: number
): Promise<RefTypeVariationsResult> {
  if (!window.electronAPI) throw new Error('API not available')
  return window.electronAPI.refTypeVariations(typeId, {
    language: getLanguage(),
  })
}

function hasVariationData(data: RefTypeVariationsResult): boolean {
  return (data.variations?.length ?? 0) > 1
}

export function ItemVariations({ typeId, onNavigate }: ItemVariationsProps) {
  const { t } = useTranslation('tools')
  return (
    <LazySection
      title={t('reference.itemVariations')}
      typeId={typeId}
      fetcher={fetchVariations}
      hasData={hasVariationData}
    >
      {(data) => (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {data.variations?.map((v) => {
            const meta = v.metaGroupId ? META_GROUPS[v.metaGroupId] : null
            return (
              <button
                key={v.id}
                onClick={() => v.id !== typeId && onNavigate?.(v.id)}
                disabled={v.id === typeId}
                className={`flex items-center gap-3 rounded border p-2 text-left transition-colors ${
                  v.id === typeId
                    ? 'border-accent bg-accent/10 cursor-default'
                    : 'border-border bg-surface-tertiary hover:border-accent'
                }`}
              >
                <TypeIcon typeId={v.id} size="lg" />
                <span className="flex-1 truncate text-sm text-content">
                  {v.name}
                </span>
                {meta && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${meta.color}`}
                  >
                    {meta.label}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </LazySection>
  )
}
