import { useId } from 'react'
import { formatClaim } from '../claims/format'
import { ChartSvg } from './ChartSvg'
import styles from './Charts.module.css'
import { ErrorState } from '../ui/ErrorState'

type HeatmapProps = {
  title: string
  description: string
  rows: string[]
  cols: string[]
  values: (number | null)[][]
  scale: 'viridis' | 'diverging'
  legendLabel: string
  valueLabel?: (value: number) => string
  /**
   * Which column labels to draw as ticks. The default is a year grid, where labelling every
   * column is unreadable and every fifth year is the convention. A heatmap whose columns are a
   * metric rather than a year needs its own rule: the year rule leaves a Φ axis spanning
   * [−8, 2] with only its two endpoints labelled, because no intermediate label is divisible
   * by five.
   */
  tickLabel?: (column: string, index: number, count: number) => boolean
}

const defaultTickLabel = (column: string, index: number, count: number) => {
  const year = Number(column)
  return index === 0 || index === count - 1 || (Number.isFinite(year) && year % 5 === 0)
}

const WIDTH = 720
const MARGIN = { top: 54, right: 34, bottom: 48, left: 118 }

export function Heatmap({ title, description, rows, cols, values, scale, legendLabel, valueLabel, tickLabel }: HeatmapProps) {
  const missingId = useId().replaceAll(':', '')
  if (rows.length === 0 || cols.length === 0 || values.length === 0) {
    return <ErrorState artifact={title} message="No data is available for this chart." />
  }
  const observed = values.flat().filter((value): value is number => value !== null)
  const height = Math.max(420, MARGIN.top + MARGIN.bottom + rows.length * 15)
  const minimum = Math.min(...observed)
  const maximum = Math.max(...observed)
  const cellWidth = (WIDTH - MARGIN.left - MARGIN.right) / cols.length
  const cellHeight = (height - MARGIN.top - MARGIN.bottom) / rows.length
  const columns = ['Row', ...cols]
  const tableRows = rows.map((row, rowIndex) => [row, ...cols.map((_, colIndex) => {
    const value = values[rowIndex]?.[colIndex]
    return value === undefined || value === null ? null : valueLabel?.(value) ?? formatClaim(value, 'p3')
  })])
  const fillFor = (value: number) => {
    const span = maximum - minimum || 1
    const proportion = Math.min(100, Math.max(0, ((value - minimum) / span) * 100))
    if (scale === 'viridis') return `color-mix(in srgb, var(--tier-b) ${proportion}%, var(--tier-a))`
    const intensity = Math.min(100, Math.abs(value) / Math.max(Math.abs(minimum), Math.abs(maximum), 1e-9) * 100)
    const color = value < 0 ? 'var(--withdrawn)' : 'var(--accent)'
    return `color-mix(in srgb, ${color} ${intensity}%, var(--surface))`
  }

  return (
    <ChartSvg
      coordinateHeaders
      title={title}
      description={description}
      data={{ columns, rows: tableRows }}
      scrollLabel={`${title}; scroll horizontally to inspect every year`}
      viewBoxHeight={height}
    >
      <defs>
        <pattern height="8" id={missingId} patternTransform="rotate(45)" patternUnits="userSpaceOnUse" width="8">
          <rect fill="var(--surface-2)" height="8" width="8" />
          <line stroke="var(--ink-3)" strokeWidth="1" x1="0" x2="0" y1="0" y2="8" />
        </pattern>
      </defs>
      <text className={styles.label} x={MARGIN.left} y={28}>{legendLabel}</text>
      {cols.map((column, colIndex) => {
        const showTick = (tickLabel ?? defaultTickLabel)(column, colIndex, cols.length)
        // Column headers are axis ticks: grid coordinates, not measurements. Marked so the
        // rendered-number audit excludes them, the same way `Axis` marks its own.
        return showTick ? <text className={styles.label} data-scale-label="" key={column} textAnchor="middle" x={MARGIN.left + colIndex * cellWidth + cellWidth / 2} y={MARGIN.top - 10}>{column}</text> : null
      })}
      {rows.map((row, rowIndex) => (
        <g key={row}>
          <text className={styles.label} data-scale-label="" textAnchor="end" x={MARGIN.left - 10} y={MARGIN.top + rowIndex * cellHeight + cellHeight / 2 + 4}>{row}</text>
          {cols.map((column, colIndex) => {
            const value = values[rowIndex]?.[colIndex]
            const fill = value === undefined || value === null ? `url(#${missingId})` : fillFor(value)
            return (
              <rect fill={fill} height={Math.max(1, cellHeight - 2)} key={`${row}-${column}`} width={Math.max(1, cellWidth - 2)} x={MARGIN.left + colIndex * cellWidth} y={MARGIN.top + rowIndex * cellHeight}>
                <title>{`${row}, ${column}: ${value === undefined || value === null ? 'Not observed' : valueLabel?.(value) ?? formatClaim(value, 'p3')}`}</title>
              </rect>
            )
          })}
        </g>
      ))}
    </ChartSvg>
  )
}
