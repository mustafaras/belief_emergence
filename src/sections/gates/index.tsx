import { useCallback, useEffect, useState } from 'react'
import { Callout, SectionHeader, SegmentedControl } from '../../ui'
import { formatClaim } from '../../claims/format'
import { getClaim } from '../../claims/registry'
import { designGateData, GATE_ORDER } from '../../claims/selectors/gates'
import { GateCard } from './GateCard'
import styles from './Gates.module.css'

/**
 * The four design gates, on both panels.
 *
 * The section exists to make one sentence checkable: the submitted panel failed all four
 * rules and the rebuilt panel passes all four. Every number here is measured by
 * `scripts/generate_design_gates.ts` — the submitted panel's design matrix is read from git
 * (`8f5c06b`), not retyped, and the rebuilt panel's is the committed CSV.
 */
type Panel = 'original' | 'rebuilt'

/**
 * Scientific notation as "× 10⁻¹⁵" rather than "e-15".
 *
 * The number audit tokenises rendered text, and `4.44e-15` splits into `4.44` and `-15`; the
 * exponent then looks like an unresolved measurement. Writing the exponent as a superscript
 * keeps the figure readable and keeps the scanners reading one value.
 */
function scientific(value: number): string {
  const [mantissa, exponent] = value.toExponential(2).split('e')
  const power = Number.parseInt(exponent, 10)
  return `${mantissa} × 10${superscript(power)}`
}

const SUPERSCRIPTS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

function superscript(value: number): string {
  const digits = Math.abs(value).toString().split('').map((d) => SUPERSCRIPTS[Number(d)]).join('')
  return (value < 0 ? '⁻' : '') + digits
}

const PANEL_KEY = 'panel'

/**
 * `panel=original|rebuilt` in the query string.
 *
 * Owned here rather than by the router because it is local to this section, and it must
 * survive navigation: a reader who lands on the failing panel should be able to send that
 * view to a co-author. `replaceState` keeps it out of the back stack, and only this key is
 * touched so a claim deep link or a lab setting elsewhere is preserved.
 */
function usePanelState(): [Panel, (next: Panel) => void] {
  const read = (): Panel => {
    if (typeof window === 'undefined') return 'original'
    return new URLSearchParams(window.location.search).get(PANEL_KEY) === 'rebuilt' ? 'rebuilt' : 'original'
  }
  const [panel, setPanel] = useState<Panel>(read)

  useEffect(() => {
    const onPopState = () => setPanel(read())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const set = useCallback((next: Panel) => {
    const url = new URL(window.location.href)
    if (next === 'original') url.searchParams.delete(PANEL_KEY)
    else url.searchParams.set(PANEL_KEY, next)
    window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
    setPanel(next)
  }, [])

  return [panel, set]
}

export default function GatesSection() {
  const [panel, onPanelChange] = usePanelState()
  const active = designGateData[panel]
  const upstream = designGateData.originalProvenance.upstreamIdentity
  const matrix = designGateData.originalProvenance.designMatrix

  return (
    <section className={styles.section}>
      <SectionHeader
        eyebrow="Design gates"
        title="Design Gates"
        lede="Four rules decide whether a design matrix can support a model at all. The submitted panel failed every one; the rebuilt panel passes every one."
      />

      <div className={styles.lab}>
        <h2 className={styles.h2}>Decision Lab 4 — the same four rules, both panels</h2>
        <SegmentedControl
          label="Panel"
          onChange={(next) => onPanelChange(next as Panel)}
          options={[
            { value: 'original', label: 'Original panel' },
            { value: 'rebuilt', label: 'Rebuilt panel' },
          ]}
          value={panel}
        />

        <p aria-live="polite" className={styles.status}>
          <strong data-testid="gate-summary">{active.gates.filter((gate) => gate.pass).length}</strong>
          {' '}of {active.gates.length} gates pass on the {panel === 'original' ? 'panel originally submitted' : 'rebuilt panel'}
          {' '}· {formatClaim(active.rows, 'int')} rows, {active.predictors.length} predictors
        </p>

        <div className={styles.grid}>
          {GATE_ORDER.map((id) => {
            const gate = active.gates.find((entry) => entry.id === id)
            if (!gate) return null
            return (
              <GateCard
                detail={gate.detail}
                id={id}
                key={`${panel}-${id}`}
                panel={panel}
                pass={gate.pass}
                rule={gate.rule}
              />
            )
          })}
        </div>
      </div>

      {panel === 'original' ? (
        <Callout variant="caution">
          These four failures are not four independent problems. The first — an outcome that was
          an exact affine rescaling of the cultural-intensity predictor, r ={' '}
          {formatClaim(getClaim('gates.original.identityCorr').value, 'p3')} — makes the fourth
          follow by construction, and the design matrix cannot be full rank once a predictor and
          the outcome are the same variable. The second failure is separate: two predictors were
          one variable with opposite sign.
        </Callout>
      ) : (
        <Callout variant="info">
          All four pass with margin: the largest predictor-outcome correlation is{' '}
          {formatClaim(getClaim('gates.rebuilt.identity').value, 'p3')} against a{' '}
          {formatClaim(designGateData.thresholds.identityCorrelation, 'p3')} ceiling, and the
          largest single-predictor R² is{' '}
          {formatClaim(getClaim('gates.rebuilt.singlePredictor').value, 'p3')} against{' '}
          {formatClaim(designGateData.thresholds.singlePredictorR2, 'p3')}. The closest call is
          collinearity between education and welfare capacity at{' '}
          {formatClaim(getClaim('gates.rebuilt.duplicates').value, 'p3')}, which is high but below
          the duplicate threshold and is reported separately in the collinearity diagnostics.
        </Callout>
      )}

      <div className={styles.rootCause}>
        <h2 className={styles.h2}>One wrong item code</h2>
        <p className={styles.prose}>
          The identity failure has a single cause, and it is worth stating at its actual size
          because it makes the failure mode generic rather than idiosyncratic: the ingestion built
          the cultural-intensity index from <code>A006</code> — the <em>first item of the
          belief-intensity outcome</em> — instead of from its own configured item set. One wrong
          code in a shared pool turned a predictor into a rescaling of the target.
        </p>
        <RootCauseDiagram />
        <p className={styles.prose}>
          Any pipeline that derives several composites from overlapping item pools is one
          configuration error away from the same outcome. That is why the gate exists as a rule
          rather than as a review step.
        </p>
      </div>

      <div className={styles.provenance}>
        <h2 className={styles.h2}>What was measured, and what could not be</h2>
        <p className={styles.prose}>
          The four gates above are recomputed, not retyped. The submitted panel&apos;s design matrix
          comes from <code>{matrix.source}</code>: {formatClaim(matrix.rows, 'int')} rows,{' '}
          {formatClaim(matrix.countries, 'int')} countries, and{' '}
          {formatClaim(matrix.distinctCountryYears, 'int')} distinct country-years, so most rows
          are repeated survey waves of the same country.
        </p>
        <p className={styles.prose}>
          The manuscript also prints a maximum absolute deviation of{' '}
          <strong>{scientific(getClaim('gates.upstream.maxAbsDeviation').value)}</strong> over{' '}
          {formatClaim(upstream.rows, 'int')} rows. That figure is measured on the upstream model
          panel, not on the {formatClaim(matrix.rows, 'int')}-row design matrix, because the two
          are different files. It is{' '}
          {upstream.source === 'recomputed'
            ? <>recomputed here from <code>{upstream.recordedFrom}</code></>
            : <>recorded rather than recomputed: <code>{upstream.recordedFrom}</code> is licence-restricted and absent from this checkout</>}
          . Both facts live in the artifact&apos;s <code>originalProvenance</code> block so a
          reader can tell which numbers they can reproduce from a clean clone.
        </p>
      </div>
    </section>
  )
}

/**
 * Three boxes and two arrows: A006 → Z item 1 → C index.
 *
 * Drawn as SVG rather than with a diagram library because the topology is fixed and the point
 * is the arrow direction — one shared item feeding both the outcome and a predictor.
 */
function RootCauseDiagram() {
  return (
    <figure className={styles.diagramFigure}>
      <svg
        aria-describedby="root-cause-desc"
        aria-labelledby="root-cause-title"
        className={styles.diagram}
        role="img"
        viewBox="0 0 660 150"
      >
        <title id="root-cause-title">How one item code produced two constructs</title>
        <desc id="root-cause-desc">
          A006 feeds both the first item of the belief-intensity outcome Z and the cultural-intensity
          index C. Because both composites were built from the same item, C became an exact affine
          rescaling of Z.
        </desc>

        <rect className={styles.box} height="52" rx="8" width="150" x="10" y="49" />
        <text className={styles.boxLabel} x="85" y="72" textAnchor="middle">A006</text>
        <text className={styles.boxNote} x="85" y="88" textAnchor="middle">declared for Z only</text>

        <line className={styles.arrow} markerEnd="url(#arrow)" x1="160" x2="228" y1="62" y2="38" />
        <line className={styles.arrow} markerEnd="url(#arrow)" x1="160" x2="228" y1="88" y2="112" />

        <rect className={styles.box} height="52" rx="8" width="160" x="232" y="12" />
        <text className={styles.boxLabel} x="312" y="34" textAnchor="middle">Z item 1</text>
        <text className={styles.boxNote} x="312" y="50" textAnchor="middle">outcome composite</text>

        <rect className={styles.boxBroken} height="52" rx="8" width="160" x="232" y="86" />
        <text className={styles.boxLabel} x="312" y="108" textAnchor="middle">C index</text>
        <text className={styles.boxNote} x="312" y="124" textAnchor="middle">should be A008, A009, …</text>

        <line className={styles.arrowAlarm} markerEnd="url(#arrowAlarm)" x1="392" x2="466" y1="38" y2="38" />
        <line className={styles.arrowAlarm} markerEnd="url(#arrowAlarm)" strokeDasharray="4 3" x1="392" x2="466" y1="112" y2="62" />

        <text className={styles.alarm} x="474" y="34">Z as measured</text>
        <text className={styles.alarm} x="474" y="58">C = a·Z + b</text>
        <text className={styles.alarmNote} x="474" y="76">r = 1 by construction</text>

        <defs>
          <marker id="arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-3)" />
          </marker>
          <marker id="arrowAlarm" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--withdrawn)" />
          </marker>
        </defs>
      </svg>
      <figcaption className={styles.diagramCaption}>
        A006 was declared for the outcome only. Building the cultural-intensity index from it as
        well made the predictor and the outcome the same variable up to a scale and offset, which
        is why every reported out-of-sample metric on that panel was an algebraic identity rather
        than evidence of predictive skill.
      </figcaption>
    </figure>
  )
}
