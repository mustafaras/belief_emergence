import { extent } from 'd3-array'
import { scaleLinear } from 'd3-scale'
import { hexbin } from 'd3-hexbin'
import { formatClaim } from '../claims/format'
import { Axis } from './Axis'
import { ChartSvg } from './ChartSvg'
import type { Point } from './chartTypes'
import styles from './Charts.module.css'
import { ErrorState } from '../ui/ErrorState'

type HexScatterProps = { title: string; description: string; points: Point[]; xLabel: string; yLabel: string }

const WIDTH = 720
const HEIGHT = 420
const MARGIN = { top: 36, right: 34, bottom: 68, left: 84 }

export function HexScatter({ title, description, points, xLabel, yLabel }: HexScatterProps) {
  if (points.length === 0) return <ErrorState artifact={title} message="No data is available for this chart." />
  const [xMin, xMax] = extent(points, point => point.x) as [number, number]
  const [yMin, yMax] = extent(points, point => point.y) as [number, number]
  const xPadding = xMin === xMax ? 0.1 : (xMax - xMin) * 0.04
  const yPadding = yMin === yMax ? 0.1 : (yMax - yMin) * 0.04
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = scaleLinear().domain([xMin - xPadding, xMax + xPadding]).range([0, plotWidth])
  const y = scaleLinear().domain([yMin - yPadding, yMax + yPadding]).range([plotHeight, 0])
  const projected: [number, number][] = points.map(point => [x(point.x), y(point.y)])
  const bins = hexbin<[number, number]>().x(point => point[0]).y(point => point[1]).radius(12).extent([[0, 0], [plotWidth, plotHeight]])(projected)
  const highest = Math.max(...bins.map(bin => bin.length), 1)
  const columns = [xLabel, yLabel]
  const rows = points.map(point => [formatClaim(point.x, 'p3'), formatClaim(point.y, 'p3')])

  return (
    <ChartSvg title={title} description={description} data={{ columns, rows }}>
      <Axis x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight}
        xTicks={x.ticks(5).map(value => ({ position: MARGIN.left + x(value), label: formatClaim(value, 'p2') }))}
        yTicks={y.ticks(5).map(value => ({ position: MARGIN.top + y(value), label: formatClaim(value, 'p2') }))} xLabel={xLabel} yLabel={yLabel} />
      <g transform={`translate(${MARGIN.left} ${MARGIN.top})`}>
        {bins.map((bin, index) => {
          const intensity = Math.round(bin.length / highest * 88) + 12
          return <path d={hexbin().hexagon()} fill={`color-mix(in srgb, var(--accent) ${intensity}%, var(--surface))`} key={`${bin.x}-${bin.y}-${index}`} transform={`translate(${bin.x} ${bin.y})`}><title>{`${bin.length} observations`}</title></path>
        })}
      </g>
      <text className={styles.label} x={MARGIN.left + 4} y={MARGIN.top + 16}>Hexagonal bins · n={formatClaim(points.length, 'int')}</text>
    </ChartSvg>
  )
}
