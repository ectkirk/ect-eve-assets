import type React from 'react'
import { cn } from '@/lib/utils'

const KEYBOARD_STEP = 16

interface ResizeHandleProps {
  /** Returns the current width when a drag or key press starts. */
  onResizeStart: () => number
  onResize: (width: number) => void
  onResizeEnd: () => void
  onReset?: (() => void) | undefined
  minWidth: number
  maxWidth?: number | undefined
  label: string
  className?: string | undefined
}

export function ResizeHandle({
  onResizeStart,
  onResize,
  onResizeEnd,
  onReset,
  minWidth,
  maxWidth = Number.POSITIVE_INFINITY,
  label,
  className,
}: ResizeHandleProps) {
  const clamp = (width: number) =>
    Math.min(maxWidth, Math.max(minWidth, Math.round(width)))

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
      onResize(clamp(startWidth + event.clientX - startX))
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
    onResize(clamp(onResizeStart() + step))
    onResizeEnd()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      tabIndex={0}
      className={cn(
        'absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none active:bg-accent',
        className,
      )}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        e.stopPropagation()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onReset?.()
      }}
    />
  )
}
