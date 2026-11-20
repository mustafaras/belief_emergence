/**
 * The lazy artifact loaders, exposed to the drawer.
 *
 * `evidenceIndex` keeps its glob private because the index only needs metadata; the
 * drawer needs the payload. Re-exporting the same glob here — rather than importing each
 * of 42 JSON files — keeps the payloads out of the initial bundle: a loader that is never
 * called is never fetched, which the bundle budget measures.
 */
const ARTIFACT_MODULES = import.meta.glob<Record<string, unknown>>('../../data/analysis/*.json')

export const ARTIFACT_MODULES_FOR_TREE: Record<string, () => Promise<Record<string, unknown>>> =
  ARTIFACT_MODULES
