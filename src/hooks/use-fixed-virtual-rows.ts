import { useEffect, useMemo, useState } from 'react'

export interface FixedVirtualRow {
  index: number
  start: number
  end: number
  size: number
}

interface FixedVirtualRowsOptions {
  count: number
  getScrollElement: () => HTMLElement | null
  rowHeight: number
  overscan?: number
}

interface FixedVirtualRowsResult {
  virtualRows: FixedVirtualRow[]
  totalSize: number
  paddingStart: number
  paddingEnd: number
}

interface ScrollMetrics {
  scrollOffset: number
  viewportSize: number
}

export function useFixedVirtualRows({
  count,
  getScrollElement,
  rowHeight,
  overscan = 5,
}: FixedVirtualRowsOptions): FixedVirtualRowsResult {
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    scrollOffset: 0,
    viewportSize: 0,
  })

  useEffect(() => {
    const element = getScrollElement()
    if (!element) return

    let frameId: number | null = null
    const updateMetrics = () => {
      if (frameId !== null) return
      frameId = requestAnimationFrame(() => {
        frameId = null
        setMetrics({
          scrollOffset: element.scrollTop,
          viewportSize: element.clientHeight,
        })
      })
    }

    const resizeObserver = new ResizeObserver(updateMetrics)
    resizeObserver.observe(element)
    element.addEventListener('scroll', updateMetrics, { passive: true })
    updateMetrics()

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      element.removeEventListener('scroll', updateMetrics)
    }
  }, [getScrollElement])

  return useMemo(() => {
    const totalSize = count * rowHeight
    if (count === 0) {
      return {
        virtualRows: [],
        totalSize,
        paddingStart: 0,
        paddingEnd: 0,
      }
    }

    const viewportSize = metrics.viewportSize || rowHeight * overscan
    const startIndex = Math.max(
      0,
      Math.floor(metrics.scrollOffset / rowHeight) - overscan,
    )
    const endIndex = Math.min(
      count - 1,
      Math.ceil((metrics.scrollOffset + viewportSize) / rowHeight) + overscan,
    )

    const virtualRows: FixedVirtualRow[] = []
    for (let index = startIndex; index <= endIndex; index++) {
      const start = index * rowHeight
      virtualRows.push({
        index,
        start,
        end: start + rowHeight,
        size: rowHeight,
      })
    }

    const paddingStart = virtualRows[0]?.start ?? 0
    const paddingEnd = Math.max(0, totalSize - (virtualRows.at(-1)?.end ?? 0))

    return {
      virtualRows,
      totalSize,
      paddingStart,
      paddingEnd,
    }
  }, [count, metrics.scrollOffset, metrics.viewportSize, overscan, rowHeight])
}
