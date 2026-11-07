/**
 * Generate 2006 temporal outlier sensitivity analysis artifact.
 *
 * Usage:
 *   npx tsx scripts/generate_2006_outlier_sensitivity.ts
 *   npm run generate:2006-outlier
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { compute2006OutlierSensitivity } from '../src/utils/validation/compute2006OutlierSensitivity.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CANONICAL_DATASET_PATH = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
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

  const rows2006 = rows.filter(r => r.year === 2006);
  console.log(`2006 rows: ${rows2006.length} (will be excluded for sensitivity).`);

  console.log('Running 2006 temporal outlier sensitivity analysis (LOO CV on full + reduced panel)...');
  const result = compute2006OutlierSensitivity(rows);

  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
  const outPath = path.join(ANALYSIS_DIR, 'temporal_outlier_2006_sensitivity.json');
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`\n✅ Generated: ${outPath}`);
  console.log(`   Schema: ${result.schemaVersion}`);
  console.log(`   Full panel: ${result.fullPanelNRows} rows`);
  console.log(`   Excluded 2006: ${result.excluded2006NRows} rows (${result.nRowsExcluded} dropped)`);
  console.log(`   Verdict: ${result.verdict}`);
  console.log('\n   LOO Metric Deltas (2006-excluded minus full, refit median):');
  for (const tc of result.looComparisonRefit) {
    console.log(`     Tier ${tc.tier}: ΔR²=${tc.r2.delta.toFixed(4)}, ΔMAE=${tc.mae.delta.toFixed(4)}, ΔRMSE=${tc.rmse.delta.toFixed(4)}`);
  }
  console.log('\n   Sign Stability:');
  for (const ss of result.signStability) {
    console.log(`     Tier ${ss.tier}: ${ss.nSignRetained}/${ss.nCoeffs} (${(ss.fractionRetained * 100).toFixed(0)}%)${ss.flippedFeatures.length > 0 ? ` — flipped: ${ss.flippedFeatures.join(', ')}` : ''}`);
  }
  console.log(`\n   Construct diagnostics:`);
  console.log(`     2006 inter-item corr: ${result.constructDiagnostics.constructCorrelation2006}`);
  console.log(`     Median inter-item corr: ${result.constructDiagnostics.constructCorrelationMedian}`);
  console.log(`     2006 mean Z: ${result.constructDiagnostics.year2006.meanZ.toFixed(4)}, SD: ${result.constructDiagnostics.year2006.sdZ.toFixed(4)}`);
  console.log(`     Other years mean Z: ${result.constructDiagnostics.otherYears.meanZ.toFixed(4)}, SD: ${result.constructDiagnostics.otherYears.sdZ.toFixed(4)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
