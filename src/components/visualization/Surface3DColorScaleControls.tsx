import type { Dispatch, SetStateAction } from 'react'
import type { ColorScaleName } from './surface/colorScale'

type Props = {
  colorScale: ColorScaleName
  setColorScale: Dispatch<SetStateAction<ColorScaleName>>
  customLow: string
  setCustomLow: Dispatch<SetStateAction<string>>
  customMid: string
  setCustomMid: Dispatch<SetStateAction<string>>
  customHigh: string
  setCustomHigh: Dispatch<SetStateAction<string>>
  reverseScale: boolean
  setReverseScale: Dispatch<SetStateAction<boolean>>
}

export default function Surface3DColorScaleControls({
  colorScale,
  setColorScale,
  customLow,
  setCustomLow,
  customMid,
  setCustomMid,
  customHigh,
  setCustomHigh,
  reverseScale,
  setReverseScale,
}: Props) {
  return (
    <details className="surface3d-expander" open>
      <summary className="surface3d-expander-summary">Colors</summary>
      <div className="surface3d-expander-body">
        <div className="surface3d-dock-row">
          <div className="surface3d-dock-item-k">Palette</div>
          <select
            className="surface3d-dock-select"
            aria-label="Palette"
            value={colorScale}
            onChange={(e) => setColorScale(e.target.value as ColorScaleName)}
          >
            {(['Cividis', 'Viridis', 'Magma', 'YlGnBu', 'RdBu', 'Custom'] as const).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {colorScale === 'Custom' ? (
          <>
            <div className="surface3d-dock-row">
              <div className="surface3d-dock-item-k">Low</div>
              <input
                className="surface3d-dock-input"
                type="color"
                aria-label="Custom palette low color"
                value={customLow}
                onChange={(e) => setCustomLow(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="surface3d-dock-row">
              <div className="surface3d-dock-item-k">Mid</div>
              <input
                className="surface3d-dock-input"
                type="color"
                aria-label="Custom palette mid color"
                value={customMid}
                onChange={(e) => setCustomMid(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="surface3d-dock-row">
              <div className="surface3d-dock-item-k">High</div>
              <input
                className="surface3d-dock-input"
                type="color"
                aria-label="Custom palette high color"
                value={customHigh}
                onChange={(e) => setCustomHigh(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </>
        ) : null}
        <div className="surface3d-dock-row surface3d-dock-row--chips">
          {reverseScale ? (
            <button
              type="button"
              className="surface3d-chip is-active"
              aria-pressed="true"
              onClick={() => setReverseScale((v) => !v)}
            >
              Reverse
            </button>
          ) : (
            <button
              type="button"
              className="surface3d-chip"
              aria-pressed="false"
              onClick={() => setReverseScale((v) => !v)}
            >
              Reverse
            </button>
          )}
        </div>
      </div>
    </details>
  )
}
