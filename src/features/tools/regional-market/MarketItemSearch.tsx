import { useCallback } from 'react'
import { TypeSearchInput } from '@/components/ui/type-search-input'
import { type CachedType } from '@/store/reference-cache'

interface MarketItemSearchProps {
  onSelectType: (type: CachedType) => void
}

export function MarketItemSearch({ onSelectType }: MarketItemSearchProps) {
  const filterFn = useCallback((type: CachedType) => {
    return !!type.marketGroupId
  }, [])

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
        filterFn={filterFn}
      />
    </div>
  )
}
