import { cn } from '@/lib/utils'

const SKIN_CATEGORY_ID = 91
const BLUEPRINT_CATEGORY_ID = 9

export interface TypeIconProps {
  typeId: number
  categoryId?: number
  isBlueprintCopy?: boolean
  isBlueprint?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZE_CLASSES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-12 w-12',
}

export function getTypeIconUrl(
  typeId: number,
  options?: {
    categoryId?: number
    isBlueprintCopy?: boolean
    isBlueprint?: boolean
    imageSize?: number
  }
): string | null {
  const {
    categoryId,
    isBlueprintCopy,
    isBlueprint,
    imageSize = 32,
  } = options ?? {}

  if (categoryId === SKIN_CATEGORY_ID) {
    return `https://images.evetech.net/types/81350/icon?size=${imageSize}`
  }

  if (
    categoryId === BLUEPRINT_CATEGORY_ID ||
    isBlueprint ||
    isBlueprintCopy === true
  ) {
    return isBlueprintCopy
      ? `https://images.evetech.net/types/${typeId}/bpc?size=${imageSize}`
      : `https://images.evetech.net/types/${typeId}/bp?size=${imageSize}`
  }

  return `https://images.evetech.net/types/${typeId}/icon?size=${imageSize}`
}

const IMAGE_SIZES: Record<string, number> = {
  sm: 32,
  md: 32,
  lg: 32,
  xl: 64,
}

export function TypeIcon({
  typeId,
  categoryId,
  isBlueprintCopy,
  isBlueprint,
  size = 'md',
  className,
}: TypeIconProps) {
  const sizeClass = SIZE_CLASSES[size]
  const imageSize = IMAGE_SIZES[size]
  const url = getTypeIconUrl(typeId, {
    categoryId,
    isBlueprintCopy,
    isBlueprint,
    imageSize,
  })

  if (!url) {
    return (
      <div
        className={cn(
          sizeClass,
          'rounded bg-surface-tertiary flex-shrink-0',
          className
        )}
      />
    )
  }

  return (
    <img
      src={url}
      alt=""
      className={cn(sizeClass, 'flex-shrink-0', className)}
      loading="lazy"
    />
  )
}

export function CharacterPortrait({
  characterId,
  size = 'md',
  className,
}: {
  characterId: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizeClass = SIZE_CLASSES[size]
  return (
    <img
      src={`https://images.evetech.net/characters/${characterId}/portrait?size=32`}
      alt=""
      className={cn(sizeClass, 'rounded flex-shrink-0', className)}
      loading="lazy"
    />
  )
}

export function CorporationLogo({
  corporationId,
  size = 'md',
  className,
}: {
  corporationId: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizeClass = SIZE_CLASSES[size]
  return (
    <img
      src={`https://images.evetech.net/corporations/${corporationId}/logo?size=32`}
      alt=""
      className={cn(sizeClass, 'rounded flex-shrink-0', className)}
      loading="lazy"
    />
  )
}

export function OwnerIcon({
  ownerId,
  ownerType,
  size = 'md',
  className,
}: {
  ownerId: number
  ownerType: 'character' | 'corporation'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  if (ownerType === 'corporation') {
    return (
      <CorporationLogo
        corporationId={ownerId}
        size={size}
        className={className}
      />
    )
  }
  return (
    <CharacterPortrait
      characterId={ownerId}
      size={size}
      className={className}
    />
  )
}
