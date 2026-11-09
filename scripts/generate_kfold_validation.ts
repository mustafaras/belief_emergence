/**
 * generate_kfold_validation.ts — emit src/data/analysis/cv_kfold.json.
 *
 * The evaluation the paper should have been reporting. Country-out CV holds out
 * 1-4 rows per fold, so R² is undefined in 36 of 48 folds and the reported
 * median comes from the twelve leftovers (KI-14). Repeated grouped k-fold gives
 * every fold ~17 test rows while keeping countries intact.
 *
 * Usage:
 *   npm run generate:kfold
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { computeKFoldRefit, KFOLD_DEFAULT_K, KFOLD_DEFAULT_REPEATS } from '../src/utils/validation/computeKFoldRefit.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CANONICAL_DATASET_PATH = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis');

function computeSha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase();
}

function main(): void {
  const csvText = fs.readFileSync(CANONICAL_DATASET_PATH, 'utf8');
  const hash = computeSha256(csvText);
  if (hash !== CANONICAL_PANEL_SHA256) {
    throw new Error(`Canonical dataset checksum mismatch: expected ${CANONICAL_PANEL_SHA256}, got ${hash}`);
  }

  const rows = parsePanelCsvText(csvText, CANONICAL_DATASET_PATH);
  const countries = new Set(rows.map((row) => row.iso3)).size;
  console.log(`Loaded ${rows.length} panel rows across ${countries} countries.`);
  console.log(`Running repeated grouped k-fold (k=${KFOLD_DEFAULT_K}, repeats=${KFOLD_DEFAULT_REPEATS})...`);

  const result = computeKFoldRefit(rows, { k: KFOLD_DEFAULT_K, repeats: KFOLD_DEFAULT_REPEATS });

  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
  const outPath = path.join(ANALYSIS_DIR, 'cv_kfold.json');
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`✅ Generated: ${outPath}`);
  console.log(`   Schema : ${result.schemaVersion}`);
  console.log(`   Folds  : ${result.checks.observedFoldCount} (min test rows ${result.checks.minTestRows}, min train rows ${result.checks.minTrainRows})`);
  console.log(`   Leakage: ${result.checks.leakagePass ? 'none' : `${result.checks.groupsSplitAcrossFolds} split group(s)`}`);
  for (const tier of ['A', 'B', 'C'] as const) {
    const r = result.aggregatesRefit[tier];
    const c = result.aggregatesCanonical[tier];
    console.log(
      `   Tier ${tier} refit    : R² ${r.r2.median.toFixed(4)} [${r.r2.q25.toFixed(3)}, ${r.r2.q75.toFixed(3)}]  `
      + `RMSE ${r.rmse.median.toFixed(4)}  R² defined ${(r.r2DefinedRate * 100).toFixed(0)}%`,
    );
    console.log(
      `   Tier ${tier} canonical: R² ${c.r2.median.toFixed(4)} [${c.r2.q25.toFixed(3)}, ${c.r2.q75.toFixed(3)}]  `
      + `RMSE ${c.rmse.median.toFixed(4)}`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
