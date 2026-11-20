import { scaleLinear } from 'd3-scale'
import { type KeyboardEvent, type MouseEvent } from 'react'
import { formatClaim } from '../claims/format'
import { getClaim } from '../claims/registry'
import { useClaimInspector } from '../claims/InspectorContext'
import { ChartSvg } from './ChartSvg'
import styles from './Charts.module.css'
import { ErrorState } from '../ui/ErrorState'

type FunnelStep = { label: string; claimId: string; unit?: string }
type FunnelProps = { title: string; description: string; steps: FunnelStep[] }

const WIDTH = 720
const HEIGHT = 420
const MARGIN = { top: 42, right: 104, bottom: 32, left: 136 }

export function Funnel({ title, description, steps }: FunnelProps) {
  const { openClaim } = useClaimInspector()
  if (steps.length === 0) return <ErrorState artifact={title} message="No data is available for this chart." />
  const resolvedSteps = steps.map(step => ({ ...step, value: getClaim(step.claimId).value }))
  const maximaByUnit = new Map<string, number>()
  resolvedSteps.forEach((step, index) => {
    const unit = step.unit ?? `stage-${index}`
    maximaByUnit.set(unit, Math.max(maximaByUnit.get(unit) ?? 0, step.value))
  })
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right
  const scalesByUnit = new Map([...maximaByUnit].map(([unit, maximum]) => [
    unit,
    scaleLinear().domain([0, Math.max(maximum, 1)]).range([0, plotWidth])
  ]))
  const rowHeight = (HEIGHT - MARGIN.top - MARGIN.bottom) / resolvedSteps.length
  const columns = ['Stage', 'Value', 'Unit', 'Claim']
  const rows = resolvedSteps.map(step => [step.label, formatClaim(step.value, 'int'), step.unit ?? 'Unspecified', step.claimId])
  const valueX = WIDTH - MARGIN.right + 12

  return (
    <ChartSvg title={title} description={description} data={{ columns, rows }} role="group">
      {resolvedSteps.map((step, index) => {
        const unit = step.unit ?? `stage-${index}`
        const x = scalesByUnit.get(unit)!
        const barWidth = x(step.value)
        const y = MARGIN.top + index * rowHeight
        const previous = resolvedSteps[index - 1]
        const difference = previous && previous.unit && previous.unit === step.unit
          ? previous.value - step.value
          : null
        const drop = difference === null || difference === 0
          ? null
          : difference > 0
            ? `−${formatClaim(difference, 'int')} lost`
            : `+${formatClaim(Math.abs(difference), 'int')} gained`
        return (
          <g key={step.claimId}>
            <text className={styles.label} textAnchor="end" x={MARGIN.left - 12} y={y + rowHeight / 2 + 4}>{step.label}</text>
            <rect fill="var(--accent)" height={Math.min(28, rowHeight * 0.58)} rx="var(--radius-1)" width={barWidth} x={MARGIN.left} y={y + (rowHeight - Math.min(28, rowHeight * 0.58)) / 2}>
              <title>{`${step.label}: ${formatClaim(step.value, 'int')}`}</title>
            </rect>
            <text
              aria-label={`${step.label}: ${formatClaim(step.value, 'int')}`}
              className={`${styles.value} ${styles.claimValue}`}
              data-claim-id={step.claimId}
              onClick={(event: MouseEvent<SVGTextElement>) => openClaim(step.claimId, event.currentTarget)}
              onKeyDown={(event: KeyboardEvent<SVGTextElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openClaim(step.claimId, event.currentTarget)
                }
              }}
              role="button"
              tabIndex={0}
              x={valueX}
              y={y + rowHeight / 2}
            >
              {formatClaim(step.value, 'int')}
            </text>
            {drop !== null && <text className={styles.loss} x={valueX} y={y + rowHeight / 2 + 16}>{drop}</text>}
          </g>
        )
      })}
    </ChartSvg>
  )
}
