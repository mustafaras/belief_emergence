/**
 * generate_covariate_blockers.ts — which covariate blocks which cell, and by how much?
 *
 * WHY THIS EXISTS
 * ---------------
 * "Of the 180 cells lost after the WVS join, 131 were lost to Y alone; the next
 * largest losses were education (92) and trauma (46)" was hand-written in the
 * manuscript and copied into `build_canonical_panel.ts`, `ROADMAP_TO_SUBMISSION.md`
 * and the application's P19 prompt. It cannot be right as written: 131 + 92 + 46
 * exceeds 180, so the three numbers are not a partition of anything.
 *
 * They are not a partition. They are **exposure**: among the cells that reach the
 * covariate stage but are missing at least one raw covariate, 131 are missing Y,
 * 92 are missing E, and 46 are missing T. A cell missing both Y and E appears in
 * both counts. The overlap is the point, not an error to be divided away — Gini's
 * dominance is a statement about how many cells it touches, not about how many
 * cells it solely destroys.
 *
 * The disjoint view is also reported (`firstFailure`), because a reader deserves
 * one and only one is a partition. But it is a different question, answered under
 * a stated ordering, and it must never be substituted for exposure in a sentence
 * that says "alone".
 *
 * WHAT IT READS
 * -------------
 *   rawdata/wvs_combined.csv        constructs, one row per country-year
 *   rawdata/panel_model_data.csv    macro covariates
 *   public/data/panel_canonical_v2.csv        the committed panel (for resolution)
 *   public/data/panel_canonical_v2.audit.json the builder's post-backfill attribution
 *
 * The ISO-2 → ISO-3 table is **parsed out of the panel builder** rather than
 * duplicated here. If these two files ever disagree about whether `MV` is
 * `MDV`, the blocker counts and the panel would describe different samples, and
 * that divergence is exactly the class of defect this repository is auditing.
 *
 * Usage:
 *   npm run generate:blockers
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readCsvRecords } from './lib/csv';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONSTRUCTS = path.join(ROOT, 'rawdata', 'wvs_combined.csv');
const MACRO = path.join(ROOT, 'rawdata', 'panel_model_data.csv');
const PANEL = path.join(ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const PANEL_AUDIT = path.join(ROOT, 'public', 'data', 'panel_canonical_v2.audit.json');
const BUILDER = path.join(ROOT, 'scripts', 'build_canonical_panel.ts');
const OUT = path.join(ROOT, 'src', 'data', 'analysis', 'covariate_blocker_attribution.json');

/** Covariate codes and the macro column each one reads. Mirrors `KEPT` in the builder. */
const COVARIATES = [
  { code: 'X', column: 'X_urbanization', label: 'Settlement / urbanisation' },
  { code: 'Y', column: 'Y_gini', label: 'Gini (inequality)' },
  { code: 'T', column: 'T_trauma_shock', label: 'Trauma / disaster exposure' },
  { code: 'E', column: 'E_education_capacity', label: 'Education capacity' },
  { code: 'R', column: 'R_welfare_capacity', label: 'Welfare capacity' },
  { code: 'M', column: 'M_media_environment', label: 'Media environment' },
] as const;

/** The builder's covariate order; it decides which covariate "gets" a multi-missing cell. */
const FIRST_FAILURE_ORDER = ['X', 'Y', 'T', 'E', 'R', 'M'] as const;

type Macros = Record<string, string>;

const readCsv = (file: string): Array<Record<string, string>> =>
  readCsvRecords(fs.readFileSync(file, 'utf8'));

/** Pull ISO2_TO_ISO3 out of the builder so the two cannot drift apart. */
function readIso2Map(): Record<string, string> {
  const source = fs.readFileSync(BUILDER, 'utf8');
  const body = source.match(/const ISO2_TO_ISO3: Record<string, string> = \{([\s\S]*?)\n\};/)?.[1];
  if (!body) {
    throw new Error(`Could not find ISO2_TO_ISO3 in ${path.relative(ROOT, BUILDER)}. The blocker counts would silently use a different sample.`);
  }
  const map: Record<string, string> = {};
  for (const [, from, to] of body.matchAll(/([A-Z]{2}):\s*'([A-Z]{3})'/g)) map[from] = to;
  if (Object.keys(map).length === 0) throw new Error('ISO2_TO_ISO3 was found but yielded no pairs.');
  return map;
}

const present = (value: string | undefined): boolean => value !== undefined && value !== '' && value !== 'NA';

function main(): void {
  for (const required of [CONSTRUCTS, MACRO, PANEL, PANEL_AUDIT]) {
    if (!fs.existsSync(required)) {
      // The raw inputs are licence-restricted and gitignored; a clean clone has
      // neither them nor the panel. The committed artifact remains the evidence
      // of record and `npm run check:blockers` verifies the manuscript against it.
      console.log(`SKIP  ${path.relative(ROOT, required)} is absent; the committed artifact remains the evidence of record.`);
      return;
    }
  }

  const iso2 = readIso2Map();
  const constructs = readCsv(CONSTRUCTS);
  const macroRows = readCsv(MACRO);
  const panelRows = readCsv(PANEL);
  const audit = JSON.parse(fs.readFileSync(PANEL_AUDIT, 'utf8')) as {
    rows: number;
    attrition?: { missingCovariate?: number };
    missingByCovariate?: Record<string, number>;
  };

  for (const column of COVARIATES.map((c) => c.column)) {
    if (!(column in (macroRows[0] ?? {}))) {
      throw new Error(`Macro extract has no column ${column}; the covariate contract changed.`);
    }
  }

  const macro = new Map<string, Macros>();
  for (const row of macroRows) {
    const key = `${row.iso3}|${row.year}`;
    if (!macro.has(key)) macro.set(key, row);
  }

  // Walk the construct rows exactly as the builder does: resolve the country,
  // require a computable outcome, require a macro row, and only then look at
  // covariates. Skipping an earlier stage would inflate every later count.
  let missingOutcome = 0;
  let unresolvableIso = 0;
  let noMacroRow = 0;
  let reachedCovariateStage = 0;
  let rawCompleteCells = 0;

  const exposure = new Map<string, number>(COVARIATES.map((c) => [c.code, 0]));
  const firstFailure = new Map<string, number>(FIRST_FAILURE_ORDER.map((c) => [c, 0]));
  const exclusive = new Map<string, number>(COVARIATES.map((c) => [c.code, 0]));
  const missingCovariateCounts = new Map<number, number>();

  for (const row of constructs) {
    const rawIso = (row.iso3 ?? '').trim();
    const iso3 = /^[A-Z]{3}$/.test(rawIso) ? rawIso : iso2[rawIso];
    if (!iso3) { unresolvableIso += 1; continue; }

    if (!present(row.Z_religion_importance)) { missingOutcome += 1; continue; }

    const year = String(Number.parseInt(String(Number.parseFloat(row.year ?? '')), 10));
    const macros = macro.get(`${iso3}|${year}`);
    if (!macros) { noMacroRow += 1; continue; }

    reachedCovariateStage += 1;
    const missing = COVARIATES.filter((c) => !present(macros[c.column])).map((c) => c.code);

    if (missing.length === 0) { rawCompleteCells += 1; continue; }

    for (const code of missing) exposure.set(code, (exposure.get(code) ?? 0) + 1);
    if (missing.length === 1) exclusive.set(missing[0], (exclusive.get(missing[0]) ?? 0) + 1);
    missingCovariateCounts.set(missing.length, (missingCovariateCounts.get(missing.length) ?? 0) + 1);

    const first = FIRST_FAILURE_ORDER.find((code) => missing.includes(code));
    if (first) firstFailure.set(first, (firstFailure.get(first) ?? 0) + 1);
  }

  const atRiskCells = reachedCovariateStage - rawCompleteCells;
  const rescuedByBackfill = Math.max(0, panelRows.length - rawCompleteCells);
  const permanentlyLost = atRiskCells - rescuedByBackfill;

  const ordered = (map: Map<string, number>) =>
    COVARIATES.map((c) => ({
      covariate: c.code,
      label: c.label,
      cells: map.get(c.code) ?? 0,
      shareOfAtRisk: atRiskCells > 0 ? Number(((map.get(c.code) ?? 0) / atRiskCells).toFixed(4)) : null,
    })).sort((a, b) => b.cells - a.cells);

  const exposureRows = ordered(exposure);
  const exposureSum = exposureRows.reduce((sum, r) => sum + r.cells, 0);

  // The manuscript's own arithmetic is the check: if the three leading counts
  // summed to the at-risk total, they would be a partition and "alone" would be
  // defensible. They exceed it, which is why the wording must say so.
  const leadingSum = exposureRows.slice(0, 3).reduce((sum, r) => sum + r.cells, 0);

  const auditLost = audit.attrition?.missingCovariate ?? null;
  const payload = {
    schemaVersion: 'phase1.covariate_blocker_attribution.v1',
    generatedAtIso: new Date().toISOString(),
    purpose:
      'Attribute the covariate-stage cells that are missing at least one raw driver, so the manuscript, the application and the panel builder describe the same sample and the same quantity.',
    definition: {
      frame:
        'Construct-bearing country-years that survive ISO resolution, have a computable outcome, and have a macro row.',
      exposure:
        'A cell counts once for every covariate it is missing. Counts therefore overlap and sum to more than atRiskCells; they are not a partition and must not be added.',
      firstFailure:
        'Each at-risk cell counts once, against the first missing covariate in the builder order X,Y,T,E,R,M. This is a partition of atRiskCells and answers a different question than exposure.',
      exclusive:
        'Cells missing exactly one raw covariate. A subset of firstFailure that is invariant to the ordering.',
    },
    sources: {
      constructs: path.relative(ROOT, CONSTRUCTS),
      macro: path.relative(ROOT, MACRO),
      panel: path.relative(ROOT, PANEL),
      isoResolution: `parsed from ${path.relative(ROOT, BUILDER)}`,
    },
    frame: {
      constructRows: constructs.length,
      unresolvableIso,
      missingOutcome,
      noMacroRow,
      reachedCovariateStage,
      rawCompleteCells,
      atRiskCells,
    },
    exposure: exposureRows,
    exposureSum,
    exposureIsPartition: exposureSum === atRiskCells,
    firstFailureOrder: [...FIRST_FAILURE_ORDER],
    firstFailure: ordered(firstFailure),
    exclusive: ordered(exclusive),
    missingCovariateHistogram: [...missingCovariateCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([covariatesMissing, cells]) => ({ covariatesMissing, cells })),
    resolution: {
      rawCompleteCells,
      rescuedByBackfill,
      permanentlyLost,
      backfillWindowYears: 5,
    },
    crossChecks: {
      panelRows: audit.rows,
      auditMissingCovariate: auditLost,
      lostAgreesWithAudit: auditLost === permanentlyLost,
      auditMissingByCovariate: audit.missingByCovariate ?? {},
      note:
        'auditMissingByCovariate is the builder\'s post-backfill, first-failure attribution of the cells that stay lost. It is not comparable to exposure above and is recorded only so a reader can see both.',
    },
  };

  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`✅ ${path.relative(ROOT, OUT)}`);
  console.log(`   ${constructs.length} construct rows → ${reachedCovariateStage} reach the covariate stage`);
  console.log(`   raw-complete ${rawCompleteCells}; at risk ${atRiskCells}; rescued ${rescuedByBackfill}; lost ${permanentlyLost}`);
  console.log(`   exposure (overlapping, sums to ${exposureSum} > ${atRiskCells}):`);
  for (const row of exposureRows) console.log(`     ${row.covariate}: ${row.cells}`);
  console.log(`   leading three sum to ${leadingSum}: ${leadingSum > atRiskCells ? 'NOT a partition' : 'unexpectedly a partition'}`);
  if (auditLost !== null && auditLost !== permanentlyLost) {
    console.error(`   WARNING: the panel audit records ${auditLost} cells lost to a covariate, this derivation says ${permanentlyLost}.`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
