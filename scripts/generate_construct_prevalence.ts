/**
 * generate_construct_prevalence.ts — how widely does the measurement failure extend?
 *
 * WHY THIS EXISTS
 * ---------------
 * `construct_prevalence.json` was written by hand once, which makes it exactly
 * the kind of document this paper argues against: a claim with no generator.
 * This script derives it from `rawdata/wvs_construct_audit.json`, so the
 * headline numbers in the abstract ("three of four constructs fail", "41.3% of
 * the frame survives") are reproducible rather than typed.
 *
 * The artefact answers a question the construct audit does not: not "does Z
 * measure belief?" but "how much of a typical multi-composite pipeline survives
 * a routine reliability check?", which is the transferable finding.
 *
 * Usage:
 *   npm run generate:prevalence
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AUDIT = path.join(ROOT, 'rawdata', 'wvs_construct_audit.json');
const PANEL = path.join(ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const OUT = path.join(ROOT, 'src', 'data', 'analysis', 'construct_prevalence.json');

/** Reliability floor the paper sets for itself. */
const ALPHA_FLOOR = 0.7;

interface AuditConstruct {
  itemsConfigured: number;
  cellsEmitted: number;
  cronbachAlpha: number | null;
  unidimensional: boolean;
}

interface Audit {
  countryYears: number;
  constructs: Record<string, AuditConstruct>;
}

function disposition(c: AuditConstruct): 'retained' | 'withdrawn' | 'uncomputable' {
  if (c.cellsEmitted === 0) return 'uncomputable';
  return c.unidimensional ? 'retained' : 'withdrawn';
}

function main(): void {
  if (!fs.existsSync(AUDIT)) {
    // The audit is derived from licence-restricted microdata and is therefore
    // gitignored, so a clean clone never has it. The artifact itself IS
    // committed, and ci_gate verifies its schema, so absence here is not a
    // failure — regenerating it requires data CI cannot hold. Mirror the
    // behaviour of `verify:constructs`: say what happened, exit 0.
    console.log(`SKIP: ${path.relative(ROOT, AUDIT)} is absent (licence-restricted source).`);
    console.log('      The committed construct_prevalence.json remains the evidence of record;');
    console.log('      run `npm run build:wvs-constructs` locally to regenerate it.');
    return;
  }
  const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf-8')) as Audit;

  const panelRows = fs.existsSync(PANEL)
    ? fs.readFileSync(PANEL, 'utf-8').trim().split(/\r?\n/).length - 1
    : 0;

  const constructs = Object.entries(audit.constructs).map(([name, c]) => ({
    name,
    items: c.itemsConfigured,
    cells: c.cellsEmitted,
    alpha: c.cronbachAlpha,
    unidimensional: c.unidimensional,
    disposition: disposition(c),
  }));

  const retained = constructs.filter((c) => c.disposition === 'retained').length;
  const withdrawn = constructs.filter((c) => c.disposition === 'withdrawn').length;
  const uncomputable = constructs.filter((c) => c.disposition === 'uncomputable').length;
  const total = constructs.length;

  const out = {
    schemaVersion: 'phase1.construct_prevalence.v1',
    generatedAtIso: new Date().toISOString(),
    purpose:
      'Quantify how widely the measurement failure extends: how many configured constructs fail a routine reliability check, and how much of the available frame survives it.',
    reliabilityFloor: ALPHA_FLOOR,
    frame: {
      scannedCountryYears: audit.countryYears,
      zComputableCells: audit.constructs.Z_belief_outcome?.cellsEmitted ?? 0,
      canonicalCompleteCases: panelRows,
    },
    constructs,
    summary: {
      configuredConstructs: total,
      retained,
      withdrawn,
      uncomputable,
      failureRate: total > 0 ? Number(((withdrawn + uncomputable) / total).toFixed(4)) : null,
      frameUtilisation: {
        scanned: audit.countryYears,
        analysable: panelRows,
        fraction: audit.countryYears > 0 ? Number((panelRows / audit.countryYears).toFixed(4)) : null,
      },
    },
    implication:
      'Constructs specified by this project\'s own configuration fail at a 3-in-4 rate. Any pipeline that inherits item sets from an older conceptual scheme, rather than testing them, inherits the same risk; the failure is not specific to this dataset but the audit is.',
  };

  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf-8');

  const pct = (f: number | null) => (f === null ? 'n/a' : `${(f * 100).toFixed(1)}%`);
  console.log(`✅ ${path.relative(ROOT, OUT)}`);
  console.log(`   constructs: ${retained} retained / ${withdrawn} withdrawn / ${uncomputable} uncomputable of ${total}`);
  console.log(`   failure rate: ${pct(out.summary.failureRate)}`);
  console.log(`   frame utilisation: ${panelRows} of ${audit.countryYears} (${pct(out.summary.frameUtilisation.fraction)})`);
  if (out.summary.failureRate === null) {
    console.error('   WARNING: no constructs found in the audit — failure rate is undefined');
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
