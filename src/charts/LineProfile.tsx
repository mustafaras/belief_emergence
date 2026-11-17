import { extent } from 'd3-array'
import { scaleLinear, scaleLog } from 'd3-scale'
import { curveMonotoneX, line } from 'd3-shape'
import { formatClaim } from '../claims/format'
import type { ClaimFormat } from '../claims/types'
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
  /** Axis tick format. The data table keeps its own precision. */
  xFormat?: ClaimFormat
  yFormat?: ClaimFormat
}

const WIDTH = 720
const HEIGHT = 420
const MARGIN = { top: 42, right: 36, bottom: 70, left: 84 }

export function LineProfile({ title, description, points, thresholds = [], highlightX = [], xLabel, yLabel, logX = false, xFormat = 'p2', yFormat = 'p2' }: LineProfileProps) {
  if (points.length === 0) return <ErrorState artifact={title} message="No data is available for this chart." />
  if (logX && points.some(point => point.x <= 0)) return <ErrorState artifact={title} message="Log-scale inputs must be positive." />
  const sorted = [...points].sort((a, b) => a.x - b.x)
  const [xMin, xMax] = extent(sorted, point => point.x) as [number, number]
  // Threshold lines are part of the chart's content, so the domain has to contain them.
  // Computing it from the data points alone drew the Bonferroni threshold above the plot
  // and clipped it: the whole point of that line is the distance between it and the curve.
  const thresholdY = thresholds.map((item) => item.y)
  const [dataMin, dataMax] = extent(sorted, point => point.y) as [number, number]
  const yMin = thresholdY.length > 0 ? Math.min(dataMin, ...thresholdY) : dataMin
  const yMax = thresholdY.length > 0 ? Math.max(dataMax, ...thresholdY) : dataMax
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
        xTicks={x.ticks(5).map(value => ({ position: x(value), label: formatClaim(value, xFormat) }))}
        yTicks={y.ticks(5).map(value => ({ position: y(value), label: formatClaim(value, yFormat) }))} xLabel={xLabel} yLabel={yLabel} />
      {thresholds.map((item, index) => (
        <g key={`${item.y}-${item.label}`}>
          <line className={item.style === 'dashed' ? styles.dashed : styles.reference} x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(item.y)} y2={y(item.y)} />
          {/* Labels sit at the left so they cannot collide with a vertical marker, which is
              usually placed at a data value somewhere along the axis. Alternating rows keeps
              two nearby thresholds from overprinting. */}
          <text
            className={styles.label}
            textAnchor="start"
            x={MARGIN.left + 6}
            y={y(item.y) - 6 + index * 12}
          >
            {item.label}
          </text>
        </g>
      ))}
      {highlightX.map(item => {
        // A marker at the far right of the domain used to render its label past the
        // viewBox, where it was clipped to "paper". Anchor the text inward when there
        // is no room to the right, and keep it inside the plot at both ends.
        const plotRight = WIDTH - MARGIN.right
        const anchorStart = x(item.x) + 4
        const fits = anchorStart + 120 <= plotRight
        return (
          <g key={`${item.x}-${item.label}`}>
            <line className={styles.highlight} x1={x(item.x)} x2={x(item.x)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
            <text
              className={styles.label}
              textAnchor={fits ? 'start' : 'end'}
              x={fits ? anchorStart : x(item.x) - 4}
              y={MARGIN.top + 14}
            >
              {item.label}
            </text>
          </g>
        )
      })}
      <path d={path ?? ''} fill="none" stroke="var(--accent)" strokeWidth="3"><title>{title}</title></path>
      {sorted.map(point => <circle cx={x(point.x)} cy={y(point.y)} fill="var(--accent)" key={`${point.x}-${point.y}`} r="4"><title>{`${xLabel}: ${formatClaim(point.x, 'p3')}; ${yLabel}: ${formatClaim(point.y, 'p3')}`}</title></circle>)}
    </ChartSvg>
  )
}
