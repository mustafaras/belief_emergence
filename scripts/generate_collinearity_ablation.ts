import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { computeCollinearityAblation } from '../src/utils/validation/computeCollinearityAblation.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PANEL = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'collinearity_ablation.json');

const csvText = fs.readFileSync(PANEL, 'utf8');
const hash = createHash('sha256').update(csvText, 'utf8').digest('hex').toUpperCase();
if (hash !== CANONICAL_PANEL_SHA256) throw new Error(`panel checksum mismatch: ${hash}`);

const result = computeCollinearityAblation(parsePanelCsvText(csvText, PANEL));
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(`wrote ${path.relative(REPO_ROOT, OUT)}  (n=${result.n})`);
for (const s of result.specs) {
  console.log(`  ${s.label.padEnd(16)} kfB=${s.kFold.B.toFixed(4)} kfC=${s.kFold.C.toFixed(4)} C-B=${s.cMinusB.toFixed(4)}`);
}
console.log(`  reversalStable=${result.reversalStable} orderingStableInSample=${result.orderingStableInSample}`);
