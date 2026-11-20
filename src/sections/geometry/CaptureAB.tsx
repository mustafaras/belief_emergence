import { useState } from 'react'
import { calculateModel } from '../../utils/calculateModel'
import { formatClaim } from '../../claims/format'
import { downloadCsv } from '../../utils/csv/exportCsv'
import { Button, Card } from '../../ui'
import { toBeliefParameters, type GeometryState } from './useGeometryParams'
import type { SurfaceImageFn } from './Surface3D'
import styles from './Geometry.module.css'

/**
 * Capture two configurations and compare them.
 *
 * Sliders are a poor memory: a reader who has found an interesting ridge and then moved to the
 * other side cannot tell how far they moved. Capturing both states and printing the difference
 * turns "it looked different" into two numbers.
 */
type Snapshot = { label: string; state: GeometryState; z: number; phi: number; gain: number }

const snapshot = (label: string, state: GeometryState): Snapshot => {
  const result = calculateModel(toBeliefParameters(state) as never)
  const z = result.Z
  const phi = result.phi
  return { label, state, z, phi, gain: z * (1 - z) }
}

const CONTROL_KEYS = ['X', 'Y', 'M', 'T', 'E', 'R'] as const

export function CaptureAB({
  state,
  surfaceImage,
}: {
  state: GeometryState
  /** Supplied by the surface, which is the only place Plotly is imported. */
  surfaceImage?: SurfaceImageFn | null
}) {
  const [a, setA] = useState<Snapshot | null>(null)
  const [b, setB] = useState<Snapshot | null>(null)
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied; the URL is in the address bar either way.
      setCopied(false)
    }
  }

  const exportPng = async () => {
    if (!surfaceImage) return
    const dataUrl = await surfaceImage()
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = 'geometry-surface.png'
    link.click()
  }

  const exportCsv = () => {
    const headers = ['snapshot', ...CONTROL_KEYS, 'Z', 'Phi', 'Z(1-Z)']
    const rows = [a, b]
      .filter((entry): entry is Snapshot => entry !== null)
      .map((entry) => [
        entry.label,
        ...CONTROL_KEYS.map((key) => entry.state[key].toFixed(4)),
        entry.z.toFixed(6),
        entry.phi.toFixed(6),
        entry.gain.toFixed(6),
      ])
    downloadCsv('geometry-captures.csv', headers, rows)
  }

  return (
    <div className={styles.capture}>
      <h2 className={styles.h2}>Capture A / B</h2>
      <p className={styles.caption}>
        Store the current configuration in either slot, then compare. The difference is computed
        from the same model that drew the surface, so it cannot disagree with it.
      </p>

      <div className={styles.captureButtons}>
        <Button onClick={() => setA(snapshot('A', state))} type="button">Capture A</Button>
        <Button onClick={() => setB(snapshot('B', state))} type="button">Capture B</Button>
        <Button onClick={copyLink} type="button">{copied ? 'Link copied' : 'Copy share link'}</Button>
        <Button disabled={a === null && b === null} onClick={exportCsv} type="button">Export CSV</Button>
        <Button disabled={!surfaceImage} onClick={() => void exportPng()} type="button">
          Export surface PNG
        </Button>
      </div>

      {a !== null && b !== null ? (
        <Card className={styles.diffCard}>
          <table className={styles.diffTable}>
            <caption className={styles.visuallyHidden}>Difference between capture A and capture B</caption>
            <thead>
              <tr>
                <th scope="col">Quantity</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
                <th scope="col">Δ (B − A)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Z</th>
                <td>{formatClaim(a.z, 'p3')}</td>
                <td>{formatClaim(b.z, 'p3')}</td>
                <td data-testid="diff-z">{formatClaim(b.z - a.z, 'signed3')}</td>
              </tr>
              <tr>
                <th scope="row">Φ</th>
                <td>{formatClaim(a.phi, 'p3')}</td>
                <td>{formatClaim(b.phi, 'p3')}</td>
                <td data-testid="diff-phi">{formatClaim(b.phi - a.phi, 'signed3')}</td>
              </tr>
              <tr>
                <th scope="row">Z(1−Z)</th>
                <td>{formatClaim(a.gain, 'p4')}</td>
                <td>{formatClaim(b.gain, 'p4')}</td>
                <td>{formatClaim(b.gain - a.gain, 'signed3')}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      ) : (
        <p className={styles.captureHint}>
          {a === null && b === null
            ? 'Capture A, move a slider, then capture B to see the difference.'
            : `${a === null ? 'A' : 'B'} is stored; capture the other slot to compare.`}
        </p>
      )}
    </div>
  )
}
