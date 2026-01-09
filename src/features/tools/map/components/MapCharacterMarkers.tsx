import { memo, useMemo } from 'react'
import type { CharacterLocation } from '@/store/character-locations-store'
import type { IndexedSystem } from '../utils/spatial-index'
import type { Camera } from '../types'
import { canvasToScreen } from '../utils/coordinates'

interface MapCharacterMarkersProps {
  markers: CharacterLocation[]
  systemMap: Map<number, IndexedSystem>
  camera: Camera
  width: number
  height: number
  onSystemClick: (systemId: number) => void
}

const PORTRAIT_SIZE = 28
const OVERLAP_OFFSET = -10

export const MapCharacterMarkers = memo(function MapCharacterMarkers({
  markers,
  systemMap,
  camera,
  width,
  height,
  onSystemClick,
}: MapCharacterMarkersProps) {
  const groupedMarkers = useMemo(() => {
    const groups = new Map<number, CharacterLocation[]>()
    for (const marker of markers) {
      const existing = groups.get(marker.systemId)
      if (existing) {
        existing.push(marker)
      } else {
        groups.set(marker.systemId, [marker])
      }
    }
    return groups
  }, [markers])

  const visibleGroups = useMemo(() => {
    const result: Array<{
      systemId: number
      screenX: number
      screenY: number
      characters: CharacterLocation[]
    }> = []

    for (const [systemId, characters] of groupedMarkers) {
      const system = systemMap.get(systemId)
      if (!system) continue

      const { x, y } = canvasToScreen(
        system.canvasX,
        system.canvasY,
        camera,
        width,
        height
      )

      if (x < -50 || x > width + 50 || y < -50 || y > height + 50) continue

      result.push({ systemId, screenX: x, screenY: y, characters })
    }

    return result
  }, [groupedMarkers, systemMap, camera, width, height])

  if (visibleGroups.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {visibleGroups.map(({ systemId, screenX, screenY, characters }) => {
        const groupWidth =
          PORTRAIT_SIZE +
          (characters.length - 1) * (PORTRAIT_SIZE + OVERLAP_OFFSET)

        return (
          <div
            key={systemId}
            className="pointer-events-auto absolute cursor-pointer"
            style={{
              left: screenX - groupWidth / 2,
              top: screenY - PORTRAIT_SIZE / 2 - 8,
              transform: 'translateY(-50%)',
            }}
            onClick={() => onSystemClick(systemId)}
          >
            <div className="flex items-center">
              {characters.map((char, i) => (
                <div
                  key={char.characterId}
                  className="relative rounded-full ring-2 ring-surface-secondary"
                  style={{
                    marginLeft: i === 0 ? 0 : OVERLAP_OFFSET,
                    zIndex: characters.length - i,
                  }}
                  title={char.characterName}
                >
                  <img
                    src={`https://images.evetech.net/characters/${char.characterId}/portrait?size=64`}
                    alt={char.characterName}
                    className="rounded-full"
                    style={{ width: PORTRAIT_SIZE, height: PORTRAIT_SIZE }}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
})
