import { LineProfile } from '../../charts'
import { formatClaim } from '../../claims/format'
import { getClaim } from '../../claims/registry'
import { Callout, FigureFrame, Num, SegmentedControl } from '../../ui'
import giniWindow from '../../data/analysis/gini_window_sensitivity.json'
import styles from './Data.module.css'

/**
 * Decision Lab 1 — how far may a Gini value be borrowed?
 *
 * The manuscript adopts ±5 years and publishes the whole curve so a reader can pick
 * their own tolerance. That is only honest if the cost of the choice is visible, so
 * both halves move together: the row count and the number of cells that were filled
 * from a neighbouring year rather than measured in place.
 *
 * Every displayed value is a registered claim, so the number a reader clicks and the
 * number the figure plots are the same number.
 */
type Window = '0' | '1' | '2' | '3' | '5'

const WINDOWS: Window[] = ['0', '1', '2', '3', '5']
const PAPER_WINDOW: Window = '5'

const windowValue = (row: { window: number }): number => row.window

export function GiniWindowLab({ value, onChange }: { value: Window; onChange: (next: Window) => void }) {
  const selected = giniWindow.rows.find(row => row.window === Number(value)) ?? giniWindow.rows.at(-1)
  if (!selected) return null

  const rowsClaim = getClaim(`data.gini.window.${selected.window}.rows`)
  const recoveredClaim = getClaim(`data.gini.window.${selected.window}.recovered`)
  const paper = giniWindow.rows.find(row => row.window === Number(PAPER_WINDOW)) ?? selected

  // A window is a promise about how stale a borrowed value may be. Naming the share
  // rather than only the count keeps the trade visible when the count looks small.
  const borrowedShare = selected.completeCaseRows > 0
    ? Number((selected.giniBackfilled / selected.completeCaseRows).toFixed(4))
    : 0

  return (
    <FigureFrame
      boundary="A borrowed value is a measurement taken in a different year, not an interpolation. The curve is published so a reader can substitute a stricter tolerance; the panel itself is rebuilt at ±5 and no other window is used for any headline number."
      method="Each point is produced by rebuilding the canonical panel at that window and reading the resulting row count and the number of cells rescued by the World Bank Gini backfill. Nothing here is fitted or interpolated between windows."
      number="1.4"
      scope={`${giniWindow.rows.length} windows from exact-year to ±5 years; the adopted window is ±${paper.window} with ${paper.completeCaseRows} complete cases and ${paper.giniBackfilled} borrowed Gini cells.`}
      sources={['gini_window_sensitivity.json']}
      title="How far may a Gini value be borrowed?"
    >
      <div className={styles.lab}>
        <SegmentedControl
          label="Gini borrow window"
          onChange={next => onChange(next as Window)}
          options={WINDOWS.map(window => ({
            value: window,
            label: window === '0' ? 'exact' : `±${window}`,
          }))}
          value={value}
        />

        <div className={styles.labReadout}>
          <div className={styles.labFigure}>
            <span className={styles.labFigureLabel}>Complete-case rows</span>
            <Num id={rowsClaim.id} />
          </div>
          <div className={styles.labFigure}>
            <span className={styles.labFigureLabel}>Borrowed from a neighbouring year</span>
            <Num id={recoveredClaim.id} />
            <span className={styles.labFigureNote}>{formatClaim(borrowedShare, 'pct1')} of the rows</span>
          </div>
        </div>

        <LineProfile
          description="Complete-case rows against the tolerated Gini borrow window. The adopted window is marked; the line is the same panel rebuilt at each width."
          highlightX={value === PAPER_WINDOW
            // Two labels at the same x printed on top of each other; when the reader
            // is already on the adopted window one label says both things.
            ? [{ x: Number(PAPER_WINDOW), label: `paper ±${PAPER_WINDOW} (selected)` }]
            : [{ x: Number(PAPER_WINDOW), label: `paper ±${PAPER_WINDOW}` }, { x: Number(value), label: 'selected' }]}
          points={giniWindow.rows.map(row => ({ x: windowValue(row), y: row.completeCaseRows }))}
          title="Complete cases by Gini window"
          xFormat="int"
          xLabel="Borrow window (years)"
          yFormat="int"
          yLabel="Complete-case rows"
        />

        <Callout variant="info">
          Paper adopts ±{paper.window} years; the curve is published so you can choose your own tolerance. Every
          recovered cell borrowed a neighbouring year — none was measured in place — so the row count rises with the
          window while the measurement stays a year or more away from the survey.
        </Callout>
      </div>
    </FigureFrame>
  )
}
