/**
 * Generate C-dominance sensitivity analysis artifact.
 *
 * Usage:
 *   npx tsx scripts/generate_c_dominance_sensitivity.ts
 *   npm run generate:c-dominance
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { computeCDominanceSensitivity } from '../src/utils/validation/computeCDominanceSensitivity.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CANONICAL_DATASET_PATH = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_23_countries_v1.csv');
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis');

function computeSha256(text: string): string {
  const hash = createHash('sha256');
  hash.update(text, 'utf8');
  return hash.digest('hex').toUpperCase();
}

async function main(): Promise<void> {
  const csvText = fs.readFileSync(CANONICAL_DATASET_PATH, 'utf8');
  const hash = computeSha256(csvText);
  if (hash !== CANONICAL_PANEL_SHA256) {
    throw new Error(
      `Canonical dataset checksum mismatch: expected ${CANONICAL_PANEL_SHA256}, got ${hash}`,
    );
  }

  const rows = parsePanelCsvText(csvText, CANONICAL_DATASET_PATH);
  console.log(`Loaded ${rows.length} panel rows.`);

  console.log('Running C-dominance sensitivity analysis (200 permutations)...');
  const result = computeCDominanceSensitivity(rows, { nPermutations: 200, seed: 42 });

  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
  const outPath = path.join(ANALYSIS_DIR, 'c_dominance_sensitivity.json');
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`✅ Generated: ${outPath}`);
  console.log(`   Schema: ${result.schemaVersion}`);
  console.log(`   Verdict: ${result.verdict}`);
  for (const tr of result.tierResults) {
    console.log(`   Tier ${tr.tier}: full R²=${tr.fullModel.r2.toFixed(4)}, C-excluded R²=${tr.cExcluded.r2.toFixed(4)}, ΔR²=${tr.cExcluded.deltaR2.toFixed(4)}, perm p=${tr.cPermuted.pValue.toFixed(3)}`);
  }
  console.log('   Partial R² ranking (top 5):');
  for (const e of result.partialR2Ranking.slice(0, 5)) {
    console.log(`     #${e.rank} ${e.predictor}: ΔR²=${e.partialR2.toFixed(4)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
