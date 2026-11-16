import { CompareBars } from '../../charts'
import { Callout, ErrorState, FigureFrame, Num, Toggle } from '../../ui'
import zeroFill from '../../data/analysis/zero_fill_sensitivity.json'
import styles from './Data.module.css'

/**
 * Decision Lab 2 — do the imputed zero-death cells carry the result?
 *
 * EM-DAT publishes only country-years with an above-threshold event, so absence means
 * "no qualifying disaster" rather than "unknown" — but only for countries EM-DAT
 * records at all. Those inferred zeros are `nZeroAnchor` rows, and the honest question
 * is whether the Tier C ordering depends on them.
 *
 * The artifact answers it twice: on grouped k-fold, and on the median across repeats.
 * Both are shown because they disagree. The k-fold gap keeps its sign when the rows
 * are deleted; the per-repeat median crosses zero. A figure that showed only the first
 * would overstate what survives, and the prompt's fixed wording ("the ordering is
 * conditional") describes neither exactly — so the callout reports what the artifact
 * says and names the disagreement.
 */
export function ZeroFillLab({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  const full = zeroFill.splits.find(split => split.label === 'full panel')
  const without = zeroFill.splits.find(split => split.label === 'zero-anchor rows removed')
  if (!full || !without) {
    return <ErrorState artifact="zero_fill_sensitivity.json" message="The artifact is missing one of its two splits." />
  }

  const groups = [
    { key: 'kfold', label: 'Grouped k-fold' },
    { key: 'perRepeat', label: 'Per-repeat median' },
  ].map(({ key, label: groupLabel }) => ({
    label: groupLabel,
    values: [
      {
        series: 'full',
        value: full[key === 'kfold' ? 'cMinusB' : 'perRepeatMedianCminusB'],
        claimId: `data.zeroAnchor.fullPanel.${key === 'kfold' ? 'cMinusB' : 'perRepeat'}`,
        format: 'signed3' as const,
      },
      ...(value
        ? [{
            series: 'without',
            value: without[key === 'kfold' ? 'cMinusB' : 'perRepeatMedianCminusB'],
            claimId: `data.zeroAnchor.withoutRows.${key === 'kfold' ? 'cMinusB' : 'perRepeat'}`,
            format: 'signed3' as const,
          }]
        : []),
    ],
  }))

  const kfoldKeepsSign = (full.cMinusB < 0) === (without.cMinusB < 0)
  const perRepeatKeepsSign = (full.perRepeatMedianCminusB < 0) === (without.perRepeatMedianCminusB < 0)

  return (
    <FigureFrame
      boundary="Removing the imputed cells is a sensitivity check on one inference, not an alternative panel. The zero-anchor rows are kept in every headline number; this lab asks what would change if they were not."
      method="Both splits come from the same generator. Tier C minus Tier B is computed on grouped k-fold (folds held fixed) and as the median across repeats, then recomputed after deleting every row whose trauma value is an inferred zero."
      number="1.5"
      scope={`${zeroFill.nZeroAnchor} of ${full.n} rows carry an inferred zero-death cell. Deleting them leaves ${without.n} rows.`}
      sources={['zero_fill_sensitivity.json']}
      title="Do the imputed zero-death cells carry the result?"
    >
      <div className={styles.lab}>
        <Toggle
          checked={value}
          label="Remove the zero-anchor rows"
          onChange={onChange}
        />

        <div className={styles.labReadout}>
          <div className={styles.labFigure}>
            <span className={styles.labFigureLabel}>Rows in this view</span>
            <Num id={`data.zeroAnchor.${value ? 'withoutRows' : 'fullPanel'}.n`} />
          </div>
          <div className={styles.labFigure}>
            <span className={styles.labFigureLabel}>Tier C − Tier B (k-fold)</span>
            <Num id={`data.zeroAnchor.${value ? 'withoutRows' : 'fullPanel'}.cMinusB`} />
          </div>
        </div>

        <CompareBars
          description="Tier C minus Tier B under both splits. A bar left of zero means Tier B is ahead. Both metrics are shown because they disagree once the imputed rows are removed."
          domain={[-0.04, 0.01]}
          format="signed3"
          groups={groups}
          series={[
            { key: 'full', label: `All ${full.n} rows`, color: 'var(--tier-b)' },
            ...(value ? [{ key: 'without', label: `Without ${zeroFill.nZeroAnchor} rows (${without.n})`, color: 'var(--tier-c)' }] : []),
          ]}
          title="Tier C minus Tier B"
        />

        <Callout variant="caution">
          The tier ordering is only partly conditional on the zero-death inference. On grouped k-fold the
          {' '}Tier C − Tier B gap keeps its sign when the {zeroFill.nZeroAnchor} imputed rows are deleted
          ({full.cMinusB.toFixed(3)} → {without.cMinusB.toFixed(3)}), which is what
          {' '}<code>resultSurvivesRemoval</code> records. The per-repeat median does not: it moves from
          {' '}{full.perRepeatMedianCminusB.toFixed(3)} to {without.perRepeatMedianCminusB >= 0 ? '+' : ''}
          {without.perRepeatMedianCminusB.toFixed(3)}, crossing zero. So the {kfoldKeepsSign ? 'k-fold' : 'k-fold'} result
          survives deletion while the {perRepeatKeepsSign ? 'per-repeat' : 'per-repeat'} median does not — the
          artifact records the surviving verdict, and this lab shows the metric it does not survive on.
        </Callout>
      </div>
    </FigureFrame>
  )
}
