import { Heatmap, LineProfile } from '../../charts'
import { calculateModel } from '../../utils/calculateModel'
import { formatClaim } from '../../claims/format'
import { Tabs } from '../../ui'
import { toBeliefParameters, type GeometryState } from './useGeometryParams'
import styles from './Geometry.module.css'

/**
 * The 2D companions: the same fitted map seen from three angles that the 3D view cannot show
 * precisely.
 *
 * A rotated surface is good for shape and bad for reading a value; a heatmap over (Φ, s) and a
 * line profile of Z(Φ) put the numbers on flat axes where a reader can actually follow them.
 */
const GRID = 40

/**
 * The two axes of the heatmap are not the same variable, and they must not share a range.
 *
 * `Z = σ(Φ + s)`. The fitted field Φ runs about −12 to +4 on this panel, while the structural
 * offset s is roughly +6 to +7 for any configuration the sliders can reach. Giving both axes
 * the field's range made every cell but one corner saturated, because Φ + s never crossed zero
 * inside the grid — the ridge the figure exists to show was off-screen.
 */
const PHI_RANGE: [number, number] = [-8, 2]
const S_RANGE: [number, number] = [0, 10]

const linspace = (min: number, max: number): number[] => {
  const values: number[] = []
  for (let i = 0; i < GRID; i += 1) values.push(min + (i / (GRID - 1)) * (max - min))
  return values
}

const PHI_GRID = linspace(PHI_RANGE[0], PHI_RANGE[1])
const S_GRID = linspace(S_RANGE[0], S_RANGE[1])

const Z_BY_PHI = PHI_GRID.map((phi) => {
  // Z = sigma(Phi + s) with s fixed at the current state.
  const z = 1 / (1 + Math.exp(-phi))
  return { x: phi, y: z }
})

export function Companions({ state }: { state: GeometryState }) {
  const params = toBeliefParameters(state)
  const current = calculateModel(params as never)
  const z = current.Z
  const phi = current.phi
  const s = Math.log(z / (1 - z)) - phi
  const gain = z * (1 - z)

  // Heatmap of Z over (Phi, s): every cell asks what the map returns for a field value and a
  // structural offset, holding the four contextual channels where the reader put them.
  const heatRows = PHI_GRID.filter((_, index) => index % 4 === 0).map((rowPhi) => formatClaim(rowPhi, 'p2'))
  const heatCols = S_GRID.filter((_, index) => index % 4 === 0).map((colS) => formatClaim(colS, 'p2'))
  const heatValues = PHI_GRID.filter((_, index) => index % 4 === 0).map((rowPhi) => (
    S_GRID.filter((_, index) => index % 4 === 0).map((colS) => {
      const t = rowPhi + colS
      return 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, t))))
    })
  ))

  const gainProfile = PHI_GRID.map((value) => {
    const zAt = 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, value))))
    return { x: value, y: zAt * (1 - zAt) }
  })

  return (
    <Tabs
      label="2D companions"
      tabs={[
        {
          id: 'phi-s',
          label: 'Φ against s',
          content: (
            <div className={styles.companion}>
              <Heatmap
                cols={heatCols}
                description="Where the fitted map sits for each combination of field value and structural offset. The ridge at Φ + s = 0 is where Z crosses one half."
                legendLabel="Z"
                rows={heatRows}
                scale="viridis"
                tickLabel={(_, index, count) => index === 0 || index === count - 1 || index % 3 === 0}
                title="Z over field and structural offset"
                valueLabel={(value) => formatClaim(value, 'p2')}
                values={heatValues}
              />
              <p className={styles.companionNote}>
                The crossing row is Φ + s = 0, which is Z = 0.5. Current state:{' '}
                Φ {formatClaim(phi, 'p3')}, s {formatClaim(s, 'p3')} — their sum{' '}
                {formatClaim(phi + s, 'p3')} places this configuration{' '}
                {phi + s > 0 ? 'above' : 'below'} the ridge.
              </p>
            </div>
          ),
        },
        {
          id: 'z-phi',
          label: 'Z(Φ)',
          content: (
            <div className={styles.companion}>
              <LineProfile
                description="The saturation map alone: Z against the field value, with the current configuration marked. This is the sigmoid whose shape gives the model its bounded response."
                highlightX={[{ x: phi, label: `current Φ ${formatClaim(phi, 'p2')}` }]}
                points={Z_BY_PHI}
                seriesLabel="Z(Φ)"
                thresholds={[{ y: 0.5, label: 'Z = 0.5', style: 'dashed' }]}
                title="Saturation map"
                xFormat="int"
                xLabel="Field Φ"
                yFormat="p2"
                yLabel="Z"
              />
            </div>
          ),
        },
        {
          id: 'gain',
          label: 'Z(1−Z)',
          content: (
            <div className={styles.companion}>
              <LineProfile
                description="Local gain: how much a one-unit move in the field changes Z. It peaks at Z = 0.5 and vanishes in both tails, which is why the same coefficient has different force at different configurations."
                highlightX={[{ x: phi, label: `current ${formatClaim(gain, 'p3')}` }]}
                points={gainProfile}
                seriesLabel="Z(1−Z)"
                title="Local gain"
                xFormat="int"
                xLabel="Field Φ"
                yFormat="p3"
                yLabel="Z(1−Z)"
              />
              <p className={styles.companionNote}>
                Current gain {formatClaim(gain, 'p4')}: a coefficient of{' '}
                {formatClaim(0.39, 'p2')} on education capacity would move Z by{' '}
                {formatClaim(0.39 * gain, 'p4')} per standard deviation at this configuration,
                and by nothing at all in either tail.
              </p>
            </div>
          ),
        },
      ]}
    />
  )
}
