import { useMemo } from 'react'
import auditArtifact from '../../data/analysis/wvs_construct_audit.json'
import itemAvailabilityArtifact from '../../data/analysis/construct_item_availability.json'
import {
  RELIABILITY_FLOOR,
  buildConstructRows,
  summarise,
  type AuditArtifact,
  type ItemAvailability,
} from '../../verification/constructAudit'
import './ConstructAudit.css'

/**
 * The paper's central table.
 *
 * Three of four configured constructs fail a reliability test. That finding was absent
 * from the interface entirely, which meant the product argued the opposite of the
 * manuscript: a confident fitted surface with no sign that the measurement underneath it
 * had failed.
 *
 * The `S_social_support` row is the one to read carefully. It carries
 * `cronbachAlpha: 0.753` beside `cellsEmitted: 0` and `computable: false`; the alpha is a
 * leftover. `buildConstructRows` suppresses it, so this component cannot print it even by
 * accident — the value is `null` before it reaches the renderer.
 */
export default function ConstructAudit() {
  const artifact = auditArtifact as unknown as AuditArtifact
  const availability = (itemAvailabilityArtifact as unknown as {
    constructs: Record<string, ItemAvailability>
  }).constructs
  const rows = useMemo(() => buildConstructRows(artifact, availability), [artifact, availability])
  const summary = useMemo(() => summarise(rows), [rows])

  return (
    <section className="construct-audit" aria-labelledby="construct-audit-title">
      <header className="construct-audit-header">
        <h3 id="construct-audit-title">Construct audit</h3>
        <p className="construct-audit-lead">
          Every composite this project configured, tested against a{' '}
          {RELIABILITY_FLOOR.toFixed(2)} reliability floor before it was allowed into a
          model. <strong>{summary.withdrawn + summary.uncomputable} of {summary.total}</strong>{' '}
          fail.
        </p>
      </header>

      <div className="construct-audit-table-wrap">
        <table className="construct-audit-table">
          <caption>
            Constructs with their item coverage, emitted cells, reliability and verdict.
            A construct that could not be computed shows no reliability figure.
          </caption>
          <thead>
            <tr>
              <th scope="col">Construct</th>
              <th scope="col" className="is-numeric">Items</th>
              <th scope="col" className="is-numeric">Cells</th>
              <th scope="col" className="is-numeric">Rejected</th>
              <th scope="col" className="is-numeric">Cronbach&rsquo;s &alpha;</th>
              <th scope="col">Verdict</th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-construct={row.id} data-verdict={row.verdict}>
                <th scope="row" className="construct-name">
                  <span className="construct-label">{row.label}</span>
                  <span className="construct-key">{row.id}</span>
                </th>
                <td
                  className="is-numeric"
                  title={
                    row.absentItems && row.absentItems.length > 0
                      ? `Absent from the harmonised source: ${row.absentItems.join(', ')}`
                      : undefined
                  }
                >
                  {row.itemsAvailable ?? row.itemsUsed}/{row.itemsConfigured}
                </td>
                <td className="is-numeric">{row.cellsEmitted.toLocaleString('en-US')}</td>
                <td className="is-numeric">{row.cellsRejected.toLocaleString('en-US')}</td>
                <td className="is-numeric construct-alpha">
                  {row.alpha === null ? (
                    <>
                      <span className="construct-alpha-none">not computable</span>
                      {row.suppressedAlpha ? (
                        <span
                          className="construct-alpha-suppressed"
                          title="The artifact carries a leftover alpha for this construct, but it was computed on no cells and must not be read as a reliability figure."
                        >
                          (leftover value suppressed)
                        </span>
                      ) : null}
                    </>
                  ) : (
                    row.alpha.toFixed(3)
                  )}
                </td>
                <td>
                  <span className={`construct-verdict is-${row.verdict}`}>{row.verdict}</span>
                </td>
                <td className="construct-reason">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="construct-audit-scope">
        <h4>What this table counts</h4>
        <p>
          Eight channels were originally proposed. Four of them &mdash; cultural intensity,
          social atomization, redistribution capacity and social support &mdash; are declared
          but not estimated in the panel, which is why only the four computable constructs
          are audited above. The paper states the finding both ways: <em>three of eight
          proposed channels</em> do not reach the model, and <em>three of the four
          constructs that could be tested</em> fail the reliability floor. Both are the same
          result counted from different starting points.
        </p>
        <p>
          Redistribution capacity (<code>G</code>) is absent for a different reason from the
          other three: its disposable-income Gini is unavailable outside the OECD sample, so
          no reliability test was possible. It is not scored here rather than scored and
          passed.
        </p>
      </div>

      <p className="construct-audit-foot">
        Only <strong>{summary.retained}</strong> of {summary.total} testable constructs
        survived. The failure is not a caveat on the model: it is what the model is fitted
        to.
      </p>
    </section>
  )
}
