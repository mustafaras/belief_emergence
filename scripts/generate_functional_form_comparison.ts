/**
 * generate_functional_form_comparison.ts — emit functional_form_comparison.json.
 *
 * The manuscript states, as its central methodological finding, that the
 * saturating bounded form does not beat an ordinary linear regression on this
 * panel. That statement previously had no generator: the numbers existed only in
 * prose. This script produces them from the canonical panel, on identical rows
 * and identical folds, so the claim can be checked and contradicted.
 *
 * Usage:
 *   npm run generate:functional-form
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { fitModelTier, evaluateTierModel } from '../src/utils/validation/fitModelTier.ts';
import { computeFunctionalFormComparison, type FitMetrics } from '../src/utils/validation/computeFunctionalFormComparison.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CANONICAL_DATASET_PATH = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis');
const HEADLINE = path.join(ANALYSIS_DIR, 'metrics_authoritative.json');

/**
 * The comparison is run at Tier A: eleven parameters, the tier that carries the
 * paper's primary claims. Comparing the full Tier C structure would conflate
 * "curvature helps" with "more parameters help", and the latter is already
 * answered by the model ladder.
 */
const COMPARISON_TIER = 'A' as const;

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase();
}

function main(): void {
  const csvText = fs.readFileSync(CANONICAL_DATASET_PATH, 'utf8');
  const hash = sha256(csvText);
  if (hash !== CANONICAL_PANEL_SHA256) {
    throw new Error(`Canonical dataset checksum mismatch: expected ${CANONICAL_PANEL_SHA256}, got ${hash}`);
  }

  const rows = parsePanelCsvText(csvText, CANONICAL_DATASET_PATH);
  console.log(`Loaded ${rows.length} panel rows.`);

  const headline = JSON.parse(fs.readFileSync(HEADLINE, 'utf8')) as {
    n: number; r2: number; corr: number; mae: number; rmse: number;
  };
  const saturatingInSample: FitMetrics = {
    n: headline.n,
    r2: headline.r2,
    corr: headline.corr,
    mae: headline.mae,
    rmse: headline.rmse,
  };

  // The saturating side is refitted per fold exactly as the k-fold harness does,
  // so both models face the same training rows and the same held-out rows.
  let lastModel = fitModelTier(rows, COMPARISON_TIER);

  const result = computeFunctionalFormComparison(rows, {
    k: 5,
    repeats: 20,
    seed: 20260101,
    saturatingInSample,
    fitSaturating: (trainRows) => {
      lastModel = fitModelTier(trainRows, COMPARISON_TIER);
    },
    predictSaturating: (testRows) => {
      const evaluation = evaluateTierModel(lastModel, testRows);
      return { observed: evaluation.observed, predicted: evaluation.predicted };
    },
  });

  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
  const outPath = path.join(ANALYSIS_DIR, 'functional_form_comparison.json');
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`✅ Generated: ${outPath}`);
  console.log(`   Schema: ${result.schemaVersion}   Tier: ${COMPARISON_TIER}`);
  for (const model of result.models) {
    console.log(
      `   ${model.model.padEnd(20)} in-sample R² ${Number.isFinite(model.inSample.r2) ? model.inSample.r2.toFixed(4) : 'n/a'}`
      + `   k-fold R² ${model.kfold.median.toFixed(4)} [${model.kfold.q25.toFixed(3)}, ${model.kfold.q75.toFixed(3)}]`
      + `   LOO pooled R² ${Number.isFinite(model.countryOutPooled.r2) ? model.countryOutPooled.r2.toFixed(4) : 'n/a'}`,
    );
  }
  console.log(`   Verdict: ${result.verdict}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
