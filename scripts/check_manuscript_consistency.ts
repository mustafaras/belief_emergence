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
//   <app>/paper                           versioned layout (CI, fresh clone)
//   <repo>/BE_paper_latest                local development tree, app at root
//   <repo>/../BE_paper_latest             local development tree, app in BE_app/
//
// APP_ROOT is checked FIRST, and that ordering is the whole point. `REPO_ROOT`
// is the parent of the app, so in a local development tree it is the folder
// that also holds BE_paper_latest/ — a stale copy of the manuscript. Listing
// REPO_ROOT candidates first made this check validate the stale copy while the
// versioned paper/ went unread, i.e. it reported success on text nobody would
// submit. The versioned layout must win whenever it exists.
const PAPER_ROOT = [
  path.join(APP_ROOT, 'paper'),
  path.join(REPO_ROOT, 'paper'),
  path.join(REPO_ROOT, 'BE_paper_latest'),
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

/**
 * Locate a table row by its leading label rather than by match order.
 *
 * The supplement carries three protocols (grouped k-fold, country-out,
 * rolling-origin), each with a "Median OOS RMSE & ..." row. Selecting them by
 * `occurrence: 1/2/3` binds the check to the order the tables happen to appear
 * in, so inserting a protocol above them silently retargets every assertion.
 * Matching on the label plus a nearby anchor phrase keeps each check pointed at
 * the protocol it is meant to verify.
 */
function addLabelledRowNumberCheck(args: {
  stats: CheckRunStats;
  failures: CheckFailure[];
  id: string;
  file: string;
  anchor: RegExp;
  row: RegExp;
  expected: number[];
  tolerance?: number;
  context?: string;
}): void {
  const { stats, failures, id, file, anchor, row, expected, tolerance = DEFAULT_TOLERANCE, context } = args;
  const content = readText(file);
  if (content === null) {
    stats.skippedOptional += 1;
    console.log(`ℹ️ Skipping optional consistency check [${id}] because file is missing: ${file}`);
    return;
  }
  stats.executed += 1;

  // matchAll requires /g; the anchor is written without it at the call site so
  // the shared regexes stay readable, so the flag is added here.
  const anchorGlobal = new RegExp(anchor.source, anchor.flags.includes('g') ? anchor.flags : `${anchor.flags}g`);
  const anchorMatch = [...content.matchAll(anchorGlobal)];
  if (anchorMatch.length === 0) {
    failures.push({
      id,
      file,
      message: `Protocol anchor not found${context ? ` (${context})` : ''}.`,
      remediation: 'Restore the protocol heading, or update the anchor regex to the current wording.',
    });
    return;
  }

  const start = anchorMatch[0].index ?? 0;
  // Search a bounded window so a later table cannot satisfy this check.
  const window = content.slice(start, start + 4000);
  const rowMatch = row.exec(window);
  if (!rowMatch) {
    failures.push({
      id,
      file,
      message: `Labelled row not found after its protocol anchor${context ? ` (${context})` : ''}.`,
      remediation: 'Restore the table row, or synchronize its label with the checker.',
    });
    return;
  }

  const found = parseNumbers(rowMatch.slice(1));
  if (found.length !== expected.length || found.some((value) => Number.isNaN(value))) {
    failures.push({
      id,
      file,
      message: `Could not parse numeric captures for the labelled row${context ? ` (${context})` : ''}.`,
      remediation: 'Ensure claim keeps machine-parseable numeric formatting in this table row.',
    });
    return;
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (!closeEnough(found[index], expected[index], tolerance)) {
      failures.push({
        id,
        file,
        message: `Labelled row mismatch at capture ${index + 1}: found ${found[index].toFixed(4)} expected ${expected[index].toFixed(4)} (tol=${tolerance}).`,
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
      // The country-out paragraph now reports the pooled series and the RMSE
      // triple in one sentence; the triple is the assertion target.
      regex: /spatial stress test[\s\S]{0,1200}?median held-out RMSE is \\num\{([0-9.]+)\}\/\\num\{([0-9.]+)\}\/\\num\{([0-9.]+)\}/s,
      expected: expectedCountryMedians,
      context: 'Main results LOO medians',
    });

    addRegexNumberCheck({
      stats,
      failures,
      id: 'MAIN_RESULTS_ROLLING_MEDIANS',
      file: path.join('main', 'main.tex'),
      // Rolling-origin reports its triple in the same sentence as its protocol name.
      regex: /Forward-chaining rolling-origin evaluation[\s\S]{0,500}?median out-of-sample RMSE is \\num\{([0-9.]+)\}\/\\num\{([0-9.]+)\}\/\\num\{([0-9.]+)\}/s,
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

    // Derived from the panel rather than written down, so the sentence cannot
    // drift away from the data it describes.
    const panelRowsPath = path.join(APP_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
    const countryCounts = new Map<string, number>();
    if (fs.existsSync(panelRowsPath)) {
      const csv = fs.readFileSync(panelRowsPath, 'utf8');
      const [header, ...body] = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const isoIndex = header.split(',').indexOf('iso3');
      for (const line of body) {
        const iso = line.split(',')[isoIndex];
        if (iso) countryCounts.set(iso, (countryCounts.get(iso) ?? 0) + 1);
      }
    }
    const panelCountryCount = countryCounts.size;
    const singleObservationCountries = [...countryCounts.values()].filter((n) => n === 1).length;

    // LaTeX table column counts. A row with more cells than its declared
    // preamble compiles to "Extra alignment tab has been changed to \\cr" --
    // a warning that pdflatex does not treat as fatal, so the build can succeed
    // locally while the row silently loses its tail. It failed on CI instead.
    // This catches it before either happens.
    for (const file of ['main/main.tex', 'supplementary/supplementary_materials.tex']) {
      const content = readText(file);
      if (!content) continue;
      const lines = content.split('\n');
      let declared: number | null = null;
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        // Brace-matched preamble extraction: column specs contain nested
        // braces (`@{}`, `p{3cm}`, `*{5}{X}`) so a regex cannot count them.
        const beginMatch = line.match(/\\begin\{(tab(ularx?)|longtable)\}/);
        if (beginMatch) {
          let depth = 0;
          let seen = 0;
          let start = -1;
          for (let c = beginMatch.index! + beginMatch[0].length; c < line.length; c += 1) {
            if (line[c] === '{') {
              depth += 1;
              if (depth === 1) { seen += 1; start = c + 1; }
            } else if (line[c] === '}') {
              depth -= 1;
              if (depth === 0 && seen === 2) {
                const raw = line.slice(start, c);
                // Strip the decorations that themselves contain column letters:
                // `@{}` separators, `>{...}` / `<{...}` modifiers (whose bodies
                // hold things like \raggedleft\arraybackslash) and any
                // `>{...}`-wrapped body. What is left is the column skeleton.
                let spec = raw
                  .replace(/@\{[^{}]*\}/g, '')
                  .replace(/[<>]\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
                  // Width-bearing column types collapse to a single marker, or
                  // the letters inside their argument (`\linewidth`) would be
                  // counted as columns.
                  .replace(/[pmb]\{[^{}]*\}/g, '#')
                  // siunitx S columns carry options in brackets.
                  .replace(/S\[[^\]]*\]/g, '#');
                let multiplied = 0;
                spec = spec.replace(/\*\{(\d+)\}\{([^{}]*)\}/g, (_m, n: string, body: string) => {
                  multiplied += Number(n) - 1;
                  return body;
                });
                const base = (spec.match(/[#lcrX]/g) ?? []).length;
                declared = base + multiplied;
                break;
              }
            }
          }
          continue;
        }
        if (declared !== null && line.includes('&') && line.trim().endsWith('\\\\')) {
          const cells = line.split('&').length;
          // Both directions matter. Too many cells drops the tail silently;
          // too few shifts every value in the row one column left, which
          // produces a table that compiles and is wrong -- worse than a crash.
          if (cells !== declared && !line.includes('\\multicolumn')) {
            failures.push({
              id: 'LATEX_TABLE_COLUMNS',
              file,
              message: `line ${i + 1}: row has ${cells} cells but the table declares ${declared}`,
              remediation: 'Fix the row or the preamble; pdflatex reports this as a warning and drops the excess cells.',
            });
            stats.executed += 1;
          }
        }
        if (line.includes('\\end{tabular')) declared = null;
      }
    }

    // Structural panel facts. "N of M countries contribute exactly one
    // observation" reads like description but is a number, and it drifted
    // 29 -> 30 -> 27 as the panel grew because nothing computed it. The fold
    // count has the same property: one fold per country, so it is the country
    // count wearing a different name.
    addRegexNumberCheck({
      stats,
      failures,
      id: 'MAIN_PANEL_BALANCE',
      file: path.join('main', 'main.tex'),
      regex: /(\d+) of (\d+) countries contribute exactly one observation/,
      expected: [singleObservationCountries, panelCountryCount],
      context: 'Main panel balance sentence',
    });

    addRegexNumberCheck({
      stats,
      failures,
      id: 'SUPP_PANEL_BALANCE_AND_FOLDS',
      file: path.join('supplementary', 'supplementary_materials.tex'),
      regex: /Across (\d+) folds \(one country held out per fold\)\. Because (\d+) of (\d+) countries contribute a single observation/,
      expected: [panelCountryCount, singleObservationCountries, panelCountryCount],
      context: 'Supplementary fold count and balance sentence',
    });

    // Each supplementary table is located by its protocol heading, not by the
    // order the tables appear in: three protocols now publish a "Median OOS
    // RMSE" row and position is not a stable key.
    addLabelledRowNumberCheck({
      stats,
      failures,
      id: 'SUPP_LOO_MEDIANS_ROW',
      file: path.join('supplementary', 'supplementary_materials.tex'),
      anchor: /Leave-One-Country-Out Cross-Validation \(spatial stress test/,
      row: /Median OOS RMSE & ([0-9.]+) & ([0-9.]+) & ([0-9.]+) &/,
      expected: expectedCountryMedians,
      context: 'Supplementary country-out table medians',
    });

    addLabelledRowNumberCheck({
      stats,
      failures,
      id: 'SUPP_ROLLING_MEDIANS_ROW',
      file: path.join('supplementary', 'supplementary_materials.tex'),
      anchor: /Rolling-Origin Temporal Scope Diagnostic/,
      row: /Median OOS RMSE & ([0-9.]+) & ([0-9.]+) & ([0-9.]+) &/,
      expected: expectedRollingMedians,
      context: 'Supplementary rolling-origin table medians',
    });

    addLabelledRowNumberCheck({
      stats,
      failures,
      id: 'SUPP_LOO_IQR_ROW',
      file: path.join('supplementary', 'supplementary_materials.tex'),
      anchor: /Leave-One-Country-Out Cross-Validation \(spatial stress test/,
      row: /IQR \(RMSE range\) & ([0-9.]+)--([0-9.]+) & ([0-9.]+)--([0-9.]+) & ([0-9.]+)--([0-9.]+) &/,
      expected: expectedCountryIqr,
      context: 'Supplementary country-out IQR ranges',
    });

    addLabelledRowNumberCheck({
      stats,
      failures,
      id: 'SUPP_ROLLING_IQR_ROW',
      file: path.join('supplementary', 'supplementary_materials.tex'),
      anchor: /Rolling-Origin Temporal Scope Diagnostic/,
      row: /IQR \(RMSE range\) & ([0-9.]+)--([0-9.]+) & ([0-9.]+)--([0-9.]+) & ([0-9.]+)--([0-9.]+) &/,
      expected: expectedRollingIqr,
      context: 'Supplementary rolling-origin IQR ranges',
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
      // Tolerates a descriptor after the fold count (e.g. "48 folds, retained as
      // a spatial stress test") so the protocol's role can change without
      // silently disabling the numeric assertion.
      regex: /Leave-one-country-out\} \(([0-9]+) folds[^)]*\):?\s*median OOS RMSE ([0-9.]+) \(Tier.A\), ([0-9.]+) \(Tier.B\), ([0-9.]+) \(Tier.C\)[\s\S]*?Rolling-origin temporal validation\} \(([0-9]+) forward-chaining folds\): median OOS RMSE ([0-9.]+) \(Tier.A\), ([0-9.]+) \(Tier.B\), ([0-9.]+) \(Tier.C\)/s,
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
