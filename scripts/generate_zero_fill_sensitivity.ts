import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { computeZeroFillSensitivity } from '../src/utils/validation/computeZeroFillSensitivity.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PANEL = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'zero_fill_sensitivity.json');

const csvText = fs.readFileSync(PANEL, 'utf8');
const hash = createHash('sha256').update(csvText, 'utf8').digest('hex').toUpperCase();
if (hash !== CANONICAL_PANEL_SHA256) throw new Error(`panel checksum mismatch: ${hash}`);

const result = computeZeroFillSensitivity(parsePanelCsvText(csvText, PANEL));
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(`wrote ${path.relative(REPO_ROOT, OUT)}  (${result.nZeroAnchor} rows at the zero anchor)`);
for (const s of result.splits) {
  console.log(`  ${s.label.padEnd(28)} n=${s.n} C-B=${s.cMinusB.toFixed(4)} perRepeat=${s.perRepeatMedianCminusB.toFixed(4)}`);
}
console.log(`  survives=${result.resultSurvivesRemoval}`);
