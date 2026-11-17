import { Badge, Card, Num } from '../../ui'
import { formatClaim } from '../../claims/format'
import { designGateData } from '../../claims/selectors/gates'
import styles from './GateCard.module.css'

export type GateId = 'identity' | 'duplicates' | 'rank' | 'singlePredictor'

type GateCardProps = {
  panel: 'original' | 'rebuilt'
  id: GateId
  /** The rule as the manuscript states it, already carrying its threshold. */
  rule: string
  /** Which predictor or pair produced the measurement. */
  detail: string
  pass: boolean
}

const TITLES: Record<GateId, string> = {
  identity: 'No predictor restates the outcome',
  duplicates: 'No two predictors are duplicates',
  rank: 'The design matrix is full rank',
  singlePredictor: 'No single predictor explains the outcome',
}

/**
 * One design gate: its rule, the measured value, and the verdict.
 *
 * The measured value is a `Num`, so it opens its artifact — the claim carries the path it
 * came from, and a reader can check "1.000" against `design_gates.json` rather than
 * trusting the badge. The rank gate reads as a count ("7 of 8") because a rank is not a
 * correlation and printing "7.000" would misrepresent what was measured.
 */
export function GateCard({ panel, id, rule, detail, pass }: GateCardProps) {
  const claimId = `gates.${panel}.${id}`
  const gate = designGateData[panel].gates.find((entry) => entry.id === id)
  const threshold = gate?.threshold ?? 0
  const isRank = id === 'rank'

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <span className={styles.rule}>{rule}</span>
        <Badge variant={pass ? 'pass' : 'withdrawn'}>{pass ? 'Pass' : 'Fail'}</Badge>
      </div>
      <h3 className={styles.title}>{TITLES[id]}</h3>
      <p className={styles.measured}>
        <span className={styles.measuredLabel}>Measured</span>
        {isRank ? (
          <>
            <Num id={claimId} /> <span className={styles.of}>of {threshold}</span>
          </>
        ) : (
          <Num id={claimId} />
        )}
      </p>
      <p className={styles.detail}>
        {detail}
        {!isRank && (
          <>
            {' '}· threshold {formatClaim(threshold, 'p3')}
          </>
        )}
      </p>
    </Card>
  )
}
