import { useEffect, useMemo, useState } from 'react'
import { ARTIFACT_CONSUMPTION } from '../../evidence/artifactConsumption.generated'
import {
  buildEvidenceIndex,
  formatRowCount,
  formatTimestamp,
  loadArtifactFacts,
  withFacts,
  type ArtifactFacts,
} from '../../evidence/evidenceIndex'
import './EvidenceIndex.css'

type FactsState = Record<string, ArtifactFacts | undefined>

/**
 * The evidence index: every analysis artifact, what it establishes, and whether anything
 * reads it.
 *
 * The split is the point. A reader who arrives expecting the artifact set to be wired
 * into the interface should be able to see, without reading code, that 5 of 31 are
 * actually imported — and that 11 more are only named in prose, which looks like wiring
 * and is not.
 */
export default function EvidenceIndex() {
  const baseIndex = useMemo(() => buildEvidenceIndex(ARTIFACT_CONSUMPTION), [])
  const [facts, setFacts] = useState<FactsState>({})
  const index = useMemo(() => withFacts(baseIndex, facts), [baseIndex, facts])

  // Facts need a payload read, so they are fetched after first paint rather than
  // blocking it. `cv_kfold.json` alone is 1.8 MB.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next: FactsState = {}
      for (const row of baseIndex.rows) {
        const loaded = await loadArtifactFacts(row.name)
        if (cancelled) return
        next[row.name] = loaded
        // Publish incrementally so rows fill in rather than appearing all at once at
        // the end of a 3.3 MB read.
        setFacts({ ...next })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [baseIndex.rows])

  return (
    <section className="evidence-index" aria-labelledby="evidence-index-title">
      <header className="evidence-header">
        <h2 id="evidence-index-title">Evidence index</h2>
        <p className="evidence-subtitle">
          Every analysis artifact this project generates, what it establishes, and whether
          the interface actually reads it.
        </p>
        <dl className="evidence-tally">
          <div className="evidence-tally-item is-wired">
            <dt>Imported</dt>
            <dd>{index.importedCount}</dd>
          </div>
          <div className="evidence-tally-item is-mentioned">
            <dt>Named only</dt>
            <dd>{index.referencedOnlyCount}</dd>
          </div>
          <div className="evidence-tally-item is-unused">
            <dt>Untouched</dt>
            <dd>{index.untouchedCount}</dd>
          </div>
          <div className="evidence-tally-item">
            <dt>Total</dt>
            <dd>{index.total}</dd>
          </div>
        </dl>
        <p className="evidence-claim">
          <strong>
            {index.importedCount} of {index.total}
          </strong>{' '}
          artifacts are imported by a module, so only those values can reach the
          interface. A further {index.referencedOnlyCount} are named in source without
          being imported — they look wired in and are not. The remaining{' '}
          {index.untouchedCount} appear nowhere in the application.
        </p>
      </header>

      <div className="evidence-table-wrap">
        <table className="evidence-table">
          <caption className="visually-hidden">
            Analysis artifacts with their schema version, generation time, declared row
            count, consumption status and what each establishes.
          </caption>
          <thead>
            <tr>
              <th scope="col">Artifact</th>
              <th scope="col">Schema</th>
              <th scope="col">Generated</th>
              <th scope="col" className="is-numeric">Rows</th>
              <th scope="col">Read by</th>
              <th scope="col">What it establishes</th>
            </tr>
          </thead>
          <tbody>
            {index.rows.map((row) => {
              const loaded = facts[row.name]
              const differs = row.conflictsWithRows !== undefined
              const stale = differs && !row.rowCountIsSubset
              return (
                <tr key={row.name} data-artifact={row.name}>
                  <th scope="row" className="evidence-artifact-name">
                    {row.name}
                  </th>
                  <td className="evidence-mono">{loaded?.schemaVersion ?? '—'}</td>
                  <td className="evidence-mono">{formatTimestamp(loaded?.generatedAt)}</td>
                  <td className="is-numeric evidence-mono">
                    {formatRowCount(loaded?.rowCount)}
                    {stale ? (
                      <span
                        className="evidence-stale"
                        title={`This artifact declares ${formatRowCount(loaded?.rowCount)} rows; most artifacts report ${formatRowCount(row.conflictsWithRows)}. It predates the current panel and has not been regenerated.`}
                      >
                        {' '}≠ {formatRowCount(row.conflictsWithRows)}
                      </span>
                    ) : null}
                    {differs && row.rowCountIsSubset ? (
                      <span
                        className="evidence-subset"
                        title={`A legitimate sub-sample: this artifact reports its own ${formatRowCount(loaded?.rowCount)}-row set, not the ${formatRowCount(row.conflictsWithRows)}-row panel.`}
                      >
                        {' '}subset
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span
                      className={`evidence-status ${
                        row.imported
                          ? 'is-wired'
                          : row.referenced
                            ? 'is-mentioned'
                            : 'is-unused'
                      }`}
                    >
                      {row.imported ? 'imported' : row.referenced ? 'named only' : 'unused'}
                    </span>
                  </td>
                  <td className="evidence-description">{row.description}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
