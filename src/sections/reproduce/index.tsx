import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Callout, DataTable, Drawer, SectionHeader, Tabs } from '../../ui'
import { APP_ROUTES } from '../../app/routes'
import { buildEvidenceIndex, formatRowCount, loadArtifactFacts, type ArtifactFacts } from '../../evidence/evidenceIndex'
import { ARTIFACT_CONSUMPTION } from '../../evidence/artifactConsumption.generated'
import { MANIFEST_CLAIM_COUNT, REPRODUCTION_MANIFEST } from '../../evidence/reproductionManifest.generated'
import { GATE_LOOP_CHECKS, GATE_STEPS } from './gateSteps.generated'
import { ARTIFACT_MODULES_FOR_TREE } from './artifactTree'
import { JsonTree } from './JsonTree'
import { ProvenanceChain } from './ProvenanceChain'
import styles from './Reproduce.module.css'

/**
 * `?artifact=<name>` opens one artifact's drawer directly.
 *
 * A reviewer who wants to check the k-fold numbers should be able to be sent that JSON
 * rather than told where to look. Written with `replaceState` so opening a drawer does not
 * push a history entry the reader has to back out of.
 */
const ARTIFACT_KEY = 'artifact'

/**
 * The artifact named in `?artifact=`, normalised to a bare basename.
 *
 * Two writers disagree about the suffix: the evidence table sets `cv_kfold`, and the command
 * palette's artifact entries set `cv_kfold.json` — the filename as it sits on disk. The loader
 * key is built by appending `.json`, so the palettte's form produced `cv_kfold.json.json`,
 * the lookup missed, and the drawer opened on "could not be read" with no clue why. Accepting
 * both spellings here is cheaper than fixing one caller and leaving the other to rot.
 */
const readArtifactParam = (): string | null => {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get(ARTIFACT_KEY)
  if (!raw) return null
  return raw.replace(/\.json$/i, '')
}

function writeArtifactParam(name: string | null) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (name === null) url.searchParams.delete(ARTIFACT_KEY)
  else url.searchParams.set(ARTIFACT_KEY, name)
  window.history.replaceState({}, '', url)
}

type ArtifactRow = {
  name: string
  description: string
  consumed: 'imported' | 'referenced' | 'untouched'
  rowCount: string
  generator: string
  provenance: 'generated' | 'copied' | 'recorded'
}

export default function ReproduceSection() {
  const index = useMemo(() => buildEvidenceIndex(ARTIFACT_CONSUMPTION), [])
  const names = useMemo(() => index.rows.map((row) => row.name), [index.rows])
  const facts = useArtifactFacts(names)
  const [openArtifact, setOpenArtifact] = useState<string | null>(readArtifactParam)
  const [filter, setFilter] = useState('')
  /**
   * A second axis on the same table.
   *
   * 42 rows is too many to read and too few to paginate; what a reader actually wants is
   * "which of these is not wired in", which is a filter rather than a scroll. The default
   * is `untouched` because that is the set that needs a decision.
   */
  const [consumed, setConsumed] = useState<'all' | 'imported' | 'referenced' | 'untouched'>('untouched')

  useEffect(() => {
    const onPopState = () => setOpenArtifact(readArtifactParam())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const setOpen = useCallback((name: string | null) => {
    setOpenArtifact(name)
    writeArtifactParam(name)
  }, [])

  const manifestByName = useMemo(
    () => new Map(REPRODUCTION_MANIFEST.artifacts.map((entry) => [entry.name, entry])),
    [],
  )

  const rows: ArtifactRow[] = useMemo(() => index.rows.map((row): ArtifactRow => {
    const manifest = manifestByName.get(row.name)
    return {
      name: row.name,
      description: row.description,
      consumed: row.imported ? 'imported' : row.referenced ? 'referenced' : 'untouched',
      rowCount: formatRowCount(facts[row.name]?.rowCount),
      generator: manifest?.generator ?? '—',
      provenance: manifest?.provenance ?? 'recorded',
    }
  }), [index.rows, facts, manifestByName])

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return rows.filter((row) => {
      if (consumed !== 'all' && row.consumed !== consumed) return false
      if (!needle) return true
      return row.name.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle)
    })
  }, [rows, filter, consumed])

  const untouched = index.untouchedCount
  const recordedOnly = rows.filter((row) => row.provenance === 'recorded').length
  const copied = rows.filter((row) => row.provenance === 'copied').length

  return (
    <section>
      <SectionHeader
        eyebrow="09 · REPRODUCIBILITY"
        lede="Every number in this application comes from a committed artifact. This page lists them, shows what each contains, and names the script that would rebuild it."
        title="Evidence & Reproducibility"
      />

      <Callout title="What this page can and cannot show" variant="info">
        The manifest below is derived from the source tree — from real import statements,
        checked in continuous integration — so an artifact cannot be described as wired in when
        it is not. What the page cannot show is that a committed artifact still matches the data
        it was built from: that needs the restricted inputs, which are not in this checkout.{' '}
        <strong>{recordedOnly}</strong> of {rows.length} artifacts are present as evidence and not
        rebuildable here{copied > 0 ? `; ${copied} are byte-identical copies of a rawdata measurement, moved in by hand` : ''}.
      </Callout>

      <section className={styles.section}>
        <h2 className={styles.h2}>Artifacts</h2>
        <p className={styles.lede}>
          {index.total} artifacts: {index.importedCount} imported by a module,{' '}
          {index.referencedOnlyCount} named in source but never imported, {untouched} untouched.
          Select a name to read the JSON. <strong>{MANIFEST_CLAIM_COUNT}</strong> distinct claims
          are reachable from the routes on this site.
        </p>
        <div className={styles.filterRow}>
          <div aria-label="Show artifacts by consumption" className={styles.segmented} role="group">
            {([
              ['untouched', `${untouched} untouched`],
              ['referenced', `${index.referencedOnlyCount} referenced`],
              ['imported', `${index.importedCount} imported`],
              ['all', `all ${index.total}`],
            ] as const).map(([value, label]) => (
              <button
                aria-pressed={consumed === value}
                className={consumed === value ? styles.segmentActive : styles.segment}
                key={value}
                onClick={() => setConsumed(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className={styles.filter}>
          <span>Filter</span>
          <input
            onChange={(event) => setFilter(event.target.value)}
            placeholder="artifact name or description"
            type="search"
            value={filter}
          />
        </label>
        <DataTable<ArtifactRow>
          caption="Committed artifacts, how each is consumed, and the command that would rebuild it"
          columns={[
            {
              key: 'name',
              header: 'Artifact',
              sortable: true,
              render: (row) => (
                <button className={styles.artifactLink} onClick={() => setOpen(row.name)} type="button">
                  {row.name}
                </button>
              ),
            },
            { key: 'description', header: 'What it holds' },
            {
              key: 'consumed',
              header: 'Consumed',
              sortable: true,
              render: (row) => (
                <Badge variant={row.consumed === 'imported' ? 'pass' : row.consumed === 'referenced' ? 'exploratory' : 'neutral'}>
                  {row.consumed}
                </Badge>
              ),
            },
            { key: 'rowCount', header: 'Rows', align: 'right', sortable: true },
            { key: 'generator', header: 'Rebuild with' },
            {
              key: 'provenance',
              header: 'Provenance',
              sortable: true,
              render: (row) => (
                <Badge variant={row.provenance === 'generated' ? 'pass' : row.provenance === 'copied' ? 'exploratory' : 'withdrawn'}>
                  {row.provenance}
                </Badge>
              ),
            },
          ]}
          rowAttributes={(row) => ({ 'data-artifact': row.name })}
          rows={filtered}
        />
        {filtered.length === 0 ? (
          <p className={styles.empty}>
            No artifact matches that filter{filter ? ` for “${filter}”` : ''}.
          </p>
        ) : null}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Provenance</h2>
        <p className={styles.lede}>
          The chain the paper argues for, in the order it argues for it. Each link names the
          artifact that establishes it; two are marked because they narrow or remove something.
        </p>
        <ProvenanceChain />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Reproducing it</h2>
        <Tabs
          label="Reproduction"
          tabs={[
            {
              id: 'commands',
              label: 'Commands',
              content: (
                <div className={styles.commands}>
                  <CommandBlock
                    command="npm ci && npm run generate:analysis && npm run ci:gate"
                    label="Full reproduction"
                    note="Rebuilds every artifact this checkout can rebuild, then runs the gate over the result."
                  />
                  <CommandBlock
                    command="npm run ci:gate"
                    label="Verify without rebuilding"
                    note={`Runs the ${GATE_LOOP_CHECKS.total} checks: generation, presence, schema, metrics, validation and code quality.`}
                  />
                  <CommandBlock
                    command="npm run check:dom-numbers"
                    label="Audit what is on screen"
                    note="Every rendered number must resolve to an artifact or a documented derivation, or the check fails."
                  />
                </div>
              ),
            },
            {
              id: 'gates',
              label: `Gate steps (${GATE_STEPS.length} of ${GATE_LOOP_CHECKS.total})`,
              content: (
                <>
                  <p className={styles.lede}>
                    {GATE_STEPS.length} steps are written out in the gate; the remaining{' '}
                    {GATE_LOOP_CHECKS.total - GATE_STEPS.length} are emitted from loops over the
                    expected artifacts, schema versions and canonical metrics.
                  </p>
                  <DataTable<{ phase: string; label: string; needs: string }>
                    caption="The steps the continuous-integration gate runs"
                    columns={[
                      { key: 'phase', header: 'Phase', sortable: true },
                      { key: 'label', header: 'Check', sortable: true },
                      { key: 'needs', header: 'Needs' },
                    ]}
                    rows={GATE_STEPS}
                  />
                </>
              ),
            },
            {
              id: 'routes',
              label: 'Claims per route',
              content: (
                <DataTable<{ route: string; title: string; shown: number; artifacts: number; rebuildable: number }>
                  caption="Claims each route displays itself, and the artifacts behind them"
                  columns={[
                    { key: 'route', header: 'Route', sortable: true },
                    { key: 'title', header: 'Section' },
                    { key: 'shown', header: 'Claims shown', align: 'right', sortable: true },
                    { key: 'artifacts', header: 'Artifacts', align: 'right', sortable: true },
                    { key: 'rebuildable', header: 'Rebuildable', align: 'right', sortable: true },
                  ]}
                  rows={REPRODUCTION_MANIFEST.routes.map((route) => ({
                    route: route.id,
                    title: APP_ROUTES.find((entry) => entry.id === route.id)?.title ?? route.id,
                    shown: route.directClaimIds.length,
                    artifacts: route.artifacts.length,
                    rebuildable: route.artifacts.filter((name) => manifestByName.get(name)?.generator).length,
                  }))}
                />
              ),
            },
          ]}
        />
      </section>

      <Drawer
        onOpenChange={(open) => { if (!open) setOpen(null) }}
        open={openArtifact !== null}
        title={openArtifact ?? 'Artifact'}
        trigger={<span className={styles.visuallyHidden}>Open artifact</span>}
      >
        {openArtifact !== null ? <ArtifactPanel name={openArtifact} /> : null}
      </Drawer>
    </section>
  )
}

/**
 * Read every artifact's declared facts, one at a time.
 *
 * Sequentially rather than with `Promise.all`, because these are dynamic imports: firing 42
 * at once fetches ~2 MB of JSON in parallel for a table that only needs a row count. The
 * table shows an em dash until a row's facts arrive, which is honest about what has been
 * measured so far.
 */
function useArtifactFacts(names: string[]): Record<string, ArtifactFacts | undefined> {
  const [facts, setFacts] = useState<Record<string, ArtifactFacts | undefined>>({})
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const next: Record<string, ArtifactFacts | undefined> = {}
      for (const name of names) {
        if (cancelled) return
        next[name] = await loadArtifactFacts(name)
        if (!cancelled) setFacts({ ...next })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [names])
  return facts
}

function ArtifactPanel({ name }: { name: string }) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'missing'; data?: unknown }>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const loader = ARTIFACT_MODULES_FOR_TREE[`../../data/analysis/${name}.json`]
      if (!loader) {
        setState({ status: 'missing' })
        return
      }
      try {
        const payload = await loader()
        if (!cancelled) setState({ status: 'ready', data: payload })
      } catch {
        if (!cancelled) setState({ status: 'missing' })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [name])

  if (state.status === 'loading') return <p className={styles.lede}>Reading the artifact…</p>
  if (state.status === 'missing') {
    return <p className={styles.lede}>This artifact could not be read from the committed files.</p>
  }
  return <JsonTree data={state.data} label={`${name} contents`} />
}

function CommandBlock({ command, label, note }: { command: string; label: string; note: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className={styles.command}>
      <div className={styles.commandHead}>
        <strong>{label}</strong>
        <button className={styles.copyButton} onClick={() => void copy()} type="button">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <code className={styles.commandCode}>{command}</code>
      <p className={styles.commandNote}>{note}</p>
    </div>
  )
}
