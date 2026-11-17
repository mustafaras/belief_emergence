import type { ReactNode } from 'react'
import styles from './Interactive.module.css'

type FigureFrameProps = {
  number: string | number
  title: string
  children: ReactNode
  scope: string
  method: string
  boundary: string
  sources: string[]
}

export function FigureFrame({ number, title, children, scope, method, boundary, sources }: FigureFrameProps) {
  return (
    <figure className={styles.figure}>
      <div className={styles.figureBody}>
        {/* A figure number is a label, not a measurement: marked so the rendered-number
            audit excludes it rather than relying on some artifact containing the digits. */}
        <p className={styles.figureNumber} data-scale-label="">Figure {number}</p>
        <h2>{title}</h2>
        {children}
      </div>
      <figcaption className={styles.figureCaption}>
        <p><strong>Data scope · </strong>{scope}</p>
        <p><strong>Method context · </strong>{method}</p>
        <p><strong>Interpretation boundary · </strong>{boundary}</p>
        <ul aria-label="Sources">
          {sources.map(source => <li key={source}>{source}</li>)}
        </ul>
      </figcaption>
    </figure>
  )
}
