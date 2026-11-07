import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { buildModelLadder } from '../src/utils/validation/buildModelLadder.ts';
import { computeLeaveOneCountryOutRefit } from '../src/utils/validation/computeLeaveOneCountryOutRefit.ts';
import { computeRollingOriginRefit } from '../src/utils/validation/computeRollingOriginRefit.ts';
import { computePredictionIntervalCoverage } from '../src/utils/validation/computePredictionIntervalCoverage.ts';
import { computeParameterStabilitySummary } from '../src/utils/validation/computeParameterStabilitySummary.ts';
import { computeSupportMaskSummary } from '../src/utils/validation/computeSupportMaskSummary.ts';
import { computeModelComplexitySummary } from '../src/utils/validation/computeModelComplexitySummary.ts';
import { computeFailureLogSummary } from '../src/utils/validation/computeFailureLogSummary.ts';
import {
  computeConstructValidityInvarianceSummary,
  parseConstructDiagnosticsRowsFromCsv,
} from '../src/utils/validation/computeConstructValidityInvarianceSummary.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CANONICAL_DATASET_PATH = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const WVS_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'wvs_items.yaml');
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis');

function writeJson(fileName: string, value: unknown): void {
  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
  fs.writeFileSync(path.join(ANALYSIS_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function computeSha256(text: string): string {
  const hash = createHash('sha256');
  hash.update(text, 'utf8');
  return hash.digest('hex').toUpperCase();
}

function extractYamlNumberField(yamlText: string, fieldName: string): number | undefined {
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^\\s*${escapedName}\\s*:\\s*([-+]?\\d*\\.?\\d+)\\s*$`, 'm');
  const match = yamlText.match(regex);
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export async function generatePhase1ValidationArtifacts(): Promise<void> {
  const csvText = fs.readFileSync(CANONICAL_DATASET_PATH, 'utf8');
  const hash = computeSha256(csvText);
  if (hash !== CANONICAL_PANEL_SHA256) {
    throw new Error(
      `Canonical dataset checksum mismatch: expected ${CANONICAL_PANEL_SHA256}, got ${hash} at ${CANONICAL_DATASET_PATH}`,
    );
  }

  const rows = parsePanelCsvText(csvText, CANONICAL_DATASET_PATH);

  const modelLadder = buildModelLadder(rows);
  const cvCountryOut = computeLeaveOneCountryOutRefit(rows);
  const cvRollingOrigin = computeRollingOriginRefit(rows);
  const predictionIntervalCoverage = computePredictionIntervalCoverage(cvCountryOut, cvRollingOrigin);
  const parameterStability = computeParameterStabilitySummary(cvCountryOut, cvRollingOrigin);
  const supportMask = computeSupportMaskSummary(rows);
  const modelComplexitySupport = computeModelComplexitySummary(modelLadder, supportMask);
  const failureLog = computeFailureLogSummary(cvCountryOut, cvRollingOrigin);
  const parsedConstructDiagnostics = parseConstructDiagnosticsRowsFromCsv(csvText, CANONICAL_DATASET_PATH);
  const wvsConfigText = fs.readFileSync(WVS_CONFIG_PATH, 'utf8');
  const configuredMinItemCoverage = extractYamlNumberField(wvsConfigText, 'min_item_coverage') ?? 0.5;
  const constructValidityInvariance = computeConstructValidityInvarianceSummary(parsedConstructDiagnostics.rows, {
    datasetPath: CANONICAL_DATASET_PATH,
    datasetSha256: hash,
    missingColumns: parsedConstructDiagnostics.missingColumns,
    configuredMinItemCoverage,
  });

  writeJson('model_ladder_metrics.json', modelLadder);
  writeJson('cv_country_out.json', cvCountryOut);
  writeJson('cv_rolling_origin.json', cvRollingOrigin);
  writeJson('prediction_interval_coverage.json', predictionIntervalCoverage);
  writeJson('parameter_stability.json', parameterStability);
  writeJson('model_complexity_support.json', modelComplexitySupport);
  writeJson('failure_log.json', failureLog);
  writeJson('construct_validity_invariance.json', constructValidityInvariance);

  console.log('✅ Generated Phase 1 artifacts:');
  console.log('   - src/data/analysis/model_ladder_metrics.json');
  console.log('   - src/data/analysis/cv_country_out.json');
  console.log('   - src/data/analysis/cv_rolling_origin.json');
  console.log('   - src/data/analysis/prediction_interval_coverage.json');
  console.log('   - src/data/analysis/parameter_stability.json');
  console.log('   - src/data/analysis/model_complexity_support.json');
  console.log('   - src/data/analysis/failure_log.json');
  console.log('   - src/data/analysis/construct_validity_invariance.json');
  console.log('   - lockbox artifact is generated separately via npm run generate:lockbox-holdout (release-gated)');
  console.log(`   Folds: country_out=${cvCountryOut.folds.length}, rolling_origin=${cvRollingOrigin.folds.length}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  generatePhase1ValidationArtifacts().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
