import { extent } from 'd3-array'
import { scaleLinear, scaleLog } from 'd3-scale'
import { curveMonotoneX, line } from 'd3-shape'
import { formatClaim } from '../claims/format'
import { Axis } from './Axis'
import { ChartSvg } from './ChartSvg'
import type { Point } from './chartTypes'
import styles from './Charts.module.css'
import { ErrorState } from '../ui/ErrorState'

type LineThreshold = { y: number; label: string; style: 'solid' | 'dashed' }
type LineProfileProps = {
  title: string
  description: string
  points: Point[]
  thresholds?: LineThreshold[]
  highlightX?: { x: number; label: string }[]
  xLabel: string
  yLabel: string
  logX?: boolean
}

const WIDTH = 720
const HEIGHT = 420
const MARGIN = { top: 42, right: 36, bottom: 70, left: 84 }

export function LineProfile({ title, description, points, thresholds = [], highlightX = [], xLabel, yLabel, logX = false }: LineProfileProps) {
  if (points.length === 0) return <ErrorState artifact={title} message="No data is available for this chart." />
  if (logX && points.some(point => point.x <= 0)) return <ErrorState artifact={title} message="Log-scale inputs must be positive." />
  const sorted = [...points].sort((a, b) => a.x - b.x)
  const [xMin, xMax] = extent(sorted, point => point.x) as [number, number]
  const [yMin, yMax] = extent(sorted, point => point.y) as [number, number]
  const xDomain = xMin === xMax ? [xMin / 1.2, xMax * 1.2] : [xMin, xMax]
  const yPadding = yMin === yMax ? 0.1 : (yMax - yMin) * 0.08
  const x = (logX ? scaleLog() : scaleLinear()).domain(xDomain).range([MARGIN.left, WIDTH - MARGIN.right])
  const y = scaleLinear().domain([yMin - yPadding, yMax + yPadding]).range([HEIGHT - MARGIN.bottom, MARGIN.top]).nice()
  const path = line<Point>().x(point => x(point.x)).y(point => y(point.y)).curve(curveMonotoneX)(sorted)
  const columns = [xLabel, yLabel]
  const rows = sorted.map(point => [formatClaim(point.x, 'p3'), formatClaim(point.y, 'p3')])

  return (
    <ChartSvg title={title} description={description} data={{ columns, rows }}>
      <Axis x={MARGIN.left} y={MARGIN.top} width={WIDTH - MARGIN.left - MARGIN.right} height={HEIGHT - MARGIN.top - MARGIN.bottom}
        xTicks={x.ticks(5).map(value => ({ position: x(value), label: formatClaim(value, 'p2') }))}
        yTicks={y.ticks(5).map(value => ({ position: y(value), label: formatClaim(value, 'p2') }))} xLabel={xLabel} yLabel={yLabel} />
      {thresholds.map(item => <g key={`${item.y}-${item.label}`}><line className={item.style === 'dashed' ? styles.dashed : styles.reference} x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(item.y)} y2={y(item.y)} /><text className={styles.label} x={WIDTH - MARGIN.right - 4} y={y(item.y) - 6} textAnchor="end">{item.label}</text></g>)}
      {highlightX.map(item => <g key={`${item.x}-${item.label}`}><line className={styles.highlight} x1={x(item.x)} x2={x(item.x)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} /><text className={styles.label} x={x(item.x) + 4} y={MARGIN.top + 14}>{item.label}</text></g>)}
      <path d={path ?? ''} fill="none" stroke="var(--accent)" strokeWidth="3"><title>{title}</title></path>
      {sorted.map(point => <circle cx={x(point.x)} cy={y(point.y)} fill="var(--accent)" key={`${point.x}-${point.y}`} r="4"><title>{`${xLabel}: ${formatClaim(point.x, 'p3')}; ${yLabel}: ${formatClaim(point.y, 'p3')}`}</title></circle>)}
    </ChartSvg>
  )
}
