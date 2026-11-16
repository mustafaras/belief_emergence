import { extent, median, quantile } from 'd3-array'
import { scaleLinear } from 'd3-scale'
import { formatClaim } from '../claims/format'
import { Axis } from './Axis'
import { ChartSvg } from './ChartSvg'
import { requireTokenColor, type SeriesDefinition } from './chartTypes'
import styles from './Charts.module.css'
import { ErrorState } from '../ui/ErrorState'

type DistributionSeries = SeriesDefinition & { values: number[] }
type DistStripProps = { title: string; description: string; series: DistributionSeries[]; reference?: { value: number; label: string } }

const WIDTH = 720
const HEIGHT = 420
const MARGIN = { top: 36, right: 36, bottom: 64, left: 140 }

export function DistStrip({ title, description, series, reference }: DistStripProps) {
  const values = series.flatMap(item => item.values)
  if (values.length === 0) return <ErrorState artifact={title} message="No data is available for this chart." />
  const [minimum, maximum] = extent(values) as [number, number]
  const padding = minimum === maximum ? Math.max(0.1, Math.abs(minimum) * 0.1) : (maximum - minimum) * 0.08
  const x = scaleLinear().domain([minimum - padding, maximum + padding]).range([MARGIN.left, WIDTH - MARGIN.right]).nice()
  const rowHeight = (HEIGHT - MARGIN.top - MARGIN.bottom) / series.length
  const columns = ['Series', 'N', 'Q1', 'Median', 'Q3']
  const rows = series.map(item => [
    item.label, item.values.length,
    formatClaim(quantile(item.values, 0.25) ?? 0, 'p3'),
    formatClaim(median(item.values) ?? 0, 'p3'),
    formatClaim(quantile(item.values, 0.75) ?? 0, 'p3')
  ])

  return (
    <ChartSvg title={title} description={description} data={{ columns, rows }}>
      <Axis x={MARGIN.left} y={MARGIN.top} width={WIDTH - MARGIN.left - MARGIN.right} height={HEIGHT - MARGIN.top - MARGIN.bottom}
        xTicks={x.ticks(5).map(value => ({ position: x(value), label: formatClaim(value, 'p2') }))} />
      {reference && <g><line className={styles.reference} x1={x(reference.value)} x2={x(reference.value)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} /><text className={styles.label} x={x(reference.value) + 4} y={MARGIN.top - 8}>{reference.label}</text></g>}
      {series.map((item, seriesIndex) => {
        const y = MARGIN.top + seriesIndex * rowHeight + rowHeight / 2
        const q1 = quantile(item.values, 0.25) ?? 0
        const q3 = quantile(item.values, 0.75) ?? 0
        const center = median(item.values) ?? 0
        const color = requireTokenColor(item.color)
        return (
          <g key={item.key}>
            <text className={styles.label} textAnchor="end" x={MARGIN.left - 12} y={y + 4}>{item.label}</text>
            <line stroke={color} strokeWidth="2" x1={x(minimum)} x2={x(maximum)} y1={y} y2={y} />
            <rect fill={color} fillOpacity="0.2" height="18" width={Math.max(1, x(q3) - x(q1))} x={x(q1)} y={y - 9} />
            <line stroke={color} strokeWidth="2" x1={x(center)} x2={x(center)} y1={y - 10} y2={y + 10} />
            {item.values.map((value, pointIndex) => (
              <circle cx={x(value)} cy={y + ((pointIndex % 5) - 2) * 4} fill={color} key={`${value}-${pointIndex}`} r="3">
                <title>{`${item.label}: ${formatClaim(value, 'p3')}`}</title>
              </circle>
            ))}
          </g>
        )
      })}
    </ChartSvg>
  )
}
