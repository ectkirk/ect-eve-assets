import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { clampToViewport } from '../utils/coordinates'

interface MapSystemContextMenuProps {
  x: number
  y: number
  isIgnored: boolean
  onSetOrigin: () => void
  onSetDestination: () => void
  onIgnore: () => void
  onUnignore: () => void
  onSetWaypoint: () => void
  onClose: () => void
}

const MENU_WIDTH = 180
const MENU_HEIGHT_ESTIMATE = 200

export function MapSystemContextMenu({
  x,
  y,
  isIgnored,
  onSetOrigin,
  onSetDestination,
  onIgnore,
  onUnignore,
  onSetWaypoint,
  onClose,
}: MapSystemContextMenuProps) {
  const { t } = useTranslation('tools')
  const { t: tCommon } = useTranslation('common')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const position = useMemo(
    () => clampToViewport(x, y, MENU_WIDTH, MENU_HEIGHT_ESTIMATE),
    [x, y]
  )

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded border border-border bg-surface-secondary py-1 shadow-lg"
      style={{ left: position.left, top: position.top }}
    >
      <div className="px-3 py-1 text-xs font-medium text-content-secondary">
        {t('map.contextMenu.map')}
      </div>
      <button
        className="w-full px-4 py-1.5 text-left text-sm hover:bg-surface-tertiary"
        onClick={onSetOrigin}
      >
        {t('map.contextMenu.setOrigin')}
      </button>
      <button
        className="w-full px-4 py-1.5 text-left text-sm hover:bg-surface-tertiary"
        onClick={onSetDestination}
      >
        {t('map.contextMenu.setDestination')}
      </button>
      {isIgnored ? (
        <button
          className="w-full px-4 py-1.5 text-left text-sm hover:bg-surface-tertiary"
          onClick={onUnignore}
        >
          {t('map.contextMenu.unignoreSystem')}
        </button>
      ) : (
        <button
          className="w-full px-4 py-1.5 text-left text-sm hover:bg-surface-tertiary"
          onClick={onIgnore}
        >
          {t('map.contextMenu.ignoreSystem')}
        </button>
      )}
      <div className="my-1 border-t border-border" />
      <div className="px-3 py-1 text-xs font-medium text-content-secondary">
        {t('map.contextMenu.ingame')}
      </div>
      <button
        className="w-full px-4 py-1.5 text-left text-sm hover:bg-surface-tertiary"
        onClick={onSetWaypoint}
      >
        {tCommon('contextMenu.setWaypoint')}
      </button>
    </div>
  )
}
