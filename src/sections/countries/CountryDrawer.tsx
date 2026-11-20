import { LineProfile } from '../../charts'
import { formatClaim } from '../../claims/format'
import { Callout, Drawer } from '../../ui'
import styles from './Countries.module.css'

/**
 * One country's observed and predicted outcome over its years.
 *
 * The two series share the y-axis deliberately: the question a reader brings to this drawer is
 * how far apart they are, and two separate axes would make any gap look small.
 *
 * The EST/RUS/SVK note the execution prompt asked for is not a recorded "failure log" entry —
 * the failure log records zero nonconverged folds. What the artifacts do support is that those
 * three countries carry the largest residuals in the preset set, so the drawer says that and
 * names the actual per-year residuals instead.
 */
export type CountryYear = { year: number; observed: number; predicted: number; residual: number }

export function CountryDrawer({
  iso3,
  name,
  open,
  onOpenChange,
  years,
  mae,
  verdict,
}: {
  iso3: string
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
  years: CountryYear[]
  mae: number
  verdict: 'good' | 'acceptable' | 'poor'
}) {
  const observed = years.map((point) => ({ x: point.year, y: point.observed }))
  const predicted = years.map((point) => ({ x: point.year, y: point.predicted }))
  const worst = years.reduce((worstPoint, point) => (
    Math.abs(point.residual) > Math.abs(worstPoint.residual) ? point : worstPoint
  ), years[0])

  return (
    <Drawer
      onOpenChange={onOpenChange}
      open={open}
      title={`${name} (${iso3})`}
      trigger={<span className={styles.rowTrigger}>{name}</span>}
    >
      <div className={styles.drawerBody}>
        <p className={styles.drawerMeta}>
          {years.length} country-year{years.length === 1 ? '' : 's'} · mean absolute error{' '}
          {formatClaim(mae, 'p3')} · <strong>{verdict}</strong>
        </p>

        <LineProfile
          description={`Observed and predicted belief intensity for ${name} across its survey years. The vertical gap at each year is the residual.`}
          points={observed}
          seriesLabel="Observed"
          series={[
            // `--accent` and `--tier-b` are the same hex (#2F43C8), so drawing the second
            // series in --tier-b produced two indistinguishable lines. Observed keeps the
            // accent colour; predicted uses the neutral comparator token.
            { key: 'predicted', label: 'Predicted', color: 'var(--linear)', points: predicted },
          ]}
          title={`${name}: observed versus predicted`}
          xFormat="year"
          xLabel="Survey year"
          yFormat="p2"
          yLabel="Belief intensity (Z)"
        />

        <table className={styles.yearTable}>
          <caption className={styles.visuallyHidden}>Per-year observed, predicted and residual values</caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Observed</th>
              <th scope="col">Predicted</th>
              <th scope="col">Residual</th>
            </tr>
          </thead>
          <tbody>
            {years.map((point) => (
              <tr key={point.year}>
                <th scope="row">{point.year}</th>
                <td>{formatClaim(point.observed, 'p3')}</td>
                <td>{formatClaim(point.predicted, 'p3')}</td>
                <td>{formatClaim(point.residual, 'signed3')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Callout variant="info">
          The largest residual here is {formatClaim(worst.residual, 'signed3')} in {worst.year}.
          {' '}No fold failed to converge for this country: the failure log records zero
          nonconverged folds across every tier, so a wide residual is a fit difference rather than
          an estimation failure.
        </Callout>

        <a className={styles.geometryLink} href={`?v=geometry&iso=${iso3}`}>
          Open in Geometry Lab →
        </a>
      </div>
    </Drawer>
  )
}
