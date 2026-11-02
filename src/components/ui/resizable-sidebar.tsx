import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ResizeHandle } from './resize-handle'

interface ResizableSidebarProps {
  storageKey: string
  defaultWidth: number
  minWidth?: number
  maxWidth?: number
  children: ReactNode
  className?: string
}

function loadWidth(
  key: string,
  minWidth: number,
  maxWidth: number,
): number | null {
  try {
    const stored = Number(localStorage.getItem(key))
    return stored >= minWidth && stored <= maxWidth ? stored : null
  } catch {
    return null
  }
}

function saveWidth(key: string, width: number | null): void {
  try {
    if (width === null) localStorage.removeItem(key)
    else localStorage.setItem(key, String(width))
  } catch {
    return
  }
}

export function ResizableSidebar({
  storageKey,
  defaultWidth,
  minWidth = 200,
  maxWidth = 600,
  children,
  className = '',
}: ResizableSidebarProps) {
  const { t } = useTranslation('common')
  const key = `sidebar-width-${storageKey}`
  const [width, setWidth] = useState(
    () => loadWidth(key, minWidth, maxWidth) ?? defaultWidth,
  )
  const widthRef = useRef(width)

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width }}>
      {children}
      <ResizeHandle
        minWidth={minWidth}
        maxWidth={maxWidth}
        label={t('accessibility.resizePanel')}
        onResizeStart={() => widthRef.current}
        onResize={(next) => {
          widthRef.current = next
          setWidth(next)
        }}
        onResizeEnd={() => {
          saveWidth(key, widthRef.current)
        }}
        onReset={() => {
          widthRef.current = defaultWidth
          setWidth(defaultWidth)
          saveWidth(key, null)
        }}
      />
    </div>
  )
}
