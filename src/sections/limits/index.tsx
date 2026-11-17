import { useState } from 'react'
import { LineProfile } from '../../charts'
import { formatClaim } from '../../claims/format'
import { getClaim } from '../../claims/registry'
import { outlier2006, profileBounds } from '../../claims/selectors/limits'
import { Callout, Card, FigureFrame, SectionHeader, Toggle } from '../../ui'
import { Collinearity } from './Collinearity'
import styles from './Limits.module.css'

/**
 * Figure 6.1 — the profile likelihood for the structural exponent.
 *
 * WHAT THE FIGURE HAS TO SHOW
 * ---------------------------
 * Not "the optimum is 0.05". The loss rises monotonically across the whole grid and never
 * reaches significance, so the honest reading is that the exponent is not identified: the
 * optimiser is not choosing a value so much as running to whatever floor is imposed on it.
 * The figure therefore plots the likelihood-ratio statistic against the threshold and marks
 * the shipped value, which sits outside the tested grid entirely.
 *
 * THE MULTIPLICITY TOGGLE, AND WHY BOTH STATES READ THE SAME
 * ---------------------------------------------------------
 * Bonferroni divides the tail probability by the number of grid points, which raises the
 * chi-square threshold from 3.84 to about 7.16. That should narrow the interval. It does not
 * change the printed bound at all on this panel, because no grid point clears even the
 * uncorrected threshold — the maximum statistic is 3.02. The toggle stays because the
 * invariance is the finding: multiplicity correction cannot bite where the data have already
 * failed to reject anything.
 */
const SHIPPED_ALPHA = getClaim('limits.alpha.shipped').value
const CI95 = profileBounds.ci95
const BONFERRONI = profileBounds.bonferroni

/**
 * The two grid points that bracket the shipped value.
 *
 * Computed rather than indexed: hard-coding `grid[4]` and `grid[5]` printed 0.016 and 0.032,
 * which do not bracket 0.050 at all. The bracket has to be derived from the value it
 * describes, or it silently becomes a sentence about different numbers.
 */
const bracketLow = Math.max(...profileBounds.grid.filter((value) => value < SHIPPED_ALPHA))
const bracketHigh = Math.min(...profileBounds.grid.filter((value) => value > SHIPPED_ALPHA))

export default function LimitsSection() {
  const [bonferroni, setBonferroni] = useState(false)
  const active = bonferroni ? BONFERRONI : CI95
  const threshold = active.threshold

  const points = profileBounds.points.map((point) => ({ x: point.value, y: point.lrStatistic }))

  return (
    <section className={styles.section}>
      <SectionHeader
        eyebrow="Limits and sensitivity"
        title="What This Model Cannot Show"
        lede="Four checks bound the interpretation: the structural exponent is not identified, one covariate carries most of the collinearity, the lockbox is small, and one survey year behaves differently."
      />

      <FigureFrame
        boundary="A flat profile is not evidence that the exponent is zero. It says the likelihood cannot distinguish the tested values from each other, so the data do not locate the parameter at all — and any floor imposed by the optimiser appears in the fit as if it were an estimate."
        method={`Each grid point refits the model with alpha fixed and measures the likelihood-ratio statistic against the best-fitting value. The threshold is the chi-square quantile with one degree of freedom: ${formatClaim(CI95.threshold, 'p2')} at 95%, or ${formatClaim(BONFERRONI.threshold, 'p2')} with a Bonferroni correction over the ${profileBounds.grid.length} grid points.`}
        number="6.1"
        scope={`${profileBounds.grid.length} grid points from ${formatClaim(profileBounds.grid[0], 'p3')} to ${formatClaim(profileBounds.grid[profileBounds.grid.length - 1], 'p3')}. The shipped value ${formatClaim(SHIPPED_ALPHA, 'p3')} was not one of them: the profile brackets it rather than testing it.`}
        sources={['elasticity_profile.json', 'elasticity_bound_sensitivity.json']}
        title="The structural exponent is not identified"
      >
        <div className={styles.lab}>
          <h3 className={styles.h3}>Decision Lab 6 — charge multiplicity</h3>
          <p className={styles.prose}>
            Seven grid points were tested. If they are treated as seven chances to find a
            significant value, the threshold rises from {formatClaim(CI95.threshold, 'p2')} to{' '}
            {formatClaim(BONFERRONI.threshold, 'p2')}.
          </p>

          <Toggle
            checked={bonferroni}
            label={`Charge multiplicity (Bonferroni over ${profileBounds.grid.length} grid points)`}
            onChange={setBonferroni}
          />

          <p aria-live="polite" className={styles.readout}>
            <span className={styles.readoutLabel}>Interval upper bound</span>
            <strong data-testid="profile-upper">{formatClaim(active.value, 'p3')}</strong>
            <span className={styles.readoutNote}>
              {active.gridLimited
                ? 'grid edge — no point is rejected'
                : `largest value whose statistic clears ${formatClaim(threshold, 'p2')}`}
            </span>
          </p>

          <p className={styles.prose}>
            The maximum statistic anywhere on the grid is{' '}
            <strong>{formatClaim(active.maxStatistic, 'p2')}</strong>, below both thresholds. That
            is why turning the correction on changes nothing: there is no rejected point for it to
            reject.
          </p>
        </div>

        <LineProfile
          description="Likelihood-ratio statistic for the structural exponent across the tested grid. The horizontal lines are the uncorrected and Bonferroni thresholds; the vertical marker is the shipped value."
          highlightX={[{ x: SHIPPED_ALPHA, label: 'shipped 0.050' }]}
          points={points}
          thresholds={[
            { y: CI95.threshold, label: 'χ²₁ 0.95', style: 'dashed' },
            { y: BONFERRONI.threshold, label: 'Bonferroni', style: 'solid' },
          ]}
          title="Profile likelihood for alpha"
          xFormat="p3"
          xLabel="Structural exponent α"
          yFormat="p2"
          yLabel="Likelihood-ratio statistic"
        />

        <Callout variant="caution">
          The dashed line is the 95% threshold and the profile never reaches it, so no tested value
          is rejected. The shipped exponent of {formatClaim(SHIPPED_ALPHA, 'p3')} is not one of the
          seven grid points — it lies between{' '}
          {formatClaim(bracketLow, 'p3')} and {formatClaim(bracketHigh, 'p3')} —
          so the profile brackets the shipped value without ever testing it, which is exactly why
          the parameter reads as unidentified rather than as estimated.
        </Callout>
      </FigureFrame>

      <Collinearity />

      <div className={styles.block}>
        <h2 className={styles.h2}>Moving the bound</h2>
        <p className={styles.prose}>
          If the exponent is not identified, the floor imposed on it is a modelling decision
          rather than an estimate. Lowering that floor from{' '}
          {formatClaim(SHIPPED_ALPHA, 'p3')} to{' '}
          {formatClaim(0.001, 'p3')} raises in-sample R² from{' '}
          {formatClaim(getClaim('limits.bound.r2.before').value, 'r2')} to{' '}
          {formatClaim(getClaim('limits.bound.r2.after').value, 'r2')}.
        </p>
        <div className={styles.compare}>
          <Card className={styles.compareCard}>
            <p className={styles.compareLabel}>Lower bound {formatClaim(SHIPPED_ALPHA, 'p3')}</p>
            <p className={styles.compareValue}>{formatClaim(getClaim('limits.bound.r2.before').value, 'r2')}</p>
            <p className={styles.compareNote}>shipped constraint</p>
          </Card>
          <Card className={styles.compareCard}>
            <p className={styles.compareLabel}>Lower bound {formatClaim(0.001, 'p3')}</p>
            <p className={styles.compareValue}>{formatClaim(getClaim('limits.bound.r2.after').value, 'r2')}</p>
            <p className={styles.compareNote}>relaxed constraint</p>
          </Card>
        </div>
        <Callout variant="caution">
          The constraint binds: the data prefer α, β → 0. The improvement in fit is produced by
          removing a restriction rather than by finding structure, so it is reported as a
          sensitivity result and not as a better model.
        </Callout>
      </div>

      <div className={styles.block}>
        <h2 className={styles.h2}>Lockbox scope</h2>
        <p className={styles.prose}>
          The lockbox holds {formatClaim(getClaim('limits.lockbox.cells').value, 'int')} cells
          across {formatClaim(getClaim('limits.lockbox.countries').value, 'int')} countries, drawn
          by hashing on the (country, year) pair before any model was fitted. It is a partition,
          not a validation study: {formatClaim(59, 'int')} cells recovered by the covariate
          backfill are out of sample in the cross-validation sense but not blind, because the
          backfill constants were estimated on rows the model had already seen.
        </p>
        <Callout variant="info">
          Lockbox metrics reduce metric peeking within one release cycle. They do not substitute
          for external data, and with {formatClaim(getClaim('limits.lockbox.cells').value, 'int')}{' '}
          cells they cannot resolve a difference as small as the one this paper reports between
          the two functional forms.
        </Callout>
      </div>

      <div className={styles.block}>
        <h2 className={styles.h2}>2006 behaves differently</h2>
        <p className={styles.prose}>
          One survey year sits apart from the rest. The correlation between the outcome and the
          cultural-intensity composite is {formatClaim(outlier2006.constructCorrelation2006, 'p3')} in
          2006 against a median of {formatClaim(outlier2006.constructCorrelationMedian, 'p3')} in the
          other years, and its outcome has both a lower mean and a wider spread.
        </p>
        <div className={styles.compare}>
          <Card className={styles.compareCard}>
            <p className={styles.compareLabel}>Construct correlation, 2006</p>
            <p className={styles.compareValue} data-testid="year-2006-corr">
              {formatClaim(outlier2006.constructCorrelation2006, 'p3')}
            </p>
            <p className={styles.compareNote}>
              {formatClaim(outlier2006.nRows2006, 'int')} rows
            </p>
          </Card>
          <Card className={styles.compareCard}>
            <p className={styles.compareLabel}>Median elsewhere</p>
            <p className={styles.compareValue}>{formatClaim(outlier2006.constructCorrelationMedian, 'p3')}</p>
            <p className={styles.compareNote}>
              {formatClaim(outlier2006.nRowsOther, 'int')} rows
            </p>
          </Card>
        </div>
        <p className={styles.prose}>
          Excluding the year changes the out-of-sample metrics enough that the sensitivity run is
          reported rather than buried: the Tier C country-out R² moves by{' '}
          {formatClaim(Math.abs(outlier2006.tierCDeltaR2), 'p3')}. That is a statement about how much
          one year can move an aggregate on a panel this sparse, not a recommendation to exclude
          it.
        </p>
      </div>
    </section>
  )
}
