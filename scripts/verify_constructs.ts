/**
 * verify_constructs.ts — independent re-derivation of the construct audit.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `rawdata/wvs_construct_audit.json` is the evidence a reviewer will ask for:
 * it says which items built each construct, how many country-years survived,
 * and what each construct's internal consistency is. Evidence that nobody can
 * check is not evidence. This script recomputes those numbers from the raw
 * microdata and asserts that the artifact still describes what the data says.
 *
 * It deliberately does NOT import `build_wvs_constructs.ts`. Re-running the
 * producer would only prove that the producer is deterministic; a real check
 * needs a second implementation that can disagree. The rules are read from
 * `config/wvs_items.yaml`, because the config — not this file — is the
 * definition being verified.
 *
 * CONTRACT
 * --------
 *  - Exit 0: artifact matches the recomputation, or the source is absent and
 *    verification was skipped (the WVS microdata is licence-restricted and is
 *    not in the repository, so CI cannot run the check).
 *  - Exit 1: the artifact and the data disagree. Every mismatched field is
 *    printed with both values.
 *  - Exit 2: the artifact is missing while the source is present — nothing to
 *    verify against.
 *
 * Usage:
 *   npm run verify:constructs
 *   npx tsx scripts/verify_constructs.ts --source rawdata/wvs_trend_all_items.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'rawdata');

const AUDIT_PATH = path.join(RAW, 'wvs_construct_audit.json');
const CONFIG_PATH = path.join(ROOT, 'config', 'wvs_items.yaml');
const TREND_SOURCE = path.join(RAW, 'wvs_trend_all_items.csv');
const JOINT_SOURCE = path.join(RAW, 'EVS_WVS_Joint_Csv_v5_0.csv');
const ISO_NUMERIC_MAP = path.join(RAW, 'iso_numeric_to_alpha2.json');

/** Alpha is compared to 1e-6: the artifact stores full float precision. */
const ALPHA_TOLERANCE = 1e-6;

interface ItemSpec {
  item_code: string;
  scale_min: number;
  scale_max: number;
  reverse: boolean;
}

interface ConstructSpec {
  label: string;
  items: ItemSpec[];
}

interface AuditConfig {
  defaults: {
    normalisation: string;
    missing_codes: number[];
    aggregation_method: string;
    min_observations: number;
    min_item_coverage: number;
  };
  constructs: Record<string, ConstructSpec>;
}

interface AuditConstruct {
  itemsConfigured: number;
  itemsUsed: string[];
  cellsEmitted: number;
  cellsRejected: number;
  computable: boolean;
  cronbachAlpha: number | null;
  unidimensional: boolean;
}

interface AuditArtifact {
  source: string;
  rules: {
    normalisation: string;
    min_observations: number;
    min_item_coverage: number;
  };
  respondentsScanned: number;
  countryYears: number;
  constructs: Record<string, AuditConstruct>;
}

type ItemCode = string;

interface ResolvedItem {
  reverse: boolean;
  min: number;
  max: number;
}

interface Mismatch {
  field: string;
  expected: string;
  actual: string;
}

/* ------------------------------------------------------------------ */
/*  Source parsing                                                     */
/* ------------------------------------------------------------------ */

/** Minimal RFC-4180-ish parser: handles quoted fields and doubled quotes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** Distinct item codes per construct, in config order, rejects inconsistent reverse-coding. */
function resolveItems(spec: ConstructSpec): Map<ItemCode, ResolvedItem> {
  const out = new Map<ItemCode, ResolvedItem>();
  for (const item of spec.items) {
    const seen = out.get(item.item_code);
    if (seen) {
      if (seen.reverse !== item.reverse) {
        throw new Error(
          `config/wvs_items.yaml declares ${item.item_code} with reverse=${seen.reverse} and reverse=${item.reverse}`,
        );
      }
      continue;
    }
    out.set(item.item_code, { reverse: item.reverse, min: item.scale_min, max: item.scale_max });
  }
  return out;
}

/** Cronbach's alpha over the aligned per-item cell means. */
function cronbachAlpha(columns: number[][]): number | null {
  if (columns.length < 2) return null;
  const n = columns[0].length;
  if (n < 2) return null;

  const totals = Array.from({ length: n }, (_, j) => columns.reduce((s, c) => s + c[j], 0));
  const meanTotal = totals.reduce((s, v) => s + v, 0) / n;
  const varTotal = totals.reduce((s, v) => s + (v - meanTotal) ** 2, 0) / (n - 1);
  if (varTotal === 0) return null;

  let sumItemVar = 0;
  for (const col of columns) {
    const m = col.reduce((s, v) => s + v, 0) / n;
    sumItemVar += col.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1);
  }
  const k = columns.length;
  return (k / (k - 1)) * (1 - sumItemVar / varTotal);
}

/* ------------------------------------------------------------------ */
/*  Recomputation                                                      */
/* ------------------------------------------------------------------ */

function recompute(sourcePath: string, cfg: AuditConfig): AuditArtifact {
  const isTrend = sourcePath === TREND_SOURCE;
  const isoMap: Record<string, string> = fs.existsSync(ISO_NUMERIC_MAP)
    ? (JSON.parse(fs.readFileSync(ISO_NUMERIC_MAP, 'utf-8')) as Record<string, string>)
    : {};

  const lines = fs.readFileSync(sourcePath, 'utf-8').split(/\r?\n/);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = new Map<string, number>();
  header.forEach((h, i) => idx.set(h, i));

  const countryIdx = isTrend ? idx.get('S003') : (idx.get('cntry_AN') ?? idx.get('cntry'));
  const yearIdx = isTrend ? idx.get('S020') : idx.get('year');
  if (countryIdx === undefined || yearIdx === undefined) {
    throw new Error(
      `${path.basename(sourcePath)} is missing ${isTrend ? 'S003/S020' : 'cntry_AN|year'}`,
    );
  }

  const toCountry = (raw: string): string => {
    if (!isTrend) return raw.trim();
    const numeric = String(Math.trunc(Number.parseFloat(raw)));
    return isoMap[numeric] ?? '';
  };

  const resolved = new Map<string, Map<ItemCode, ResolvedItem>>();
  for (const [name, spec] of Object.entries(cfg.constructs)) {
    resolved.set(name, resolveItems(spec));
  }

  const missingCodes = new Set(cfg.defaults.missing_codes);
  const minObs = cfg.defaults.min_observations;
  const minCoverage = cfg.defaults.min_item_coverage;

  // cell -> item -> { sum, count }
  const cells = new Map<string, Map<ItemCode, { sum: number; count: number }>>();
  let respondents = 0;

  for (let li = 1; li < lines.length; li += 1) {
    const line = lines[li];
    if (!line || line.length < 5) continue;
    const fields = parseCsvLine(line);
    const country = toCountry(fields[countryIdx] ?? '');
    const year = (fields[yearIdx] ?? '').trim();
    if (!country || !year) continue;
    respondents += 1;

    const key = `${country}|${year}`;
    let cell = cells.get(key);
    if (!cell) { cell = new Map(); cells.set(key, cell); }

    for (const items of resolved.values()) {
      for (const code of items.keys()) {
        const col = idx.get(code);
        if (col === undefined) continue;
        const raw = fields[col];
        if (raw === undefined || raw === '') continue;
        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value) || missingCodes.has(value)) continue;
        const acc = cell.get(code) ?? { sum: 0, count: 0 };
        acc.sum += value;
        acc.count += 1;
        cell.set(code, acc);
      }
    }
  }

  // Build per-cell item means once, then derive every construct from them.
  const perCell = new Map<string, Map<ItemCode, number>>();
  for (const [key, items] of cells) {
    const means = new Map<ItemCode, number>();
    for (const [code, acc] of items) {
      if (acc.count < minObs) continue;
      means.set(code, acc.sum / acc.count);
    }
    perCell.set(key, means);
  }

  const constructs: Record<string, AuditConstruct> = {};
  for (const [name, items] of resolved) {
    let emitted = 0;
    let rejected = 0;
    const usedItems = new Set<ItemCode>();
    const alignedRows: Array<Map<ItemCode, number>> = [];

    for (const [, means] of perCell) {
      const present: ItemCode[] = [];
      for (const code of items.keys()) {
        if (means.has(code)) present.push(code);
      }
      const need = Math.ceil(minCoverage * items.size);
      if (present.length === 0 || present.length < need) {
        rejected += 1;
        continue;
      }
      emitted += 1;
      for (const code of present) usedItems.add(code);
      if (present.length === items.size) alignedRows.push(means);
    }

    // Alpha is computed on rows where every usable item is present, matching
    // the producer's alignment rule; values are min-max scaled to [0,1] first.
    const usable = [...items.keys()].filter((code) => usedItems.has(code));
    const columns: number[][] = [];
    for (const code of usable) {
      const spec = items.get(code)!;
      const range = spec.max - spec.min || 1;
      const column: number[] = [];
      for (const means of alignedRows) {
        const mean = means.get(code);
        if (mean === undefined) { column.length = 0; break; }
        const oriented = spec.reverse ? spec.min + spec.max - mean : mean;
        column.push((oriented - spec.min) / range);
      }
      if (column.length > 0) columns.push(column);
    }
    const alpha = usable.length >= 2 ? cronbachAlpha(columns) : null;

    constructs[name] = {
      itemsConfigured: items.size,
      itemsUsed: usable,
      cellsEmitted: emitted,
      cellsRejected: rejected,
      computable: emitted > 0,
      cronbachAlpha: alpha,
      unidimensional: alpha !== null && alpha >= 0.7,
    };
  }

  return {
    source: path.relative(ROOT, sourcePath),
    rules: {
      normalisation: cfg.defaults.normalisation,
      min_observations: minObs,
      min_item_coverage: minCoverage,
    },
    respondentsScanned: respondents,
    countryYears: cells.size,
    constructs,
  };
}

/* ------------------------------------------------------------------ */
/*  Comparison                                                         */
/* ------------------------------------------------------------------ */

function compare(actual: AuditArtifact, expected: AuditArtifact & Record<string, unknown>): Mismatch[] {
  const out: Mismatch[] = [];
  const push = (field: string, a: unknown, e: unknown) => {
    out.push({ field, expected: String(e), actual: String(a) });
  };

  if (expected.respondentsScanned !== actual.respondentsScanned) {
    push('respondentsScanned', actual.respondentsScanned, expected.respondentsScanned);
  }
  if (expected.countryYears !== actual.countryYears) {
    push('countryYears', actual.countryYears, expected.countryYears);
  }

  for (const [name, recomputed] of Object.entries(actual.constructs)) {
    const recorded = expected.constructs[name];
    if (!recorded) {
      push(`${name}`, 'present in data', 'absent from artifact');
      continue;
    }
    if (recorded.itemsConfigured !== recomputed.itemsConfigured) {
      push(`${name}.itemsConfigured`, recomputed.itemsConfigured, recorded.itemsConfigured);
    }
    if (recorded.cellsEmitted !== recomputed.cellsEmitted) {
      push(`${name}.cellsEmitted`, recomputed.cellsEmitted, recorded.cellsEmitted);
    }
    if (recorded.cellsRejected !== recomputed.cellsRejected) {
      push(`${name}.cellsRejected`, recomputed.cellsRejected, recorded.cellsRejected);
    }
    if (recorded.computable !== recomputed.computable) {
      push(`${name}.computable`, recomputed.computable, recorded.computable);
    }
    const a = recomputed.cronbachAlpha;
    const e = recorded.cronbachAlpha;
    if (a === null || e === null || e === undefined) {
      if (a !== e) push(`${name}.cronbachAlpha`, a, e);
    } else if (Math.abs(a - e) > ALPHA_TOLERANCE) {
      push(`${name}.cronbachAlpha`, a.toFixed(8), Number(e).toFixed(8));
    }
    if (recorded.unidimensional !== recomputed.unidimensional) {
      push(`${name}.unidimensional`, recomputed.unidimensional, recorded.unidimensional);
    }
    const recordedItems = [...(recorded.itemsUsed ?? [])].sort().join(',');
    const actualItems = [...recomputed.itemsUsed].sort().join(',');
    if (recordedItems !== actualItems) {
      push(`${name}.itemsUsed`, actualItems, recordedItems);
    }
  }

  for (const name of Object.keys(expected.constructs)) {
    if (!(name in actual.constructs)) push(name, 'absent from data', 'present in artifact');
  }

  return out;
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */

function pickSource(argv: string[]): string | null {
  const flag = argv.indexOf('--source');
  if (flag !== -1 && argv[flag + 1]) return path.resolve(ROOT, argv[flag + 1]);
  if (fs.existsSync(TREND_SOURCE)) return TREND_SOURCE;
  if (fs.existsSync(JOINT_SOURCE)) return JOINT_SOURCE;
  return null;
}

/** Override the artifact path, used by the self-test to point at a fixture. */
function pickAuditPath(argv: string[]): string {
  const flag = argv.indexOf('--audit');
  if (flag !== -1 && argv[flag + 1]) return path.resolve(ROOT, argv[flag + 1]);
  return AUDIT_PATH;
}

function main(): void {
  const t0 = Date.now();
  const auditPath = pickAuditPath(process.argv.slice(2));
  console.log('\nWVS construct verification');
  console.log('='.repeat(64));

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`  FATAL: config missing at ${path.relative(ROOT, CONFIG_PATH)}`);
    process.exitCode = 1;
    return;
  }
  const cfg = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) as AuditConfig;

  const source = pickSource(process.argv.slice(2));
  if (!source) {
    console.log('  SKIP: no item-level WVS source in rawdata/.');
    console.log('        The microdata is licence-restricted and is never committed.');
    console.log('        Download it per REPLICATION_RUNBOOK.md § 9.1, then re-run.');
    console.log('        Expected files: rawdata/wvs_trend_all_items.csv (preferred)');
    console.log('                     or rawdata/EVS_WVS_Joint_Csv_v5_0.csv');
    console.log('\n  Nothing was verified and nothing failed.\n');
    return;
  }
  console.log(`  source  : ${path.relative(ROOT, source)}`);
  console.log(`  config  : ${path.relative(ROOT, CONFIG_PATH)}`);
  console.log(`  artifact: ${path.relative(ROOT, auditPath)}`);

  if (!fs.existsSync(auditPath)) {
    console.error('  FATAL: the audit artifact is absent, so there is nothing to verify.');
    console.error('         Run `npm run build:wvs-constructs` to generate it.');
    process.exitCode = 2;
    return;
  }
  const expected = JSON.parse(fs.readFileSync(auditPath, 'utf-8')) as AuditArtifact;

  if (expected.rules?.min_observations !== cfg.defaults.min_observations
    || expected.rules?.min_item_coverage !== cfg.defaults.min_item_coverage) {
    console.error('  FATAL: the artifact was produced under different rules than the config declares.');
    console.error(`         artifact: min_observations=${expected.rules?.min_observations}, `
      + `min_item_coverage=${expected.rules?.min_item_coverage}`);
    console.error(`         config  : min_observations=${cfg.defaults.min_observations}, `
      + `min_item_coverage=${cfg.defaults.min_item_coverage}`);
    process.exitCode = 1;
    return;
  }

  console.log('\n  recomputing construct coverage from item-level data...');
  const actual = recompute(source, cfg);

  console.log('\n  construct                 cells  alpha(recorded)  alpha(recomputed)  verdict');
  console.log('  ' + '-'.repeat(74));
  for (const [name, r] of Object.entries(actual.constructs)) {
    const rec = expected.constructs[name];
    const recorded = rec?.cronbachAlpha ?? null;
    const fmt = (v: number | null) => (v === null ? '     n/a' : v.toFixed(4).padStart(8));
    const matches = rec
      && rec.cellsEmitted === r.cellsEmitted
      && (recorded === null || r.cronbachAlpha === null
        ? recorded === r.cronbachAlpha
        : Math.abs((recorded as number) - (r.cronbachAlpha as number)) <= ALPHA_TOLERANCE);
    console.log(
      `  ${name.padEnd(24)} ${String(r.cellsEmitted).padStart(5)}  ${fmt(recorded)}        `
      + `${fmt(r.cronbachAlpha)}          ${matches ? 'match' : 'MISMATCH'}`,
    );
  }

  const mismatches = compare(actual, expected);
  console.log(`\n  respondents scanned: recorded ${expected.respondentsScanned.toLocaleString()}, `
    + `recomputed ${actual.respondentsScanned.toLocaleString()}`);
  console.log(`  country-years      : recorded ${expected.countryYears}, recomputed ${actual.countryYears}`);

  if (mismatches.length > 0) {
    console.error(`\n  FAILED: ${mismatches.length} field(s) differ from the artifact.`);
    for (const m of mismatches) {
      console.error(`    ${m.field}\n      artifact  : ${m.expected}\n      recomputed: ${m.actual}`);
    }
    console.error('\n  The artifact does not describe the data. Either the source changed or the');
    console.error('  producer is wrong. Do not submit until this is explained.\n');
    process.exitCode = 1;
    return;
  }

  console.log(`\n  PASS: the audit artifact matches an independent recomputation`
    + ` (${((Date.now() - t0) / 1000).toFixed(1)}s).`);
  console.log('  Every construct\'s cell count, usable items, alpha and unidimensionality flag agree.\n');
}

main();
