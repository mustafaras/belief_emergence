import styles from './Charts.module.css'

export type AxisTick = { position: number; label: string }

type AxisProps = {
  x: number
  y: number
  width: number
  height: number
  xTicks?: AxisTick[]
  yTicks?: AxisTick[]
  xLabel?: string
  yLabel?: string
}

export function Axis({ x, y, width, height, xTicks = [], yTicks = [], xLabel, yLabel }: AxisProps) {
  return (
    // Scale labels, not measurements: the ticks are chosen by the d3 scale (`.nice()`),
    // so they are a presentation of the domain rather than a value any artifact carries.
    // The rendered-number audit excludes this subtree for that reason; without the marker
    // it would demand an artifact for "60.00" and "80.00".
    <g className={styles.axis} data-scale-label="">
      {xTicks.map(tick => (
        <g key={`x-${tick.position}`}>
          <line x1={tick.position} x2={tick.position} y1={y} y2={y + height} />
          <text textAnchor="middle" x={tick.position} y={y + height + 20}>{tick.label}</text>
        </g>
      ))}
      {yTicks.map(tick => (
        <g key={`y-${tick.position}`}>
          <line x1={x} x2={x + width} y1={tick.position} y2={tick.position} />
          <text textAnchor="end" x={x - 10} y={tick.position + 4}>{tick.label}</text>
        </g>
      ))}
      {xLabel && <text textAnchor="middle" x={x + width / 2} y={y + height + 48}>{xLabel}</text>}
      {yLabel && <text textAnchor="middle" transform={`rotate(-90 ${x - 78} ${y + height / 2})`} x={x - 78} y={y + height / 2}>{yLabel}</text>}
    </g>
  )
}
