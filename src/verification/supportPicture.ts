/**
 * The support picture: how 442,026 respondents became 207 complete cases.
 *
 * Two things this module refuses to do:
 *
 *   1. Retype any number. Every figure is read from
 *      `public/data/panel_canonical_v2.audit.json`, which the panel builder writes, or
 *      from `wvs_construct_audit.json`. The percentage is computed here.
 *   2. Claim a cause the artifacts do not support. The per-covariate attribution is only
 *      reported when the audit carries it; `missingByCovariate` was added to the builder
 *      for exactly this reason. Before it existed, `missingCovariate: 61` said only that
 *      61 cells were lost to *some* covariate, and any per-covariate story would have been
 *      invention.
 *
 * A note on overlap: the builder counts a cell against the **first** covariate that
 * fails and stops, so a cell missing both Gini and education is attributed once. The
 * per-covariate counts therefore sum to `missingCovariate` exactly, and they cannot be
 * read as "how many cells are short of each covariate" — a cell may be short of several
 * and appear under only one.
 */

export type PanelAttrition = {
  noIso?: number
  noMacro?: number
  missingCovariate?: number
  missingOutcome?: number
}

export type PanelAudit = {
  rows: number
  countries: number
  attrition: PanelAttrition
  missingByCovariate?: Record<string, number>
}

export type ConstructAuditTotals = {
  respondentsScanned?: number
  countryYears?: number
  /** Cells with a computable outcome, before the covariate filter. */
  zComputableCells?: number
}

export type AttritionStage = {
  id: string
  label: string
  value: number
  /** Share of the stage above it. */
  ofPrevious: number
  /** One line explaining what this stage removes. */
  detail: string
}

export type CovariateBlocker = {
  covariate: string
  /** Human name where the code is known, else the code. */
  label: string
  cells: number
  /** Share of all cells lost to a missing covariate. */
  share: number
  /** True for the largest blocker. Exactly one row carries it. */
  binding: boolean
}

export type SupportPicture = {
  respondents: number
  scannedCountryYears: number
  zComputableCells: number
  completeCases: number
  countries: number
  /** completeCases / scannedCountryYears, computed rather than typed. */
  frameUtilisation: number
  stages: AttritionStage[]
  blockers: CovariateBlocker[]
  /** Cells lost to a covariate, i.e. the denominator of the blocker shares. */
  covariateDropouts: number
  /** Cells lost to something other than a covariate, by bucket. */
  otherDropouts: Array<{ id: string; label: string; cells: number }>
  /** True when the arithmetic closes: scanned - all losses == completeCases. */
  reconciles: boolean
}

/** Covariate codes as they appear in the panel builder. */
const COVARIATE_LABELS: Record<string, string> = {
  X: 'Settlement / urbanisation',
  Y: 'Gini (inequality)',
  T: 'Trauma / disaster exposure',
  E: 'Education capacity',
  R: 'Welfare capacity',
  M: 'Media environment',
}

const OTHER_LABELS: Record<string, string> = {
  noIso: 'unresolvable country codes',
  noMacro: 'with no macro row for that year',
  missingOutcome: 'with no computable outcome',
}

export function buildSupportPicture(
  panel: PanelAudit,
  constructs: ConstructAuditTotals,
): SupportPicture {
  const scanned = constructs.countryYears ?? 0
  const respondents = constructs.respondentsScanned ?? 0
  const zCells = constructs.zComputableCells ?? 0
  const complete = panel.rows
  const attrition = panel.attrition ?? {}

  const covariateDropouts = attrition.missingCovariate ?? 0

  const blockers: CovariateBlocker[] = Object.entries(panel.missingByCovariate ?? {})
    .map(([covariate, cells]) => ({
      covariate,
      label: COVARIATE_LABELS[covariate] ?? covariate,
      cells,
      share: covariateDropouts > 0 ? cells / covariateDropouts : 0,
      binding: false,
    }))
    .sort((a, b) => b.cells - a.cells)

  // Exactly one binding constraint, and only if there is something to bind.
  if (blockers.length > 0 && blockers[0].cells > 0) blockers[0].binding = true

  const otherDropouts = ['noIso', 'noMacro', 'missingOutcome']
    .map((id) => ({
      id,
      label: OTHER_LABELS[id] ?? id,
      cells: attrition[id as keyof PanelAttrition] ?? 0,
    }))
    .filter((d) => d.cells > 0)

  const stages: AttritionStage[] = []
  const pushStage = (id: string, label: string, value: number, ofPrevious: number, detail: string) => {
    stages.push({ id, label, value, ofPrevious, detail })
  }

  if (respondents > 0) {
    pushStage(
      'respondents',
      'Survey respondents scanned',
      respondents,
      1,
      'Every respondent in the harmonised World Values Survey / European Values Study file.',
    )
  }

  pushStage(
    'scanned',
    'Construct-bearing country-years',
    scanned,
    respondents > 0 ? scanned / respondents : 1,
    `Respondent means aggregated to country-years — an aggregation, not a loss, so the ` +
      `share below is a ratio of unlike units. ${zCells.toLocaleString('en-US')} of these ` +
      `produced a computable outcome.`,
  )

  if (otherDropouts.length > 0 || covariateDropouts > 0) {
    pushStage(
      'complete',
      'Complete cases in the panel',
      complete,
      scanned > 0 ? complete / scanned : 0,
      `After ${(scanned - complete).toLocaleString('en-US')} country-years were dropped: ` +
        `${covariateDropouts.toLocaleString('en-US')} for a missing covariate, and ` +
        `${otherDropouts.map((d) => `${d.cells} ${d.label}`).join(', ')}.`,
    )
  }

  const totalLost =
    covariateDropouts + otherDropouts.reduce((sum, d) => sum + d.cells, 0)

  return {
    respondents,
    scannedCountryYears: scanned,
    zComputableCells: zCells,
    completeCases: complete,
    countries: panel.countries,
    frameUtilisation: scanned > 0 ? complete / scanned : 0,
    stages,
    blockers,
    covariateDropouts,
    otherDropouts,
    // The panel builder attributes every dropped cell exactly once, so the identity must
    // hold. If it does not, the audit and the panel disagree and the panel is wrong.
    reconciles: scanned - totalLost === complete,
  }
}
