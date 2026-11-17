import { CompareBars } from '../../charts'
import { getClaim } from '../../claims/registry'
import styles from './AuditReplay.module.css'

/**
 * The last step's comparison, rendered beside the text rather than inside the sticky panel.
 *
 * It used to live in the sticky card, where it was clipped: the card is `position: sticky`
 * and sized to its content, so a chart appended at the bottom simply ran past the viewport
 * and was never seen. Placing it in the step's own column keeps it in flow.
 */
export function ReplayMini() {
  return (
    <div className={styles.mini} data-testid="replay-mini">
      <CompareBars
        description="Grouped k-fold R² for the two functional forms on identical rows and folds. The bars differ in the fourth decimal."
        domain={[0.3, 0.45]}
        format="r2"
        groups={[
          {
            label: 'Grouped k-fold',
            values: [
              { series: 'bounded', value: getClaim('eval.bounded.kfold').value, claimId: 'eval.bounded.kfold' },
              { series: 'linear', value: getClaim('eval.linear.kfold').value, claimId: 'eval.linear.kfold' },
            ],
          },
        ]}
        series={[
          { key: 'bounded', label: 'Bounded', color: 'var(--tier-b)' },
          { key: 'linear', label: 'Linear', color: 'var(--linear)' },
        ]}
        title="Bounded vs linear, out of sample"
      />
    </div>
  )
}
