import { extent } from 'd3-array'
import { scaleLinear } from 'd3-scale'
import { formatClaim } from '../claims/format'
import { Axis } from './Axis'
import { ChartSvg } from './ChartSvg'
import styles from './Charts.module.css'
import { ErrorState } from '../ui/ErrorState'

type CalibrationPoint = { predicted: number; observed: number }
type CalibrationProps = { title: string; description: string; points: CalibrationPoint[] }

const WIDTH = 720
const HEIGHT = 420
const MARGIN = { top: 36, right: 34, bottom: 70, left: 84 }

export function Calibration({ title, description, points }: CalibrationProps) {
  if (points.length === 0) return <ErrorState artifact={title} message="No data is available for this chart." />
  const values = points.flatMap(point => [point.predicted, point.observed])
  const [minimum, maximum] = extent(values) as [number, number]
  const padding = maximum === minimum ? 0.1 : (maximum - minimum) * 0.05
  const domain = [minimum - padding, maximum + padding]
  const size = Math.min(WIDTH - MARGIN.left - MARGIN.right, HEIGHT - MARGIN.top - MARGIN.bottom)
  const x = scaleLinear().domain(domain).range([MARGIN.left, MARGIN.left + size])
  const y = scaleLinear().domain(domain).range([MARGIN.top + size, MARGIN.top])
  const columns = ['Predicted', 'Observed']
  const rows = points.map(point => [formatClaim(point.predicted, 'p3'), formatClaim(point.observed, 'p3')])

  return (
    <ChartSvg title={title} description={description} data={{ columns, rows }}>
      <Axis x={MARGIN.left} y={MARGIN.top} width={size} height={size}
        xTicks={x.ticks(5).map(value => ({ position: x(value), label: formatClaim(value, 'p2') }))}
        yTicks={y.ticks(5).map(value => ({ position: y(value), label: formatClaim(value, 'p2') }))} xLabel="Predicted" yLabel="Observed" />
      <line className={styles.reference} x1={x(domain[0])} x2={x(domain[1])} y1={y(domain[0])} y2={y(domain[1])} />
      <text className={styles.label} x={MARGIN.left + 12} y={MARGIN.top + 16}>Ideal calibration</text>
      {points.map((point, index) => <circle cx={x(point.predicted)} cy={y(point.observed)} fill="var(--accent)" key={`${point.predicted}-${point.observed}-${index}`} r="5"><title>{`Predicted ${formatClaim(point.predicted, 'p3')}; observed ${formatClaim(point.observed, 'p3')}`}</title></circle>)}
    </ChartSvg>
  )
}
