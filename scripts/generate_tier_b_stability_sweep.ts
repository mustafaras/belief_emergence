/**
 * Generate Tier B stability threshold sweep artifact.
 *
 * Usage:
 *   npx tsx scripts/generate_tier_b_stability_sweep.ts
 *   npm run generate:tier-b-sweep
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { computeTierBStabilitySweep } from '../src/utils/validation/computeTierBStabilitySweep.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis');
const STABILITY_PATH = path.join(ANALYSIS_DIR, 'parameter_stability.json');

async function main(): Promise<void> {
  const raw = fs.readFileSync(STABILITY_PATH, 'utf8');
  const parameterStability = JSON.parse(raw);

  console.log('Running Tier B stability threshold sweep...');
  const result = computeTierBStabilitySweep(parameterStability);

  const outPath = path.join(ANALYSIS_DIR, 'tier_b_stability_sweep.json');
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`✅ Generated: ${outPath}`);
  console.log(`   Schema: ${result.schemaVersion}`);
  console.log(`   Parameters: ${result.nParameters}`);
  console.log(`   LOO folds: ${result.nFolds}`);
  console.log(`   Min sign-consistency: ${result.minimumSignConsistency.toFixed(4)} (${result.minimumSignConsistencyParameter})`);
  console.log(`   Demotion candidates (<0.80): ${result.demotionCandidates.length === 0 ? 'none' : result.demotionCandidates.join(', ')}`);
  console.log('   Threshold sweep:');
  for (const t of result.thresholdSweep) {
    console.log(`     ≥${t.threshold.toFixed(2)}: ${t.nMeeting}/${result.nParameters} pass${t.failing.length > 0 ? ` (failing: ${t.failing.join(', ')})` : ''}`);
  }
  console.log(`   Verdict: ${result.verdict}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
