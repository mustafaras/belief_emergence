/**
 * build_canonical_panel.ts — rebuild the canonical estimation panel from
 * verified constructs plus macro covariates.
 *
 * WHY THIS REPLACES THE OLD PANEL
 * -------------------------------
 * The shipped panel carried a fatal defect: `C_cultural_intensity` was an
 * exact rescaling of the outcome `Z_belief_outcome` (corr = 1.0), because the
 * WVS ingestion built C from item A006 — the first item of Z. A rebuild of
 * the constructs (scripts/build_wvs_constructs.ts) showed that the three
 * contextual constructs cannot be salvaged:
 *
 *   Z_belief_outcome      alpha = +0.81   usable
 *   C_cultural_intensity  alpha = +0.33   not one dimension
 *   D_social_atomization  alpha = -0.42   items disagree
 *   S_social_support      computable for 0 cells (3 of 7 items available)
 *
 * So this panel keeps only what the data supports:
 *
 *   outcome    Z  (six-item WVS composite, alpha 0.81)
 *   drivers    X (urbanization), Y (disposable-income inequality)
 *   channels   T (trauma), E (education), R (welfare capacity),
 *              M (media environment)
 *   dropped    C, D, S — see docs/KNOWN_ISSUES.md KI-09..KI-11
 *
 * Dropped columns are still emitted, filled with `NA`, so downstream code can
 * report them as structurally unavailable instead of silently absent.
 *
 * Usage:
 *   npx tsx scripts/build_canonical_panel.ts            # write
 *   npx tsx scripts/build_canonical_panel.ts --dry-run  # audit only
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WVS_CONSTRUCTS = path.join(ROOT, 'rawdata', 'wvs_combined.csv');
const MACRO = path.join(ROOT, 'rawdata', 'panel_model_data.csv');
const OUT = path.join(ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const OUT_AUDIT = path.join(ROOT, 'public', 'data', 'panel_canonical_v2.audit.json');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Pinned input fingerprints. The panel is only reproducible if the two inputs
 * are the ones it was built from, and both are gitignored (one is
 * licence-restricted, the other is a 22k-row merge). A silent input swap would
 * produce a different panel with the same name, so the build refuses to run
 * against an unrecognised file instead of emitting one.
 *
 * SHA-256 values are recorded in REPLICATION_RUNBOOK.md section 9.1 alongside
 * the download instructions. Regenerate them deliberately, never automatically.
 */
const EXPECTED_INPUTS: Array<{ label: string; path: string; sha256: string }> = [
  {
    label: 'WVS construct table (derived by build_wvs_constructs.ts)',
    path: WVS_CONSTRUCTS,
    sha256: '12E6B66AE3D1D6C459AA67379B2DDB8728169667F3035952408BC00298EBF1A1',
  },
  {
    label: 'Upstream macro panel (22,096 rows)',
    path: MACRO,
    sha256: 'D97992B158EA170A0A6C5B4AF7D1412CB01ED09C8F233B6A5A2640D1E1054202',
  },
];

function sha256Of(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

/**
 * Verify every input before reading it. Returns false (and prints why) instead
 * of throwing, so `--dry-run` still reports a diagnosable state.
 */
function verifyInputs(): boolean {
  let ok = true;
  for (const input of EXPECTED_INPUTS) {
    if (!fs.existsSync(input.path)) {
      console.error(`\n  MISSING INPUT: ${path.relative(ROOT, input.path)}`);
      console.error(`    ${input.label}`);
      console.error('    Download it per REPLICATION_RUNBOOK.md section 9.1, then re-run.');
      ok = false;
      continue;
    }
    const actual = sha256Of(input.path);
    if (input.sha256.startsWith('RAW_')) {
      console.log(`  ${path.relative(ROOT, input.path)}: ${actual}`);
      console.log('    (no pinned hash yet — record this value in REPLICATION_RUNBOOK.md section 9.1)');
      continue;
    }
    if (actual !== input.sha256) {
      console.error(`\n  CHECKSUM MISMATCH: ${path.relative(ROOT, input.path)}`);
      console.error(`    expected ${input.sha256}`);
      console.error(`    actual   ${actual}`);
      console.error('    The panel would be built from different inputs than the committed one.');
      ok = false;
    }
  }
  return ok;
}

/** WVS stores ISO-2 country codes; the macro panel uses ISO-3. */
const ISO2_TO_ISO3: Record<string, string> = {
  AD: 'AND', AL: 'ALB', AM: 'ARM', AR: 'ARG', AT: 'AUT', AU: 'AUS', AZ: 'AZE',
  BA: 'BIH', BD: 'BGD', BO: 'BOL', BG: 'BGR', BR: 'BRA', BY: 'BLR', CA: 'CAN',
  CH: 'CHE', CL: 'CHL', CN: 'CHN', CO: 'COL', CY: 'CYP', CZ: 'CZE', DE: 'DEU',
  DK: 'DNK', EC: 'ECU', EE: 'EST', ES: 'ESP', ET: 'ETH', FI: 'FIN', FR: 'FRA',
  GB: 'GBR', GE: 'GEO', GR: 'GRC', GT: 'GTM', HK: 'HKG', HR: 'HRV', HU: 'HUN',
  ID: 'IDN', IN: 'IND', IR: 'IRN', IS: 'ISL', IT: 'ITA', JO: 'JOR', JP: 'JPN',
  KE: 'KEN', KR: 'KOR', KZ: 'KAZ', LB: 'LBN', LT: 'LTU', LV: 'LVA', LY: 'LBY',
  MA: 'MAR', ME: 'MNE', MK: 'MKD', MM: 'MMR', MN: 'MNG', MO: 'MAC', MV: 'MDV',
  MX: 'MEX', MY: 'MYS', NG: 'NGA', NI: 'NIC', NL: 'NLD', NO: 'NOR', NZ: 'NZL',
  PE: 'PER', PH: 'PHL', PK: 'PAK', PL: 'POL', PR: 'PRI', PT: 'PRT', RO: 'ROU',
  RS: 'SRB', RU: 'RUS', SE: 'SWE', SG: 'SGP', SI: 'SVN', SK: 'SVK', TH: 'THA',
  TJ: 'TJK', TN: 'TUN', TR: 'TUR', TW: 'TWN', UA: 'UKR', US: 'USA', UY: 'URY',
  UZ: 'UZB', VE: 'VEN', VN: 'VNM', ZW: 'ZWE', NIR: 'GBR',
};

/** Macro covariates retained in the model. */
const KEPT = [
  { csv: 'X_urbanization', out: 'X' },
  { csv: 'Y_gini', out: 'Y' },
  { csv: 'T_trauma_shock', out: 'T' },
  { csv: 'E_education_capacity', out: 'E' },
  { csv: 'R_welfare_capacity', out: 'R' },
  { csv: 'M_media_environment', out: 'M' },
] as const;

/** Covariates dropped because they cannot support inference in this sample. */
const DROPPED = [
  { out: 'C', reason: 'alpha 0.33 — not a unidimensional construct (KI-09)' },
  { out: 'D', reason: 'alpha -0.42 — items disagree (KI-10)' },
  { out: 'S', reason: '3 of 7 configured items available; below min_item_coverage (KI-11)' },
  // G is not a construct defect: it is simply unavailable for the countries in
  // scope. Redistribution capacity requires disposable-income Gini, which
  // exists only for OECD members; 51 of 96 WVS cells fall outside that set.
  { out: 'G', reason: 'disposable-income Gini unavailable outside the OECD sample' },
];

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
    } else if (ch === '"') { quoted = true; }
    else if (ch === ',') { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

function readCsv(file: string): Array<Record<string, string>> {
  const text = fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

function main(): void {
  const t0 = Date.now();
  console.log('\nCanonical panel build (v2)');
  console.log('='.repeat(64));
  console.log(`constructs : ${path.relative(ROOT, WVS_CONSTRUCTS)}`);
  console.log(`macro      : ${path.relative(ROOT, MACRO)}`);
  console.log(`output     : ${path.relative(ROOT, OUT)}`);
  console.log(`mode       : ${DRY_RUN ? 'dry-run' : 'write'}`);

  if (!verifyInputs()) {
    console.error('\n  Refusing to build: an input is missing or does not match its pinned hash.\n');
    process.exitCode = 1;
    return;
  }

  const constructs = readCsv(WVS_CONSTRUCTS);
  console.log(`\n  WVS construct rows: ${constructs.length}`);

  const macroIndex = new Map<string, Record<string, string>>();
  for (const r of readCsv(MACRO)) {
    const iso = (r.iso3 ?? '').trim();
    const year = (r.year ?? '').trim();
    if (iso && year) macroIndex.set(`${iso}|${year}`, r);
  }
  console.log(`  macro index size : ${macroIndex.size}`);

  const rows: Array<Record<string, string | number>> = [];
  const dropped = { noIso: 0, noMacro: 0, missingCovariate: 0, missingOutcome: 0 };
  const missingByCovariate = new Map<string, number>();

  for (const c of constructs) {
    const raw = (c.iso3 ?? '').trim();
    const year = String(Number.parseFloat(c.year ?? ''));
    // build_wvs_constructs.ts now emits ISO-3 directly; the table is kept for
    // older construct files that still carry ISO-2.
    const iso3 = raw.length === 3 && /^[A-Z]{3}$/.test(raw)
      ? raw
      : ISO2_TO_ISO3[raw];
    if (!iso3) { dropped.noIso += 1; continue; }

    const zRaw = c.Z_religion_importance;
    const z = zRaw ? Number.parseFloat(zRaw) : NaN;
    if (!Number.isFinite(z)) { dropped.missingOutcome += 1; continue; }

    const m = macroIndex.get(`${iso3}|${year}`);
    if (!m) { dropped.noMacro += 1; continue; }

    const values: Record<string, number> = {};
    let complete = true;
    for (const { csv, out } of KEPT) {
      const raw = m[csv];
      const v = raw ? Number.parseFloat(raw) : NaN;
      if (!Number.isFinite(v)) {
        complete = false;
        missingByCovariate.set(out, (missingByCovariate.get(out) ?? 0) + 1);
        break;
      }
      values[out] = v;
    }
    if (!complete) { dropped.missingCovariate += 1; continue; }

    rows.push({
      iso3, country_name: (m.country_name ?? iso3).trim(), year,
      Z: z, ...values,
    });
  }

  console.log('\n-- Attrition --');
  console.log(`  construct rows                              : ${constructs.length}`);
  console.log(`  - unresolvable ISO-2 country code           : ${dropped.noIso}`);
  console.log(`  - missing outcome                           : ${dropped.missingOutcome}`);
  console.log(`  - no macro row for (iso3, year)             : ${dropped.noMacro}`);
  console.log(`  - missing >=1 retained covariate            : ${dropped.missingCovariate}`);
  console.log(`  = complete-case rows                        : ${rows.length}`);
  if (missingByCovariate.size > 0) {
    console.log('  covariate responsible for the first missing value:');
    for (const [k, v] of missingByCovariate) console.log(`    ${k}: ${v}`);
  }

  const nParams = KEPT.length + 1;
  console.log(`\n  observations per parameter : ${(rows.length / nParams).toFixed(1)} (${rows.length} rows / ${nParams} params)`);
  if (rows.length / nParams < 10) {
    console.log('  WARNING: below the conventional 10 obs/param floor — this must be stated as a limitation');
  }

  /* ---------------------------------------------------------------- */
  /*  Audit — no retained predictor may restate the outcome            */
  /* ---------------------------------------------------------------- */

  console.log('\n-- Validity audit --');
  const zs = rows.map((r) => r.Z as number);
  const mz = zs.reduce((s, v) => s + v, 0) / zs.length;
  const sdZ = Math.sqrt(zs.reduce((s, v) => s + (v - mz) ** 2, 0) / (zs.length - 1));
  let failed = false;
  for (const { out } of KEPT) {
    const xs = rows.map((r) => r[out] as number);
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const sdX = Math.sqrt(xs.reduce((s, v) => s + (v - mx) ** 2, 0) / (xs.length - 1));
    let num = 0;
    for (let i = 0; i < xs.length; i += 1) num += (xs[i] - mx) * (zs[i] - mz);
    const r = num / ((xs.length - 1) * sdX * sdZ);
    const flag = Math.abs(r) > 0.999 ? '  <-- TAUTOLOGY' : '';
    if (Math.abs(r) > 0.999) failed = true;
    console.log(`  corr(${out}, Z) = ${r.toFixed(6).padStart(10)}${flag}`);
  }
  if (failed) throw new Error('A retained predictor restates the outcome. Refusing to write.');

  const header = ['iso3', 'country_name', 'year', 'Z', ...KEPT.map((k) => k.out), ...DROPPED.map((d) => d.out)];
  const body = rows.map((r) => header.map((h) => {
    if (h in r) return String(r[h]);
    return 'NA';
  }).join(','));
  const csvText = [header.join(','), ...body].join('\r\n') + '\r\n';

  const audit = {
    schemaVersion: 'canonical.panel.v2',
    generatedAtIso: new Date().toISOString(),
    sources: {
      constructs: path.relative(ROOT, WVS_CONSTRUCTS),
      macro: path.relative(ROOT, MACRO),
    },
    rows: rows.length,
    countries: new Set(rows.map((r) => r.iso3)).size,
    yearRange: [
      Math.min(...rows.map((r) => Number(r.year))),
      Math.max(...rows.map((r) => Number(r.year))),
    ],
    retainedPredictors: KEPT.map((k) => k.out),
    droppedConstructs: DROPPED,
    observationsPerParameter: Number((rows.length / nParams).toFixed(2)),
    attrition: dropped,
    validityAuditPassed: !failed,
  };

  if (DRY_RUN) {
    console.log('\n  dry-run: no files written');
  } else {
    fs.writeFileSync(OUT, csvText, 'utf-8');
    fs.writeFileSync(OUT_AUDIT, JSON.stringify(audit, null, 2), 'utf-8');
    const sha = crypto.createHash('sha256').update(csvText, 'utf8').digest('hex').toUpperCase();
    console.log(`\n  wrote ${path.relative(ROOT, OUT)} (${rows.length} rows)`);
    console.log(`  wrote ${path.relative(ROOT, OUT_AUDIT)}`);
    console.log(`  sha256: ${sha}`);
  }

  console.log(`\n  done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}

main();
