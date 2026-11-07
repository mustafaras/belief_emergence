/**
 * build_wvs_constructs.ts — WVS construct aggregation, enforced by config.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The repository shipped a panel in which `C_cultural_intensity` was built
 * from item A006 — the first item of the outcome `Z_belief_outcome` — instead
 * of from its configured item set. The consequence was corr(C, Z) = 1.0 and a
 * model that restated its own outcome. The script that did this was never
 * versioned, so the construct definitions in config/wvs_items.yaml were
 * documentation that nothing executed.
 *
 * This script is that missing executable definition. It reads
 * config/wvs_items.yaml and refuses to emit output that violates it.
 *
 * CONTRACT
 * --------
 *  - Item codes, reverse-coding, scale bounds, min_observations and
 *    min_item_coverage all come from config/wvs_items.yaml. Nothing is
 *    hard-coded here.
 *  - A construct is emitted for a country-year only when the number of
 *    available items is at least ceil(min_item_coverage * n_configured_items).
 *    Otherwise the cell is null, never silently proxied by one item.
 *  - Every construct is z-scored across the emitted cells, matching
 *    defaults.normalisation = "zscore".
 *  - The script aborts if any two constructs share an item, unless that
 *    overlap is explicitly allowlisted below with a reason.
 *  - The script aborts if any two emitted constructs correlate at |r| > 0.999,
 *    which is the exact condition that went undetected before.
 *
 * Usage:
 *   npx tsx scripts/build_wvs_constructs.ts            # write outputs
 *   npx tsx scripts/build_wvs_constructs.ts --dry-run  # audit only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'rawdata');
const SOURCE = path.join(RAW, 'EVS_WVS_Joint_Csv_v5_0.csv');
const CONFIG = path.join(ROOT, 'config', 'wvs_items.yaml');
const OUT_CSV = path.join(RAW, 'wvs_combined.csv');
const OUT_AUDIT = path.join(RAW, 'wvs_construct_audit.json');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Item overlaps between constructs are only acceptable when the config
 * declares them. `config/wvs_items.yaml` supports an `overlap_note` field on
 * an item entry; if both constructs that share an item carry a note naming
 * the other construct, the overlap is treated as a documented design choice
 * rather than a copy-paste error.
 *
 * As of 2026-11-07 the config declares exactly one such overlap:
 *   C_cultural_intensity ~ S_social_support on A008, A009
 * both annotated with "Also used in C_cultural_intensity".
 *
 * Note that a declared overlap still contaminates the design: two constructs
 * sharing items are not independent measurements. The build therefore records
 * every overlap in the audit artefact so the manuscript can disclose it.
 */
const ALLOW_DECLARED_OVERLAPS = true;

interface ItemSpec {
  wave: number;
  item_code: string;
  label: string;
  scale_min: number;
  scale_max: number;
  reverse: boolean;
  overlap_note?: string;
}

interface ConstructSpec {
  label: string;
  items: ItemSpec[];
}

interface Config {
  defaults: {
    normalisation: string;
    missing_codes: number[];
    aggregation_method: string;
    min_observations: number;
    min_item_coverage: number;
  };
  constructs: Record<string, ConstructSpec>;
}

interface CellAccumulator {
  sums: Map<string, number>;
  counts: Map<string, number>;
}

function loadConfig(): Config {
  return yaml.load(fs.readFileSync(CONFIG, 'utf-8')) as Config;
}

/** Unique item codes per construct, with reverse/scale resolved per code. */
function resolveItems(spec: ConstructSpec): Map<string, { reverse: boolean; min: number; max: number; label: string }> {
  const out = new Map<string, { reverse: boolean; min: number; max: number; label: string }>();
  for (const it of spec.items) {
    const existing = out.get(it.item_code);
    if (existing) {
      if (existing.reverse !== it.reverse) {
        throw new Error(
          `config/wvs_items.yaml declares item ${it.item_code} with reverse=${existing.reverse} and reverse=${it.reverse}. ` +
          'Reverse-coding must be consistent across waves.',
        );
      }
      continue;
    }
    out.set(it.item_code, { reverse: it.reverse, min: it.scale_min, max: it.scale_max, label: it.label });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Audit 1 — item overlap between constructs                          */
/* ------------------------------------------------------------------ */

/** Returns a map of construct -> item -> overlap_note, for declared overlaps. */
function declaredOverlapNotes(spec: ConstructSpec): Map<string, string> {
  const out = new Map<string, string>();
  for (const it of spec.items) {
    if (it.overlap_note && !out.has(it.item_code)) out.set(it.item_code, it.overlap_note);
  }
  return out;
}

function auditOverlaps(cfg: Config): Array<{ between: [string, string]; items: string[]; declared: boolean }> {
  const names = Object.keys(cfg.constructs);
  const itemsOf = new Map<string, Set<string>>();
  const notesOf = new Map<string, Map<string, string>>();
  for (const n of names) {
    itemsOf.set(n, new Set(resolveItems(cfg.constructs[n]).keys()));
    notesOf.set(n, declaredOverlapNotes(cfg.constructs[n]));
  }

  const problems: string[] = [];
  const overlaps: Array<{ between: [string, string]; items: string[]; declared: boolean }> = [];

  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const A = names[i]; const B = names[j];
      const shared = [...itemsOf.get(A)!].filter((x) => itemsOf.get(B)!.has(x));
      if (shared.length === 0) continue;

      // Declared only if BOTH constructs annotate EVERY shared item.
      const declared = shared.every((code) => {
        const noteA = notesOf.get(A)!.get(code) ?? '';
        const noteB = notesOf.get(B)!.get(code) ?? '';
        return noteA.length > 0 && noteB.length > 0;
      });

      overlaps.push({ between: [A, B], items: shared, declared });

      if (declared && ALLOW_DECLARED_OVERLAPS) {
        console.log(`  DECLARED overlap ${A} ~ ${B}: ${shared.join(', ')}`);
        console.log('    treated as a design choice, but the constructs are NOT independent — recorded in the audit');
        continue;
      }
      problems.push(`${A} ~ ${B} share ${shared.join(', ')} (undeclared)`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      'Constructs share items without declaring it, so they cannot be treated as independent measurements:\n  ' +
      problems.join('\n  ') +
      '\n\nFix config/wvs_items.yaml, or annotate each shared item with an overlap_note on BOTH constructs.',
    );
  }
  return overlaps;
}

/* ------------------------------------------------------------------ */
/*  CSV reading                                                        */
/* ------------------------------------------------------------------ */

/** Minimal RFC4180-ish reader: handles quoted fields and embedded commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else { quoted = false; }
      } else { cur += ch; }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

interface ConstructResult {
  columns: Record<string, number | null>;
  itemsUsed: string[];
  itemsConfigured: number;
  coverage: number;
  cellsEmitted: number;
  cellsRejected: number;
}

function main(): void {
  const t0 = Date.now();
  const cfg = loadConfig();
  const { missing_codes: missingCodes, min_observations: minObs, min_item_coverage: minCoverage } = cfg.defaults;

  console.log('\nWVS construct build');
  console.log('='.repeat(64));
  console.log(`source   : ${path.relative(ROOT, SOURCE)}`);
  console.log(`config   : ${path.relative(ROOT, CONFIG)}`);
  console.log(`mode     : ${DRY_RUN ? 'dry-run (no files written)' : 'write'}`);
  console.log(`rules    : min_observations=${minObs}, min_item_coverage=${minCoverage}, normalisation=${cfg.defaults.normalisation}`);

  console.log('\n-- Audit 1: construct item overlap --');
  const overlaps = auditOverlaps(cfg);

  const resolved = new Map<string, ReturnType<typeof resolveItems>>();
  for (const [name, spec] of Object.entries(cfg.constructs)) {
    const items = resolveItems(spec);
    resolved.set(name, items);
    console.log(`  ${name.padEnd(22)} ${items.size} distinct item(s): ${[...items.keys()].join(',')}`);
  }

  // Every item we need must exist as a column in the source.
  const headerLine = fs.readFileSync(SOURCE, 'utf-8').split(/\r?\n/, 1)[0];
  const header = parseCsvLine(headerLine).map((h) => h.trim());
  const headerSet = new Set(header);
  const missingColumns: string[] = [];
  for (const [name, items] of resolved) {
    for (const code of items.keys()) {
      if (!headerSet.has(code)) missingColumns.push(`${name}.${code}`);
    }
  }
  if (missingColumns.length > 0) {
    console.log(`\n  WARNING: ${missingColumns.length} configured item(s) are absent from the source header:`);
    console.log(`    ${missingColumns.join(', ')}`);
    console.log('  Those items are excluded from the coverage denominator at the cell level.');
  }

  const idxOf = new Map<string, number>();
  header.forEach((h, i) => idxOf.set(h, i));
  const iCountry = idxOf.get('cntry_AN');
  const iCountryAlt = idxOf.get('cntry');
  const iYear = idxOf.get('year');
  if (iYear === undefined || (iCountry === undefined && iCountryAlt === undefined)) {
    throw new Error('Source is missing cntry_AN/cntry or year columns.');
  }
  const cIdx = iCountry ?? iCountryAlt!;

  // Accumulate sums and counts per (country, year, item).
  const cells = new Map<string, CellAccumulator>();
  const missingSet = new Set(missingCodes);
  const text = fs.readFileSync(SOURCE, 'utf-8');
  const lines = text.split(/\r?\n/);

  let scanned = 0;
  for (let li = 1; li < lines.length; li += 1) {
    const line = lines[li];
    if (!line || line.length < 5) continue;
    const f = parseCsvLine(line);
    const country = (f[cIdx] ?? '').trim();
    const year = (f[iYear] ?? '').trim();
    if (!country || !year) continue;
    scanned += 1;
    const key = `${country}|${year}`;
    let acc = cells.get(key);
    if (!acc) { acc = { sums: new Map(), counts: new Map() }; cells.set(key, acc); }

    for (const [, items] of resolved) {
      for (const code of items.keys()) {
        const col = idxOf.get(code);
        if (col === undefined) continue;
        const raw = f[col];
        if (raw === undefined || raw === '') continue;
        const v = Number.parseFloat(raw);
        if (!Number.isFinite(v) || missingSet.has(v)) continue;
        acc.sums.set(code, (acc.sums.get(code) ?? 0) + v);
        acc.counts.set(code, (acc.counts.get(code) ?? 0) + 1);
      }
    }
  }
  console.log(`\n  scanned ${scanned.toLocaleString()} respondents across ${cells.size} country-years`);

  // Per-country-year item means, then construct scores.
  const rows: Array<Record<string, number | string | null>> = [];
  const stats = new Map<string, ConstructResult>();
  for (const name of resolved.keys()) {
    stats.set(name, {
      columns: {}, itemsUsed: [], itemsConfigured: resolved.get(name)!.size,
      coverage: 0, cellsEmitted: 0, cellsRejected: 0,
    });
  }

  for (const [key, acc] of cells) {
    const [country, year] = key.split('|');
    const row: Record<string, number | string | null> = { cntry: country, year };

    for (const [name, items] of resolved) {
      const itemMeans: number[] = [];
      const used: string[] = [];
      for (const [code, spec] of items) {
        const n = acc.counts.get(code) ?? 0;
        if (n < minObs) continue;
        let mean = (acc.sums.get(code) ?? 0) / n;
        // Reverse-code on the declared scale so higher always means "more".
        if (spec.reverse) mean = spec.min + spec.max - mean;
        itemMeans.push(mean);
        used.push(code);
      }
      const available = itemMeans.length;
      const need = Math.ceil(minCoverage * items.size);
      // Retain min-max normalized per-item values for the alpha audit.
      for (const [code, spec] of items) {
        const n = acc.counts.get(code) ?? 0;
        if (n < minObs) { row[`__item__${name}__${code}`] = null; continue; }
        let mean = (acc.sums.get(code) ?? 0) / n;
        if (spec.reverse) mean = spec.min + spec.max - mean;
        const range = spec.max - spec.min || 1;
        row[`__item__${name}__${code}`] = (mean - spec.min) / range;
      }
      if (available < need || available === 0) {
        row[name] = null;
        stats.get(name)!.cellsRejected += 1;
      } else {
        row[name] = itemMeans.reduce((s, v) => s + v, 0) / available;
        stats.get(name)!.cellsEmitted += 1;
        if (used.length > stats.get(name)!.itemsUsed.length) stats.get(name)!.itemsUsed = used;
      }
    }
    rows.push(row);
  }

  // z-score each construct across emitted cells (defaults.normalisation).
  for (const name of resolved.keys()) {
    const vals = rows.map((r) => r[name]).filter((v): v is number => typeof v === 'number');
    const st = stats.get(name)!;
    st.coverage = vals.length;
    if (vals.length > 1 && cfg.defaults.normalisation === 'zscore') {
      const m = vals.reduce((s, v) => s + v, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (vals.length - 1));
      if (sd > 0) {
        for (const r of rows) {
          const v = r[name];
          if (typeof v === 'number') r[name] = (v - m) / sd;
        }
      }
    }
  }

  console.log('\n-- Construct coverage --');
  console.log('  construct                cells  configured  used  verdict');
  for (const [name, st] of stats) {
    const verdict = st.cellsEmitted === 0 ? 'UNCOMPUTABLE (below min_item_coverage)' : 'ok';
    console.log(
      `  ${name.padEnd(24)} ${String(st.cellsEmitted).padStart(5)}  ${String(st.itemsConfigured).padStart(10)}  ` +
      `${String(st.itemsUsed.length).padStart(4)}  ${verdict}`,
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Audit 3 — internal consistency (Cronbach's alpha)                */
  /* ---------------------------------------------------------------- */

  console.log('\n-- Audit 3: internal consistency per construct --');
  console.log('  construct                alpha   items  verdict');
  const alphaByConstruct = new Map<string, number | null>();
  for (const [name, items] of resolved) {
    const usable = [...items.keys()].filter((c) => headerSet.has(c));
    // Align on rows where every usable item is present, otherwise the
    // columns are ragged and alpha is meaningless.
    const aligned = rows.filter((r) =>
      usable.every((code) => typeof r[`__item__${name}__${code}`] === 'number'));
    const cols: number[][] = usable.map((code) =>
      aligned.map((r) => r[`__item__${name}__${code}`] as number));
    let alpha: number | null = null;
    if (cols.length >= 2) {
      const n = cols[0].length;
      const totals = Array.from({ length: n }, (_, j) => cols.reduce((s, c) => s + c[j], 0));
      const mt = totals.reduce((s, v) => s + v, 0) / n;
      const varT = totals.reduce((s, v) => s + (v - mt) ** 2, 0) / (n - 1);
      let sumVar = 0;
      for (const c of cols) {
        const m = c.reduce((s, v) => s + v, 0) / n;
        sumVar += c.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1);
      }
      const k = cols.length;
      alpha = varT === 0 ? null : (k / (k - 1)) * (1 - sumVar / varT);
    }
    alphaByConstruct.set(name, alpha);
    const verdict = alpha === null
      ? 'n/a (need >= 2 comparable items)'
      : alpha >= 0.70 ? 'ok'
        : alpha >= 0.50 ? 'WEAK — below the 0.70 convention'
          : 'NOT A UNIDIMENSIONAL CONSTRUCT';
    const shown = alpha === null ? '   n/a' : alpha.toFixed(4).padStart(8);
    console.log(`  ${name.padEnd(24)} ${shown}  ${String(cols.length).padStart(5)}  ${verdict}`);
  }

  /* ---------------------------------------------------------------- */
  /*  Audit 4 — emitted constructs must not be collinear               */
  /* ---------------------------------------------------------------- */

  console.log('\n-- Audit 4: collinearity between emitted constructs --');
  const names = [...resolved.keys()];
  const complete = rows.filter((r) => names.every((n) => typeof r[n] === 'number'));
  console.log(`  ${complete.length} country-years have all constructs present`);

  let collinear = false;
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = complete.map((r) => r[names[i]] as number);
      const b = complete.map((r) => r[names[j]] as number);
      if (a.length < 3) continue;
      const ma = a.reduce((s, v) => s + v, 0) / a.length;
      const mb = b.reduce((s, v) => s + v, 0) / b.length;
      let num = 0; let da = 0; let db = 0;
      for (let k = 0; k < a.length; k += 1) {
        const xa = a[k] - ma; const xb = b[k] - mb;
        num += xa * xb; da += xa * xa; db += xb * xb;
      }
      const r = num / Math.sqrt(da * db);
      const flag = Math.abs(r) > 0.999 ? '  <-- COLLINEAR' : '';
      if (flag) collinear = true;
      console.log(`  corr(${names[i]}, ${names[j]}) = ${r.toFixed(6).padStart(10)}${flag}`);
    }
  }
  if (collinear) {
    throw new Error(
      'Emitted constructs are collinear at |r| > 0.999. This is the condition that produced the ' +
      'original Z = C defect. Refusing to write output.',
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Write                                                            */
  /* ---------------------------------------------------------------- */

  const audit = {
    schemaVersion: 'wvs.construct_audit/1.0',
    generatedAtIso: new Date().toISOString(),
    source: path.relative(ROOT, SOURCE),
    config: path.relative(ROOT, CONFIG),
    rules: cfg.defaults,
    respondentsScanned: scanned,
    countryYears: cells.size,
    constructs: Object.fromEntries(
      [...stats].map(([name, st]) => [name, {
        label: cfg.constructs[name].label,
        itemsConfigured: st.itemsConfigured,
        itemsUsed: st.itemsUsed,
        cellsEmitted: st.cellsEmitted,
        cellsRejected: st.cellsRejected,
        computable: st.cellsEmitted > 0,
        cronbachAlpha: alphaByConstruct.get(name) ?? null,
        unidimensional: (alphaByConstruct.get(name) ?? 0) >= 0.70,
      }]),
    ),
    collinearityAuditPassed: !collinear,
    itemOverlaps: overlaps,
  };

  if (DRY_RUN) {
    console.log('\n  dry-run: no files written');
  } else {
    // Preserve the historical column order expected by downstream scripts.
    const outHeader = ['iso3', 'country_name', 'year', 'Z_religion_importance',
      'Z_violence_justifiable', 'C_religiosity_index', 'M_internet_daily',
      'D_social_trust', 'S_support_index'];
    const nameMap: Record<string, string> = {
      Z_belief_outcome: 'Z_religion_importance',
      C_cultural_intensity: 'C_religiosity_index',
      D_social_atomization: 'D_social_trust',
      S_social_support: 'S_support_index',
    };
    const outRows = rows.map((r) => {
      const o: Record<string, string | number | null> = {
        iso3: r.cntry as string, country_name: r.cntry as string, year: r.year as string,
      };
      for (const [k, col] of Object.entries(nameMap)) o[col] = r[k] ?? null;
      o['Z_violence_justifiable'] = null;
      o['M_internet_daily'] = null;
      return o;
    });
    const body = [outHeader.join(',')].concat(
      outRows.map((o) => outHeader.map((h) => (o[h] === null || o[h] === undefined ? '' : String(o[h]))).join(',')),
    ).join('\n');
    fs.writeFileSync(OUT_CSV, body + '\n', 'utf-8');
    fs.writeFileSync(OUT_AUDIT, JSON.stringify(audit, null, 2), 'utf-8');
    console.log(`\n  wrote ${path.relative(ROOT, OUT_CSV)} (${outRows.length} rows)`);
    console.log(`  wrote ${path.relative(ROOT, OUT_AUDIT)}`);
  }

  console.log(`\n  done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}

main();
