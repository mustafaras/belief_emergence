/**
 * Does the interface show the numbers the paper reports?
 *
 * Everything else in this repository is checked from the inside: the manuscript
 * against the artifacts, the runtime coefficients against the fit. Nothing checked
 * the one surface a reader actually looks at, and that surface spent two revisions
 * rendering a tautology-era training summary (R2 = 0.9481) beside a headline of
 * 0.3376 with the same wording for both.
 *
 * This loads the same modules the components load, computes what they would print,
 * and compares every value against the artifact of record. It does not render React:
 * the risk being checked is numeric, and the data layer is where a wrong number
 * enters.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getProductionHeadlineMetrics,
  getProductionTrainingMetadata,
  getProductionDatasetMetadata,
} from '../src/data/modelMetrics.ts';
import { PRODUCTION_MODEL_METADATA, OPTIMIZED_STRUCTURAL_PARAMS, OPTIMIZED_SIGMOID_COEFFICIENTS } from '../src/data/feCoefficients.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ANALYSIS = path.join(REPO_ROOT, 'src', 'data', 'analysis');

type Failure = { surface: string; shown: string; expected: string };

const failures: Failure[] = [];
let checked = 0;

const close = (a: number, b: number, tol = 5e-4) => Math.abs(a - b) <= tol;

const compare = (surface: string, shown: number, expected: number, tol = 5e-4) => {
  checked += 1;
  if (!Number.isFinite(shown) || !close(shown, expected, tol)) {
    failures.push({ surface, shown: String(shown), expected: expected.toFixed(6) });
  }
};

const metrics = JSON.parse(fs.readFileSync(path.join(ANALYSIS, 'metrics_authoritative.json'), 'utf8'));
const fit = JSON.parse(fs.readFileSync(path.join(ANALYSIS, 'coefficient_fit.json'), 'utf8'));
const panelCsv = fs.readFileSync(path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv'), 'utf8')
  .trim().split(/\r?\n/).slice(1);
const panelRows = panelCsv.length;
const panelCountries = new Set(panelCsv.map((l) => l.split(',')[0])).size;

/* ---- headline metrics the interface prints ---- */
const headline = getProductionHeadlineMetrics();
compare('headline.r2', headline.r2, metrics.r2);
compare('headline.correlation', headline.correlation, metrics.corr);
compare('headline.mae', headline.mae, metrics.mae);
compare('headline.rmse', headline.rmse, metrics.rmse);
compare('headline.bias', headline.bias, metrics.bias);

/* ---- training metadata printed beside them ---- */
const training = getProductionTrainingMetadata();
compare('training.r2', training.metrics.r2, metrics.r2);
compare('training.correlation', training.metrics.correlation, metrics.corr);
compare('training.mae', training.metrics.mae, metrics.mae);
compare('training.rmse', training.metrics.rmse, metrics.rmse);
compare('training.bias', training.metrics.bias, metrics.bias);

/* ---- dataset description ---- */
const dataset = getProductionDatasetMetadata();
compare('dataset.observations', dataset.observations, panelRows, 0);
compare('dataset.countries', dataset.countries, panelCountries, 0);

/* ---- structural coefficients ---- */
compare('structural.alpha', OPTIMIZED_STRUCTURAL_PARAMS.alpha, fit.parameters.alpha, 1e-6);
compare('structural.beta', OPTIMIZED_STRUCTURAL_PARAMS.beta, fit.parameters.beta, 1e-6);
compare('structural.k', OPTIMIZED_STRUCTURAL_PARAMS.k, fit.parameters.k, 1e-6);
compare('structural.phi0', OPTIMIZED_STRUCTURAL_PARAMS.phi0, fit.parameters.phi0, 1e-6);

/* ---- main-effect coefficients ---- */
const c = OPTIMIZED_SIGMOID_COEFFICIENTS;
compare('coefficients.c2 (media)', c.c2, fit.parameters.c_M, 1e-6);
compare('coefficients.c3 (trauma)', c.c3, fit.parameters.c_T, 1e-6);
compare('coefficients.c6 (education)', c.c6, fit.parameters.c_E, 1e-6);
compare('coefficients.c8 (welfare)', c.c8, fit.parameters.c_R, 1e-6);

/* ---- retracted channels must stay at zero: a non-zero here would mean the
       interface claims to have estimated something the audit withdrew ---- */
for (const [name, value] of [['c1', c.c1], ['c4', c.c4], ['c5', c.c5], ['c7', c.c7]] as [string, number][]) {
  checked += 1;
  if (value !== 0) {
    failures.push({ surface: `coefficients.${name}`, shown: String(value), expected: '0 (channel unavailable)' });
  }
}

/* ---- source-level scan: no component may hardcode a parameter that the
       module already provides. The App root was carrying alpha = 0.3, beta = 0.3,
       k = 1.307 in five places, so the numbers on screen came from there rather
       than from the fit, and the fit could change without the interface moving. ---- */
{
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  };
  const srcFiles = walk(path.join(REPO_ROOT, 'src')).filter(
    (f) => !f.includes('feCoefficients.ts') && !f.endsWith('.test.ts'),
  );
  const hardcoded: string[] = [];
  for (const file of srcFiles) {
    const text = fs.readFileSync(file, 'utf8');
    // A literal 1.307 or a structural triple like "alpha: 0.3" is the signature of
    // a value copied out of the module instead of imported from it.
    if (/\bk:\s*1\.307\b/.test(text) || /\balpha:\s*0\.3\b/.test(text)) {
      hardcoded.push(path.relative(REPO_ROOT, file));
    }
  }
  checked += 1;
  if (hardcoded.length > 0) {
    failures.push({
      surface: 'hardcoded structural parameters',
      shown: hardcoded.join(', '),
      expected: 'imported from feCoefficients',
    });
  }
}

/* ---- a tautology-era value anywhere in the rendered metadata is a failure ---- */
const metaText = JSON.stringify(PRODUCTION_MODEL_METADATA);
checked += 1;
if (/0\.948|0\.9794|1\.307|0\.300/.test(metaText)) {
  failures.push({
    surface: 'PRODUCTION_MODEL_METADATA',
    shown: 'contains a tautology-era value (0.948 / 0.9794 / 1.307 / 0.300)',
    expected: 'current fit only',
  });
}

console.log(`checked ${checked} values the interface would display`);
if (failures.length === 0) {
  console.log('UI AGREES — every displayed number matches its artifact of record');
  process.exit(0);
}
console.error(`\n${failures.length} MISMATCH(ES):`);
for (const f of failures) console.error(`  ${f.surface}: shows ${f.shown}, artifact says ${f.expected}`);
process.exit(1);
