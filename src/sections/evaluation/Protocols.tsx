import { useCallback, useEffect, useState } from 'react'
import { CompareBars, DistStrip, LineProfile } from '../../charts'
import { formatClaim } from '../../claims/format'
import { getClaim } from '../../claims/registry'
import {
  coverageByProtocol,
  kfoldFoldSeries,
  looFoldSeries,
  nominalCoverage,
  rollingSeries,
  seedDeltas,
} from '../../claims/selectors/protocols'
import { Badge, Callout, Card, DataTable, SegmentedControl, Tabs } from '../../ui'
import ladder from '../../data/analysis/model_ladder_metrics.json'
import styles from './Protocols.module.css'

/**
 * The four evaluation protocols, and the tiers under each.
 *
 * They are tabbed rather than stacked because they answer different questions and their
 * numbers are not comparable: grouped k-fold is the primary held-out protocol, country-out
 * is a spatial stress test whose per-fold median is degenerate, rolling-origin is a temporal
 * scope diagnostic, and coverage asks how often an interval contains the truth. Putting them
 * side by side in one figure would invite a reader to average four answers to four questions.
 */
type Tab = 'kfold' | 'loo' | 'rolling' | 'coverage'

const TAB_ITEMS = [
  { id: 'kfold', label: 'Grouped k-fold (primary)' },
  { id: 'loo', label: 'Leave-one-country-out (stress test)' },
  { id: 'rolling', label: 'Rolling origin (temporal scope)' },
  { id: 'coverage', label: 'Coverage' },
] as const

const TIERS = ['A', 'B', 'C'] as const
/** Flattened once: `DataColumn.key` must name a row field, and the metrics nest. */
const inSampleRows = ladder.tiers.map((tier) => ({
  tier: tier.tier,
  exploratory: tier.exploratory,
  parameterCount: tier.parameterCount,
  r2: tier.trainMetrics.r2,
  corr: tier.trainMetrics.corr,
  mae: tier.trainMetrics.mae,
  rmse: tier.trainMetrics.rmse,
  bias: tier.trainMetrics.bias,
}))

const TIER_COLORS: Record<string, string> = {
  A: 'var(--tier-a)',
  B: 'var(--tier-b)',
  C: 'var(--tier-c)',
}

/** Tier C is exploratory in every view; the badge is not decoration. */
function TierBadge({ tier, exploratory }: { tier: string; exploratory: boolean }) {
  return (
    <span className={styles.tierBadge}>
      <span className={styles.tierName}>Tier {tier}</span>
      {exploratory && <Badge variant="exploratory">exploratory</Badge>}
    </span>
  )
}

const TAB_KEY = 'tab'
const SEED_KEY = 'seed'
const VALID_TABS: Tab[] = ['kfold', 'loo', 'rolling', 'coverage']

/**
 * `tab` and `seed` in the query string.
 *
 * Both are part of the argument, not decoration: a reader who has found the seed where Tier C
 * loses must be able to hand that view to someone. Only these two keys are written, so a claim
 * deep link or a panel choice elsewhere survives.
 */
function useProtocolUrl(): [Tab, (next: Tab) => void] {
  const read = (): Tab => {
    if (typeof window === 'undefined') return 'kfold'
    const raw = new URLSearchParams(window.location.search).get(TAB_KEY)
    return VALID_TABS.includes(raw as Tab) ? (raw as Tab) : 'kfold'
  }
  const [tab, setTabState] = useState<Tab>(read)

  useEffect(() => {
    const onPop = () => setTabState(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const setTab = useCallback((next: Tab) => {
    const url = new URL(window.location.href)
    if (next === 'kfold') url.searchParams.delete(TAB_KEY)
    else url.searchParams.set(TAB_KEY, next)
    window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
    setTabState(next)
  }, [])

  return [tab, setTab]
}

export default function ProtocolsSection({ initialTab }: { initialTab?: Tab }) {
  const [urlTab, setUrlTab] = useProtocolUrl()
  const tab = initialTab ?? urlTab
  const setTab = setUrlTab

  return (
    <div className={styles.wrap}>
      <Tabs
        activeId={tab}
        label="Evaluation protocol"
        onActiveChange={(next) => setTab(next as Tab)}
        tabs={[
          { id: 'kfold', label: TAB_ITEMS[0].label, content: <KfoldView /> },
          { id: 'loo', label: TAB_ITEMS[1].label, content: <LooView /> },
          { id: 'rolling', label: TAB_ITEMS[2].label, content: <RollingView /> },
          { id: 'coverage', label: TAB_ITEMS[3].label, content: <CoverageView /> },
        ]}
      />

      <section className={styles.inSample}>
        <h2 className={styles.h2}>In-sample context</h2>
        <p className={styles.prose}>
          The ladder's training fit is reported for context only. It is where complexity looks
          best and where the reversal under validation is hardest to see, which is why the
          protocol tabs come first.
        </p>
        <DataTable
          caption="In-sample fit by tier on the canonical panel"
          columns={[
            {
              key: 'tier',
              header: 'Tier',
              render: (row: (typeof inSampleRows)[number]) => (
                <TierBadge exploratory={row.exploratory} tier={row.tier} />
              ),
            },
            { key: 'parameterCount', header: 'Parameters', align: 'right' },
            { key: 'r2', header: 'R²', align: 'right', render: (row: (typeof inSampleRows)[number]) => formatClaim(row.r2, 'r2') },
            { key: 'corr', header: 'Corr', align: 'right', render: (row: (typeof inSampleRows)[number]) => formatClaim(row.corr, 'r2') },
            { key: 'mae', header: 'MAE', align: 'right', render: (row: (typeof inSampleRows)[number]) => formatClaim(row.mae, 'r2') },
            { key: 'rmse', header: 'RMSE', align: 'right', render: (row: (typeof inSampleRows)[number]) => formatClaim(row.rmse, 'r2') },
            { key: 'bias', header: 'Bias', align: 'right', render: (row: (typeof inSampleRows)[number]) => formatClaim(row.bias, 'signed2') },
          ]}
          rowAttributes={(row) => ({ 'data-tier': row.tier })}
          rows={inSampleRows}
        />
        <Callout variant="caution">
          Tier C's in-sample R² is the highest of the three and its held-out R² is not. Eleven
          extra parameters reorder the tiers under validation, which is why C is exploratory and
          every C view in this section carries the badge.
        </Callout>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ k-fold */

/**
 * Seed choice, mirrored into `?seed=`.
 *
 * Kept local to the k-fold view rather than hoisted: the seed only means something for that
 * protocol, and a global seed control would imply the other three tabs have draws.
 */
function useSeedParam(): [string, (next: string) => void] {
  const read = (): string => {
    if (typeof window === 'undefined') return String(seedDeltas[0]?.seed ?? '')
    const raw = new URLSearchParams(window.location.search).get(SEED_KEY)
    return raw !== null && seedDeltas.some((entry) => String(entry.seed) === raw)
      ? raw
      : String(seedDeltas[0]?.seed ?? '')
  }
  const [seed, setSeedState] = useState<string>(read)

  useEffect(() => {
    const onPop = () => setSeedState(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const setSeed = useCallback((next: string) => {
    const url = new URL(window.location.href)
    if (next === String(seedDeltas[0]?.seed ?? '')) url.searchParams.delete(SEED_KEY)
    else url.searchParams.set(SEED_KEY, next)
    window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
    setSeedState(next)
  }, [])

  return [seed, setSeed]
}

function KfoldView() {
  const [seed, setSeed] = useSeedParam()
  const selected = seedDeltas.find((entry) => String(entry.seed) === seed) ?? seedDeltas[0]
  const cFails = getClaim('eval.seeds.cFails').value
  const total = seedDeltas.length

  return (
    <div className={styles.panel}>
      <div className={styles.strip}>
        <DistStrip
          description="Per-fold held-out R² for the three tiers across the grouped folds. Tier C sits below B in the median even though it leads in sample."
          reference={{ value: 0, label: 'R² = 0' }}
          series={TIERS.map((tier) => ({
            key: tier,
            label: `Tier ${tier}`,
            color: TIER_COLORS[tier],
            values: kfoldFoldSeries(tier),
          }))}
          title="Grouped k-fold distribution by tier"
        />
      </div>

      <div className={styles.tierRow}>
        {TIERS.map((tier) => (
          <Card className={styles.tierCard} key={tier}>
            <TierBadge exploratory={tier === 'C'} tier={tier} />
            <p className={styles.tierMedian}>
              <span className={styles.tierValue}>
                {formatClaim(getClaim(`eval.kfold.${tier}.median`).value, 'r2')}
              </span>
              <span className={styles.tierLabel}>median held-out R²</span>
            </p>
          </Card>
        ))}
      </div>

      <div className={styles.lab}>
        <h3 className={styles.h3}>Decision Lab 5 — seed sensitivity</h3>
        <p className={styles.prose}>
          Each repeat draws its own grouped folds. The question is not whether Tier C beats Tier B
          on average but how often it does, because a ranking that reverses across seeds is not a
          ranking.
        </p>

        <SegmentedControl
          label="Repeat seed"
          onChange={setSeed}
          options={seedDeltas.map((entry) => ({
            // The full seed is unreadable in a control; the offset identifies it and the
            // readout below prints the whole number.
            value: String(entry.seed),
            label: `…${String(entry.seed).slice(-2)}`,
          }))}
          value={String(selected?.seed ?? '')}
        />

        {selected && (
          <p aria-live="polite" className={styles.seedReadout}>
            <span className={styles.seedLabel}>Seed {selected.seed}</span>
            <strong data-testid="seed-delta">{formatClaim(selected.delta, 'signed3')}</strong>
            <span className={styles.seedVerdict}>
              {selected.cAhead ? 'Tier C ahead of B' : 'Tier C behind B'}
            </span>
          </p>
        )}

        <p className={styles.prose}>
          <strong data-testid="seed-fails">{formatClaim(cFails, 'int')}</strong> of{' '}
          {formatClaim(total, 'int')} seeds put Tier C behind Tier B. A majority, which is what
          makes C exploratory rather than merely noisy: the extra eleven parameters help the
          training fit and cost transfer on most draws.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------- leave-one-country-out */

function LooView() {
  const perFold = getClaim('eval.loo.A.median').value
  const pooled = getClaim('eval.bounded.pooledLoo').value

  return (
    <div className={styles.panel}>
      <div className={styles.compare}>
        <Card className={styles.compareCard}>
          <p className={styles.compareLabel}>Per-fold median R²</p>
          <p className={styles.compareValue}>{formatClaim(perFold, 'r2')}</p>
          <p className={styles.compareNote}>
            Degenerate: most folds hold one or two rows, so the variance of the held-out
            observations is close to zero and R² is either undefined or meaningless.
          </p>
        </Card>
        <Card className={styles.compareCard}>
          <p className={styles.compareLabel}>Pooled R²</p>
          <p className={styles.compareValue}>{formatClaim(pooled, 'r2')}</p>
          <p className={styles.compareNote}>
            Every row predicted exactly once by a model that never saw its country. This is the
            meaningful country-out number.
          </p>
        </Card>
      </div>

      <div className={styles.strip}>
        <DistStrip
          description="Per-fold R² under leave-one-country-out. The long left tail is folds with one or two held-out rows, where the ratio of explained to total variance is unstable rather than informative."
          reference={{ value: 0, label: 'R² = 0' }}
          series={TIERS.map((tier) => ({
            key: tier,
            label: `Tier ${tier}`,
            color: TIER_COLORS[tier],
            values: looFoldSeries(tier),
          }))}
          title="Country-out per-fold distribution"
        />
      </div>

      <Callout variant="caution">
        The spread here is a variance ratio computed on one to four points. It is not a
        distribution of predictive skill, and the per-fold median should not be quoted as one —
        which is why the pooled figure is shown beside it rather than instead of it.
      </Callout>
    </div>
  )
}

/* ------------------------------------------------ rolling origin */

function RollingView() {
  const series = rollingSeries('A')
  const points = series.map((point) => ({ x: point.year, y: point.rmse }))

  return (
    <div className={styles.panel}>
      <div className={styles.strip}>
        <LineProfile
          description="Out-of-sample RMSE for each rolling-origin fold, indexed by the test year. Each fold trains on every year up to its test year, so later folds have more training data than earlier ones."
          points={points}
          title="Rolling-origin RMSE by test year"
          xFormat="int"
          xLabel="Test year"
          yLabel="Out-of-sample RMSE"
        />
      </div>
      <p className={styles.prose}>
        Rolling origin answers a temporal question rather than a spatial one: would a model
        trained on the past have predicted the next wave? The folds are ordered, not independent,
        so the line is a trajectory and not a sample.
      </p>
      <Callout variant="info">
        This protocol is a <em>temporal scope diagnostic</em>. It does not feed the headline
        out-of-sample claim, which rests on the grouped k-fold median.
      </Callout>
    </div>
  )
}

/* ---------------------------------------------------- coverage */

function CoverageView() {
  const protocols = ['country_out', 'rolling_origin'] as const
  const groups = TIERS.map((tier) => ({
    label: `Tier ${tier}`,
    values: protocols.map((protocol) => ({
      series: protocol,
      value: coverageByProtocol[protocol]?.[tier]?.meanCoverage95 ?? 0,
      claimId: `eval.coverage.${protocol}.${tier}`,
      format: 'pct1' as const,
    })),
  }))

  return (
    <div className={styles.panel}>
      <div className={styles.strip}>
        <CompareBars
          description="Observed 95% interval coverage by tier under both protocols. The nominal level is 0.95; bars below it mean the intervals are too narrow for the errors they are meant to contain."
          domain={[0.75, 1]}
          format="pct1"
          groups={groups}
          series={[
            { key: 'country_out', label: 'Country-out', color: 'var(--tier-b)' },
            { key: 'rolling_origin', label: 'Rolling origin', color: 'var(--tier-c)' },
          ]}
          title="Observed coverage against a nominal 95%"
        />
      </div>
      <p className={styles.prose}>
        Nominal coverage is {formatClaim(nominalCoverage, 'pct1')}. Both protocols fall short of
        it, rolling origin more so, and the shortfall is the same in every tier — the intervals
        are too narrow for the errors they are meant to contain, and adding parameters does not
        fix it.
      </p>
      <Callout variant="caution">
        Under-coverage is a property of the interval construction, not of the point predictions.
        The ranking of tiers on R² and their ranking on coverage need not agree, and here they do
        not.
      </Callout>
    </div>
  )
}
