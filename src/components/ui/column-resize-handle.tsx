import type React from 'react'
import { useTranslation } from 'react-i18next'

export const MIN_COLUMN_WIDTH = 40
const KEYBOARD_STEP = 16

interface ColumnResizeCallbacks {
  onResizeStart: () => number
  onResize: (width: number) => void
  onResizeEnd: () => void
  onReset: () => void
}

function clampWidth(width: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.round(width))
}

export function ColumnResizeHandle({
  onResizeStart,
  onResize,
  onResizeEnd,
  onReset,
}: ColumnResizeCallbacks) {
  const { t } = useTranslation('common')
  const label = t('accessibility.resizeColumn')

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const handle = e.currentTarget
    const pointerId = e.pointerId
    const startX = e.clientX
    const startWidth = onResizeStart()

    handle.setPointerCapture(pointerId)
    document.body.classList.add('cursor-col-resize', 'select-none')

    const handleMove = (event: PointerEvent) => {
      onResize(clampWidth(startWidth + event.clientX - startX))
    }
    const handleEnd = () => {
      handle.removeEventListener('pointermove', handleMove)
      handle.removeEventListener('pointerup', handleEnd)
      handle.removeEventListener('pointercancel', handleEnd)
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId)
      }
      document.body.classList.remove('cursor-col-resize', 'select-none')
      onResizeEnd()
    }

    handle.addEventListener('pointermove', handleMove)
    handle.addEventListener('pointerup', handleEnd)
    handle.addEventListener('pointercancel', handleEnd)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    e.stopPropagation()
    const step = e.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP
    onResize(clampWidth(onResizeStart() + step))
    onResizeEnd()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      tabIndex={0}
      className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none active:bg-accent"
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        e.stopPropagation()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onReset()
      }}
    />
  )
}
