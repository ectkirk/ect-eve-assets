import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'

interface ResizableSidebarProps {
  storageKey: string
  defaultWidth: number
  minWidth?: number
  maxWidth?: number
  children: ReactNode
  className?: string
}

export function ResizableSidebar({
  storageKey,
  defaultWidth,
  minWidth = 200,
  maxWidth = 600,
  children,
  className = '',
}: ResizableSidebarProps) {
  const [width, setWidth] = useState(() => {
    try {
      const stored = localStorage.getItem(`sidebar-width-${storageKey}`)
      if (stored) {
        const parsed = Number(stored)
        if (parsed >= minWidth && parsed <= maxWidth) return parsed
      }
    } catch {
      // ignore
    }
    return defaultWidth
  })

  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const widthRef = useRef(width)

  useEffect(() => {
    widthRef.current = width
  }, [width])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = e.clientX - startX.current
      const newWidth = Math.min(
        maxWidth,
        Math.max(minWidth, startWidth.current + delta)
      )
      setWidth(newWidth)
    },
    [minWidth, maxWidth]
  )

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    try {
      localStorage.setItem(
        `sidebar-width-${storageKey}`,
        String(widthRef.current)
      )
    } catch {
      // ignore
    }
  }, [storageKey])

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = widthRef.current
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width }}>
      {children}
      <div
        onMouseDown={handleMouseDown}
        className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-accent/40 active:bg-accent/60"
      />
    </div>
  )
}
