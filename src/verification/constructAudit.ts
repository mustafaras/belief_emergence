/**
 * The construct audit's verdict rule.
 *
 * The paper's central finding is that three of four configured constructs fail a
 * reliability test. Rendering that faithfully has one trap in it, and the trap is a
 * single row:
 *
 *   S_social_support  cronbachAlpha: 0.753  cellsEmitted: 0  computable: false
 *
 * That alpha is a leftover from a partial run. A renderer that prints the alpha field
 * without first checking `computable` shows a reliability figure of 0.753 — comfortably
 * above the 0.70 floor — for a construct with **zero** observations, which reads as a
 * pass and is the opposite of what the paper says. So `computable` is checked first and
 * the alpha is never read when it fails.
 *
 * Everything here is pure so the rule can be tested without a browser.
 */

/** Reliability floor the paper sets for itself ("the 0.70 convention is a floor"). */
export const RELIABILITY_FLOOR = 0.7

/**
 * Minimum fraction of configured items that must be available for a composite to be
 * built, from `config/wvs_items.yaml` (`defaults.min_item_coverage`).
 *
 * A construct below this floor emits no cells. For social support that is the actual
 * mechanism: three of seven items survive (0.43), which is under 0.5.
 */
export const MIN_ITEM_COVERAGE = 0.5

/** Items a construct needs before it can be assembled at all. */
export function requiredItems(configured: number): number {
  return Math.ceil(MIN_ITEM_COVERAGE * configured)
}

/** One construct as the audit artifact stores it. */
export type AuditConstruct = {
  label?: string
  itemsConfigured: number
  itemsUsed?: string[]
  cellsEmitted: number
  cellsRejected: number
  computable: boolean
  cronbachAlpha: number | null
  unidimensional: boolean
}

export type AuditArtifact = {
  schemaVersion: string
  generatedAtIso?: string
  respondentsScanned?: number
  countryYears?: number
  constructs: Record<string, AuditConstruct>
}

export type Verdict = 'retained' | 'withdrawn' | 'uncomputable'

export type ConstructRow = {
  /** Key as it appears in the artifact, e.g. `S_social_support`. */
  id: string
  /** Human label, falling back to the key. */
  label: string
  itemsConfigured: number
  itemsUsed: number
  cellsEmitted: number
  cellsRejected: number
  verdict: Verdict
  /** Why. Always present for withdrawn and uncomputable rows. */
  reason: string
  /** Alpha, only when the construct is computable. Never a leftover. */
  alpha: number | null
  /** True when the artifact carries an alpha that must not be shown. */
  suppressedAlpha: boolean
  /** Items present in the harmonised source, when known. */
  itemsAvailable?: number
  /** Configured items absent from the source, when known. */
  absentItems?: string[]
}

/**
 * Decide one construct's disposition.
 *
 * Order matters and is the whole point: `computable` is tested before alpha is read.
 *
 * `itemsUsed` is empty for a construct that could not be computed, but that does **not**
 * mean every configured item was missing. For social support, four of seven items are
 * absent from the harmonised source (A101, A106, F185, F186) and the remaining three fall
 * below the coverage floor, so the composite was never assembled. Reading `itemsUsed`
 * alone and reporting "7 of 7 unavailable" states a different fact from the paper's
 * "four of its seven configured items are absent" — and the wrong one.
 *
 * The available count is therefore supplied from configuration when it can be
 * established. The fallback says the composite was not assembled rather than inventing a
 * shortfall.
 */
export function verdictFor(
  construct: AuditConstruct,
  availableItems?: { count: number; items?: string[] },
): { verdict: Verdict; reason: string } {
  if (!construct.computable || construct.cellsEmitted <= 0) {
    const configured = construct.itemsConfigured
    const need = requiredItems(configured)
    let detail: string
    if (availableItems && availableItems.count < configured) {
      const missing = configured - availableItems.count
      const named = availableItems.items?.length ? ` (${availableItems.items.join(', ')})` : ''
      detail =
        `${missing} of ${configured} configured items are absent from the harmonised source${named}, ` +
        `leaving ${availableItems.count} where the coverage floor requires ${need}, so no cell could be emitted`
    } else {
      detail =
        `the composite could not be assembled from ${configured} configured items ` +
        `(the audit records no item as usable; the coverage floor requires ${need}), so no cell could be emitted`
    }
    return {
      verdict: 'uncomputable',
      reason: `Not computable: ${detail} — ${construct.cellsRejected} country-years rejected. Cronbach's alpha cannot be estimated without observations.`,
    }
  }

  const alpha = construct.cronbachAlpha
  if (alpha === null || !Number.isFinite(alpha)) {
    return {
      verdict: 'uncomputable',
      reason: `Not computable: no alpha was estimated despite ${construct.cellsEmitted} cells emitted.`,
    }
  }

  if (!construct.unidimensional) {
    return {
      verdict: 'withdrawn',
      reason: `Withdrawn: the items do not load on a single dimension (alpha ${alpha.toFixed(2)} against a ${RELIABILITY_FLOOR.toFixed(2)} floor).`,
    }
  }

  if (alpha < RELIABILITY_FLOOR) {
    return {
      verdict: 'withdrawn',
      reason: `Withdrawn: alpha ${alpha.toFixed(2)} is below the ${RELIABILITY_FLOOR.toFixed(2)} floor.`,
    }
  }

  return {
    verdict: 'retained',
    reason: `Retained: ${construct.itemsUsed?.length ?? construct.itemsConfigured} items, single dimension, alpha ${alpha.toFixed(2)} at or above the ${RELIABILITY_FLOOR.toFixed(2)} floor.`,
  }
}

/** Item availability, as recorded by `construct_item_availability.json`. */
export type ItemAvailability = {
  configuredItems: string[]
  availableItems: string[]
  absentItems: string[]
}

/** Build one row per construct, sorted by key so the table is stable. */
export function buildConstructRows(
  artifact: AuditArtifact,
  availability?: Record<string, ItemAvailability>,
): ConstructRow[] {
  return Object.entries(artifact.constructs)
    .map(([id, construct]) => {
      const items = availability?.[id]
      const { verdict, reason } = verdictFor(
        construct,
        items ? { count: items.availableItems.length, items: items.absentItems } : undefined,
      )
      const computable = verdict !== 'uncomputable'
      return {
        id,
        label: construct.label ?? id,
        itemsConfigured: construct.itemsConfigured,
        itemsUsed: construct.itemsUsed?.length ?? 0,
        cellsEmitted: construct.cellsEmitted,
        cellsRejected: construct.cellsRejected,
        verdict,
        reason,
        // Suppressed rather than merely conditional: a reader must never see an alpha for
        // a construct with no observations.
        alpha: computable ? construct.cronbachAlpha : null,
        suppressedAlpha: !computable && construct.cronbachAlpha !== null,
        itemsAvailable: items?.availableItems.length,
        absentItems: items?.absentItems,
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export type AuditSummary = {
  total: number
  retained: number
  withdrawn: number
  uncomputable: number
  /** (withdrawn + uncomputable) / total — the paper's 3-in-4. */
  failureRate: number
}

export function summarise(rows: ConstructRow[]): AuditSummary {
  const retained = rows.filter((r) => r.verdict === 'retained').length
  const withdrawn = rows.filter((r) => r.verdict === 'withdrawn').length
  const uncomputable = rows.filter((r) => r.verdict === 'uncomputable').length
  return {
    total: rows.length,
    retained,
    withdrawn,
    uncomputable,
    failureRate: rows.length > 0 ? (withdrawn + uncomputable) / rows.length : 0,
  }
}
