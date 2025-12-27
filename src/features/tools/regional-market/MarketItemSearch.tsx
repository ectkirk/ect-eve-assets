import { useMemo, useCallback } from 'react'
import { TypeSearchInput } from '@/components/ui/type-search-input'
import { type CachedType } from '@/store/reference-cache'
import { useRegionalOrdersStore } from '@/store/regional-orders-store'

interface MarketItemSearchProps {
  onSelectType: (type: CachedType) => void
}

export function MarketItemSearch({ onSelectType }: MarketItemSearchProps) {
  const regionId = useRegionalOrdersStore((s) => s.regionId)
  const status = useRegionalOrdersStore((s) => s.status)
  const getAvailableTypeIds = useRegionalOrdersStore(
    (s) => s.getAvailableTypeIds
  )

  const availableTypeIds = useMemo(() => {
    if (status !== 'ready' || !regionId) return null
    return getAvailableTypeIds()
  }, [regionId, status, getAvailableTypeIds])

  const filterFn = useCallback(
    (type: CachedType) => {
      if (!type.marketGroupId) return false
      if (availableTypeIds && !availableTypeIds.has(type.id)) return false
      return true
    },
    [availableTypeIds]
  )

  const handleChange = useCallback(
    (type: CachedType | null) => {
      if (type) onSelectType(type)
    },
    [onSelectType]
  )

  return (
    <div className="px-2 py-2">
      <TypeSearchInput
        value={null}
        onChange={handleChange}
        placeholder="Search items..."
        filterFn={filterFn}
      />
    </div>
  )
}
