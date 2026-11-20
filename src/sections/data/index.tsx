import { useDataContext } from '../../contexts/DataContext'
import { CompareBars, Funnel, Heatmap } from '../../charts'
import { formatClaim } from '../../claims/format'
import { getClaim } from '../../claims/registry'
import { Callout, ErrorState, FigureFrame, SectionHeader, Skeleton } from '../../ui'
import blockers from '../../data/analysis/covariate_blocker_attribution.json'
import { GiniWindowLab } from './GiniWindowLab'
import { ZeroFillLab } from './ZeroFillLab'
import { useLabUrlState } from './useLabUrlState'
import { buildSupportMatrix } from './supportMatrix'
import styles from './Data.module.css'

const blockerGroups = blockers.exposure.map(row => {
  const first = blockers.firstFailure.find(entry => entry.covariate === row.covariate)
  return {
    label: row.label,
    values: [
      { series: 'exposure', value: row.cells, claimId: `data.blocker.${row.covariate}.exposure`, format: 'int' as const },
      ...(first === undefined ? [] : [{ series: 'firstFailure', value: first.cells, format: 'int' as const }]),
    ],
  }
})

export default function DataSection() {
  const { panelData, loading, error } = useDataContext()
  const { giniWindow, zeroFill, setGiniWindow, setZeroFill } = useLabUrlState()
  const support = panelData ? buildSupportMatrix(panelData) : null

  return (
    <section className={styles.section}>
      <SectionHeader
        eyebrow="Data and support"
        title="Data & Support"
        lede="The data pipeline moves from respondent-level inputs to a country-year estimation panel; the support map shows which years are observed for each country."
      />

      <FigureFrame
        boundary="The stages use different units, so the labels carry the counts; their bar lengths are not cross-unit comparisons."
        method="Counts are taken from the construct audit and canonical panel sources."
        number="1.1"
        scope="442,026 respondents, 305 scanned country-years, 287 computable outcome cells, and 207 estimation rows."
        sources={['wvs_construct_audit.json', 'panel_canonical_v2.csv']}
        title="From respondents to the estimation panel"
      >
        <Funnel
          description="Four linked counts in distinct units: respondents, scanned country-years, computable outcome cells, and complete estimation rows."
          steps={[
            { label: 'Respondents scanned', claimId: 'audit.respondents', unit: 'respondents' },
            { label: 'Scanned country-years', claimId: 'audit.countryYears', unit: 'country-years' },
            { label: 'Outcome cells', claimId: 'audit.Z.cells', unit: 'outcome cells' },
            { label: 'Estimation rows', claimId: 'data.panelRows', unit: 'complete-case rows' },
          ]}
          title="Respondent-to-panel counts"
        />
      </FigureFrame>

      <FigureFrame
        boundary="Exposure counts overlap: a country-year short of both inequality and education appears in both bars, so the bars do not sum to the at-risk frame. They describe how many cells each driver touches, not a division of those cells."
        method="Derived by scripts/generate_covariate_blockers.ts from the raw construct and macro extracts, walking the same stage order as the panel builder. The disjoint series assigns each cell to its first missing driver under the builder's X,Y,T,E,R,M order."
        number="1.2"
        scope={`${formatClaim(getClaim('data.blockers.atRisk').value, 'int')} country-years reach the covariate stage short of at least one driver; ${formatClaim(getClaim('data.blockers.rescued').value, 'int')} are rescued by the covariate backfill and ${formatClaim(getClaim('data.blockers.lost').value, 'int')} stay lost.`}
        sources={['covariate_blocker_attribution.json']}
        title="Which driver is short, and how often"
      >
        <CompareBars
          description="Two series per driver. Exposure counts every cell missing that driver and overlaps with the other drivers. First failure counts each cell once, against the first driver it is missing, and partitions the at-risk frame."
          groups={blockerGroups}
          series={[
            { key: 'exposure', label: 'Cells short of this driver (overlapping)', color: 'var(--accent)' },
            { key: 'firstFailure', label: 'Cells attributed on first failure (disjoint)', color: 'var(--linear)' },
          ]}
          title="Covariate blocker counts"
        />
        <Callout variant="caution">
          The overlapping bars are the ones the manuscript quotes. Because a cell can be short of more than one
          driver, they exceed the {formatClaim(getClaim('data.blockers.atRisk').value, 'int')} affected cells and must
          not be read as a partition; the disjoint series is what sums to that total.
        </Callout>
      </FigureFrame>

      <FigureFrame
        boundary="A blank cell means that country-year is not present in the canonical estimation panel; it does not imply a zero outcome."
        method="Cells are derived from DataContext panel rows; countries are ordered by descending row count, with ISO3 as the tie-break."
        number="1.3"
        scope={support ? `${support.countries.length} countries × ${support.years.length} calendar years in the canonical panel.` : 'Canonical country-year estimation support.'}
        sources={['panel_canonical_v2.csv']}
        title="Country × year estimation support"
      >
        {loading ? (
          <Skeleton aria-label="Loading canonical country-year support" className={styles.loading} />
        ) : error ? (
          <ErrorState artifact="panel_canonical_v2.csv" message={error} />
        ) : !support || support.countries.length === 0 ? (
          <ErrorState artifact="panel_canonical_v2.csv" message="The canonical panel has no country-year rows to plot." />
        ) : (
          <Heatmap
            cols={support.years.map(String)}
            description="Each row is an ISO3 country code sorted by its number of estimation rows. A filled cell is an observed country-year; a hatched cell is absent from the canonical panel."
            legendLabel="Filled = estimation row · hatched = no row"
            rows={support.countries.map(country => country.iso3)}
            scale="viridis"
            title="Canonical panel support by country and year"
            valueLabel={() => 'Observed estimation row'}
            values={support.values}
          />
        )}
      </FigureFrame>

      <SectionHeader
        eyebrow="Decision labs"
        title="Two choices the panel depends on"
        lede="Both are inferences rather than measurements: how stale a borrowed inequality value may be, and whether absence from the disaster file means zero. Each lab shows what changes when the choice changes, and what does not."
      />

      <GiniWindowLab onChange={setGiniWindow} value={giniWindow as '0' | '1' | '2' | '3' | '5'} />
      <ZeroFillLab onChange={setZeroFill} value={zeroFill} />
    </section>
  )
}
