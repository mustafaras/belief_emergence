import { useState } from 'react'
import { formatClaim } from '../../claims/format'
import { getClaim } from '../../claims/registry'
import { Badge, Callout, Card, DataTable, Toggle } from '../../ui'
import { vifEntries } from '../../claims/selectors/limits'
import { rCase } from '../../claims/selectors/limits'
import styles from './Limits.module.css'

/**
 * Table 6.2 and Decision Lab 7 — collinearity, and why R is not dropped.
 *
 * THE TRAP IN THIS LAB
 * --------------------
 * Removing R lowers the maximum VIF from 9.43 to 2.47 and costs almost nothing out of sample
 * (k-fold R² actually improves by 1.3e-5). That looks like a free repair, and a lab that
 * stopped at "here is the improvement" would be inviting the reader to make it — which would
 * be post-hoc specification selection: dropping a covariate *because* the fit improved after
 * you saw it. The caution is therefore mandatory, not optional, and the section carries a
 * banner while the counterfactual is on screen.
 */
export function Collinearity() {
  const [dropR, setDropR] = useState(false)
  const active = dropR ? rCase.withoutR : rCase.withR

  return (
    <div className={styles.block}>
      {dropR && (
        <p className={styles.counterfactualBanner} data-testid="counterfactual-banner" role="status">
          Counterfactual view — this is not the reported model. R is retained in every published
          estimate.
        </p>
      )}

      <p className={styles.tableNumber} data-scale-label="">Table 6.2</p>
      <h2 className={styles.h2}>Collinearity</h2>
      <p className={styles.prose}>
        Variance inflation for the six retained covariates. R carries most of it, and the reason
        is not a data defect: R is welfare capacity, which is close to linear in the human
        development index.
      </p>

      <DataTable
        caption="Variance inflation factors for the retained covariates"
        columns={[
          {
            key: 'covariate',
            header: 'Covariate',
            render: (row: (typeof vifEntries)[number]) => (
              <span className={styles.vifName}>
                {row.covariate}
                {row.flagged && <Badge variant="unidentified">above 5</Badge>}
              </span>
            ),
          },
          {
            key: 'vif',
            header: 'VIF',
            align: 'right',
            render: (row: (typeof vifEntries)[number]) => formatClaim(row.vif, 'p2'),
          },
          { key: 'label', header: 'What it measures' },
        ]}
        rowAttributes={(row) => ({ 'data-covariate': row.covariate })}
        rows={vifEntries}
      />

      <p className={styles.prose}>
        The condition number of the design matrix is{' '}
        {formatClaim(getClaim('limits.collinearity.conditionNumber').value, 'p2')} on{' '}
        {formatClaim(getClaim('limits.collinearity.n').value, 'int')} rows. That is high enough
        that the affected coefficients are reported as associations under a fixed design rather
        than as separately identified effects — the model is not claiming to have untangled R
        from the development index.
      </p>

      <div className={styles.lab}>
        <h3 className={styles.h3}>Decision Lab 7 — drop R?</h3>
        <p className={styles.prose}>
          A reasonable question: if one covariate carries a VIF of{' '}
          {formatClaim(rCase.withR.maxVif, 'p2')}, what happens if it goes? Lowering it is easy to
          compute, and the answer is uncomfortable rather than convenient.
        </p>

        <Toggle
          checked={dropR}
          label="Remove R from the specification (counterfactual)"
          onChange={setDropR}
        />

        <div className={styles.compare}>
          <Card className={styles.compareCard}>
            <p className={styles.compareLabel}>Maximum VIF</p>
            <p className={styles.compareValue} data-testid="lab-max-vif">
              {formatClaim(active.maxVif, 'p2')}
            </p>
            <p className={styles.compareNote}>
              {dropR ? 'without R' : 'with R, as reported'}
            </p>
          </Card>
          <Card className={styles.compareCard}>
            <p className={styles.compareLabel}>In-sample R²</p>
            <p className={styles.compareValue} data-testid="lab-in-sample">
              {formatClaim(active.inSampleR2, 'r2')}
            </p>
            <p className={styles.compareNote}>
              {dropR ? `costs ${formatClaim(rCase.verdict.inSampleCost, 'p4')}` : 'reported model'}
            </p>
          </Card>
          <Card className={styles.compareCard}>
            <p className={styles.compareLabel}>Grouped k-fold R²</p>
            <p className={styles.compareValue} data-testid="lab-kfold">
              {formatClaim(active.kFoldR2, 'r2')}
            </p>
            <p className={styles.compareNote}>
              {dropR ? 'out of sample, the difference is 1.3e-5' : 'reported model'}
            </p>
          </Card>
        </div>

        <Callout variant="caution">
          <strong>This is why it is not dropped.</strong> Removing R after seeing the fit improve
          is post-hoc specification selection: the improvement is discovered in the same data that
          would then be used to validate it, so it carries no out-of-sample information. The VIF is
          reported as a limit on interpretation, not as a cue to re-specify.
        </Callout>
      </div>
    </div>
  )
}
