/**
 * Read the facts an evidence index needs out of an artifact, without trusting any one
 * key name.
 *
 * The 31 artifacts were generated at different times and disagree about their own
 * metadata: `schemaVersion` vs `schema_version` vs `schema`, `generatedAtIso` vs
 * `generated_at` vs `generated` vs `timestamp`, and row counts under `n`, `nRows`,
 * `rows`, `fullPanelNRows`, or nested in `source.nRows` or `frame`.
 *
 * Guessing from "any key containing date" produced a false positive on
 * `manuscript_update_recommendations`, so the candidate lists are explicit and ordered.
 * When nothing matches, the field reports `undefined` and the renderer prints an em
 * dash — a blank is honest; a wrong number is not.
 */

export type ArtifactFacts = {
  /** Name as written in the artifact, or undefined when it declares none. */
  schemaVersion?: string
  /** ISO timestamp as written, or undefined when it declares none. */
  generatedAt?: string
  /** A row count the artifact actually declares. Never inferred. */
  rowCount?: number
}

const SCHEMA_KEYS = ['schemaVersion', 'schema_version', 'schema'] as const
const TIMESTAMP_KEYS = ['generatedAtIso', 'generated_at', 'generated', 'timestamp'] as const

const ROW_COUNT_KEYS = [
  'n',
  'nRows',
  'rows',
  'totalRows',
  'fullPanelNRows',
  'nUniqueCountryYears',
] as const

function firstString(source: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function firstFiniteNumber(
  source: Record<string, unknown>,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

/**
 * Extract the displayable facts from a parsed artifact.
 *
 * Row count falls back to a nested declaration (`source.nRows`, then `frame`) because
 * several artifacts describe their sample there rather than at the top level. It never
 * counts array elements: the length of `folds` is the fold count, not the sample size,
 * and presenting it as a row count would be a fabricated number.
 */
export function readArtifactFacts(parsed: unknown): ArtifactFacts {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }

  const record = parsed as Record<string, unknown>
  const facts: ArtifactFacts = {
    schemaVersion: firstString(record, SCHEMA_KEYS),
    generatedAt: firstString(record, TIMESTAMP_KEYS),
  }

  let rowCount = firstFiniteNumber(record, ROW_COUNT_KEYS)

  if (rowCount === undefined && record.source && typeof record.source === 'object') {
    rowCount = firstFiniteNumber(record.source as Record<string, unknown>, ['nRows'])
  }

  if (rowCount === undefined && record.frame && typeof record.frame === 'object') {
    // `canonicalCompleteCases` is the analysed sample; `scannedCountryYears` is the
    // frame before attrition. The complete-case count is the row count.
    rowCount = firstFiniteNumber(record.frame as Record<string, unknown>, ['canonicalCompleteCases'])
  }

  // Some artifacts describe the sample only inside their own result arrays. Each of
  // these is unambiguous: every entry agrees, or the field is named for the country-year
  // count outright. Ambiguous candidates (per-fold nTrain/nTest, per-window sample sizes,
  // fold counts) are deliberately excluded — see the note below.
  if (rowCount === undefined && Array.isArray(record.variants)) {
    // r_collinearity_case: every specification is fitted on the same n.
    rowCount = sharedNumber(record.variants, 'n')
  }

  if (rowCount === undefined && Array.isArray(record.splits)) {
    // zero_fill_sensitivity: the "full panel" split is the panel; later splits are
    // the same panel with rows deleted, so only the first entry is the sample.
    const first = record.splits[0]
    if (first && typeof first === 'object') {
      rowCount = firstFiniteNumber(first as Record<string, unknown>, ['n'])
    }
  }

  if (rowCount === undefined && record.supportMask && typeof record.supportMask === 'object') {
    rowCount = firstFiniteNumber(record.supportMask as Record<string, unknown>, [
      'nUniqueCountryYears',
    ])
  }

  facts.rowCount = rowCount
  return facts
}

/** A number every element of `items` reports identically, else undefined. */
function sharedNumber(items: unknown[], key: string): number | undefined {
  const values = items.map((item) =>
    item && typeof item === 'object'
      ? firstFiniteNumber(item as Record<string, unknown>, [key])
      : undefined,
  )
  if (values.some((v) => v === undefined)) return undefined
  const unique = new Set(values)
  return unique.size === 1 ? (values[0] as number) : undefined
}

/** Format a row count for display; em dash when the artifact declares none. */
export function formatRowCount(rowCount: number | undefined): string {
  if (rowCount === undefined || !Number.isFinite(rowCount)) return '—'
  return rowCount.toLocaleString('en-US')
}

/** Shorten an ISO timestamp to `YYYY-MM-DD HH:MM`; em dash when absent. */
export function formatTimestamp(iso: string | undefined): string {
  if (!iso) return '—'
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(iso)
  if (match) return `${match[1]} ${match[2]}`
  // Keep an unparseable-but-present value rather than hiding it.
  return iso.length > 19 ? `${iso.slice(0, 19)}` : iso
}
