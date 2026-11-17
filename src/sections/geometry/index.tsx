import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { calculateModel } from '../../utils/calculateModel'
import { Z_NORMALIZATION } from '../../data/feCoefficients'
import { useDataContext } from '../../contexts/DataContext'
import { formatClaim } from '../../claims/format'
import { Callout, SectionHeader, Skeleton, Slider, Toggle } from '../../ui'
import { CaptureAB } from './CaptureAB'
import type { SurfaceImageFn } from './Surface3D'
import { Companions } from './Companions'
import {
  applyCountryMeans,
  CONTROL_RANGES,
  PANEL_MEANS,
  useGeometryParams,
  WITHDRAWN_CHANNELS,
  type GeometryState,
} from './useGeometryParams'
import styles from './Geometry.module.css'

/**
 * The Geometry Lab: controls on the left, the fitted surface on the right.
 *
 * Plotly is lazy so the landing route does not pay for it; the bundle budget measures that
 * rather than trusting the import graph to be honest.
 */
const Surface3D = lazy(() => import('./Surface3D'))

/** A computed value, not a claim: it changes with the sliders and has no artifact behind it. */
function ComputedValue({ label, value, digits = 3 }: { label: string; value: number; digits?: number }) {
  return (
    <div className={styles.computed}>
      <span className={styles.computedLabel}>{label}</span>
      <span className={styles.computedValue} data-testid={`computed-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
        {formatClaim(value, digits === 4 ? 'p4' : 'p3')}
      </span>
      <span className={styles.computedTag}>computed live</span>
    </div>
  )
}

const CONTROL_LABELS: Record<keyof GeometryState, string> = {
  X: 'X — settlement / urbanisation',
  Y: 'Y — inequality',
  M: 'M — media environment',
  T: 'T — trauma exposure',
  E: 'E — education capacity',
  R: 'R — welfare capacity',
}

export default function GeometrySection() {
  const [state, setState, setOne] = useGeometryParams()
  const [isoFilled, setIsoFilled] = useState<string | null>(null)
  const [showSupport, setShowSupport] = useState(true)
  const [surfaceImage, setSurfaceImage] = useState<SurfaceImageFn | null>(null)
  const { panelData } = useDataContext()

  /**
   * The 207 observed rows as (X, Y, Z) triples.
   *
   * Plotted over the surface so a reader can see where the data actually sit: the corners of
   * the box are extrapolation, and the points show that without a caption needing to say so.
   */
  /**
   * The 207 rows mapped onto the surface's own scale.
   *
   * The panel stores `Z` raw (−2.66 to 3.37) while `calculateModel` returns it inside the
   * training band [0.0001, 0.9999] after `Z_NORMALIZATION`. Plotting the raw values against the
   * surface put two unrelated scales on one axis: the Z axis stretched to ±3,000 and the
   * surface flattened to a plane. Observed points are normalised with the same constants the
   * fit used, so a point sits directly above the cell it belongs to.
   *
   * Six rows normalise outside the band the model can emit (−0.061 … 1.355 across all 207).
   * They are left where they land, above or below the surface, rather than clamped to its edge:
   * the fitted map cannot represent those six observations, and the overlay is the only place
   * in the application where that is visible.
   */
  const supportPoints = useMemo(() => (panelData ?? [])
    .filter((row) => [row.X, row.Y, row.Z].every((value) => typeof value === 'number' && Number.isFinite(value)))
    .map((row) => ({
      x: row.X as number,
      y: row.Y as number,
      // Deliberately not clamped into the model's band: six of the 207 rows land outside
      // [0.0001, 0.9999] once normalised, which is a fact about the panel the surface cannot
      // show on its own. Pinning them to the edge would hide it.
      z: ((row.Z as number) - Z_NORMALIZATION.min) / (Z_NORMALIZATION.max - Z_NORMALIZATION.min),
    })), [panelData])

  /**
   * `?iso=` fills the controls from that country's mean row.
   *
   * The Countries drawer links here with an ISO code, and the link is only honest if the
   * sliders actually move: opening at the panel mean while claiming to show Estonia would be
   * worse than not linking at all.
   */
  useEffect(() => {
    if (typeof window === 'undefined' || panelData === null || panelData.length === 0) return
    const iso = new URLSearchParams(window.location.search).get('iso')
    if (iso === null) return
    const filled = applyCountryMeans(iso, panelData as unknown as Array<Record<string, string | number | null>>)
    if (filled === null) return
    setState(filled)
    setIsoFilled(iso.toUpperCase())
    // Deliberately keyed on the ISO code only: re-applying on every panel-data identity change
    // would overwrite whatever the reader has just dragged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelData])

  const params = { X: state.X, Y: state.Y, M: state.M, T: state.T, E: state.E, R: state.R, C: 0, D: 0, G: 0, S: 0 }
  const result = calculateModel(params as never)
  const z = result.Z
  const phi = result.phi
  /**
   * `s` is the structural log-odds offset, not the logit of Z.
   *
   * The model is `Z = σ(Φ + s)`, so `s = logit(Z) − Φ`. Computing `logit(Z)` alone reports
   * 0.612, which is the total log-odds rather than the structural part of it — and that number
   * is already on screen as a different card. The two are related but not interchangeable, and
   * only one of them is what the paper calls `s`.
   */
  const s = Math.log(z / (1 - z)) - phi
  const gain = z * (1 - z)

  return (
    <section className={styles.section}>
      <SectionHeader
        eyebrow="Model geometry"
        title="Geometry Lab"
        lede="Explore the fitted response surface within the panel's observed support."
      />

      <Callout variant="caution">
        In-sample geometry of the fitted map · not out-of-sample evidence · α, β sit at their bound.
      </Callout>

      {isoFilled !== null && (
        <p aria-live="polite" className={styles.isoNote} role="status">
          Controls filled from {isoFilled}&apos;s mean rows. Every value here is that country&apos;s
          average, not a specific survey year.
        </p>
      )}

      <div className={styles.layout}>
        <div className={styles.controls}>
          <h2 className={styles.h2}>Inputs</h2>
          {(Object.keys(CONTROL_RANGES) as Array<keyof GeometryState>).map((key) => (
            <Slider
              key={key}
              label={CONTROL_LABELS[key]}
              // The paper marker labels the panel mean; min and max are already implied by the
              // track's ends, and printing all three made the row read as three competing marks.
              marks={[{ value: PANEL_MEANS[key], label: 'panel mean' }]}
              max={CONTROL_RANGES[key].max}
              min={CONTROL_RANGES[key].min}
              onChange={(value) => setOne(key, value)}
              paperValue={PANEL_MEANS[key]}
              step={CONTROL_RANGES[key].step}
              value={state[key]}
            />
          ))}

          <div className={styles.withdrawn}>
            <h3 className={styles.h3}>Withdrawn channels</h3>
            <p className={styles.withdrawnNote}>
              These four are locked at zero. The model receives them as 0, not as a slider default —
              a test pins that.
            </p>
            <ul className={styles.withdrawnList}>
              {WITHDRAWN_CHANNELS.map((channel) => (
                <li className={styles.withdrawnRow} key={channel.code}>
                  <span aria-hidden="true" className={styles.lock}>🔒</span>
                  <span className={styles.withdrawnCode}>{channel.code}</span>
                  <span className={styles.withdrawnName}>{channel.name}</span>
                  <span className={styles.withdrawnReason}>{channel.reason}</span>
                  <a className={styles.withdrawnLink} href="?v=audit">§2</a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.surfaceColumn}>
          <div className={styles.computedRow}>
            <ComputedValue label="Z" value={z} />
            <ComputedValue label="Φ" value={phi} />
            <ComputedValue label="s" value={s} />
            <ComputedValue digits={4} label="Z(1−Z)" value={gain} />
          </div>

          <div className={styles.surfaceControls}>
            <Toggle
              checked={showSupport}
              label={`Show observed support (${supportPoints.length} rows)`}
              onChange={setShowSupport}
            />
          </div>

          <Suspense fallback={<Skeleton aria-label="Loading the 3D surface" className={styles.surfaceSkeleton} />}>
            <Surface3D
              registerImageFn={setSurfaceImage}
              showSupport={showSupport}
              state={state}
              support={supportPoints}
            />
          </Suspense>

          <p className={styles.caption}>
            Axes are <strong>X</strong> settlement / urbanisation, <strong>Y</strong> inequality and{' '}
            <strong>Z</strong> emergence — single letters on the canvas, spelled out here because
            the rotated axis titles do not fit at this width. The surface is the fitted map
            evaluated on a 48 × 48 grid across the panel&apos;s realised X and Y ranges, with M, T,
            E and R held at the values on the left. It is the same function whose coefficients are
            estimated in the model section; nothing here is a new fit.
          </p>
          {showSupport ? (
            <p className={styles.caption}>
              Grey cells are outside the convex hull of the observed (X, Y) points: the model still
              returns a value there, but no country in the panel occupies that combination, so the
              cell is extrapolation. {supportPoints.length} observed rows are plotted over the
              surface; the six that normalise outside the model&apos;s output band appear above or
              below it rather than on it.
            </p>
          ) : null}
        </div>
      </div>

      <Companions state={state} />

      <CaptureAB state={state} surfaceImage={surfaceImage} />
    </section>
  )
}
