import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { computeRCollinearityCase } from '../src/utils/validation/computeRCollinearityCase.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PANEL = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'r_collinearity_case.json');

const csvText = fs.readFileSync(PANEL, 'utf8');
const hash = createHash('sha256').update(csvText, 'utf8').digest('hex').toUpperCase();
if (hash !== CANONICAL_PANEL_SHA256) throw new Error(`panel checksum mismatch: ${hash}`);

const result = computeRCollinearityCase(parsePanelCsvText(csvText, PANEL));
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(`wrote ${path.relative(REPO_ROOT, OUT)}`);
for (const v of result.variants) {
  console.log(`  ${v.label.padEnd(10)} maxVIF=${v.maxVif.toFixed(2)} inR2=${v.inSampleR2.toFixed(4)} kfR2=${v.kFoldR2.toFixed(4)} C-B=${v.cMinusB.toFixed(4)}`);
}
console.log(`  verdict: ${result.verdict.recommendation} — ${result.verdict.reason}`);
