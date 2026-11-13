import { useMemo, useState } from 'react'
import {
  buildEffectiveColorScale,
  isColorScaleName,
  readColorHex,
  type ColorScaleName,
} from './colorScale'

export function useSurfaceColorScale(initialState: {
  colorScale?: unknown
  reverseScale?: unknown
  showColorbar?: boolean
} | undefined) {
  const [colorScale, setColorScale] = useState<ColorScaleName>(
    () => (isColorScaleName(initialState?.colorScale) ? initialState.colorScale : 'Cividis'),
  )
  const [customLow, setCustomLow] = useState<string>(() => readColorHex('--accent-primary', '#f59e0b'))
  const [customMid, setCustomMid] = useState<string>(() => readColorHex('--accent-warning', '#f59e0b'))
  const [customHigh, setCustomHigh] = useState<string>(() => readColorHex('--accent-error', '#f59e0b'))
  const effectiveColorscale = useMemo(
    () => buildEffectiveColorScale(colorScale, customLow, customMid, customHigh),
    [colorScale, customLow, customMid, customHigh],
  )
  const [reverseScale, setReverseScale] = useState<boolean>(() => Boolean(initialState?.reverseScale))
  const [showColorbar, setShowColorbar] = useState<boolean>(() => initialState?.showColorbar !== false)

  return {
    colorScale,
    setColorScale,
    customLow,
    setCustomLow,
    customMid,
    setCustomMid,
    customHigh,
    setCustomHigh,
    effectiveColorscale,
    reverseScale,
    setReverseScale,
    showColorbar,
    setShowColorbar,
  }
}
