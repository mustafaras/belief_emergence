import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { computeCollinearityDiagnostics } from '../src/utils/validation/computeCollinearityDiagnostics.ts';
import { createHash } from 'node:crypto';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PANEL = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'collinearity_diagnostics.json');

const csvText = fs.readFileSync(PANEL, 'utf8');
const hash = createHash('sha256').update(csvText, 'utf8').digest('hex').toUpperCase();
if (hash !== CANONICAL_PANEL_SHA256) throw new Error(`panel checksum mismatch: ${hash}`);

const diagnostics = computeCollinearityDiagnostics(parsePanelCsvText(csvText, PANEL));
fs.writeFileSync(OUT, `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8');

console.log(`wrote ${path.relative(REPO_ROOT, OUT)}`);
console.log(`  n = ${diagnostics.n}, condition number = ${diagnostics.conditionNumber}`);
for (const e of diagnostics.entries) {
  console.log(`  ${e.covariate}: VIF = ${e.vif.toFixed(2)}  (R2 on others = ${e.r2OnOthers.toFixed(4)})`);
}
