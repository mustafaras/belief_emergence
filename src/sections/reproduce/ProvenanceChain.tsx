/**
 * The provenance chain: where the outcome came from and where it can be trusted.
 *
 * The paper's argument is that validity has to be established before model geometry is
 * discussed, so the chain is drawn in that order and each link states its own evidence
 * rather than being asserted. Two links are marked as broken or narrowed, because they
 * are: the construct audit withdrew four channels, and the fitted model is reported with
 * its exponent unbounded.
 *
 * Every number here comes from a claim or an artifact. Nothing on the diagram is a
 * qualitative gesture: each link names the artifact that establishes it.
 */
import { Badge } from '../../ui'
import { formatClaim } from '../../claims/format'
import { getClaim } from '../../claims/registry'
import styles from './Reproduce.module.css'

type Link = {
  id: string
  title: string
  detail: string
  artifact: string
  status: 'holds' | 'narrows' | 'withdrawn'
}

const links: Link[] = [
  {
    id: 'wvs',
    title: 'World Values Survey microdata',
    detail: `${formatClaim(getClaim('audit.respondents').value, 'int')} respondents scanned before any construct is defined.`,
    artifact: 'wvs_construct_audit',
    status: 'holds',
  },
  {
    id: 'constructs',
    title: 'Construct audit',
    detail: 'Four of eight candidate channels withdrawn; the reason for each is recorded against its name.',
    artifact: 'wvs_construct_audit',
    status: 'withdrawn',
  },
  {
    id: 'panel',
    title: 'Canonical panel',
    detail: `${formatClaim(getClaim('data.frameShare').value, 'pct1')} of scanned country-years survive into the analysed sample.`,
    artifact: 'construct_prevalence',
    status: 'narrows',
  },
  {
    id: 'fit',
    title: 'Model fit',
    detail: 'Ten coefficients estimated by tier; the outcome is bounded so the link is logistic.',
    artifact: 'coefficient_fit',
    status: 'holds',
  },
  {
    id: 'artifacts',
    title: 'Committed artifacts',
    detail: 'Every displayed quantity is read from a JSON file in this repository, not typed into a component.',
    artifact: 'reproduction manifest',
    status: 'holds',
  },
  {
    id: 'app',
    title: 'This application',
    detail: 'Rendered numbers are audited against those artifacts in continuous integration.',
    artifact: 'check:dom-numbers',
    status: 'holds',
  },
]

const VARIANT = { holds: 'pass', narrows: 'exploratory', withdrawn: 'withdrawn' } as const

export function ProvenanceChain() {
  return (
    <ol className={styles.chain}>
      {links.map((link, position) => (
        <li className={styles.chainItem} key={link.id}>
          <div className={styles.chainMarker} aria-hidden="true">{position + 1}</div>
          <div className={styles.chainBody}>
            <div className={styles.chainHead}>
              <strong>{link.title}</strong>
              <Badge variant={VARIANT[link.status]}>{link.status}</Badge>
            </div>
            <p className={styles.chainDetail}>{link.detail}</p>
            <p className={styles.chainSource}>
              established by <code>{link.artifact}</code>
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
