import { useId, useRef, type ReactNode } from 'react'
import { useChartSize } from './useChartSize'
import type { AccessibleTable } from './chartTypes'
import styles from './Charts.module.css'

type ChartSvgProps = {
  title: string
  description: string
  data: AccessibleTable
  children: ReactNode
  viewBoxHeight?: number
  role?: 'img' | 'group'
  scrollLabel?: string
}

export function ChartSvg({ title, description, data, children, viewBoxHeight = 420, role = 'img', scrollLabel }: ChartSvgProps) {
  const figureRef = useRef<HTMLDivElement>(null)
  const size = useChartSize(figureRef, viewBoxHeight)
  const id = useId().replaceAll(':', '')

  return (
    <div aria-label={scrollLabel} className={styles.figure} ref={figureRef} role={scrollLabel ? 'group' : undefined} tabIndex={scrollLabel ? 0 : undefined}>
      <figure className={styles.chart}>
        <figcaption className={styles.title}>{title}</figcaption>
        <svg aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} height={size.height} role={role} viewBox={`0 0 720 ${viewBoxHeight}`} width={size.width}>
          <title id={`${id}-title`}>{title}</title>
          <desc id={`${id}-description`}>{description}</desc>
          {children}
        </svg>
        <table className={styles.visuallyHidden}>
          <caption>{title} data</caption>
          <thead><tr>{data.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={`${String(row[0])}-${index}`}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{cell ?? 'Not observed'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </div>
  )
}
