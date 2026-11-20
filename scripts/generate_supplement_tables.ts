/**
 * generate_supplement_tables.ts — emit supplementary_tables.json.
 *
 * Three supplementary tables had no generator and described a retired panel: the
 * temporal-slice / ablation table (167 rows) and the "training-time uncertainty"
 * table (R2 = 0.948, from the retired 630-row scenario panel). This script
 * recomputes them from the canonical panel with the production-pinned map:
 *   - temporal slices and structural ablations (fixed coefficients, no refit)
 *   - a country-level cluster bootstrap of the production map's global metrics
 *   - the Tier A refit fold-level distribution from cv_kfold.json
 *
 * Usage: npm run generate:supplement-tables
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { predictFromPanelRow } from '../src/utils/validation/panelPredict.ts';
import { computeAblationSummary } from '../src/utils/validation/computeAblationSummary.ts';
import { computeCountrySliceSummary } from '../src/utils/validation/computeCountrySliceSummary.ts';
import { computeTemporalHoldoutSummary } from '../src/utils/validation/computeTemporalHoldoutSummary.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PANEL = path.join(ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const ANALYSIS = path.join(ROOT, 'src', 'data', 'analysis');
const BOOTSTRAP_RESAMPLES = 2000;
const BOOTSTRAP_SEED = 20260101;
const MIN_ROWS_PER_SLICE = 10;

type Pair = { country: string; obs: number; pred: number };
type Metrics = { r2: number; corr: number; mae: number; rmse: number };

/** Small deterministic PRNG so the bootstrap is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function metrics(pairs: Pair[]): Metrics {
  const n = pairs.length;
  const mo = pairs.reduce((s, p) => s + p.obs, 0) / n;
  const mp = pairs.reduce((s, p) => s + p.pred, 0) / n;
  let sse = 0, sst = 0, sop = 0, soo = 0, spp = 0, sae = 0;
  for (const p of pairs) {
    sse += (p.obs - p.pred) ** 2;
    sst += (p.obs - mo) ** 2;
    sop += (p.obs - mo) * (p.pred - mp);
    soo += (p.obs - mo) ** 2;
    spp += (p.pred - mp) ** 2;
    sae += Math.abs(p.obs - p.pred);
  }
  return { r2: 1 - sse / sst, corr: sop / Math.sqrt(soo * spp), mae: sae / n, rmse: Math.sqrt(sse / n) };
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (pos - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)] ?? sorted[lo]) - sorted[lo]);
}

function mean(v: number[]): number { return v.reduce((s, x) => s + x, 0) / v.length; }
function sd(v: number[]): number { const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); }

function bootstrap(pairs: Pair[]): Record<keyof Metrics, { lo: number; hi: number }> {
  const byCountry = new Map<string, Pair[]>();
  for (const p of pairs) byCountry.set(p.country, [...(byCountry.get(p.country) ?? []), p]);
  const groups = [...byCountry.values()];
  const rand = mulberry32(BOOTSTRAP_SEED);
  const draws: Metrics[] = [];
  for (let b = 0; b < BOOTSTRAP_RESAMPLES; b += 1) {
    const sample: Pair[] = [];
    for (let i = 0; i < groups.length; i += 1) sample.push(...groups[Math.floor(rand() * groups.length)]);
    draws.push(metrics(sample));
  }
  const ci = (key: keyof Metrics) => {
    const sorted = draws.map((d) => d[key]).sort((a, b) => a - b);
    return { lo: quantile(sorted, 0.025), hi: quantile(sorted, 0.975) };
  };
  return { r2: ci('r2'), corr: ci('corr'), mae: ci('mae'), rmse: ci('rmse') };
}

function main(): void {
  const rows = parsePanelCsvText(fs.readFileSync(PANEL, 'utf8'), PANEL);
  const pairs: Pair[] = rows.map((r) => {
    const p = predictFromPanelRow(r);
    return { country: r.iso3, obs: p.zObs, pred: p.zPred };
  });
  const train = metrics(pairs);
  /** Regime support on the production-predicted bounded Z (definitions from the glossary). */
  const zp = pairs.map((p) => p.pred);
  const count = (f: (z: number) => boolean): number => zp.filter(f).length;
  const regimeSupport = {
    basis: 'production-predicted Z on the bounded scale, 207 country-years',
    n: zp.length,
    lowUptake: count((z) => z < 0.33),
    transitionCorridor: count((z) => z >= 0.33 && z < 0.67),
    ridgePeak: count((z) => z >= 0.45 && z <= 0.55),
    highUptake: count((z) => z >= 0.67),
    saturatedTails: count((z) => z < 0.05 || z > 0.95),
  };

  const kfold = JSON.parse(fs.readFileSync(path.join(ANALYSIS, 'cv_kfold.json'), 'utf8')) as {
    folds: { tierResults: { A: { testMetricsRefit: Metrics } } }[];
  };
  const fold = (key: keyof Metrics) => {
    const v = kfold.folds.map((f) => f.tierResults.A.testMetricsRefit[key]);
    const sorted = [...v].sort((a, b) => a - b);
    return { mean: mean(v), sd: sd(v), median: quantile(sorted, 0.5), q25: quantile(sorted, 0.25), q75: quantile(sorted, 0.75), n: v.length };
  };

  const temporal = computeTemporalHoldoutSummary(rows as never, { minRowsPerSlice: MIN_ROWS_PER_SLICE });
  const ablation = computeAblationSummary(rows as never);
  const country = computeCountrySliceSummary(rows as never, { minRowsPerCountry: 1, sortBy: 'nUsed_desc' });
  const result = {
    schemaVersion: 'phase1.supplementary_tables.v1',
    generatedAtIso: new Date().toISOString(),
    panelSha256: CANONICAL_PANEL_SHA256,
    temporal: {
      splitYears: temporal.definition.splitYears,
      global: { nTotal: temporal.global.nTotal, n: temporal.global.nUsed, metricsFull: temporal.global.metrics },
      slices: temporal.slices.map((s) => ({ label: s.label, yearMin: s.yearMin ?? null, yearMax: s.yearMax ?? null, nTotal: s.nTotal, n: s.nUsed, ...pick(s.metrics), metricsFull: s.metrics })),
    },
    countrySlices: {
      global: { nTotal: country.global.nTotal, n: country.global.nUsed, metricsFull: country.global.metrics },
      rows: country.rows.map((r) => ({ country: r.country, nTotal: r.nTotal, n: r.nUsed, metricsFull: r.metrics })),
    },
    ablation: ablation.rows.map((r) => ({ mode: r.mode, label: r.label, n: r.nUsed, ...pick(r.metrics) })),
    regimeSupport,
    uncertainty: {
      method: `Country-level cluster bootstrap (${BOOTSTRAP_RESAMPLES} resamples, seed ${BOOTSTRAP_SEED}) of the production-pinned map's global metrics; CV columns are the Tier A refit fold-level distribution from cv_kfold.json.`,
      train,
      bootstrapCi: bootstrap(pairs),
      cvTierA: { r2: fold('r2'), corr: fold('corr'), mae: fold('mae') },
    },
  };
  fs.writeFileSync(path.join(ANALYSIS, 'supplementary_tables.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`✅ Generated supplementary_tables.json; splits ${result.temporal.splitYears.join(', ')}; train R2 ${train.r2.toFixed(4)}`);
}

function pick(m: Metrics & Record<string, number>): Metrics {
  return { r2: m.r2, corr: m.corr, mae: m.mae, rmse: m.rmse };
}

main();
