import { useEffect, useState, type RefObject } from 'react'

export type ChartSize = { width: number; height: number }

const DEFAULT_SIZE: ChartSize = { width: 720, height: 420 }

export function useChartSize<T extends HTMLElement>(element: RefObject<T | null>, viewBoxHeight = DEFAULT_SIZE.height): ChartSize {
  const [size, setSize] = useState(DEFAULT_SIZE)

  useEffect(() => {
    const node = element.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const measuredWidth = entries[0]?.contentRect.width ?? DEFAULT_SIZE.width
      if (measuredWidth > 0) {
        // Keep the chart's 12px SVG labels readable at narrow widths. The
        // figure scrolls horizontally when its container is narrower than
        // the minimum plotting canvas.
        const width = Math.max(DEFAULT_SIZE.width, Math.min(measuredWidth, 960))
        const height = width * viewBoxHeight / DEFAULT_SIZE.width
        setSize({ width, height })
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [element, viewBoxHeight])

  return size
}
