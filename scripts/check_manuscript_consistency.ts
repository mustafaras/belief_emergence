import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type CheckFailure = {
  id: string;
  file: string;
  message: string;
  remediation: string;
};

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = path.resolve(APP_ROOT, '..');
// The manuscript lives in one of three places depending on where this runs:
//   <repo>/paper                          versioned layout (CI and fresh clones)
//   <repo>/BE_paper_latest                local development tree, app at root
//   <repo>/../BE_paper_latest             local development tree, app in BE_app/
// Resolve by existence rather than by assumption; assuming the third form is
// what made the check pass locally and fail in CI.
const PAPER_ROOT = [
  path.join(REPO_ROOT, 'paper'),
  path.join(REPO_ROOT, 'BE_paper_latest'),
  path.join(APP_ROOT, 'paper'),
  path.join(REPO_ROOT, '..', 'BE_paper_latest'),
].find((candidate) => fs.existsSync(candidate)) ?? path.join(REPO_ROOT, 'BE_paper_latest');
const ANALYSIS_DIR = path.join(APP_ROOT, 'src', 'data', 'analysis');

const OPTIONAL_DOC_FILES = new Set([
  'EDITOR_RESPONSE_MATRIX.md',
  'CLAIM_EVIDENCE_MAP.md',
  'REPRO_RUNBOOK.md',
]);

const DEFAULT_TOLERANCE = 5e-4;

function normalizeRelativePath(relativePathFromPaperRoot: string): string {
  return relativePathFromPaperRoot.replace(/\\/g, '/');
}

function readText(relativePathFromPaperRoot: string): string | null {
  const absolutePath = path.join(PAPER_ROOT, relativePathFromPaperRoot);
  if (!fs.existsSync(absolutePath)) {
    const normalized = normalizeRelativePath(relativePathFromPaperRoot);
    if (OPTIONAL_DOC_FILES.has(normalized)) {
      return null;
    }
    throw new Error(`Required manuscript/support file is missing: ${relativePathFromPaperRoot} (${absolutePath})`);
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function readJson<T>(fileName: string): T {
  const absolutePath = path.join(ANALYSIS_DIR, fileName);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as T;
}

function closeEnough(found: number, expected: number, tolerance: number): boolean {
  return Number.isFinite(found) && Number.isFinite(expected) && Math.abs(found - expected) <= tolerance;
}

function parseNumbers(groups: string[]): number[] {
  return groups.map((group) => Number.parseFloat(group));
}

type CheckRunStats = {
  executed: number;
  skippedOptional: number;
};

function addRegexNumberCheck(args: {
  stats: CheckRunStats;
  failures: CheckFailure[];
  id: string;
  file: string;
  regex: RegExp;
  expected: number[];
  tolerance?: number;
  context?: string;
}): void {
  const { stats, failures, id, file, regex, expected, tolerance = DEFAULT_TOLERANCE, context } = args;
  const content = readText(file);
  if (content === null) {
    stats.skippedOptional += 1;
    console.log(`ℹ️ Skipping optional consistency check [${id}] because file is missing: ${file}`);
    return;
  }
  stats.executed += 1;
  const match = content.match(regex);
  if (!match) {
    failures.push({
      id,
      file,
      message: `Configured claim pattern not found${context ? ` (${context})` : ''}.`,
      remediation: 'Update whitelist regex or synchronize manuscript wording with canonical format.',
    });
    return;
  }

  const found = parseNumbers(match.slice(1));
  if (found.length !== expected.length || found.some((value) => Number.isNaN(value))) {
    failures.push({
      id,
      file,
      message: `Could not parse numeric captures for configured claim${context ? ` (${context})` : ''}.`,
      remediation: 'Ensure claim keeps machine-parseable numeric formatting (e.g., \\num{...} or plain decimals).',
    });
    return;
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (!closeEnough(found[index], expected[index], tolerance)) {
      failures.push({
        id,
        file,
        message: `Numeric mismatch at capture ${index + 1}: found ${found[index].toFixed(4)} expected ${expected[index].toFixed(4)} (tol=${tolerance}).`,
        remediation: 'Run `npm run generate:phase1-validation` and update manuscript values to canonical artifacts.',
      });
      return;
    }
  }
}

function addNthRegexNumberCheck(args: {
  stats: CheckRunStats;
  failures: CheckFailure[];
  id: string;
  file: string;
  regex: RegExp;
  occurrence: number;
  expected: number[];
  tolerance?: number;
  context?: string;
}): void {
  const { stats, failures, id, file, regex, occurrence, expected, tolerance = DEFAULT_TOLERANCE, context } = args;
  const content = readText(file);
  if (content === null) {
    stats.skippedOptional += 1;
    console.log(`ℹ️ Skipping optional consistency check [${id}] because file is missing: ${file}`);
    return;
  }
  stats.executed += 1;
  const matches = [...content.matchAll(regex)];
  if (occurrence < 1 || occurrence > matches.length) {
    failures.push({
      id,
      file,
      message: `Configured occurrence #${occurrence} not found${context ? ` (${context})` : ''}.`,
      remediation: 'Update whitelist occurrence index or synchronize manuscript table structure.',
    });
    return;
  }

  const selected = matches[occurrence - 1];
  const found = parseNumbers(selected.slice(1));
  if (found.length !== expected.length || found.some((value) => Number.isNaN(value))) {
    failures.push({
      id,
      file,
      message: `Could not parse numeric captures for occurrence #${occurrence}${context ? ` (${context})` : ''}.`,
      remediation: 'Ensure claim keeps machine-parseable numeric formatting in this table row.',
    });
    return;
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (!closeEnough(found[index], expected[index], tolerance)) {
      failures.push({
        id,
        file,
        message: `Occurrence #${occurrence} mismatch at capture ${index + 1}: found ${found[index].toFixed(4)} expected ${expected[index].toFixed(4)} (tol=${tolerance}).`,
        remediation: 'Sync table values with canonical artifacts.',
      });
      return;
    }
  }
}

type CvArtifact = {
  folds: Array<{
    nTestRows: number;
  }>;
  aggregates: Record<string, { rmse: { median: number; q25?: number; q75?: number } }>;
};

type StabilityArtifact = {
  thresholdsByTier?: Record<string, number>;
  pooledByTier?: Record<string, { medianSignConsistency: number }>;
};

type ModelComplexitySupportArtifact = {
  supportConstrainedInference?: {
    effectiveSupportUnits?: number;
  };
};

export function runConsistencyChecks(): void {
  try {
    const cvCountry = readJson<CvArtifact>('cv_country_out.json');
    const cvRolling = readJson<CvArtifact>('cv_rolling_origin.json');
    const parameterStability = readJson<StabilityArtifact>('parameter_stability.json');
    const modelComplexitySupport = readJson<ModelComplexitySupportArtifact>('model_complexity_support.json');

    const expectedCountryMedians = ['A', 'B', 'C'].map((tier) => cvCountry.aggregates[tier].rmse.median);
    const expectedRollingMedians = ['A', 'B', 'C'].map((tier) => cvRolling.aggregates[tier].rmse.median);
    const expectedCountryFoldCount = cvCountry.folds.length;
    const expectedRollingFoldCount = cvRolling.folds.length;
    const expectedSupportUnits = modelComplexitySupport.supportConstrainedInference?.effectiveSupportUnits ?? Number.NaN;
    const expectedCountryIqr = ['A', 'B', 'C'].flatMap((tier) => [
      cvCountry.aggregates[tier].rmse.q25 ?? Number.NaN,
      cvCountry.aggregates[tier].rmse.q75 ?? Number.NaN,
    ]);
    const expectedRollingIqr = ['A', 'B', 'C'].flatMap((tier) => [
      cvRolling.aggregates[tier].rmse.q25 ?? Number.NaN,
      cvRolling.aggregates[tier].rmse.q75 ?? Number.NaN,
    ]);

    const expectedTierCThreshold = parameterStability.thresholdsByTier?.C;
    const expectedTierCPooled = parameterStability.pooledByTier?.C?.medianSignConsistency;

    if (
      !Number.isFinite(expectedTierCThreshold)
      || !Number.isFinite(expectedTierCPooled)
      || !Number.isFinite(expectedSupportUnits)
      || expectedCountryIqr.some((value) => !Number.isFinite(value))
      || expectedRollingIqr.some((value) => !Number.isFinite(value))
    ) {
      throw new Error('Canonical artifacts missing required fields for consistency checks. Regenerate phase1 validation artifacts.');
    }

    const failures: CheckFailure[] = [];
    const stats: CheckRunStats = { executed: 0, skippedOptional: 0 };

    addRegexNumberCheck({
      stats,
      failures,
      id: 'MAIN_ABSTRACT_SUPPORT_AND_PROTOCOL_COUNTS',
      file: path.join('main', 'main.tex'),
      regex: /rebuilt panel comprises ([0-9]+) countries and ([0-9]+) complete-case country--year observations spanning [0-9]{4}--[0-9]{4}/s,
      expected: [expectedCountryFoldCount, expectedSupportUnits],
      context: 'Main abstract panel counts',
      tolerance: 0,
    });

    addRegexNumberCheck({
      stats,
      failures,
      id: 'MAIN_RESULTS_LOO_MEDIANS',
      file: path.join('main', 'main.tex'),
      regex: /median out-of-sample RMSE is \\num\{([0-9.]+)\}\/\\num\{([0-9.]+)\}\/\\num\{([0-9.]+)\} for Tier A\/B\/C/s,
      expected: expectedCountryMedians,
      context: 'Main results LOO medians',
    });

    addRegexNumberCheck({
      stats,
      failures,
      id: 'MAIN_RESULTS_ROLLING_MEDIANS',
      file: path.join('main', 'main.tex'),
      regex: /Median out-of-sample RMSE across the [0-9]+ rolling folds is \\num\{([0-9.]+)\}\/\\num\{([0-9.]+)\}\/\\num\{([0-9.]+)\} for Tier A\/B\/C/s,
      expected: expectedRollingMedians,
      context: 'Main results rolling medians',
    });

    addRegexNumberCheck({
      stats,
      failures,
      id: 'MAIN_TIERC_BOUNDARY',
      file: path.join('main', 'main.tex'),
      regex: /Tier C threshold \\num\{([0-9.]+)\}; pooled median consistency \\num\{([0-9.]+)\}/s,
      expected: [expectedTierCThreshold as number, expectedTierCPooled as number],
      tolerance: 1e-3,
      context: 'Main Tier C threshold language',
    });

    addNthRegexNumberCheck({
      stats,
      failures,
      id: 'SUPP_LOO_MEDIANS_ROW',
      file: path.join('supplementary', 'supplementary_materials.tex'),
      regex: /Median OOS RMSE & ([0-9.]+) & ([0-9.]+) & ([0-9.]+) &/g,
      occurrence: 1,
      expected: expectedCountryMedians,
      context: 'Supplementary LOO table medians',
    });

    addNthRegexNumberCheck({
      stats,
      failures,
      id: 'SUPP_ROLLING_MEDIANS_ROW',
      file: path.join('supplementary', 'supplementary_materials.tex'),
      regex: /Median OOS RMSE & ([0-9.]+) & ([0-9.]+) & ([0-9.]+) &/g,
      occurrence: 2,
      expected: expectedRollingMedians,
      context: 'Supplementary rolling table medians',
    });

    addNthRegexNumberCheck({
      stats,
      failures,
      id: 'SUPP_LOO_IQR_ROW',
      file: path.join('supplementary', 'supplementary_materials.tex'),
      regex: /IQR \(RMSE range\) & ([0-9.]+)--([0-9.]+) & ([0-9.]+)--([0-9.]+) & ([0-9.]+)--([0-9.]+) &/g,
      occurrence: 1,
      expected: expectedCountryIqr,
      context: 'Supplementary LOO IQR ranges',
    });

    addNthRegexNumberCheck({
      stats,
      failures,
      id: 'SUPP_ROLLING_IQR_ROW',
      file: path.join('supplementary', 'supplementary_materials.tex'),
      regex: /IQR \(RMSE range\) & ([0-9.]+)--([0-9.]+) & ([0-9.]+)--([0-9.]+) & ([0-9.]+)--([0-9.]+) &/g,
      occurrence: 2,
      expected: expectedRollingIqr,
      context: 'Supplementary rolling IQR ranges',
    });

    addRegexNumberCheck({
      stats,
      failures,
      id: 'HIGHLIGHTS_OOS_TRIPLETS',
      file: 'highlights.tex',
      regex: /leave-one-country-out \(([0-9]+) folds\) and forward-chaining rolling origin \(([0-9]+) folds[^)]*\) with median OOS RMSE ([0-9.]+) and ([0-9.]+) for Tier.A/s,
      expected: [expectedCountryFoldCount, expectedRollingFoldCount, expectedCountryMedians[0], expectedRollingMedians[0]],
      tolerance: 0.0005,
      context: 'Highlights OOS medians',
    });

    addRegexNumberCheck({
      stats,
      failures,
      id: 'COVERLETTER_OOS_TRIPLETS',
      file: 'cover_letter.tex',
      regex: /Leave-one-country-out\} \(([0-9]+) folds\): median OOS RMSE ([0-9.]+) \(Tier.A\), ([0-9.]+) \(Tier.B\), ([0-9.]+) \(Tier.C\)[\s\S]*?Rolling-origin temporal validation\} \(([0-9]+) forward-chaining folds\): median OOS RMSE ([0-9.]+) \(Tier.A\), ([0-9.]+) \(Tier.B\), ([0-9.]+) \(Tier.C\)/s,
      expected: [expectedCountryFoldCount, ...expectedCountryMedians, expectedRollingFoldCount, ...expectedRollingMedians],
      tolerance: 0.0005,
      context: 'Cover letter OOS medians',
    });

    addRegexNumberCheck({
      stats,
      failures,
      id: 'COVERLETTER_TIERC_BOUNDARY',
      file: 'cover_letter.tex',
      regex: /stability threshold \(([0-9.]+);\s*pooled median consistency ([0-9.]+)\)/s,
      expected: [expectedTierCThreshold as number, expectedTierCPooled as number],
      tolerance: 1e-3,
      context: 'Cover letter Tier C threshold language',
    });

    addRegexNumberCheck({
      stats,
      failures,
      id: 'EDITOR_MATRIX_SHOW_NUMBERS',
      file: 'EDITOR_RESPONSE_MATRIX.md',
      regex: /LOO median OOS RMSE \*\*([0-9.]+)\*\* \(Tier A\), \*\*([0-9.]+)\*\* \(Tier B\), \*\*([0-9.]+)\*\* \(Tier C\); rolling-origin \*\*([0-9.]+)\*\* \(Tier A\), \*\*([0-9.]+)\*\* \(Tier B\), \*\*([0-9.]+)\*\* \(Tier C\)/s,
      expected: [...expectedCountryMedians, ...expectedRollingMedians],
      context: 'Editor response matrix show-numbers block',
    });

    addRegexNumberCheck({
      stats,
      failures,
      id: 'CLAIM_MAP_OOS_TRIPLETS',
      file: 'CLAIM_EVIDENCE_MAP.md',
      regex: /median OOS RMSE \(Tier A\/B\/C: ([0-9.]+) \/ ([0-9.]+) \/ ([0-9.]+)\)[\s\S]*?median OOS RMSE \(Tier A\/B\/C: ([0-9.]+) \/ ([0-9.]+) \/ ([0-9.]+)\)/s,
      expected: [...expectedCountryMedians, ...expectedRollingMedians],
      context: 'Claim evidence map protocol block',
    });

    addRegexNumberCheck({
      stats,
      failures,
      id: 'RUNBOOK_EXPECTED_LOO_TRIPLE',
      file: 'REPRO_RUNBOOK.md',
      regex: /Expected LOO median RMSE \(Tier A\/B\/C\) = ([0-9.]+) \/ ([0-9.]+) \/ ([0-9.]+)/s,
      expected: expectedCountryMedians,
      context: 'Repro runbook expected LOO triplet',
    });

    if (failures.length > 0) {
      console.error('\n❌ Manuscript consistency check failed.');
      for (const failure of failures) {
        console.error(`\n[${failure.id}] ${failure.file}`);
        console.error(`- Issue: ${failure.message}`);
        console.error(`- Remediation: ${failure.remediation}`);
      }
      if (stats.skippedOptional > 0) {
        console.error(`\nInfo: skipped ${stats.skippedOptional} optional check block(s) because optional files are absent.`);
      }
      console.error('\nHint: regenerate canonical artifacts, then synchronize manuscript whitelist claims with Prompt 6/7 edits.');
      process.exitCode = 1;
      return;
    }

    console.log('✅ Manuscript consistency check passed.');
    console.log(`Checked ${stats.executed} whitelisted claim blocks against canonical analysis artifacts.`);
    if (stats.skippedOptional > 0) {
      console.log(`Skipped ${stats.skippedOptional} optional check block(s) because optional files are absent.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Manuscript consistency check failed.');
    console.error(`- Issue: ${message}`);
    console.error('- Remediation: ensure required manuscript files and canonical artifacts exist, then rerun `npm run verify:q1:docs`.');
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runConsistencyChecks();
}
