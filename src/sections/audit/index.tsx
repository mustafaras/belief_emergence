import { useState } from 'react'
import { Badge, Callout, DataTable, SectionHeader, Slider } from '../../ui'
import { formatClaim } from '../../claims/format'
import { getClaim } from '../../claims/registry'
import {
  admittedAt,
  constructRows,
  constructSummary,
  PAPER_RELIABILITY_FLOOR,
} from '../../claims/selectors/audit'
import styles from './Audit.module.css'

type Row = (typeof constructRows)[number]

/**
 * Table 2.1 — the construct audit.
 *
 * Rows come from `constructRows`, the same builder `npm run check:construct-audit` validates.
 * That matters for exactly one row: `S_social_support` carries `cronbachAlpha: 0.753` beside
 * `cellsEmitted: 0`, and printing it would show a reliability figure above the floor for a
 * construct with no observations. The builder withholds it, and the table prints the words
 * "not computable" — not an em dash, which would imply the value exists and was omitted.
 */
const badge = (row: Row) => {
  switch (row.verdict) {
    case 'retained':
      return <Badge variant="pass">Retained</Badge>
    case 'withdrawn':
      return <Badge variant="withdrawn">Withdrawn</Badge>
    case 'uncomputable':
      return <Badge variant="withdrawn">Not computable</Badge>
    default:
      return <Badge variant="neutral">{row.verdict}</Badge>
  }
}

export default function AuditSection() {
  const [floor, setFloor] = useState(PAPER_RELIABILITY_FLOOR)
  const admitted = admittedAt(floor)

  const configured = getClaim('audit.constructCount').value
  const failureRate = getClaim('audit.constructs.failureRate').value

  const columns = [
    { key: 'label' as const, header: 'Construct', sortable: true },
    { key: 'itemsConfigured' as const, header: 'Configured', align: 'right' as const },
    {
      key: 'itemsUsed' as const,
      header: 'Usable',
      align: 'right' as const,
      render: (row: Row) => (row.itemsAvailable ?? row.itemsUsed),
    },
    { key: 'cellsEmitted' as const, header: 'Cells', align: 'right' as const },
    {
      key: 'alpha' as const,
      header: 'α',
      align: 'right' as const,
      // The verification script reads `.construct-alpha`; the module class keeps the word
      // on one line. Both are needed: a check selector and a layout rule.
      render: (row: Row) => (row.alpha === null
        ? <span className={`construct-alpha ${styles.notComputable}`}>not computable</span>
        : (
            <span className={`construct-alpha ${row.alpha >= PAPER_RELIABILITY_FLOOR ? styles.alphaPass : styles.alphaFail}`}>
              {formatClaim(row.alpha, 'p2')}
            </span>
          )),
    },
    { key: 'verdict' as const, header: 'Verdict', render: (row: Row) => badge(row) },
    {
      key: 'reason' as const,
      header: 'Why',
      render: (row: Row) => <span className="construct-reason">{row.reason}</span>,
    },
  ]

  return (
    <section className={styles.section}>
      <SectionHeader
        eyebrow="Construct audit"
        title="Construct Audit"
        lede="Reliability and item availability decide which constructs can enter the analysis. Three of the four configured constructs fail."
      />

      <p className="construct-audit-scope">
        Eight channels were proposed for the model. Four constructs were specified in the
        configuration and are audited here; the other four are named in the manuscript but
        <strong> not estimated</strong> in this panel, so they are absent from this table rather
        than shown as failures. Every count below describes the four, not the eight.
      </p>

      <div className="construct-audit-table">
        <DataTable
          caption="Construct reliability, item availability and verdict"
          columns={columns}
          rowAttributes={(row) => ({ 'data-construct': row.id, 'data-verdict': row.verdict })}
          rows={constructRows}
          stickyFirst
        />
      </div>

      <Callout variant="finding">
        They do not exist in this item pool at this aggregation level. The point is not that these
        constructs are noisy: a model that reported coefficients for them would be reporting
        coefficients for arithmetic averages of discordant opinions.
      </Callout>

      <div className={styles.lab}>
        <h2 className={styles.labTitle}>Decision Lab 3 — Reliability floor</h2>
        <p className={styles.labLede}>
          The paper sets its floor at {formatClaim(PAPER_RELIABILITY_FLOOR, 'p2')}. Move it and the
          admitted count is recomputed from each construct&apos;s alpha. A construct whose alpha is
          withheld is never admitted, at any floor.
        </p>

        <Slider
          label="Reliability floor (Cronbach's alpha)"
          marks={[
            { value: 0.3, label: '0.30' },
            { value: PAPER_RELIABILITY_FLOOR, label: '0.70 (paper)' },
            { value: 0.9, label: '0.90' },
          ]}
          max={0.9}
          min={0.3}
          onChange={setFloor}
          paperValue={PAPER_RELIABILITY_FLOOR}
          step={0.05}
          value={floor}
        />

        <p aria-live="polite" className={styles.counter}>
          <strong data-testid="admitted-count">{admitted}</strong> of {constructSummary.total}{' '}
          constructs admitted at α ≥ {formatClaim(floor, 'p2')}
        </p>

        <ul className={styles.labList}>
          {constructRows.map((row) => {
            const verdict = row.alpha === null
              ? 'not admitted — no observations'
              : row.alpha >= floor ? 'admitted' : 'rejected'
            return (
              <li className={row.alpha === null ? styles.muted : undefined} key={row.id}>
                <span className={styles.labName}>{row.label}</span>
                <span className={styles.labValue}>
                  {row.alpha === null ? 'α not computable' : `α ${formatClaim(row.alpha, 'p2')}`}
                </span>
                <span>{verdict}</span>
              </li>
            )
          })}
        </ul>

        <Callout variant="caution">
          Lowering the floor to {formatClaim(0.35, 'p2')} admits cultural intensity
          ({formatClaim(getClaim('audit.C.alpha').value, 'p2')}), whose items do not load on a
          single dimension. It clears the number and fails the criterion the number stands in for,
          which is why the floor is a screening rule and not a decision rule.
        </Callout>
      </div>

      <Callout variant="info">
        Figure 2.2 — the C and D inter-item correlation matrices — is <strong>not shown</strong>.
        No artifact here carries an item-level correlation matrix; the audit reports aggregate alpha
        only. The figure was specified in the execution prompt and skipped rather than reconstructed,
        because a fabricated matrix would be the failure this section documents.
      </Callout>

      <p className={styles.summary}>
        {formatClaim(constructSummary.total, 'int')} configured ·{' '}
        {formatClaim(constructSummary.retained, 'int')} retained ·{' '}
        {formatClaim(constructSummary.withdrawn, 'int')} withdrawn ·{' '}
        {formatClaim(constructSummary.uncomputable, 'int')} not computable ·{' '}
        {formatClaim(failureRate, 'pct1')} fail, over {formatClaim(configured, 'int')} configured.
      </p>
    </section>
  )
}
