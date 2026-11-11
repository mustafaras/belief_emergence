/**
 * Complete-case row count as a function of how far a neighbouring year's Gini
 * may be borrowed. This number appeared in the manuscript as a hand-written
 * table (87 / 113 / 126) and went stale twice before anyone noticed, because no
 * script produced it. It is now measured by rebuilding the panel at each window
 * width, which is the only honest way to report it.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'gini_window_sensitivity.json');
const PANEL = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const AUDIT = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.audit.json');

type Row = { window: number; completeCaseRows: number; giniBackfilled: number };

// This script rebuilds the panel three times, which needs the gitignored raw
// inputs. On a clean clone they are absent, so the measurement cannot be made;
// the committed artifact is then left untouched rather than replaced by zeros.
// The alternative -- failing the build -- would make the CI gate impossible to
// run without licensed data it is not allowed to ship.
const REQUIRED_INPUTS = ['panel_model_data.csv', 'wvs_combined.csv'];
const missing = REQUIRED_INPUTS.filter((f) => !fs.existsSync(path.join(REPO_ROOT, 'rawdata', f)));
if (missing.length > 0) {
  console.log(`SKIP  raw inputs absent (${missing.join(', ')}); leaving the committed artifact as is.`);
  process.exit(0);
}

const rows: Row[] = [];
const original = fs.readFileSync(PANEL, 'utf8');
const originalAudit = fs.readFileSync(AUDIT, 'utf8');

try {
  for (const window of [0, 1, 2, 3, 5]) {
    execFileSync('npx', ['tsx', 'scripts/build_canonical_panel.ts', '--gini-window', String(window)], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });
    const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8')) as {
      rows: number;
      backfills?: { covariate: string; cellsRecovered: number }[];
    };
    const gini = audit.backfills?.find((b) => b.covariate === 'Y');
    rows.push({
      window,
      completeCaseRows: audit.rows,
      giniBackfilled: gini?.cellsRecovered ?? 0,
    });
  }
} finally {
  // Restore the committed panel: this script measures, it does not change the
  // canonical artefact.
  fs.writeFileSync(PANEL, original, 'utf8');
  fs.writeFileSync(AUDIT, originalAudit, 'utf8');
}

const payload = {
  schemaVersion: 'phase1.gini_window_sensitivity.v1',
  generatedAtIso: new Date().toISOString(),
  purpose: 'Sample size as a function of how far a neighbouring year\'s World Bank Gini may be borrowed when the exact year is absent. The adopted window is +/-5.',
  indicator: 'SI.POV.GINI (World Bank WDI)',
  rows,
};
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`wrote ${path.relative(REPO_ROOT, OUT)}`);
for (const r of rows) console.log(`  window +/-${r.window}: ${r.completeCaseRows} rows (${r.giniBackfilled} Gini cells backfilled)`);
