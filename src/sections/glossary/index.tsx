import { useMemo, useState } from 'react'
import { DataTable, SectionHeader, Tabs } from '../../ui'
import { MathBlock } from '../model/MathBlock'
import glossaryArtifact from '../../data/analysis/notation_glossary.json'
import { GLOSSARY, regimeTex, type GlossaryEntry, type GlossarySection } from './glossaryData'
import styles from './Glossary.module.css'

/**
 * The notation, searchable.
 *
 * Every symbol in the paper appears here with its type, its source, and the window the model
 * was fitted over. That last column is the one a reader needs and the one a prose appendix
 * usually omits: a coefficient is only meaningful inside the range the data actually covers.
 *
 * The table is generated from `notation_glossary.json`; nothing on this page is transcribed.
 */
export default function GlossarySection() {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return GLOSSARY
    return GLOSSARY.filter((entry) =>
      entry.symbol.toLowerCase().includes(needle) ||
      entry.name.toLowerCase().includes(needle) ||
      entry.definition.toLowerCase().includes(needle) ||
      entry.source.toLowerCase().includes(needle))
  }, [query])

  const counts = useMemo(() => {
    const tally = new Map<GlossarySection, number>()
    for (const entry of GLOSSARY) tally.set(entry.section, (tally.get(entry.section) ?? 0) + 1)
    return tally
  }, [])

  return (
    <section>
      <SectionHeader
        eyebrow="NOTATION"
        lede="Every symbol the paper uses, its source, and the window it was fitted over. Search by symbol, name or source."
        title="Notation"
      />

      <p className={styles.lede}>
        {GLOSSARY.length} symbols across {counts.size} groups. Generated from{' '}
        <code>notation_glossary.json</code> (schema {glossaryArtifact.schema}), which also feeds
        supplementary tables {glossaryArtifact.supplementary_table_mapping.S15.match(/S\d+/)?.[0] ?? 'S15'} and{' '}
        {glossaryArtifact.supplementary_table_mapping.S16.match(/S\d+/)?.[0] ?? 'S16'}.
      </p>

      <label className={styles.filter}>
        <span>Search notation</span>
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="symbol, name, definition or source"
          type="search"
          value={query}
        />
      </label>

      <Tabs
        label="Notation groups"
        tabs={[
          { id: 'all', label: `All (${GLOSSARY.length})`, content: <NotationTable entries={filtered} /> },
          ...ORDERED_SECTIONS.map((section) => ({
            id: section,
            label: `${section} (${counts.get(section) ?? 0})`,
            content: <NotationTable entries={filtered.filter((entry) => entry.section === section)} />,
          })),
        ]}
      />

      <section className={styles.section}>
        <h2 className={styles.h2}>Regimes</h2>
        <p className={styles.lede}>
          The five regimes the paper names, with the definition that decides membership and the
          support the panel actually provides for each. A regime with thin support is stated as
          thin support rather than described as a finding.
        </p>
        <ul className={styles.regimes}>
          {glossaryArtifact.regime_definitions.map((regime) => (
            <li className={styles.regime} key={regime.label}>
              <div className={styles.regimeHead}>
                <strong>{regime.label}</strong>
                <MathBlock label={`${regime.label} formal definition`} tex={regimeTex(regime.formal_definition)} />
              </div>
              <p className={styles.regimeBody}>{regime.empirical_characterization}</p>
              <p className={styles.regimeSupport}>{regime.support_density}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Tiers</h2>
        <p className={styles.lede}>
          The three specification tiers, and what each one is allowed to claim. A tier whose
          observations-per-parameter is low is reported as exploratory, not as a result.
        </p>
        <DataTable<{
          tier: string
          label: string
          params: number
          obsPerParam: number
          role: string
          threshold: number
        }>
          caption="Specification tiers, their parameter counts and their inferential role"
          columns={[
            { key: 'tier', header: 'Tier', sortable: true },
            { key: 'label', header: 'Specification' },
            { key: 'params', header: 'Parameters', align: 'right', sortable: true },
            { key: 'obsPerParam', header: 'Obs. per parameter', align: 'right', sortable: true },
            { key: 'role', header: 'Inferential role', sortable: true },
            { key: 'threshold', header: 'Sign-consistency floor', align: 'right' },
          ]}
          rows={glossaryArtifact.tier_definitions.map((tier) => ({
            tier: tier.tier,
            label: tier.label,
            params: tier.params,
            obsPerParam: tier.obs_per_param,
            role: tier.inferential_role,
            threshold: tier.sign_consistency_threshold,
          }))}
        />
      </section>
    </section>
  )
}

const ORDERED_SECTIONS: GlossarySection[] = [
  'Model variable',
  'Greek letter',
  'Derived quantity',
  'Hyperparameter',
  'Coefficient term',
]

function NotationTable({ entries }: { entries: GlossaryEntry[] }) {
  return (
    <DataTable<GlossaryEntry>
      caption="Symbols, their meaning, their source, and the window they were fitted over"
      columns={[
        {
          key: 'symbol',
          header: 'Symbol',
          sortable: true,
          render: (row) => (
            <MathBlock label={`${row.symbol}: ${row.name}`} tex={row.tex} />
          ),
        },
        { key: 'name', header: 'Name', sortable: true },
        { key: 'definition', header: 'Definition or role' },
        { key: 'source', header: 'Source' },
        { key: 'window', header: 'Fitted over' },
      ]}
      rowAttributes={(row) => ({ 'data-symbol': row.symbol })}
      rows={entries}
    />
  )
}
