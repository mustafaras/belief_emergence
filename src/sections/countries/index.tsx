import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatClaim } from '../../claims/format'
import { selectCountries } from '../../claims/selectors/countries'
import { Badge, Callout, DataTable, SectionHeader, SegmentedControl } from '../../ui'
import observedCsv from '../../data/analysis/observed_vs_predicted_authoritative.csv?raw'
import { CountryDrawer, type CountryYear } from './CountryDrawer'
import styles from './Countries.module.css'

/**
 * The country table, its filter, and the per-country drawer.
 *
 * Withdrawn channels are absent by construction: `selectCountries` reads
 * `preset_country_alignment.json`, which was computed from the retained covariates only. There
 * is no column for C, D, or S because there is no estimate to put in one.
 */
type Verdict = 'all' | 'good' | 'acceptable' | 'poor'

const VERDICT_OPTIONS: Array<{ value: Verdict; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'good', label: 'Good' },
  { value: 'acceptable', label: 'Acceptable' },
  { value: 'poor', label: 'Poor' },
]

/** Parse the observed/predicted CSV once. It is 207 rows, so a static import is cheap. */
const perCountryYears = ((): Map<string, CountryYear[]> => {
  const [header, ...lines] = observedCsv.trim().split(/\r?\n/)
  const columns = header.split(',').map((name) => name.trim())
  const index = (name: string) => columns.indexOf(name)
  const byCountry = new Map<string, CountryYear[]>()
  for (const line of lines) {
    const cells = line.split(',')
    const iso3 = cells[index('country')]?.trim()
    if (!iso3) continue
    const point: CountryYear = {
      year: Number(cells[index('year')]),
      observed: Number(cells[index('observed_Z')]),
      predicted: Number(cells[index('predicted_Z')]),
      residual: Number(cells[index('residual')]),
    }
    if (!Number.isFinite(point.year) || !Number.isFinite(point.observed)) continue
    byCountry.set(iso3, [...(byCountry.get(iso3) ?? []), point])
  }
  for (const list of byCountry.values()) list.sort((a, b) => a.year - b.year)
  return byCountry
})()

const ISO_KEY = 'iso'
const QUERY_KEY = 'q'

/**
 * `iso` and `q` in the query string.
 *
 * The open country and the search term are part of the view: `?v=countries&iso=EST` has to
 * reopen Estonia's drawer, or a link to a specific country lands on a table. Only these two
 * keys are written.
 */
function useCountriesUrl(): {
  iso: string | null
  query: string
  setIso: (next: string | null) => void
  setQuery: (next: string) => void
} {
  const read = () => {
    if (typeof window === 'undefined') return { iso: null as string | null, query: '' }
    const params = new URLSearchParams(window.location.search)
    return { iso: params.get(ISO_KEY), query: params.get(QUERY_KEY) ?? '' }
  }
  const [state, setState] = useState(read)

  useEffect(() => {
    const onPop = () => setState(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const write = useCallback((next: { iso: string | null; query: string }) => {
    const url = new URL(window.location.href)
    if (next.iso === null) url.searchParams.delete(ISO_KEY)
    else url.searchParams.set(ISO_KEY, next.iso)
    if (next.query === '') url.searchParams.delete(QUERY_KEY)
    else url.searchParams.set(QUERY_KEY, next.query)
    window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
    setState(next)
  }, [])

  return {
    iso: state.iso,
    query: state.query,
    setIso: (iso) => write({ iso, query: state.query }),
    setQuery: (query) => write({ iso: state.iso, query }),
  }
}

export default function CountriesSection() {
  const { iso, query, setIso, setQuery } = useCountriesUrl()
  const [verdict, setVerdict] = useState<Verdict>('all')

  const countries = useMemo(() => selectCountries(), [])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return countries.filter((country) => {
      if (verdict !== 'all' && country.verdict !== verdict) return false
      if (needle === '') return true
      return country.name.toLowerCase().includes(needle) || country.iso3.toLowerCase().includes(needle)
    })
  }, [countries, query, verdict])

  const open = iso === null ? null : countries.find((country) => country.iso3 === iso) ?? null

  return (
    <section className={styles.section}>
      <SectionHeader
        eyebrow="Country alignment"
        title="Countries"
        lede="Year-averaged observed and predicted values show where the model aligns and where support is thin."
      />

      <div className={styles.controls}>
        <label className={styles.search}>
          <span className={styles.searchLabel}>Search</span>
          <input
            className={styles.searchInput}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Country name or ISO3"
            type="search"
            value={query}
          />
        </label>
        <SegmentedControl
          label="Filter by fit verdict"
          onChange={(next) => setVerdict(next as Verdict)}
          options={VERDICT_OPTIONS}
          value={verdict}
        />
      </div>

      <p aria-live="polite" className={styles.count}>
        <strong data-testid="country-count">{filtered.length}</strong> of {countries.length} countries
      </p>

      <DataTable
        caption="Country-level alignment between observed and predicted belief intensity"
        columns={[
          {
            key: 'name',
            header: 'Country',
            sortable: true,
            render: (row: (typeof countries)[number]) => (
              <CountryDrawer
                iso3={row.iso3}
                mae={row.mae}
                name={row.name}
                onOpenChange={(next) => setIso(next ? row.iso3 : null)}
                open={open?.iso3 === row.iso3}
                verdict={row.verdict}
                years={perCountryYears.get(row.iso3) ?? []}
              />
            ),
          },
          { key: 'iso3', header: 'ISO3' },
          { key: 'years', header: 'Years', align: 'right', sortable: true },
          {
            key: 'zObs',
            header: 'Z̄ observed',
            align: 'right',
            sortable: true,
            render: (row: (typeof countries)[number]) => formatClaim(row.zObs, 'p3'),
          },
          {
            key: 'zPred',
            header: 'Ẑ predicted',
            align: 'right',
            sortable: true,
            render: (row: (typeof countries)[number]) => formatClaim(row.zPred, 'p3'),
          },
          {
            key: 'mae',
            header: 'MAE',
            align: 'right',
            sortable: true,
            render: (row: (typeof countries)[number]) => formatClaim(row.mae, 'p3'),
          },
          {
            key: 'verdict',
            header: 'Verdict',
            render: (row: (typeof countries)[number]) => (
              <Badge
                variant={row.verdict === 'good' ? 'pass' : row.verdict === 'acceptable' ? 'neutral' : 'withdrawn'}
              >
                {row.verdict}
              </Badge>
            ),
          },
        ]}
        rowAttributes={(row) => ({ 'data-country': row.iso3 })}
        rows={filtered}
        stickyFirst
      />

      <Callout variant="info">
        The verdict thresholds are mean-absolute-error bands set in the artifact:{' '}
        {formatClaim(0.1, 'p2')} for good and {formatClaim(0.2, 'p2')} for acceptable. They describe
        how closely the fitted surface tracks each country&apos;s average, not whether the country
        is well measured — a country with two survey years can be classified confidently on very
        little evidence.
      </Callout>
    </section>
  )
}
