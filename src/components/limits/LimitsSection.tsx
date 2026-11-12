import { useEffect, useMemo, useState } from 'react'
import profileArtifact from '../../data/analysis/elasticity_profile.json'
import lockboxArtifact from '../../data/analysis/lockbox_holdout.json'
import collinearityArtifact from '../../data/analysis/collinearity_diagnostics.json'
import rCaseArtifact from '../../data/analysis/r_collinearity_case.json'
import { OPTIMIZED_STRUCTURAL_PARAMS } from '../../data/feCoefficients'
import { resolvePublicPath } from '../../utils/publicPath'
import {
  buildLimits,
  type CollinearityDiagnostics,
  type ElasticityProfile,
  type LockboxHoldout,
  type RCollinearityCase,
} from '../../verification/limits'
import './LimitsSection.css'

const PANEL_AUDIT_PATH = resolvePublicPath('/data/panel_canonical_v2.audit.json')

/**
 * What this model cannot show.
 *
 * The interface looks decisive — a surface, four coefficients, a fitted form — while the
 * paper reports a measurement failure. This section is where the two are reconciled, and
 * it does not need to be apologetic to be accurate. Every figure carries the name of the
 * artifact it came from, on screen, because a limit that cites a footnote is a limit the
 * reader cannot check.
 */
export default function LimitsSection() {
  const [panelRows, setPanelRows] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(PANEL_AUDIT_PATH)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const parsed = (await response.json()) as { rows?: number }
        if (!cancelled && typeof parsed.rows === 'number') setPanelRows(parsed.rows)
      } catch {
        // The section still renders; the lockbox limit is simply withheld, because its
        // headline figure is computed from the panel and cannot be guessed.
        if (!cancelled) setPanelRows(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const report = useMemo(
    () =>
      panelRows === null
        ? null
        : buildLimits({
            profile: profileArtifact as unknown as ElasticityProfile,
            lockbox: lockboxArtifact as unknown as LockboxHoldout,
            collinearity: collinearityArtifact as unknown as CollinearityDiagnostics,
            rCase: rCaseArtifact as unknown as RCollinearityCase,
            panelRows,
            shippedAlpha: OPTIMIZED_STRUCTURAL_PARAMS.alpha,
            shippedBeta: OPTIMIZED_STRUCTURAL_PARAMS.beta,
          }),
    [panelRows],
  )

  return (
    <section className="limits-section" aria-labelledby="limits-title">
      <header className="limits-header">
        <h3 id="limits-title">What this model cannot show</h3>
        <p className="limits-lead">
          Four limits on what the fitted surface means. Each one is a property of the
          artifacts below, not a caveat added for caution.
        </p>
      </header>

      {report === null ? (
        <p className="limits-pending">Loading the panel audit…</p>
      ) : (
        <>
          <ol className="limits-list">
            {report.limits.map((limit) => (
              <li key={limit.id} className="limit-item" data-limit={limit.id}>
                <p className="limit-statement">{limit.statement}</p>

                <dl className="limit-figures">
                  {limit.figures.map((figure) => (
                    <div key={figure.label} className="limit-figure">
                      <dt>{figure.label}</dt>
                      <dd>
                        <span className="limit-value">{figure.value}</span>
                        <cite className="limit-source">{figure.source}</cite>
                      </dd>
                    </div>
                  ))}
                </dl>

                <p className="limit-consequence">{limit.consequence}</p>
              </li>
            ))}
          </ol>

          {!report.sourced ? (
            <p className="limits-unsourced" role="status">
              This section quotes {report.unsourced.length} figure(s) that its cited
              artifacts do not contain: {report.unsourced.join('; ')}.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
