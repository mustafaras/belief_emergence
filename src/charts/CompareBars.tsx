import { scaleLinear } from 'd3-scale'
import { type KeyboardEvent, type MouseEvent } from 'react'
import { formatClaim } from '../claims/format'
import type { ClaimFormat } from '../claims/types'
import { useClaimInspector } from '../claims/InspectorContext'
import { Axis } from './Axis'
import { ChartSvg } from './ChartSvg'
import { requireTokenColor, type SeriesDefinition } from './chartTypes'
import styles from './Charts.module.css'
import { ErrorState } from '../ui/ErrorState'

type GroupValue = { series: string; value: number; claimId?: string; format?: ClaimFormat }
type BarGroup = { label: string; values: GroupValue[] }

type CompareBarsProps = {
  title: string
  description: string
  groups: BarGroup[]
  series: SeriesDefinition[]
  domain?: [number, number]
  /** Format used when a value does not declare its own. */
  format?: ClaimFormat
}

const WIDTH = 720
const HEIGHT = 420
const MARGIN = { top: 36, right: 42, bottom: 96, left: 172 }

/** Wrap a long axis label onto at most two lines so it cannot leave the plot area. */
const labelLines = (label: string): string[] => {
  if (label.length <= 22) return [label]
  const words = label.split(' ')
  const first: string[] = []
  const second: string[] = []
  for (const word of words) {
    if ((first.join(' ') + ' ' + word).trim().length <= 22 && second.length === 0) first.push(word)
    else second.push(word)
  }
  return [first.join(' '), second.join(' ')]
}

export function CompareBars({ title, description, groups, series, domain, format = 'p3' }: CompareBarsProps) {
  const { openClaim } = useClaimInspector()
  if (groups.length === 0 || series.length === 0) {
    return <ErrorState artifact={title} message="No data is available for this chart." />
  }
  const valueFormat = (item?: GroupValue): ClaimFormat => item?.format ?? format
  // A value that opens the Claim Inspector is a focusable button. `role="img"` may not
  // contain interactive descendants (axe: nested-interactive), so the chart is a group
  // whenever any bar is clickable — the same rule Funnel follows.
  const hasInteractiveValues = groups.some(group => group.values.some(item => item.claimId !== undefined))
  const allValues = groups.flatMap(group => group.values.map(item => item.value))
  const limits = domain ?? [Math.min(0, ...allValues), Math.max(1e-9, ...allValues)]
  const x = scaleLinear().domain(limits).range([MARGIN.left, WIDTH - MARGIN.right]).nice()
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const groupHeight = plotHeight / groups.length
  const barHeight = Math.min(22, groupHeight / series.length * 0.68)
  const columns = ['Group', ...series.map(item => item.label)]
  const rows = groups.map(group => [group.label, ...series.map(item => {
    const value = group.values.find(entry => entry.series === item.key)?.value
    return value === undefined ? null : formatClaim(value, 'p3')
  })])

  return (
    <ChartSvg description={description} data={{ columns, rows }} role={hasInteractiveValues ? 'group' : 'img'} title={title}>
      <Axis x={MARGIN.left} y={MARGIN.top} width={WIDTH - MARGIN.left - MARGIN.right} height={plotHeight}
        xTicks={x.ticks(5).map(value => ({ position: x(value), label: formatClaim(value, 'p2') }))} />
      {groups.map((group, groupIndex) => (
        <g key={group.label}>
          {group.values.length > 0 && (
            <text className={styles.label} textAnchor="end" x={MARGIN.left - 12} y={MARGIN.top + groupIndex * groupHeight + groupHeight / 2 + 4}>
              {labelLines(group.label).map((line, lineIndex, all) => (
                <tspan key={line} x={MARGIN.left - 12} y={MARGIN.top + groupIndex * groupHeight + groupHeight / 2 + 4 + (lineIndex - (all.length - 1) / 2) * 13}>
                  {line}
                </tspan>
              ))}
            </text>
          )}
          {series.map((definition, seriesIndex) => {
            const item = group.values.find(entry => entry.series === definition.key)
            if (!item) return null
            const y = MARGIN.top + groupIndex * groupHeight + seriesIndex * (groupHeight / series.length) + (groupHeight / series.length - barHeight) / 2
            const valueX = x(item.value)
            const zeroX = x(0)
            const label = `${group.label} — ${series.find(s => s.key === item.series)?.label ?? item.series}`
            return (
              <g key={definition.key}>
                <rect fill={requireTokenColor(definition.color)} height={barHeight} rx="var(--radius-1)" width={Math.abs(valueX - zeroX)} x={Math.min(zeroX, valueX)} y={y}>
                  <title>{`${label}: ${formatClaim(item.value, valueFormat(item))}`}</title>
                </rect>
                {item.claimId === undefined ? (
                  <text className={styles.value} textAnchor={item.value < 0 ? 'end' : 'start'} x={valueX + (item.value < 0 ? -6 : 6)} y={y + barHeight / 2 + 4}>{formatClaim(item.value, valueFormat(item))}</text>
                ) : (
                  <text
                    aria-label={`${label}: ${formatClaim(item.value, valueFormat(item))}`}
                    className={`${styles.value} ${styles.claimValue}`}
                    data-claim-id={item.claimId}
                    onClick={(event: MouseEvent<SVGTextElement>) => openClaim(item.claimId as string, event.currentTarget)}
                    onKeyDown={(event: KeyboardEvent<SVGTextElement>) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openClaim(item.claimId as string, event.currentTarget)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    textAnchor={item.value < 0 ? 'end' : 'start'}
                    x={valueX + (item.value < 0 ? -6 : 6)}
                    y={y + barHeight / 2 + 4}
                  >
                    {formatClaim(item.value, valueFormat(item))}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      ))}
      {series.map((item, index) => (
        // One legend line per series. Side-by-side placement made long labels
        // overlap once the series names carried a qualifier ("… (disjoint)").
        <g key={item.key} transform={`translate(${MARGIN.left} ${HEIGHT - 46 + index * 18})`}>
          <rect fill={requireTokenColor(item.color)} height="12" width="12" y="-10" />
          <text className={styles.label} x="18">{item.label}</text>
        </g>
      ))}
    </ChartSvg>
  )
}
