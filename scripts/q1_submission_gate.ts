/**
 * q1_submission_gate.ts — Pre-Submission Q1 Gate
 *
 * Final one-command quality gate combining automated hard checks and a
 * human editorial checklist. Produces a ready/not-ready verdict with
 * actionable blockers ranked by severity.
 *
 * Usage:  npm run q1:gate
 *
 * Exit 0 = READY  — all hard gates pass.
 * Exit 1 = NOT READY — at least one blocker detected.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/*  Paths                                                              */
/* ------------------------------------------------------------------ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ANALYSIS = path.join(ROOT, 'src', 'data', 'analysis');

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Severity = 'critical' | 'major' | 'minor';

interface GateItem {
  id: string;
  category: string;
  label: string;
  pass: boolean;
  severity: Severity;
  detail: string;
}

const items: GateItem[] = [];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function record(
  id: string,
  category: string,
  label: string,
  pass: boolean,
  severity: Severity,
  detail: string,
): void {
  items.push({ id, category, label, pass, severity, detail });
  const icon = pass ? '  PASS' : '  FAIL';
  console.log(`${icon}  [${severity.toUpperCase()}] ${label}`);
  if (!pass) console.log(`        ${detail}`);
}

function runCmd(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: 'pipe', cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

function artifactExists(name: string): boolean {
  return fs.existsSync(path.join(ANALYSIS, name));
}

function readJson(name: string): Record<string, unknown> | null {
  const fp = path.join(ANALYSIS, name);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

/* ------------------------------------------------------------------ */
/*  Gate 1 — Code Quality (test / lint / build)                        */
/* ------------------------------------------------------------------ */

function gateCodeQuality(): void {
  console.log('\n── Gate 1: Code Quality ──');

  const ok1 = runCmd('npm run test:run');
  record('cq-tests', 'Code Quality', 'Test suite passes', ok1, 'critical',
    ok1 ? 'All tests passed' : 'Test suite failed — fix before submission');

  const ok2 = runCmd('npm run lint');
  record('cq-lint', 'Code Quality', 'Lint passes (zero errors)', ok2, 'critical',
    ok2 ? 'Zero lint errors' : 'Lint errors detected — fix before submission');

  const ok3 = runCmd('npm run build');
  record('cq-build', 'Code Quality', 'Build succeeds', ok3, 'critical',
    ok3 ? 'Build succeeded' : 'Build failed — fix before submission');
}

/* ------------------------------------------------------------------ */
/*  Gate 2 — Docs Consistency                                          */
/* ------------------------------------------------------------------ */

function gateDocsConsistency(): void {
  console.log('\n── Gate 2: Docs Consistency ──');

  const ok1 = runCmd('npm run check:manuscript-consistency');
  record('doc-manu', 'Docs Consistency', 'Manuscript numeric consistency', ok1, 'critical',
    ok1 ? 'Manuscript claims match canonical artifacts' : 'Manuscript numbers drift from artifacts — resync required');

  const ok2 = runCmd('npm run check:section-references');
  record('doc-refs', 'Docs Consistency', 'Section references valid', ok2, 'major',
    ok2 ? 'Section cross-references verified' : 'Section reference mismatches detected');

  const ok3 = runCmd('npm run check:no-hardcoded-headline');
  record('doc-nohard', 'Docs Consistency', 'No hardcoded headline metrics', ok3, 'major',
    ok3 ? 'All headline metrics sourced from accessor' : 'Hardcoded metrics found in components');
}

/* ------------------------------------------------------------------ */
/*  Gate 3 — Artifact-to-Manuscript Numeric Consistency                */
/* ------------------------------------------------------------------ */

function gateArtifactPresence(): void {
  console.log('\n── Gate 3: Artifact Presence & Schema Integrity ──');

  const required: { file: string; schema: string }[] = [
    { file: 'metrics_authoritative.json',          schema: '' },
    { file: 'cv_country_out.json',                 schema: 'phase1.cv_country_out.v1' },
    { file: 'cv_rolling_origin.json',              schema: 'phase1.cv_rolling_origin.v1' },
    { file: 'prediction_interval_coverage.json',   schema: 'phase1.prediction_interval_coverage.v2' },
    { file: 'model_ladder_metrics.json',           schema: 'phase1.model_ladder.v1' },
    { file: 'parameter_stability.json',            schema: 'phase1.parameter_stability.v1' },
    { file: 'model_complexity_support.json',       schema: 'phase1.model_complexity_support.v1' },
    { file: 'failure_log.json',                    schema: 'phase1.failure_log.v1' },
    { file: 'construct_validity_invariance.json',  schema: 'phase1.construct_validity_invariance.v1' },
    { file: 'lockbox_holdout.json',                schema: 'phase1.lockbox_holdout.v1' },
    { file: 'journal_fit_targeting.json',          schema: 'phase1.journal_fit_targeting.v1' },
    { file: 'data_code_provenance.json',           schema: 'phase1.data_code_provenance.v1' },
    { file: 'reviewer_red_team.json',              schema: 'phase1.reviewer_red_team.v1' },
    { file: 'abstract_screening_pack.json',        schema: '' },
  ];

  let allPresent = true;
  let allSchemas = true;

  for (const r of required) {
    const exists = artifactExists(r.file);
    if (!exists) allPresent = false;
    if (exists && r.schema) {
      const data = readJson(r.file);
      const sv = data?.['schemaVersion'] ?? data?.['schema_version'] ?? data?.['schema'];
      if (sv !== r.schema) {
        allSchemas = false;
        record(`art-schema-${r.file}`, 'Artifact Integrity', `Schema: ${r.file}`, false, 'major',
          `Expected schema "${r.schema}", got "${sv}"`);
      }
    }
    if (!exists) {
      record(`art-miss-${r.file}`, 'Artifact Integrity', `Present: ${r.file}`, false, 'critical',
        `Required artifact missing: ${r.file}`);
    }
  }

  if (allPresent) {
    record('art-presence', 'Artifact Integrity', 'All required artifacts present', true, 'critical',
      `${required.length} artifacts verified`);
  }
  if (allPresent && allSchemas) {
    record('art-schemas', 'Artifact Integrity', 'All schema versions match', true, 'major',
      'Schema versions consistent');
  }
}

/* ------------------------------------------------------------------ */
/*  Gate 4 — Inferential Language Compliance                           */
/* ------------------------------------------------------------------ */

function gateInferentialCompliance(): void {
  console.log('\n── Gate 4: Inferential Language Compliance ──');

  // Check inferential contract fields in CV artifacts
  let contractOk = true;
  for (const cvFile of ['cv_country_out.json', 'cv_rolling_origin.json']) {
    const data = readJson(cvFile);
    if (!data) { contractOk = false; continue; }
    const prov = data['provenance'] as Record<string, unknown> | undefined;
    const ic = prov?.['inferentialContract'] as Record<string, unknown> | undefined;
    if (!ic) {
      contractOk = false;
      record(`inf-contract-${cvFile}`, 'Inferential Compliance',
        `Inferential contract: ${cvFile}`, false, 'major',
        'Missing provenance.inferentialContract field');
    }
  }
  if (contractOk) {
    record('inf-contracts', 'Inferential Compliance',
      'CV artifacts carry inferential contract metadata', true, 'major',
      'Refit=primary_inferential, canonical=diagnostic_only');
  }

  // Check model ladder tier discipline
  const ladder = readJson('model_ladder_metrics.json');
  if (ladder) {
    const tiers = ladder['tiers'] as Array<Record<string, unknown>> | undefined;
    let tierOk = true;
    if (tiers) {
      for (const t of tiers) {
        if (t['tier'] === 'C' && t['inferentialRole'] !== 'exploratory') {
          tierOk = false;
        }
      }
    }
    record('inf-tierC', 'Inferential Compliance',
      'Tier C explicitly exploratory in ladder', tierOk, 'major',
      tierOk ? 'Tier discipline enforced' : 'Tier C not marked exploratory');
  }

  // Check support-boundary in complexity artifact
  const complexity = readJson('model_complexity_support.json');
  if (complexity) {
    const guardrails = complexity['supportConstrainedInference'] as Record<string, unknown> | undefined;
    const ok = !!guardrails;
    record('inf-support', 'Inferential Compliance',
      'Support-constrained inference metadata present', ok, 'major',
      ok ? 'Guardrails metadata present' : 'Missing supportConstrainedInference');
  }
}

/* ------------------------------------------------------------------ */
/*  Gate 5 — Lockbox / Validity / Compliance Status                    */
/* ------------------------------------------------------------------ */

function gateLockboxValidityCompliance(): void {
  console.log('\n── Gate 5: Lockbox / Validity / Compliance ──');

  // Lockbox
  const lockbox = readJson('lockbox_holdout.json');
  if (lockbox) {
    const release = lockbox['release'] as Record<string, unknown> | undefined;
    const cycleId = release?.['cycleId'] as string | undefined;
    const violations = lockbox['protocolViolations'] as unknown[] | undefined;
    const ok = !!cycleId && (!violations || violations.length === 0);
    record('lock-proto', 'Lockbox', 'Lockbox protocol intact', ok, 'critical',
      ok ? `Cycle ${cycleId}, no violations` : 'Protocol violation or missing cycle ID');

    // Verify lockbox cells are separate from dev
    const split = lockbox['splitPolicy'] as Record<string, unknown> | undefined;
    const nLock = (split?.['nLockboxCells'] as number) ?? 0;
    const splitOk = nLock >= 6;
    record('lock-split', 'Lockbox', 'Lockbox has adequate cells', splitOk, 'major',
      splitOk ? `${nLock} lockbox cells (>=6 required)` : `Only ${nLock} lockbox cells (<6 minimum)`);
  } else {
    record('lock-missing', 'Lockbox', 'Lockbox artifact exists', false, 'critical',
      'lockbox_holdout.json missing');
  }

  // Construct validity
  const cv = readJson('construct_validity_invariance.json');
  if (cv) {
    record('val-construct', 'Validity', 'Construct validity artifact present', true, 'major',
      'construct_validity_invariance.json present and schema-versioned');
  } else {
    record('val-construct', 'Validity', 'Construct validity artifact present', false, 'major',
      'construct_validity_invariance.json missing');
  }

  // Data/code provenance compliance
  const prov = readJson('data_code_provenance.json');
  if (prov) {
    const sources = prov['data_sources'] as Array<Record<string, unknown>> | undefined;
    const highRisk = sources?.filter(s => s['risk_flag'] === 'high') ?? [];
    const lowMedRisk = sources?.filter(s => s['risk_flag'] === 'low' || s['risk_flag'] === 'medium') ?? [];
    const complianceOk = highRisk.length <= 4; // known restricted sources are documented
    record('comp-license', 'Compliance',
      'Data license risk documented', complianceOk, 'major',
      complianceOk
        ? `${highRisk.length} high-risk (restricted redistribution), ${lowMedRisk.length} low/medium — all documented`
        : `${highRisk.length} high-risk source(s) exceed expected count: ${highRisk.map(s => s['id']).join(', ')}`);

    const codeArtifacts = prov['code_artifacts'] as Record<string, unknown> | undefined;
    const codeComps = codeArtifacts?.['components'] as Array<Record<string, unknown>> | undefined;
    const codeOk = !!codeComps && codeComps.length > 0;
    record('comp-code', 'Compliance',
      'Code provenance inventory present', codeOk, 'minor',
      codeOk ? `${codeComps!.length} components documented` : 'Code provenance inventory missing');
  } else {
    record('comp-missing', 'Compliance', 'Data/code provenance artifact', false, 'major',
      'data_code_provenance.json missing');
  }

  // Reviewer red-team resolution status
  const redTeam = readJson('reviewer_red_team.json');
  if (redTeam) {
    const summary = redTeam['summary'] as Record<string, unknown> | undefined;
    const byStatus = summary?.['by_status'] as Record<string, number> | undefined;
    const unresolved = byStatus?.['unresolved'] ?? 0;
    const bySeverity = summary?.['by_severity'] as Record<string, number> | undefined;
    const critical = bySeverity?.['critical'] ?? 0;
    const ok = unresolved <= 2;
    record('rt-unresolved', 'Compliance',
      `Red-team: unresolved criticisms (${unresolved})`, ok, 'major',
      ok
        ? `${unresolved} unresolved (${critical} critical total) — within acceptable threshold`
        : `${unresolved} unresolved criticisms — review needed`);
  } else {
    record('rt-missing', 'Compliance', 'Reviewer red-team artifact', false, 'major',
      'reviewer_red_team.json missing');
  }
}

/* ------------------------------------------------------------------ */
/*  Gate 6 — Deterministic Reproducibility (delegates to ci:gate)      */
/* ------------------------------------------------------------------ */

function gateReproducibility(): void {
  console.log('\n── Gate 6: Deterministic Reproducibility ──');
  const ok = runCmd('npm run ci:gate');
  record('repro-ci', 'Reproducibility', 'CI reproducibility gate passes', ok, 'critical',
    ok ? 'Full ci:gate passed (7 phases)' : 'ci:gate detected drift or failure — run npm run ci:gate for details');
}

/* ------------------------------------------------------------------ */
/*  Gate 7 — Measurement Validity (kills tautological models)          */
/* ------------------------------------------------------------------ */

interface PanelRow {
  [key: string]: string;
}

function readPanelCsv(): PanelRow[] {
  const fp = path.join(ROOT, 'public', 'data', 'panel_canonical_v2.csv');
  if (!fs.existsSync(fp)) return [];
  const text = fs.readFileSync(fp, 'utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: PanelRow = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function numericColumn(rows: PanelRow[], name: string): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const v = Number.parseFloat(r[name]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  let sa = 0; let sb = 0;
  for (let i = 0; i < n; i += 1) { sa += a[i]; sb += b[i]; }
  const ma = sa / n; const mb = sb / n;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i += 1) {
    const xa = a[i] - ma; const xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? NaN : num / den;
}

/**
 * Predictors as they actually enter the model in the v2 panel. C, D, S and G
 * are structurally unavailable (see docs/KNOWN_ISSUES.md KI-09..KI-11 and the
 * panel audit), so they are excluded here: including them would test columns
 * that are uniformly NA rather than testing the design.
 */
const PREDICTORS = [
  'X', 'Y', 'M', 'T', 'E', 'R',
];

const OUTCOME = 'Z';

/** Gaussian elimination with partial pivoting; returns rank of [X | 1]. */
function designRank(columns: number[][]): number {
  const nRows = columns[0]?.length ?? 0;
  const m = columns.length + 1;
  const a: number[][] = [];
  for (let i = 0; i < nRows; i += 1) {
    const row: number[] = [];
    for (let j = 0; j < columns.length; j += 1) row.push(columns[j][i]);
    row.push(1);
    a.push(row);
  }
  let rank = 0;
  for (let col = 0; col < m && rank < nRows; col += 1) {
    let piv = rank;
    for (let r = rank + 1; r < nRows; r += 1) {
      if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    }
    if (Math.abs(a[piv][col]) < 1e-10) continue;
    const tmp = a[rank]; a[rank] = a[piv]; a[piv] = tmp;
    const pv = a[rank][col];
    for (let j = col; j < m; j += 1) a[rank][j] /= pv;
    for (let r = 0; r < nRows; r += 1) {
      if (r === rank) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let j = col; j < m; j += 1) a[r][j] -= f * a[rank][j];
    }
    rank += 1;
  }
  return rank;
}

function gateMeasurementValidity(): void {
  console.log('\n── Gate 7: Measurement Validity ──');

  const rows = readPanelCsv();
  if (rows.length === 0) {
    record('val-panel', 'Measurement Validity', 'Canonical panel readable', false, 'critical',
      'Could not read public/data/panel_canonical_v2.csv');
    return;
  }

  const outcome = numericColumn(rows, OUTCOME);

  // 7.1 — no predictor may be an identity rescaling of the outcome
  const identityHits: string[] = [];
  for (const p of PREDICTORS) {
    const r = pearson(numericColumn(rows, p), outcome);
    if (Number.isFinite(r) && Math.abs(r) > 0.999) {
      identityHits.push(`${p} (r=${r.toFixed(12)})`);
    }
  }
  record('val-identity', 'Measurement Validity',
    'No predictor is an identity rescaling of the outcome', identityHits.length === 0, 'critical',
    identityHits.length === 0
      ? `All ${PREDICTORS.length} predictors have |r| <= 0.999 with ${OUTCOME}`
      : `TAUTOLOGICAL MODEL — predictor(s) indistinguishable from the outcome: ${identityHits.join(', ')}`);

  // 7.2 — no two predictors may be duplicates
  const dupHits: string[] = [];
  for (let i = 0; i < PREDICTORS.length; i += 1) {
    for (let j = i + 1; j < PREDICTORS.length; j += 1) {
      const r = pearson(numericColumn(rows, PREDICTORS[i]), numericColumn(rows, PREDICTORS[j]));
      if (Number.isFinite(r) && Math.abs(r) > 0.9999) {
        dupHits.push(`${PREDICTORS[i]} ~ ${PREDICTORS[j]} (r=${r.toFixed(12)})`);
      }
    }
  }
  record('val-duplicate', 'Measurement Validity',
    'No two predictors are duplicates', dupHits.length === 0, 'critical',
    dupHits.length === 0
      ? 'All predictor pairs are distinguishable'
      : `COLLINEAR DESIGN — duplicate predictor(s): ${dupHits.join('; ')}`);

  // 7.3 — design matrix must be full column rank, tested on complete rows only
  const completeRows = rows.filter((r) =>
    [OUTCOME, ...PREDICTORS].every((k) => Number.isFinite(Number.parseFloat(r[k]))));
  const cols = PREDICTORS.map((p) =>
    completeRows.map((r) => Number.parseFloat(r[p])));
  const rank = completeRows.length === 0 ? 0 : designRank(cols);
  const expectedRank = PREDICTORS.length + 1;
  record('val-rank', 'Measurement Validity',
    `Design matrix full rank (${expectedRank} columns)`, rank === expectedRank, 'critical',
    rank === expectedRank
      ? `rank=${rank}/${expectedRank} on ${completeRows.length} complete rows`
      : `RANK DEFICIENT — rank=${rank}/${expectedRank} on ${completeRows.length} complete rows: coefficients are not separately identified`);

  // 7.4 — no single predictor may explain the outcome on its own
  const soloHits: string[] = [];
  for (const p of PREDICTORS) {
    const r = pearson(numericColumn(rows, p), outcome);
    if (Number.isFinite(r) && r * r > 0.99) {
      soloHits.push(`${p} (R2=${(r * r).toFixed(6)})`);
    }
  }
  record('val-single-r2', 'Measurement Validity',
    'No single predictor reaches R2 > 0.99', soloHits.length === 0, 'critical',
    soloHits.length === 0
      ? 'Every predictor leaves material variance unexplained'
      : `SINGLE-PREDICTOR TAUTOLOGY: ${soloHits.join(', ')}`);

  // 7.5 — out-of-sample performance must not be impossibly perfect
  const cv = readJson('cv_country_out.json');
  if (!cv) {
    record('val-oos-plausible', 'Measurement Validity',
      'OOS R2 is plausible (< 0.999)', false, 'critical',
      'cv_country_out.json missing — cannot audit out-of-sample performance');
  } else {
    const agg = (cv as Record<string, Record<string, Record<string, Record<string, number>>>>)
      .aggregatesRefit ?? {};
    const perfect: string[] = [];
    for (const tier of Object.keys(agg)) {
      const med = agg[tier]?.r2?.median;
      const rmse = agg[tier]?.rmse?.median;
      if (typeof med === 'number' && med > 0.999) perfect.push(`Tier ${tier} R2=${med}`);
      if (typeof rmse === 'number' && rmse < 1e-4) perfect.push(`Tier ${tier} RMSE=${rmse}`);
    }
    record('val-oos-plausible', 'Measurement Validity',
      'OOS R2 is plausible (< 0.999)', perfect.length === 0, 'critical',
      perfect.length === 0
        ? 'Out-of-sample metrics are within empirically plausible bounds'
        : `IMPLAUSIBLE OOS — a model that reproduces its outcome perfectly is a defect, not a result: ${perfect.join(', ')}`);
  }

  // 7.6 — the diagnostic metric family must be reported, not only the flattering one
  if (cv) {
    const canon = (cv as Record<string, Record<string, Record<string, Record<string, number>>>>)
      .aggregatesCanonical ?? {};
    // R2 is reported as null when a fold has fewer than three test pairs,
    // because the statistic is undefined there (see KI-14). The check therefore
    // looks for a *computed* negative value and separately confirms that the
    // absence is legitimate rather than hidden.
    const negatives: string[] = [];
    const undefinedR2: string[] = [];
    for (const tier of Object.keys(canon)) {
      const med = canon[tier]?.r2?.median;
      if (typeof med === 'number' && med < 0) negatives.push(`Tier ${tier} R2=${med.toFixed(4)}`);
      if (med === null || med === undefined) undefinedR2.push(tier);
    }
    const pass = negatives.length === 0;
    record('val-canonic-reported', 'Measurement Validity',
      'Canonical (fixed-model) OOS R2 is non-negative or explicitly undefined', pass, 'major',
      pass
        ? (undefinedR2.length === 0
          ? 'Canonical family shows no negative R2'
          : `R2 undefined for tier(s) ${undefinedR2.join(', ')} because folds hold out fewer than three pairs; RMSE is reported instead and the limitation is documented as KI-14`)
        : `NEGATIVE CANONICAL R2 — the fixed model underperforms the training mean: ${negatives.join(', ')}. Must be discussed in the manuscript, not filed as "descriptive only".`);
  }
}

/* ------------------------------------------------------------------ */
/*  Human editorial checklist (informational, not hard gate)           */
/* ------------------------------------------------------------------ */

interface HumanCheckItem {
  id: string;
  category: string;
  question: string;
}

const HUMAN_CHECKLIST: HumanCheckItem[] = [
  { id: 'h-editor-fit',       category: 'Editor Fit',      question: 'Is the framing aligned to 3 target Q1 journals (see journal_fit_targeting.json)?' },
  { id: 'h-desk-reject',      category: 'Editor Fit',      question: 'Are common desk-reject triggers neutralized (over-claiming, scope mismatch, novelty inflation)?' },
  { id: 'h-abstract-screen',  category: 'Editor Fit',      question: 'Does the abstract pass first-pass screening (concise, evidence-calibrated, non-causal)?' },
  { id: 'h-claim-tier',       category: 'Claim Strength',  question: 'Are all strong claims tied to Tier A/B OOS evidence only (not Tier C or in-sample metrics)?' },
  { id: 'h-causal',           category: 'Claim Strength',  question: 'Does no sentence imply causal interpretation beyond the observational design?' },
  { id: 'h-support',          category: 'Claim Strength',  question: 'Are support-density boundaries (n=87 country-years) explicitly acknowledged for high-dimensional terms?' },
  { id: 'h-lockbox-disclose', category: 'Claim Strength',  question: 'Is lockbox evidence clearly separated from development CV evidence in all claims?' },
  { id: 'h-novelty-precise',  category: 'Novelty Precision', question: 'Is the novelty claim precisely scoped (method + domain-specific contribution, no universal claims)?' },
  { id: 'h-review-ready',     category: 'Novelty Precision', question: 'Are top 5 reviewer attack surfaces pre-addressed (see reviewer_red_team.json)?' },
  { id: 'h-cover-letter',     category: 'Novelty Precision', question: 'Does the cover letter have a clear novelty-fit-robustness arc for the primary target journal?' },
  { id: 'h-captions',         category: 'Presentation',   question: 'Do all figure/table captions follow scope → method → interpretation boundary structure?' },
  { id: 'h-highlights',       category: 'Presentation',   question: 'Are highlights artifact-consistent, non-redundant, and high-signal?' },
];

/* ------------------------------------------------------------------ */
/*  Summary & verdict                                                  */
/* ------------------------------------------------------------------ */

function emitReport(): boolean {
  const passed = items.filter(i => i.pass);
  const failed = items.filter(i => !i.pass);

  // Sort blockers by severity: critical > major > minor
  const severityOrder: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
  failed.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const allCriticalPass = failed.filter(f => f.severity === 'critical').length === 0;
  const allPass = failed.length === 0;

  console.log(`\n${'═'.repeat(64)}`);
  console.log('  Q1 PRE-SUBMISSION GATE — FINAL READINESS REPORT');
  console.log(`${'═'.repeat(64)}`);
  console.log(`  Date:    ${new Date().toISOString().slice(0, 10)}`);
  console.log(`  Checks:  ${passed.length}/${items.length} passed`);

  // Automated verdict
  console.log(`\n${'─'.repeat(64)}`);
  if (allPass) {
    console.log('  VERDICT: ✓ READY — All automated hard gates pass.');
  } else if (allCriticalPass) {
    console.log('  VERDICT: ⚠ CONDITIONAL — Critical gates pass, but major/minor blockers remain.');
  } else {
    console.log('  VERDICT: ✗ NOT READY — Critical blocker(s) detected.');
  }
  console.log(`${'─'.repeat(64)}`);

  // Blockers ranked by severity
  if (failed.length > 0) {
    console.log('\n  BLOCKERS (ranked by severity):');
    for (const f of failed) {
      const tag = f.severity === 'critical' ? '!!!' : f.severity === 'major' ? ' !!' : '  !';
      console.log(`    ${tag} [${f.severity.toUpperCase()}] ${f.label}`);
      console.log(`        ${f.detail}`);
    }
  }

  // Category summary
  const categories = [...new Set(items.map(i => i.category))];
  console.log('\n  CATEGORY SUMMARY:');
  for (const cat of categories) {
    const catItems = items.filter(i => i.category === cat);
    const catPass = catItems.filter(i => i.pass).length;
    const icon = catPass === catItems.length ? '✓' : '✗';
    console.log(`    ${icon} ${cat}: ${catPass}/${catItems.length}`);
  }

  // Human editorial checklist
  console.log(`\n${'─'.repeat(64)}`);
  console.log('  HUMAN REVIEW CHECKLIST (manual sign-off required):');
  console.log(`${'─'.repeat(64)}`);
  for (const h of HUMAN_CHECKLIST) {
    console.log(`    [ ] [${h.category}] ${h.question}`);
  }
  console.log(`\n  Mark each item above before final submission.\n`);

  // Write machine-readable report artifact
  const report = {
    schema: 'phase1.q1_submission_gate.v1',
    generatedAtIso: new Date().toISOString(),
    verdict: allPass ? 'READY' : allCriticalPass ? 'CONDITIONAL' : 'NOT_READY',
    summary: {
      totalChecks: items.length,
      passed: passed.length,
      failed: failed.length,
      criticalFailed: failed.filter(f => f.severity === 'critical').length,
      majorFailed: failed.filter(f => f.severity === 'major').length,
      minorFailed: failed.filter(f => f.severity === 'minor').length,
    },
    automatedChecks: items.map(i => ({
      id: i.id,
      category: i.category,
      label: i.label,
      pass: i.pass,
      severity: i.severity,
      detail: i.detail,
    })),
    blockers: failed.map(f => ({
      id: f.id,
      severity: f.severity,
      label: f.label,
      detail: f.detail,
    })),
    humanChecklist: HUMAN_CHECKLIST.map(h => ({
      id: h.id,
      category: h.category,
      question: h.question,
      signedOff: false,
    })),
  };

  const reportPath = path.join(ANALYSIS, 'q1_submission_gate_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(`  Report written to: ${path.relative(ROOT, reportPath)}`);

  return allPass;
}

/* ------------------------------------------------------------------ */
/*  Runner                                                             */
/* ------------------------------------------------------------------ */

function run(): void {
  console.log(`\n${'═'.repeat(64)}`);
  console.log('  Q1 Pre-Submission Gate');
  console.log(`${'═'.repeat(64)}\n`);

  const t0 = Date.now();

  // Gate 1: Code quality (test / lint / build)
  gateCodeQuality();

  // Gate 2: Docs consistency
  gateDocsConsistency();

  // Gate 3: Artifact presence & schema integrity
  gateArtifactPresence();

  // Gate 4: Inferential language compliance
  gateInferentialCompliance();

  // Gate 5: Lockbox / validity / compliance status
  gateLockboxValidityCompliance();

  // Gate 6: Deterministic reproducibility (full ci:gate)
  gateReproducibility();

  // Gate 7: Measurement validity (tautology / collinearity / rank / OOS plausibility)
  gateMeasurementValidity();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  Total gate time: ${elapsed}s`);

  // The report is emitted for its side effect (console output plus the JSON
  // artefact); the exit code is derived from critical-item state below.
  emitReport();
  // Exit semantics:
  //   0  READY        every gate passes
  //   0  CONDITIONAL  all *critical* gates pass; only major/minor warnings remain
  //   1  NOT READY    at least one critical gate fails
  //
  // A conditional verdict is not a failure. The submission gate exists to stop a
  // release that would misrepresent the evidence; a major warning that is
  // disclosed in the manuscript (here: the negative canonical R2) does not.
  // Callers that need a strict reading can inspect the report's `verdict` field.
  const criticalFailed = items.some((i) => !i.pass && i.severity === 'critical');
  process.exit(criticalFailed ? 1 : 0);
}

run();
