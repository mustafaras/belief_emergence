import { useEffect, useMemo, useState } from 'react'
import constructAuditArtifact from '../../data/analysis/wvs_construct_audit.json'
import { resolvePublicPath } from '../../utils/publicPath'
import { buildSupportPicture, type PanelAudit } from '../../verification/supportPicture'
import './SupportPicture.css'

/**
 * The panel audit lives in `public/`, which Vite serves statically rather than bundling.
 * It is fetched for the same reason the panel CSV is: it describes a build artefact, and
 * importing it would put a second copy in the bundle that can drift from the served one.
 */
const PANEL_AUDIT_PATH = resolvePublicPath('/data/panel_canonical_v2.audit.json')

/**
 * How 442,026 respondents became 207 complete cases.
 *
 * The panel's job is to make the attrition comprehensible. The number a reader should
 * leave with is the utilisation figure — 67.9% of the scanned frame survives — and the
 * name of the constraint that binds hardest, which the audit attributes to Gini.
 *
 * Neither is typed. The percentage is `completeCases / scannedCountryYears` computed at
 * render time, and the per-covariate attribution comes from `missingByCovariate`, which
 * the panel builder writes. An earlier version of this panel would have had to guess:
 * `missingCovariate: 61` said 61 cells were lost to *some* covariate and nothing more.
 */
export default function SupportPicture() {
  const [panel, setPanel] = useState<PanelAudit | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(PANEL_AUDIT_PATH)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const parsed = (await response.json()) as PanelAudit
        if (!cancelled) setPanel(parsed)
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const constructs = constructAuditArtifact as unknown as {
    respondentsScanned?: number
    countryYears?: number
    constructs: Record<string, { cellsEmitted: number }>
  }

  const picture = useMemo(
    () =>
      panel
        ? buildSupportPicture(panel, {
            respondentsScanned: constructs.respondentsScanned,
            countryYears: constructs.countryYears,
            zComputableCells: constructs.constructs?.Z_belief_outcome?.cellsEmitted,
          })
        : null,
    [panel, constructs],
  )

  // The panel audit fails to load when it is not being served; say so rather than
  // rendering a panel of zeros, which would read as "no attrition".
  if (!picture) {
    return (
      <section className="support-picture" aria-labelledby="support-picture-title">
        <header className="support-header">
          <h3 id="support-picture-title">What survives the frame</h3>
        </header>
        <p className="support-unavailable">
          {loadError
            ? `The panel audit could not be loaded (${loadError}), so the attrition figures are not shown.`
            : 'Loading the panel audit…'}
        </p>
      </section>
    )
  }

  const binding = picture.blockers.find((b) => b.binding)

  return (
    <section className="support-picture" aria-labelledby="support-picture-title">
      <header className="support-header">
        <h3 id="support-picture-title">What survives the frame</h3>
        <p className="support-lead">
          {picture.respondents.toLocaleString('en-US')} respondents aggregate to{' '}
          {picture.scannedCountryYears} construct-bearing country-years, of which{' '}
          <strong>{picture.completeCases}</strong> reach the model across{' '}
          {picture.countries} countries.
          {binding ? (
            <>
              {' '}
              The binding constraint is <strong>{binding.label}</strong>,
              which alone accounts for {binding.cells} of the{' '}
              {picture.covariateDropouts} cells lost to a missing covariate.
            </>
          ) : null}
        </p>
      </header>

      <ol className="support-stages">
        {picture.stages.map((stage) => (
          <li key={stage.id} className="support-stage" data-stage={stage.id}>
            <div className="support-stage-value">{stage.value.toLocaleString('en-US')}</div>
            <div className="support-stage-label">{stage.label}</div>
            <div className="support-stage-share">
              {stage.id === 'respondents'
                ? 'starting point'
                : `${(stage.ofPrevious * 100).toFixed(1)}% of the stage above`}
            </div>
            <p className="support-stage-detail">{stage.detail}</p>
          </li>
        ))}
      </ol>

      <p className="support-utilisation">
        <strong>{(picture.frameUtilisation * 100).toFixed(1)}%</strong> of the scanned
        country-year frame survives into the panel, computed as{' '}
        <code>{picture.completeCases}</code> / <code>{picture.scannedCountryYears}</code>.
        The remaining {(picture.scannedCountryYears - picture.completeCases).toLocaleString('en-US')}{' '}
        are lost below.
      </p>

      {picture.blockers.length > 0 ? (
        <div className="support-blockers">
          <h4>Which covariate blocks the most cells</h4>
          <table className="support-blocker-table">
            <caption>
              Cells lost to a missing covariate, attributed to the first covariate that
              fails. A cell short of several covariates is counted once, so these sum to{' '}
              {picture.covariateDropouts}, not to the number of cells short of each
              individual covariate.
            </caption>
            <thead>
              <tr>
                <th scope="col">Covariate</th>
                <th scope="col" className="is-numeric">Cells lost</th>
                <th scope="col" className="is-numeric">Share</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {picture.blockers.map((blocker) => (
                <tr
                  key={blocker.covariate}
                  data-covariate={blocker.covariate}
                  data-binding={blocker.binding ? 'true' : 'false'}
                >
                  <th scope="row">
                    <span className="support-covariate-code">{blocker.covariate}</span>{' '}
                    {blocker.label}
                  </th>
                  <td className="is-numeric">{blocker.cells}</td>
                  <td className="is-numeric">{(blocker.share * 100).toFixed(0)}%</td>
                  <td>
                    {/* Width is a computed share. The project forbids inline styles, so it
                        arrives as a CSS custom property set from the data attribute. */}
                    <span
                      className="support-bar"
                      data-share={Math.max(0.1, Math.round(blocker.share * 10) / 10)}
                      aria-hidden="true"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {picture.otherDropouts.length > 0 ? (
            <p className="support-other">
              The remaining{' '}
              {picture.otherDropouts.reduce((sum, d) => sum + d.cells, 0)} are lost for
              reasons other than a covariate:{' '}
              {picture.otherDropouts.map((d, i) => (
                <span key={d.id}>
                  {i > 0 ? (i === picture.otherDropouts.length - 1 ? ', and ' : ', ') : ''}
                  <strong>{d.cells}</strong> {d.label}
                </span>
              ))}
              .
            </p>
          ) : null}
        </div>
      ) : (
        <p className="support-no-attribution">
          The panel audit does not attribute the {picture.covariateDropouts} covariate
          losses to individual covariates, so this panel does not claim a binding
          constraint. Run <code>npm run build:panel</code> to regenerate the audit with
          attribution.
        </p>
      )}

      <p className="support-reconciliation" data-reconciles={picture.reconciles}>
        {picture.reconciles
          ? `${picture.scannedCountryYears} scanned − ${(picture.scannedCountryYears - picture.completeCases).toLocaleString('en-US')} lost = ${picture.completeCases} complete cases. The audit reconciles.`
          : `The audit does not reconcile: ${picture.scannedCountryYears} scanned minus recorded losses does not equal ${picture.completeCases}.`}
      </p>
    </section>
  )
}
