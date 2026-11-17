import { Badge, Callout, Card, DataTable, SectionHeader } from '../../ui'
import { formatClaim } from '../../claims/format'
import { getClaim } from '../../claims/registry'
import { signDiagnosticsData } from '../../claims/selectors/model'
import modelComplexity from '../../data/analysis/model_complexity_support.json'
import { MathBlock } from './MathBlock'
import { TermMap } from './TermMap'
import styles from './Model.module.css'

/**
 * The model: its equations, the terms that entered the field, and the coefficients with an
 * honest "identified?" column.
 *
 * The identification column is the part that takes a position. A coefficient printed without
 * one invites the reader to interpret a sign that the data cannot support — on this panel only
 * two of six estimated terms have a bootstrap interval excluding zero, and the media channel's
 * marginal association reverses sign between panels while its partial coefficient does not.
 * Both facts are measured (`sign_diagnostics.json`) rather than asserted.
 */
type Term = {
  key: string
  label: string
  coefficientClaim: string
  note?: string
  /** Placeholder fields: DataColumn keys must name a row field, and these columns are
      rendered from the claim registry rather than read from the row. */
  coefficient?: number
  interval?: string
  identified?: boolean
}

const TERMS: Term[] = [
  { key: 'M', label: 'Media environment' },
  { key: 'T', label: 'Trauma exposure' },
  { key: 'E', label: 'Education capacity' },
  { key: 'R', label: 'Welfare capacity' },
  { key: 'tr', label: 'Trauma × welfare', note: 'interaction' },
  { key: 'yr', label: 'Inequality × welfare', note: 'interaction' },
].map((entry) => ({ ...entry, coefficientClaim: `model.c.${entry.key}` }))

const interval = (key: string) => ({
  lo: getClaim(`model.bootstrap.c_${key}.lo`).value,
  hi: getClaim(`model.bootstrap.c_${key}.hi`).value,
})

const isIdentified = (key: string): boolean => {
  const { lo, hi } = interval(key)
  return lo > 0 || hi < 0
}

export default function ModelSection() {
  const identified = TERMS.filter((term) => isIdentified(term.key))
  const totalParams = getClaim('model.params').value

  return (
    <section className={styles.section}>
      <SectionHeader
        eyebrow="Model specification"
        title="The Model"
        lede="A bounded response surface whose field is estimated from four surviving contextual channels, six coefficients in total, on a panel whose design supports the interpretation."
      />

      <div className={styles.equations}>
        <p className={styles.eqLede}>
          The model is a saturating map of a structural product lifted by a contextual field.
          The saturation makes the response bounded by construction; the field is what varies
          with context.
        </p>
        <MathBlock display label="Structural product with contextual field" tex="S = X^{\alpha}\,Y^{\beta}\,e^{\Phi}, \qquad \Phi = \phi_0 + \sum_j c_j m_j + \sum_k c_k z_k" />
        <MathBlock display label="Saturation map" tex="Z = \frac{S}{S + k}" />
        <MathBlock display label="Equivalent logit form" tex="\operatorname{logit} Z = \Phi + \alpha \log X + \beta \log Y - \log k" />
        <MathBlock display label="Logistic form" tex="Z = \sigma\!\left(\Phi + s\right), \qquad s = \alpha \log X + \beta \log Y - \log k" />
        <Callout variant="caution">
          The four forms are the same model, not four models. Saturation of <em>S</em> is exactly
          the logistic function of the log-odds, which is why the paper can move between them
          without re-estimating anything — and why a claim about one form is a claim about all
          four.
        </Callout>
      </div>

      <div className={styles.block}>
        <h2 className={styles.h2}>What enters the field</h2>
        <p className={styles.prose}>
          Eight channels were proposed. Four were estimated; four were withdrawn in the construct
          audit and never enter <span className={styles.inlineMath}><MathBlock tex="\Phi" /></span>{' '}
          here. That distinction is the whole point of the map below: not-estimated is a different
          statement from small-effect.
        </p>
        <TermMap />
      </div>

      <div className={styles.block}>
        {/* The table number is a label, not a measurement. Rendering it as a figure
            number (the same treatment Figure 1.1 gets) keeps it out of the prose that the
            rendered-number audit reads, instead of relying on some unrelated artifact
            happening to contain "4.1". */}
        <p className={styles.tableNumber} data-scale-label="">Table 4.1</p>
        <h2 className={styles.h2}>Coefficients</h2>
        <p className={styles.prose}>
          A sign is informative only if the quantity it multiplies has a stable referent. The
          interval column reports the 95% country-level cluster bootstrap, and the identified
          column follows from it: an interval spanning zero does not support a direction.
        </p>
        <DataTable
          caption="Estimated coefficients with their bootstrap intervals and identification status"
          columns={[
            { key: 'label', header: 'Term', sortable: true },
            {
              key: 'coefficient',
              header: 'Coefficient',
              align: 'right',
              render: (row: Term) => <span className="model-coefficient">{formatClaim(getClaim(row.coefficientClaim).value, 'signed2')}</span>,
            },
            {
              key: 'interval',
              header: '95% interval',
              align: 'right',
              render: (row: Term) => {
                const { lo, hi } = interval(row.key)
                return <span className="model-interval">[{lo.toFixed(2)}, {hi.toFixed(2)}]</span>
              },
            },
            {
              key: 'identified',
              header: 'Identified?',
              render: (row: Term) => {
                if (isIdentified(row.key)) return <Badge variant="pass">identified</Badge>
                return (
                  <span className="model-not-identified">
                    <Badge variant="unidentified">not identified</Badge>
                    {row.key === 'M' && <span className={styles.termNote}>interval includes zero</span>}
                  </span>
                )
              },
            },
          ]}
          rowAttributes={(row) => ({ 'data-term': row.key })}
          rows={TERMS}
          stickyFirst
        />

        <Callout variant="info">
          <strong>The M row, precisely.</strong> {signDiagnosticsData.finding.statement}
          {' '}The two numbers are different quantities, and the prompt&rsquo;s shorthand
          &ldquo;sign flipped across panels&rdquo; is true only of the first. Neither is a finding,
          because the partial interval includes zero.
        </Callout>
      </div>

      <div className={styles.block}>
        <h2 className={styles.h2}>How many specifications were tried</h2>
        <p className={styles.prose}>
          Complexity was not chosen after seeing the fit. Four specifications were fixed in
          advance, and the parameter counts below are the reason Tier C is exploratory: at
          {' '}{formatClaim(modelComplexity.complexityByTier[2].supportPerParameter, 'p3')} observations per
          parameter it is thin, while Tier A at
          {' '}{formatClaim(modelComplexity.complexityByTier[0].supportPerParameter, 'p3')} is not.
        </p>
        <div className={styles.specGrid}>
          {modelComplexity.complexityByTier.map((tier) => (
            <Card className={styles.specCard} key={tier.tier}>
              <div className={styles.specHead}>
                <span className={styles.specTier}>Tier {tier.tier}</span>
                <Badge variant={tier.exploratory ? 'exploratory' : 'neutral'}>
                  {tier.exploratory ? 'exploratory' : 'primary'}
                </Badge>
              </div>
              <p className={styles.specParams}>
                <span className={styles.specNumber}>{tier.parameterCount}</span>
                {' '}parameters
              </p>
              <p className={styles.specSupport}>
                {formatClaim(tier.supportPerParameter, 'p3')} observations per parameter
              </p>
            </Card>
          ))}
          <Card className={styles.specCard}>
            <div className={styles.specHead}>
              <span className={styles.specTier}>Linear baseline</span>
              <Badge variant="neutral">comparator</Badge>
            </div>
            <p className={styles.specParams}>
              <span className={styles.specNumber}>{formatClaim(totalParams - 4, 'int')}</span>
              {' '}parameters
            </p>
            <p className={styles.specSupport}>
              the same six main effects, no structural exponents, no saturation — the comparison
              the paper reports as a near-tie.
            </p>
          </Card>
        </div>
      </div>

      <div className={styles.block}>
        <h2 className={styles.h2}>Reading the signs</h2>
        <p className={styles.prose}>
          Because the outcome is bounded, a coefficient&rsquo;s sign propagates to <em>Z</em> with
          state-dependent force: differentiating the saturation map gives
          {' '}<span className={styles.inlineMath}><MathBlock tex="\partial Z/\partial \Phi = Z(1-Z)" /></span>, so
          {' '}<span className={styles.inlineMath}><MathBlock tex="\partial Z/\partial j_{\mathrm{std}} = c_j\,Z(1-Z)" /></span>.
          The direction is fixed by the sign of the coefficient; the magnitude peaks near the
          middle of the range and vanishes at both ends.
        </p>
        <p className={styles.prose}>
          Two qualifications bound what that means here. Interactions and curvature make a
          marginal effect state-dependent, so a sign that holds at one configuration need not hold
          at another. And a sign computed on a construct that has not been shown to measure
          anything is a sign computed on an average of discordant items — reliability bounds
          interpretation before geometry does, which is why four channels are absent from the field
          rather than present with small coefficients.
        </p>
        <p className={styles.prose}>
          The directional vocabulary is therefore applied only to the four surviving channels, and
          only conditionally. {identified.length === 2 ? 'Two' : String(identified.length)} of the six
          estimated terms have intervals excluding zero
          ({identified.map((term) => term.label.toLowerCase()).join(' and ')}). For the other four,
          the interval spans zero and no direction is claimed — including the media channel, whose
          association with the outcome reverses between panels while its partial coefficient does
          not.
        </p>
        <Callout variant="caution">
          These are associations under a fixed, support-constrained design. Nothing in this section
          is a causal claim, and the labels that the earlier literature attached to these channels —
          the &ldquo;amplifier&rdquo; and &ldquo;suppressor&rdquo; vocabulary — are quoted here as
          prior framing rather than adopted as a finding.
        </Callout>
      </div>
    </section>
  )
}
