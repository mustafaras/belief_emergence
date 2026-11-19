import { Badge, Card, DataTable } from '../../ui'
import { formatClaim } from '../../claims/format'
import {
  failureLog,
  intervalCoverage,
  ladderMetrics,
  parameterStability,
} from '../../claims/selectors/robustness'
import styles from './Evaluation.module.css'

/**
 * The four robustness artifacts the Evaluation route is the natural home for.
 *
 * All four were generated, validated and committed — and read by nothing. The plan's item A6
 * named exactly this: out-of-sample results existed as files and were not shown anywhere, so a
 * reader had to open the JSON to learn whether the folds failed, whether the intervals covered,
 * whether coefficients kept their sign, and what the nested ladder found.
 *
 * The panels state what each artifact says, including where it says something unflattering:
 * zero failed folds is a fact about the folds, not a claim that the model is right; the sign
 * threshold is reported against the value that was configured, not against the value that would
 * look good.
 */
export function Robustness() {
  return (
    <>
      <Card>
        <h2 className={styles.h2}>Robustness of the fit</h2>
        <p className={styles.prose}>
          Four checks that do not change the headline comparison and would change how far it
          could be trusted if they had failed. Each is read from its own artifact.
        </p>

        <DataTable<{ check: string; verdict: string; detail: string }>
          caption="Robustness checks, each read from its own artifact"
          columns={[
            { key: 'check', header: 'Check', sortable: true },
            {
              key: 'verdict',
              header: 'Result',
              render: (row) => (
                <Badge variant={row.verdict.startsWith('no') || row.verdict === 'within bound' ? 'pass' : 'exploratory'}>
                  {row.verdict}
                </Badge>
              ),
            },
            { key: 'detail', header: 'What it means' },
          ]}
          rows={[
            {
              check: `Fold failures (${formatClaim(failureLog.totalFolds, 'int')} folds)`,
              verdict: failureLog.failedFolds === 0 ? 'none failed' : `${failureLog.failedFolds} failed`,
              detail:
                failureLog.failedFolds === 0
                  ? 'Every fold converged. This says the optimiser was not the obstacle; it says nothing about whether the model is right.'
                  : `${failureLog.failedFolds} folds did not converge, and their metrics are absent rather than imputed.`,
            },
            {
              check: `Sign consistency (floor ${formatClaim(parameterStability.threshold, 'p2')})`,
              verdict:
                parameterStability.unstableTerms.length === 0
                  ? 'all terms stable'
                  : `${parameterStability.unstableTerms.length} unstable`,
              detail:
                parameterStability.unstableTerms.length === 0
                  ? 'Every retained coefficient keeps its sign across repeats at the floor the paper states.'
                  : `These terms change sign across repeats: ${parameterStability.unstableTerms.join(', ')}.`,
            },
            {
              check: `Interval coverage (nominal ${formatClaim(intervalCoverage.nominal, 'pct1')})`,
              verdict:
                intervalCoverage.worstCoverage >= intervalCoverage.severeThreshold
                  ? 'within bound'
                  : 'under-covering',
              detail:
                `The worst protocol covers ${formatClaim(intervalCoverage.worstCoverage, 'pct1')} against a ` +
                `${formatClaim(intervalCoverage.nominal, 'pct1')} nominal claim; below ` +
                `${formatClaim(intervalCoverage.severeThreshold, 'pct1')} the intervals would be reported as unreliable.`,
            },
            {
              check: `Nested ladder (${formatClaim(ladderMetrics.tiers, 'int')} tiers)`,
              verdict: `${formatClaim(ladderMetrics.rows[0]?.parameters ?? 0, 'int')} → ${formatClaim(
                ladderMetrics.rows[ladderMetrics.rows.length - 1]?.parameters ?? 0, 'int')} parameters`,
              detail:
                'In-sample R² by tier: ' +
                ladderMetrics.rows
                  .map((row) => `${row.tier} ${formatClaim(row.r2, 'r2')} (${formatClaim(row.parameters, 'int')} params)`)
                  .join(', ') +
                '. This artifact records in-sample fit only; the held-out comparison is the figure above.',
            },
          ]}
          rowAttributes={(row) => ({ 'data-check': row.check })}
        />
      </Card>
    </>
  )
}
