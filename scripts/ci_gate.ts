/**
 * ci_gate.ts — Deterministic Reproducibility CI Gate
 *
 * Single-command quality gate that verifies end-to-end reproducibility
 * and fails fast on drift in artifacts, schemas, metrics, or code quality.
 *
 * Usage:  npm run ci:gate
 *
 * Exit 0 = all checks pass (release candidate is reproducible).
 * Exit 1 = at least one check failed (drift detected).
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
const METRICS  = path.join(ROOT, 'src', 'data', 'metrics');

/* ------------------------------------------------------------------ */
/*  Expected schema versions                                           */
/* ------------------------------------------------------------------ */

const EXPECTED_SCHEMAS: Record<string, { field: string; value: string | number }> = {
  'collinearity_diagnostics.json': { field: 'schemaVersion', value: 'phase1.collinearity_diagnostics.v1' },
  'cv_country_out.json':                { field: 'schemaVersion', value: 'phase1.cv_country_out.v1' },
  'cv_kfold.json':                      { field: 'schemaVersion', value: 'phase1.cv_kfold.v1' },
  'functional_form_comparison.json':    { field: 'schemaVersion', value: 'phase1.functional_form_comparison.v1' },
  'construct_prevalence.json':          { field: 'schemaVersion', value: 'phase1.construct_prevalence.v1' },
  'cv_rolling_origin.json':             { field: 'schemaVersion', value: 'phase1.cv_rolling_origin.v1' },
  'prediction_interval_coverage.json':  { field: 'schemaVersion', value: 'phase1.prediction_interval_coverage.v2' },
  'model_ladder_metrics.json':          { field: 'schemaVersion', value: 'phase1.model_ladder.v1' },
  'parameter_stability.json':           { field: 'schemaVersion', value: 'phase1.parameter_stability.v1' },
  'model_complexity_support.json':      { field: 'schemaVersion', value: 'phase1.model_complexity_support.v1' },
  'failure_log.json':                   { field: 'schemaVersion', value: 'phase1.failure_log.v1' },
  'construct_validity_invariance.json': { field: 'schemaVersion', value: 'phase1.construct_validity_invariance.v1' },
  'lockbox_holdout.json':               { field: 'schemaVersion', value: 'phase1.lockbox_holdout.v1' },
};

const EXPECTED_HEADLINE_SCHEMA = 1; // headline_metrics_authoritative.json schema_version

/* ------------------------------------------------------------------ */
/*  Expected canonical metric values (tolerance-gated)                 */
/* ------------------------------------------------------------------ */

interface MetricExpectation {
  key: string;
  expected: number;
  tolerance: number; // absolute
}

// v2 panel. The previous values (n=630, r2=0.8461) belonged to the model in
// which the predictor C was an exact rescaling of the outcome; they are not a
// target to return to. See docs/KNOWN_ISSUES.md KI-01 and KI-13.
/**
 * Expected canonical metrics.
 *
 * These are a regression guard, not a target: they pin whatever the committed
 * panel currently produces so that an accidental change to the data path is
 * caught. When the panel itself changes deliberately (here: the WDI Gini
 * backfill took the sample from 87 to 126 cells, which legitimately moves every
 * number), update this block in the same commit that changes the panel and say
 * so in the message. The one thing that must never happen is editing this list
 * to make a failing build green without a corresponding data change.
 */
const CANONICAL_METRICS: MetricExpectation[] = [
  { key: 'n',    expected: 146,     tolerance: 0 },
  { key: 'r2',   expected: 0.2745,  tolerance: 0.0001 },
  { key: 'corr', expected: 0.5851,  tolerance: 0.0001 },
  { key: 'mae',  expected: 0.1737,  tolerance: 0.0001 },
  { key: 'rmse', expected: 0.2222,  tolerance: 0.0001 },
  { key: 'bias', expected: 0.0488,  tolerance: 0.0001 },
];

/* ------------------------------------------------------------------ */
/*  Expected artifact files (must exist after generation)              */
/* ------------------------------------------------------------------ */

const REQUIRED_ARTIFACTS = [
  path.join(ANALYSIS, 'metrics_authoritative.json'),
  path.join(ANALYSIS, 'observed_vs_predicted_authoritative.csv'),
  path.join(ANALYSIS, 'cv_country_out.json'),
  path.join(ANALYSIS, 'cv_kfold.json'),
  path.join(ANALYSIS, 'functional_form_comparison.json'),
  path.join(ANALYSIS, 'construct_prevalence.json'),
  path.join(ANALYSIS, 'cv_rolling_origin.json'),
  path.join(ANALYSIS, 'prediction_interval_coverage.json'),
  path.join(ANALYSIS, 'model_ladder_metrics.json'),
  path.join(ANALYSIS, 'parameter_stability.json'),
  path.join(ANALYSIS, 'model_complexity_support.json'),
  path.join(ANALYSIS, 'failure_log.json'),
  path.join(ANALYSIS, 'construct_validity_invariance.json'),
  path.join(ANALYSIS, 'collinearity_diagnostics.json'),
  path.join(ANALYSIS, 'lockbox_holdout.json'),
  path.join(METRICS,  'headline_metrics_authoritative.json'),
];

/* ------------------------------------------------------------------ */
/*  Canonical data fingerprint                                         */
/* ------------------------------------------------------------------ */

const CANONICAL_PANEL_SHA256 = '0BEB00623687EC3E1F59959CDB4EEC9DC316CE41B9CDFEC7E99429130395D18E';

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex').toUpperCase();
}

/**
 * Strip volatile fields (timestamps) from JSON text so fingerprints
 * are deterministic across runs.
 */
function stripVolatileFields(jsonText: string): string {
  return jsonText
    .replace(/"timestamp"\s*:\s*"[^"]*"/g,        '"timestamp":"__STRIPPED__"')
    .replace(/"generatedAtIso"\s*:\s*"[^"]*"/g,   '"generatedAtIso":"__STRIPPED__"')
    .replace(/"generated_at_utc"\s*:\s*"[^"]*"/g, '"generated_at_utc":"__STRIPPED__"');
}

/* ------------------------------------------------------------------ */
/*  Gate step definitions                                              */
/* ------------------------------------------------------------------ */

interface GateResult {
  step: string;
  pass: boolean;
  detail: string;
}

const results: GateResult[] = [];

function record(step: string, pass: boolean, detail: string): void {
  results.push({ step, pass, detail });
  const icon = pass ? '  PASS' : '  FAIL';
  console.log(`${icon}  ${step}`);
  if (!pass) console.log(`        ${detail}`);
}

function runCommand(label: string, command: string): boolean {
  try {
    execSync(command, { stdio: 'pipe', cwd: ROOT });
    return true;
  } catch {
    record(label, false, `Command failed: ${command}`);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Gate phases                                                        */
/* ------------------------------------------------------------------ */

function phaseCanonicalDataFingerprint(): void {
  // The canonical panel is panel_canonical_v2.csv. panel_model_data.csv is a
  // retired 630-row scenario file that must not be fingerprint-checked in its
  // place: it has a different hash and would silently pass or fail the gate for
  // the wrong reason.
  const resolved = path.join(ROOT, 'public', 'data', 'panel_canonical_v2.csv');

  if (!fs.existsSync(resolved)) {
    record('Canonical data fingerprint', false, 'Panel CSV not found');
    return;
  }

  const hash = sha256(fs.readFileSync(resolved, 'utf-8'));
  const ok = hash === CANONICAL_PANEL_SHA256;
  record('Canonical data fingerprint', ok,
    ok ? `SHA-256 matches ${CANONICAL_PANEL_SHA256.slice(0, 16)}…`
       : `Expected ${CANONICAL_PANEL_SHA256.slice(0, 16)}… got ${hash.slice(0, 16)}…`);
}

function phaseArtifactGeneration(): boolean {
  console.log('\n── Phase 1: Artifact Generation ──');
  const steps = [
    { label: 'Generate authoritative analysis',   cmd: 'npm run generate:analysis' },
    { label: 'Generate headline metrics',         cmd: 'npm run generate:headline-metrics' },
    { label: 'Generate phase-1 validation suite', cmd: 'npm run generate:phase1-validation' },
    { label: 'Generate repeated grouped k-fold validation', cmd: 'npm run generate:kfold' },
    { label: 'Generate functional-form comparison', cmd: 'npm run generate:functional-form' },
  ];
  for (const s of steps) {
    if (!runCommand(s.label, s.cmd)) return false;
    record(s.label, true, 'OK');
  }
  return true;
}

function phaseArtifactPresence(): void {
  console.log('\n── Phase 2: Artifact Presence ──');
  for (const fp of REQUIRED_ARTIFACTS) {
    const name = path.relative(ROOT, fp);
    const exists = fs.existsSync(fp);
    record(`Artifact exists: ${name}`, exists, exists ? 'present' : 'MISSING');
  }
}

function phaseSchemaVersions(): void {
  console.log('\n── Phase 3: Schema Versions ──');

  // Analysis artifacts
  for (const [file, spec] of Object.entries(EXPECTED_SCHEMAS)) {
    const fp = path.join(ANALYSIS, file);
    if (!fs.existsSync(fp)) { record(`Schema: ${file}`, false, 'file missing'); continue; }
    const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const actual = data[spec.field];
    const ok = actual === spec.value;
    record(`Schema: ${file}`, ok,
      ok ? `${spec.field}=${spec.value}` : `Expected ${spec.value}, got ${actual}`);
  }

  // Headline metrics schema
  const hlPath = path.join(METRICS, 'headline_metrics_authoritative.json');
  if (fs.existsSync(hlPath)) {
    const hl = JSON.parse(fs.readFileSync(hlPath, 'utf-8'));
    const ok = hl.schema_version === EXPECTED_HEADLINE_SCHEMA;
    record('Schema: headline_metrics_authoritative.json', ok,
      ok ? `schema_version=${EXPECTED_HEADLINE_SCHEMA}` : `Expected ${EXPECTED_HEADLINE_SCHEMA}, got ${hl.schema_version}`);
  }
}

function phaseCanonicalMetrics(): void {
  console.log('\n── Phase 4: Canonical Metric Values ──');
  const metricsPath = path.join(ANALYSIS, 'metrics_authoritative.json');
  if (!fs.existsSync(metricsPath)) {
    record('Canonical metrics file', false, 'metrics_authoritative.json missing');
    return;
  }

  const data = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
  for (const m of CANONICAL_METRICS) {
    const actual = data[m.key];
    if (actual === undefined) {
      record(`Metric: ${m.key}`, false, 'field missing');
      continue;
    }
    const rounded = Math.round(actual * 10000) / 10000;
    const diff = Math.abs(rounded - m.expected);
    const ok = diff <= m.tolerance;
    record(`Metric: ${m.key}`, ok,
      ok ? `${rounded} (expected ${m.expected})` : `DRIFT: ${rounded} vs expected ${m.expected} (Δ=${diff.toFixed(4)})`);
  }
}

function phaseArtifactFingerprints(): void {
  console.log('\n── Phase 5: Artifact Fingerprints (determinism check) ──');

  // After regeneration, compute fingerprints of all JSON analysis artifacts
  // (with timestamps stripped) and store them. On the second pass of the pipeline,
  // these fingerprints must be bit-identical to the first pass.
  // For the CI gate, we regenerate twice and compare.
  const fingerprints: Record<string, string> = {};

  const jsonArtifacts = REQUIRED_ARTIFACTS.filter(fp => fp.endsWith('.json'));
  for (const fp of jsonArtifacts) {
    if (!fs.existsSync(fp)) continue;
    const content = fs.readFileSync(fp, 'utf-8');
    const stripped = stripVolatileFields(content);
    fingerprints[path.relative(ROOT, fp)] = sha256(stripped);
  }

  // CSV artifact: fingerprint the data rows (skip header line for timestamp-safety)
  const csvPath = path.join(ANALYSIS, 'observed_vs_predicted_authoritative.csv');
  if (fs.existsSync(csvPath)) {
    fingerprints[path.relative(ROOT, csvPath)] = sha256(fs.readFileSync(csvPath, 'utf-8'));
  }

  // Now regenerate core artifacts and compare
  console.log('       Re-generating artifacts for determinism cross-check…');
  try {
    execSync('npm run generate:analysis', { stdio: 'pipe', cwd: ROOT });
    execSync('npm run generate:phase1-validation', { stdio: 'pipe', cwd: ROOT });
    execSync('npm run generate:kfold', { stdio: 'pipe', cwd: ROOT });
    execSync('npm run generate:functional-form', { stdio: 'pipe', cwd: ROOT });
  } catch {
    record('Determinism re-generation', false, 'Regeneration command failed on second pass');
    return;
  }

  let allMatch = true;
  for (const [relPath, expectedHash] of Object.entries(fingerprints)) {
    const fp = path.join(ROOT, relPath);
    if (!fs.existsSync(fp)) {
      record(`Fingerprint: ${relPath}`, false, 'file disappeared after regen');
      allMatch = false;
      continue;
    }
    let content = fs.readFileSync(fp, 'utf-8');
    if (fp.endsWith('.json')) content = stripVolatileFields(content);
    const actualHash = sha256(content);
    const ok = actualHash === expectedHash;
    if (!ok) {
      record(`Fingerprint: ${relPath}`, false,
        `DRIFT: pre=${expectedHash.slice(0, 12)}… post=${actualHash.slice(0, 12)}…`);
      allMatch = false;
    }
  }
  if (allMatch) {
    record('Artifact determinism', true, `${Object.keys(fingerprints).length} artifacts bit-identical across regeneration passes`);
  }
}

function phaseValidationChecks(): boolean {
  console.log('\n── Phase 6: Validation Checks ──');
  const checks = [
    { label: 'Manuscript consistency',       cmd: 'npm run check:manuscript-consistency' },
    { label: 'Section references',           cmd: 'npm run check:section-references' },
    { label: 'No hardcoded headline metrics', cmd: 'npm run check:no-hardcoded-headline' },
  ];
  let allOk = true;
  for (const c of checks) {
    const ok = runCommand(c.label, c.cmd);
    if (ok) record(c.label, true, 'OK');
    else allOk = false;
  }
  return allOk;
}

function phaseCodeQuality(): boolean {
  console.log('\n── Phase 7: Code Quality ──');
  const steps = [
    { label: 'Lint',   cmd: 'npm run lint' },
    { label: 'Tests',  cmd: 'npm run test:run' },
    { label: 'Build',  cmd: 'npm run build' },
  ];
  let allOk = true;
  for (const s of steps) {
    const ok = runCommand(s.label, s.cmd);
    if (ok) record(s.label, true, 'OK');
    else allOk = false;
  }
  return allOk;
}

/* ------------------------------------------------------------------ */
/*  Summary                                                            */
/* ------------------------------------------------------------------ */

function emitSummary(): boolean {
  const totalChecks = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);
  const allPass = failed.length === 0;

  console.log(`\n${'═'.repeat(64)}`);
  console.log(allPass
    ? '  CI GATE: PASS — Release candidate is reproducible'
    : '  CI GATE: FAIL — Reproducibility regression detected');
  console.log(`${'═'.repeat(64)}`);
  console.log(`  ${passed}/${totalChecks} checks passed`);

  if (failed.length > 0) {
    console.log('\n  Failed checks:');
    for (const f of failed) {
      console.log(`    ✗ ${f.step}: ${f.detail}`);
    }
  }

  console.log('');
  return allPass;
}

/* ------------------------------------------------------------------ */
/*  Runner                                                             */
/* ------------------------------------------------------------------ */

function run(): void {
  console.log(`\n${'═'.repeat(64)}`);
  console.log('  Deterministic Reproducibility CI Gate');
  console.log(`${'═'.repeat(64)}\n`);

  const t0 = Date.now();

  // Phase 0: Canonical data fingerprint (before any generation)
  console.log('── Phase 0: Canonical Data Fingerprint ──');
  phaseCanonicalDataFingerprint();

  // Phase 1: Generate all artifacts
  const genOk = phaseArtifactGeneration();
  if (!genOk) {
    emitSummary();
    process.exit(1);
  }

  // Phase 2: Verify artifact presence
  phaseArtifactPresence();

  // Phase 3: Verify schema versions
  phaseSchemaVersions();

  // Phase 4: Verify canonical metric values
  phaseCanonicalMetrics();

  // Phase 5: Determinism cross-check (regenerate and compare fingerprints)
  phaseArtifactFingerprints();

  // Phase 6: Validation checks
  phaseValidationChecks();

  // Phase 7: Code quality
  phaseCodeQuality();

  const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n  Total gate time: ${totalTime}s`);

  const allPass = emitSummary();
  process.exit(allPass ? 0 : 1);
}

run();
