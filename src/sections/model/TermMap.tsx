import { Badge, Num } from '../../ui'
import { getClaim } from '../../claims/registry'
import styles from './TermMap.module.css'

/**
 * The Φ term map: which channels enter the field, which were withdrawn, and with what sign.
 *
 * The chip is the unit because the point is membership. A reader should be able to see at a
 * glance that the field has six estimated terms and four named-but-absent ones, and that the
 * absent ones are not "small effects" — they were never estimated at all.
 *
 * The withdrawn chips carry the reason in their accessible name, not just a visual strike:
 * colour and line-through are both invisible to a screen reader, and "withdrawn" is the whole
 * content of the claim.
 */
type ActiveTerm = {
  key: string
  label: string
  claimId: string
  term: string
}

const ACTIVE: ActiveTerm[] = [
  { key: 'M', label: 'M', claimId: 'model.c.M', term: 'media environment' },
  { key: 'T', label: 'T', claimId: 'model.c.T', term: 'trauma exposure' },
  { key: 'E', label: 'E', claimId: 'model.c.E', term: 'education capacity' },
  { key: 'R', label: 'R', claimId: 'model.c.R', term: 'welfare capacity' },
  { key: 'tr', label: 'c_tr', claimId: 'model.c.tr', term: 'trauma × welfare' },
  { key: 'yr', label: 'c_yr', claimId: 'model.c.yr', term: 'inequality × welfare' },
]

type WithdrawnTerm = { label: string; reason: string }

const WITHDRAWN: WithdrawnTerm[] = [
  { label: 'C', reason: 'α 0.35 — items do not load on one dimension' },
  { label: 'D', reason: 'α −1.23 — items disagree more than independent items would' },
  { label: 'G', reason: 'disposable-income Gini unavailable outside the OECD sample' },
  { label: 'S', reason: 'not computable — four of seven configured items are absent' },
]

/** True when the bootstrap interval excludes zero. */
const isIdentified = (key: string): boolean => {
  const lo = getClaim(`model.bootstrap.c_${key}.lo`).value
  const hi = getClaim(`model.bootstrap.c_${key}.hi`).value
  return lo > 0 || hi < 0
}

/** Names of the terms whose interval excludes zero — derived, not typed into the sentence. */
const identifiedNames = ACTIVE.filter((entry) => isIdentified(entry.key)).map((entry) => entry.term)

export function TermMap() {
  return (
    <div className={styles.wrap}>
      <div aria-label="Estimated terms in the field" className={styles.group} role="group">
        <p className={styles.groupLabel}>Estimated</p>
        <ul className={styles.chips}>
          {ACTIVE.map((entry) => {
            const identified = isIdentified(entry.key)
            const coefficient = getClaim(entry.claimId).value
            return (
              <li className={styles.chip} key={entry.key}>
                <span aria-hidden="true" className={styles.symbol}>{entry.label}</span>
                <span className={styles.chipBody}>
                  <span className={styles.chipTerm}>{entry.term}</span>
                  <span className={styles.chipValue}>
                    <Num id={entry.claimId} />
                    <span className={styles.sign}>{coefficient < 0 ? 'negative' : 'positive'}</span>
                  </span>
                </span>
                <Badge variant={identified ? 'pass' : 'unidentified'} label={identified ? 'identified' : 'not identified'}>
                  {identified ? 'identified' : 'not identified'}
                </Badge>
              </li>
            )
          })}
        </ul>
      </div>

      <div aria-label="Withdrawn terms" className={styles.group} role="group">
        <p className={styles.groupLabel}>Named, not estimated</p>
        <ul className={styles.chips}>
          {WITHDRAWN.map((entry) => (
            <li className={`${styles.chip} ${styles.chipWithdrawn}`} key={entry.label}>
              <span aria-hidden="true" className={styles.symbolStruck}>{entry.label}</span>
              <span className={styles.chipBody}>
                <span className={styles.chipTerm}>{entry.reason}</span>
              </span>
              <Badge variant="withdrawn" label="withdrawn in section two">withdrawn §2</Badge>
            </li>
          ))}
        </ul>
      </div>

      <p className={styles.note}>
        &ldquo;Not identified&rdquo; means the country-level bootstrap interval includes zero: the sign
        is then not a finding. {identifiedNames.length === 2
          ? `${identifiedNames[0]} and ${identifiedNames[1]}`
          : identifiedNames.join(', ')}{' '}
        {identifiedNames.length === 1 ? 'clears' : 'clear'} that bar.
      </p>
    </div>
  )
}
