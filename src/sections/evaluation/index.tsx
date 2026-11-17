import { type KeyboardEvent, type MouseEvent } from 'react'
import { CompareBars, DistStrip } from '../../charts'
import { useClaimInspector } from '../../claims/InspectorContext'
import { formatClaim } from '../../claims/format'
import { getClaim } from '../../claims/registry'
import { Callout, Card, SectionHeader } from '../../ui'
import comparison from '../../data/analysis/functional_form_comparison.json'
import styles from './Evaluation.module.css'

/**
 * Figure 5.1 — the functional-form comparison, which is the paper's central methodological
 * result and therefore the section's hero.
 *
 * Three groups, two series. The groups are not three protocols measuring the same quantity:
 * in-sample is the fit on the rows the model saw, grouped k-fold is the primary held-out
 * protocol, and pooled country-out is a spatial stress test where every row is predicted
 * once by a model that never saw its country. They are plotted together because the
 * contrast between them is the argument — the bounded form loses in sample and ties out of
 * sample — and the caption says so rather than leaving a reader to assume the bars are
 * three estimates of one number.
 */
function modelOf(name: 'linear_baseline' | 'saturating_bounded'): (typeof comparison)['models'][number] {
  const found = comparison.models.find((model) => model.model === name)
  if (!found) throw new Error(`functional_form_comparison.json has no ${name} entry`)
  return found
}

const linear = modelOf('linear_baseline')
const bounded = modelOf('saturating_bounded')

const groups = [
  {
    label: 'In-sample',
    values: [
      { series: 'bounded', value: bounded.inSample.r2, claimId: 'eval.bounded.inSample', format: 'r2' as const },
      { series: 'linear', value: linear.inSample.r2, claimId: 'eval.linear.inSample', format: 'r2' as const },
    ],
  },
  {
    label: 'Grouped k-fold (primary)',
    values: [
      { series: 'bounded', value: bounded.kfold.median, claimId: 'eval.bounded.kfold', format: 'r2' as const },
      { series: 'linear', value: linear.kfold.median, claimId: 'eval.linear.kfold', format: 'r2' as const },
    ],
  },
  {
    label: 'Pooled country-out (stress test)',
    values: [
      { series: 'bounded', value: bounded.countryOutPooled.r2, claimId: 'eval.bounded.pooledLoo', format: 'r2' as const },
      { series: 'linear', value: linear.countryOutPooled.r2, claimId: 'eval.linear.pooledLoo', format: 'r2' as const },
    ],
  },
]

/**
 * A headline number that opens its artifact.
 *
 * The hero sentence is the section's claim, so its two numbers must be inspectable like
 * every other. `Num` cannot be used inline here because it renders a block-level button;
 * this keeps the sentence's typography while giving the value the same keyboard and click
 * behaviour as the chart labels.
 */
function InlineClaim({ id, digits }: { id: string; digits: 'r2' | 'p6' | 'p3' }) {
  const { openClaim } = useClaimInspector()
  const claim = getClaim(id)
  const value = formatClaim(claim.value, digits)
  const activate = (target: HTMLElement | SVGElement) => openClaim(id, target)
  return (
    <button
      aria-label={`${claim.label}: ${value}`}
      className={styles.inlineClaim}
      data-claim-id={id}
      onClick={(event: MouseEvent<HTMLButtonElement>) => activate(event.currentTarget)}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          activate(event.currentTarget)
        }
      }}
      title={[claim.artifact, claim.path, claim.note].filter(Boolean).join(' · ')}
      type="button"
    >
      {value}
    </button>
  )
}

export default function EvaluationSection() {
  const kfoldGap = bounded.kfold.median - linear.kfold.median
  const inSampleGap = bounded.inSample.r2 - linear.inSample.r2

  return (
    <section className={styles.section}>
      <SectionHeader
        eyebrow="Out-of-sample evidence"
        title="Evaluation"
        lede="A saturating bounded model and an ordinary linear regression, fitted to identical rows and identical folds. Out of sample they tie; in sample the linear form wins."
      />

      <Card className={styles.hero}>
        <p className={styles.figureNumber} data-scale-label="">Figure 5.1</p>
        <h2 className={styles.heroTitle}>Bounded versus linear, on the same folds</h2>

        <div className={styles.headline}>
          <p className={styles.headlineText}>
            A near-tie:{' '}
            <InlineClaim digits="r2" id="eval.bounded.kfold" />{' '}against{' '}
            <InlineClaim digits="r2" id="eval.linear.kfold" />{' '}
            out of sample.
          </p>
          <p className={styles.headlineSub}>
            The gap is {formatClaim(kfoldGap, 'p6')} inside fold-to-fold variation that
            spans {formatClaim(linear.kfold.q25, 'r2')} to {formatClaim(linear.kfold.q75, 'r2')}.
            In sample the ordering reverses: the linear form leads by{' '}
            {formatClaim(Math.abs(inSampleGap), 'p3')}.
          </p>
        </div>

        <CompareBars
          description="Held-out R² for the two functional forms under three evaluations. In-sample is the fit on the rows the model saw; grouped k-fold is the primary held-out protocol; pooled country-out is a spatial stress test."
          domain={[0, 0.5]}
          format="r2"
          groups={groups}
          series={[
            { key: 'bounded', label: 'Bounded', color: 'var(--tier-b)' },
            { key: 'linear', label: 'Linear', color: 'var(--linear)' },
          ]}
          title="Bounded vs linear across three evaluations"
        />

        <figure className={styles.stripFigure}>
          <DistStrip
            description="Per-fold held-out R² for both models across the 100 grouped folds. The two distributions overlap almost completely, which is what a near-tie looks like at fold level rather than at the median."
            reference={{ value: 0, label: 'R² = 0' }}
            series={[
              { key: 'bounded', label: 'Bounded', color: 'var(--tier-b)', values: bounded.kfold.values },
              { key: 'linear', label: 'Linear', color: 'var(--linear)', values: linear.kfold.values },
            ]}
            title="Per-fold distribution"
          />
          <figcaption className={styles.stripCaption}>
            Each mark is one of the {formatClaim(bounded.kfold.n, 'int')} grouped folds. The
            two models were fitted on the same training rows and scored on the same held-out
            rows, so the folds are paired: the medians can agree while individual folds differ
            by more than the median gap, which is why the difference is reported per fold rather
            than as a single number.
          </figcaption>
        </figure>

        <Callout variant="caution">
          <strong>A withdrawn claim.</strong> An earlier draft reported that the linear baseline
          won decisively. That figure could not be regenerated from the panel, and it is
          withdrawn rather than revised: the current artifacts support a near-tie out of sample
          and a linear advantage in sample, which is a narrower and less convenient statement.
        </Callout>

        <Callout variant="info">
          The pooled country-out bars are a <em>spatial stress test</em>, not the primary
          out-of-sample family, and they are plotted as context. Under leave-one-country-out the
          per-fold median is degenerate for both models (
          {formatClaim(bounded.countryOutPerFold.median, 'r2')} bounded,{' '}
          {formatClaim(linear.countryOutPerFold.median, 'r2')} linear) because most folds hold
          one or two rows and R² is undefined on them; the pooled figure is the meaningful one
          and it is what the bars show.
        </Callout>
      </Card>

      <div className={styles.notes}>
        <h2 className={styles.h2}>What the comparison can and cannot settle</h2>
        <p className={styles.prose}>
          It settles whether curvature buys held-out accuracy on this panel, and the answer is
          no. It does not settle whether the bounded form is a better description of the
          phenomenon: a model can be right about the shape of a relationship and still be beaten
          on R² by a straight line, because R² rewards the fit where the data are dense. The
          paper reports both numbers rather than choosing the one that flatters the framework.
        </p>
        <p className={styles.prose}>
          The folds are grouped by country and repeated{' '}
          {formatClaim(comparison.kfold.repeats, 'int')} times, so a country never appears in
          both halves of a split. They are not independent: folds within a repeat share rows and
          repeats share countries, which is why no p-value is attached to the difference and the
          interval reported above is a spread across folds rather than a confidence interval.
        </p>
      </div>
    </section>
  )
}
