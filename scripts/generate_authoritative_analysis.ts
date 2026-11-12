/**
 * Authoritative observed-vs-predicted generator.
 *
 * This is the ONLY sanctioned pipeline for producing observed-vs-predicted artifacts.
 * It uses:
 *  - The canonical panel dataset served from public/data/panel_canonical_v2.csv
 *  - The production calculateModel() implementation (same as the app runtime)
 *
 * Outputs:
 *  - src/data/analysis/observed_vs_predicted_authoritative.csv
 *  - src/data/analysis/metrics_authoritative.json
 *
 * Run via: npm run generate:analysis
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Papa from 'papaparse';

import type { BeliefParameters } from '../src/types';
import { calculateModel } from '../src/utils/calculateModel.ts';
import {
  normalizeObservedToStructuralBand,
  STRUCTURAL_MAX,
  STRUCTURAL_MIN,
} from '../src/utils/modelContract.ts';
import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { OPTIMIZED_STRUCTURAL_PARAMS, Z_NORMALIZATION } from '../src/data/feCoefficients.ts';
import { BIAS_DEFINITION_PHRASE } from '../src/utils/metrics';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CANONICAL_DATASET_PATH = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
export const AUTHORITATIVE_CSV_PATH = path.join(
  REPO_ROOT,
  'src',
  'data',
  'analysis',
  'observed_vs_predicted_authoritative.csv',
);
export const AUTHORITATIVE_JSON_PATH = path.join(
  REPO_ROOT,
  'src',
  'data',
  'analysis',
  'metrics_authoritative.json',
);

type Metrics = {
  n: number;
  r2: number;
  corr: number;
  mae: number;
  rmse: number;
  bias: number;
  bias_definition: string;
  observed_scale: string;
  predicted_scale: string;
  dataset_id: string;
  model_id: string;
  timestamp: string;
};

function computeSha256(text: string): string {
  const hash = createHash('sha256');
  hash.update(text, 'utf8');
  return hash.digest('hex').toUpperCase();
}

function pearsonCorr(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
    xs.push(x[i]);
    ys.push(y[i]);
  }
  const m = xs.length;
  if (m === 0) return NaN;
  const meanX = xs.reduce((acc, v) => acc + v, 0) / m;
  const meanY = ys.reduce((acc, v) => acc + v, 0) / m;
  let num = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < m; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? NaN : num / denom;
}

function computeMetrics(observed: number[], predicted: number[]): Metrics {
  const n = Math.min(observed.length, predicted.length);
  let ssRes = 0;
  let ssTot = 0;
  let mae = 0;
  let rmseAccum = 0;
  let count = 0;
  const finiteObs: number[] = [];
  const finitePred: number[] = [];

  // Precompute mean for R²
  for (let i = 0; i < n; i += 1) {
    const obs = observed[i];
    const pred = predicted[i];
    if (!Number.isFinite(obs) || !Number.isFinite(pred)) continue;
    finiteObs.push(obs);
    finitePred.push(pred);
  }
  const meanObs = finiteObs.reduce((acc, v) => acc + v, 0) / (finiteObs.length || 1);

  for (let i = 0; i < finiteObs.length; i += 1) {
    const obs = finiteObs[i];
    const pred = finitePred[i];
    const diff = obs - pred;
    ssRes += diff * diff;
    const tot = obs - meanObs;
    ssTot += tot * tot;
    mae += Math.abs(diff);
    rmseAccum += diff * diff;
    count += 1;
  }

  const r2 = ssTot === 0 ? NaN : 1 - ssRes / ssTot;
  const corr = pearsonCorr(finiteObs, finitePred);
  const bias = count ? finiteObs.reduce((acc, v, i) => acc + (v - finitePred[i]), 0) / count : NaN;
  const rmse = count ? Math.sqrt(rmseAccum / count) : NaN;

  return {
    n: count,
    r2,
    corr,
    mae: count ? mae / count : NaN,
    rmse,
    bias,
    bias_definition: BIAS_DEFINITION_PHRASE,
    observed_scale: `Observed Z normalized to [${STRUCTURAL_MIN}, ${STRUCTURAL_MAX}] via Z_NORMALIZATION {min=${Z_NORMALIZATION.min}, max=${Z_NORMALIZATION.max}}`,
    predicted_scale: `Predicted Z from calculateModel() clamped to [${STRUCTURAL_MIN}, ${STRUCTURAL_MAX}]`,
    dataset_id: `${path.relative(REPO_ROOT, CANONICAL_DATASET_PATH)} (sha256=${CANONICAL_PANEL_SHA256})`,
    model_id: `calculateModel@OPTIMIZED_STRUCTURAL_PARAMS(alpha=${OPTIMIZED_STRUCTURAL_PARAMS.alpha}, beta=${OPTIMIZED_STRUCTURAL_PARAMS.beta}, k=${OPTIMIZED_STRUCTURAL_PARAMS.k}, phi0=${OPTIMIZED_STRUCTURAL_PARAMS.phi0})`,
    timestamp: new Date().toISOString(),
  };
}

function writeCsv(rows: Array<Record<string, string | number>>, csvPath: string): void {
  const csv = Papa.unparse(rows, { newline: '\n' });
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, `${csv}\n`, 'utf8');
}

function writeJson(metrics: Metrics, jsonPath: string): void {
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
}

/**
 * Generate the observed-vs-predicted artifacts.
 *
 * `outputPaths` exists so the test suite can exercise the real generator without
 * overwriting the committed artifacts. Before this, `npm run test:run` alone rewrote
 * `metrics_authoritative.json` with a fresh `timestamp`, so every test run left a
 * dirty working tree — which is how a genuine artifact change gets swept into an
 * unrelated commit. Production callers pass nothing and get the tracked paths.
 */
export async function generateAuthoritativeAnalysis(
  outputPaths: { csvPath?: string; jsonPath?: string } = {},
): Promise<Metrics> {
  const csvPath = outputPaths.csvPath ?? AUTHORITATIVE_CSV_PATH;
  const jsonPath = outputPaths.jsonPath ?? AUTHORITATIVE_JSON_PATH;
  const csvText = fs.readFileSync(CANONICAL_DATASET_PATH, 'utf8');
  const hash = computeSha256(csvText);
  if (hash !== CANONICAL_PANEL_SHA256) {
    throw new Error(
      `Canonical dataset checksum mismatch: expected ${CANONICAL_PANEL_SHA256}, got ${hash} at ${CANONICAL_DATASET_PATH}`,
    );
  }

  const panel = parsePanelCsvText(csvText, CANONICAL_DATASET_PATH);

  const results = panel.map((row) => {
    const params: BeliefParameters = {
      X: row.X,
      Y: row.Y,
      alpha: OPTIMIZED_STRUCTURAL_PARAMS.alpha,
      beta: OPTIMIZED_STRUCTURAL_PARAMS.beta,
      k: OPTIMIZED_STRUCTURAL_PARAMS.k,
      // C, D, G and S are structurally unavailable in the v2 panel. The model
      // requires concrete numbers, so they are neutralized to 0 (the mean of a
      // standardized channel) at this boundary rather than being coerced from
      // null, which would inject a fabricated value.
      C: row.C ?? 0,
      M: row.M,
      T: row.T,
      D: row.D ?? 0,
      G: row.G ?? 0,
      E: row.E,
      S: row.S ?? 0,
      R: row.R,
    };

    const predicted = calculateModel(params, { inputsAreStandardized: false, modifiersAreStandardized: true }).Z;
    const observed = normalizeObservedToStructuralBand(row.Z, Z_NORMALIZATION.min, Z_NORMALIZATION.max);

    return {
      country: row.iso3,
      year: row.year,
      observed_Z: observed,
      predicted_Z: predicted,
      residual: observed - predicted,
    };
  });

  const finite = results.filter((r) => Number.isFinite(r.observed_Z) && Number.isFinite(r.predicted_Z));
  const sorted = [...finite].sort((a, b) => (a.country === b.country ? a.year - b.year : a.country.localeCompare(b.country)));

  writeCsv(sorted, csvPath);

  const metrics = computeMetrics(
    sorted.map((r) => r.observed_Z),
    sorted.map((r) => r.predicted_Z),
  );

  writeJson(metrics, jsonPath);

  console.log(`✅ Wrote ${sorted.length} rows to ${path.relative(REPO_ROOT, csvPath)}`);
  console.log(`✅ Metrics -> ${path.relative(REPO_ROOT, jsonPath)}`);
  console.log(
    `   R²=${metrics.r2.toFixed(4)} | Corr=${metrics.corr.toFixed(4)} | MAE=${metrics.mae.toFixed(4)} | RMSE=${metrics.rmse.toFixed(4)} | Bias=${metrics.bias.toFixed(4)}`,
  );

  return metrics;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateAuthoritativeAnalysis().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
