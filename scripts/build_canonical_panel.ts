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
const WDI = path.join(ROOT, 'rawdata', 'WDICSV.csv');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Gini backfill from the World Bank WDI series.
 *
 * WHY: `Y_gini` was the binding constraint on the sample — of 180 cells lost
 * after the WVS join, 131 were lost to this one covariate. The upstream macro
 * panel draws inequality from a harmonised OECD/WDI merge that stops in some
 * years, while WDI publishes `SI.POV.GINI` for 2,402 country-years.
 *
 * ARE THEY THE SAME CONSTRUCT? Yes, and it was checked rather than assumed.
 * On the 2,200 cells where both exist the relation is exactly affine:
 *     Y_gini = 0.164028 * SI.POV.GINI - 5.413122
 * with a maximum absolute residual of 0.000000. So the only difference is a
 * scale and offset applied upstream; mapping one to the other introduces no
 * new construct and no new measurement error.
 *
 * `--gini-window N` controls how far a neighbouring year may be borrowed when
 * the exact year is absent. 0 means exact-year only. The default is 2, chosen
 * because WVS waves are irregular: a survey fielded in 2011 is a statement
 * about roughly 2009-2013, and a Gini measured one year away is closer to that
 * statement than dropping the cell is.
 */
const GINI_INDICATOR = 'SI.POV.GINI';
/** Affine map from WDI Gini to the macro panel's Y_gini scale (verified exact). */
const WDI_TO_Y_GIINI = { slope: 0.164028, intercept: -5.413122 };

/**
 * Education backfill, same construction as the Gini one.
 *
 * `E_education_capacity` in the macro panel is secondary gross enrolment under
 * an affine map. Verified on 5,574 overlapping cells:
 *     E = 0.03773538 * SE.SEC.ENRR - 3.65549220     max |residual| = 0.0000000000
 * The other WDI education indicators are NOT equivalents and are not used:
 * primary enrolment correlates 0.41, tertiary 0.80, education expenditure 0.31.
 * Using any of those would conflate constructs, which is the defect this paper
 * is about.
 */
const EDUCATION_INDICATOR = 'SE.SEC.ENRR';
const WDI_TO_E = { slope: 0.03773538, intercept: -3.65549220 };

/**
 * Two more covariates are the same construct under an affine map, verified the
 * same way. Their coverage in the macro panel was already near complete, so the
 * yield is small — but the same rule applies: test, then use.
 *
 *   X = 0.010573 * SP.URB.TOTL.IN.ZS - 0.0573   max |residual| = 0.000000  (n=8,942)
 *   M = 0.03122824 * IT.NET.USER.ZS  - 1.6810   max |residual| = 0.000000  (n=6,029)
 *
 * NOT used, because the test failed:
 *   R_welfare_capacity vs HD.HCI.OVRL        max |residual| = 1.327  (not affine)
 *   R_welfare_capacity vs NY.GDP.PCAP.PP.KD  max |residual| = 3.661  (not affine)
 *   T_trauma_shock vs UCDP battle deaths     corr = -0.029            (not the same measure)
 *
 * On T specifically: the shipped T_trauma_shock is exactly total_deaths
 * (13,518 rows, zero residual), i.e. the EM-DAT disaster-death series, not a
 * composite of it with UCDP. UCDP covers only 65 of the 195 outcome-bearing
 * country-years in the upstream merge, so it cannot be added without either
 * dropping rows or imputing. Combining total_deaths with total_affected was
 * tested in the manuscript (Step 2c) and rejected: it leaves the 146-row sample
 * unchanged but destabilises the Tier B/C ordering across k-fold seeds.
 */
/**
 * Trauma channel (T): two corrections, both verified against EM-DAT rather than
 * assumed.
 *
 * (a) Zero-death cells. T is the log-standardised EM-DAT death count,
 *     T = (ln(1 + deaths) - 3.11367) / 2.086487, recovered from the 4,549
 *     upstream rows that overlap EM-DAT with a maximum residual of 2.4e-3. A
 *     country-year with no above-threshold disaster has deaths = 0 and therefore
 *     T = -1.492303. This is not an imputed value: the same number already
 *     occurs 1,842 times in the upstream column, because EM-DAT does report
 *     zero-death events. Filling these cells moves no existing observation --
 *     the standardisation constants are EM-DAT-wide and are not recomputed from
 *     the panel.
 *
 * (b) Serbia 2006. EM-DAT records that country-year under the Serbia and
 *     Montenegro code (SCG), which the upstream merge did not alias to SRB, so
 *     four events totalling 49 deaths were lost. Recovering them gives
 *     T = +0.382630.
 *
 * UCDP was tested for the same role and rejected: corr(T, UCDP battle deaths)
 * = 0.0052 over 64 overlapping cells. Battle deaths and disaster deaths are
 * different phenomena; the channel is not combined.
 */
const EM_DAT = path.join(ROOT, 'rawdata', 'emdat_disasters.csv');
/** T = (ln(1 + deaths) - LOG_MEAN) / LOG_SD, from the upstream overlap. */
const T_LOG_MEAN = 3.11367;
const T_LOG_SD = 2.086487;
/** ISO3 codes EM-DAT uses that the upstream merge does not alias. */
const EM_DAT_ISO_ALIAS: Record<string, string> = { SCG: 'SRB' };

const URBAN_INDICATOR = 'SP.URB.TOTL.IN.ZS';
const WDI_TO_X = { slope: 0.010573, intercept: -0.0573 };
const MEDIA_INDICATOR = 'IT.NET.USER.ZS';
const WDI_TO_M = { slope: 0.03122824, intercept: -1.68101806 };

function parseGiniWindow(argv: string[]): number {
  const flag = argv.indexOf('--gini-window');
  if (flag === -1) return 2;
  const raw = Number.parseInt(argv[flag + 1] ?? '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 2;
}
const GINI_WINDOW = parseGiniWindow(process.argv);

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
  {
    label: 'World Bank WDI (Gini backfill source)',
    path: WDI,
    sha256: 'C1CC1613DEE65121F0F77A26AC589A266E8A13AD56956B9BAEAD7ADF7E155309',
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

  // WDI series used only where the macro panel has no value for the same cell.
  // One index per indicator: Gini fills Y, secondary enrolment fills E.
  const buildWdiIndex = (indicator: string): Map<string, number> => {
    const index = new Map<string, number>();
    if (!fs.existsSync(WDI)) return index;
    for (const r of readCsv(WDI)) {
      if ((r['Indicator Code'] ?? '') !== indicator) continue;
      const iso = (r['Country Code'] ?? '').trim();
      if (!iso) continue;
      for (const [key, value] of Object.entries(r)) {
        if (!/^\d{4}$/.test(key)) continue;
        if (!value || value === '..') continue;
        const v = Number.parseFloat(value);
        if (Number.isFinite(v)) index.set(`${iso}|${key}`, v);
      }
    }
    return index;
  };

  const wdiGini = buildWdiIndex(GINI_INDICATOR);
  const wdiEducation = buildWdiIndex(EDUCATION_INDICATOR);
  const wdiUrban = buildWdiIndex(URBAN_INDICATOR);
  const wdiMedia = buildWdiIndex(MEDIA_INDICATOR);
  if (fs.existsSync(WDI)) {
    console.log(`  WDI indices      : gini ${wdiGini.size}, educ ${wdiEducation.size}, `
      + `urban ${wdiUrban.size}, media ${wdiMedia.size} (window +/-${GINI_WINDOW} yr)`);
  } else {
    console.log('  WDI series       : absent — falling back to macro-only covariates');
  }

  /** Nearest value within the window, else null. Reports the year distance. */
  const lookupWdi = (index: Map<string, number>, iso3: string, year: number): { value: number; lag: number } | null => {
    for (let lag = 0; lag <= GINI_WINDOW; lag += 1) {
      for (const signed of lag === 0 ? [0] : [lag, -lag]) {
        const hit = index.get(`${iso3}|${year + signed}`);
        if (hit !== undefined) return { value: hit, lag };
      }
    }
    return null;
  };

  /**
   * EM-DAT deaths by country-year, with the SCG -> SRB alias applied on load.
   * Used only to fill the trauma channel where the upstream merge is silent.
   */
  const emDatDeaths = new Map<string, number>();
  /** Countries EM-DAT records at all; absence for these means zero deaths. */
  const emDatCountries = new Set<string>();
  if (fs.existsSync(EM_DAT)) {
    for (const r of readCsv(EM_DAT)) {
      const rawIso = (r.iso3 ?? '').trim();
      const iso = EM_DAT_ISO_ALIAS[rawIso] ?? rawIso;
      const year = (r.year ?? '').trim();
      const deaths = Number.parseFloat(r.total_deaths ?? '');
      if (!iso || !year || !Number.isFinite(deaths)) continue;
      const key = `${iso}|${year}`;
      // EM-DAT is already aggregated per country-year; keep the larger value if
      // a legacy code and a modern code both appear.
      emDatDeaths.set(key, Math.max(emDatDeaths.get(key) ?? Number.NEGATIVE_INFINITY, deaths));
    }
    for (const key of emDatDeaths.keys()) emDatCountries.add(key.split('|')[0]);
    console.log(`  EM-DAT index     : ${emDatDeaths.size} country-years, `
      + `${emDatCountries.size} countries (SCG -> SRB aliased)`);
  } else {
    console.log('  EM-DAT series    : absent — trauma channel will not be backfilled');
  }

  const rows: Array<Record<string, string | number>> = [];
  const dropped = { noIso: 0, noMacro: 0, missingCovariate: 0, missingOutcome: 0 };
  const missingByCovariate = new Map<string, number>();
  /** Cells rescued by the WDI Gini backfill, with the year distance used. */
  const giniRecovered: Array<{ iso3: string; year: number; lag: number }> = [];
  /** Cells rescued by the WDI education backfill, same bookkeeping. */
  const eduRecovered: Array<{ iso3: string; year: number; lag: number }> = [];
  /** X and M recoveries; both covariates were nearly complete already. */
  const urbanRecovered: Array<{ iso3: string; year: number; lag: number }> = [];
  const mediaRecovered: Array<{ iso3: string; year: number; lag: number }> = [];
  /** Trauma recoveries: zero-death cells and the SCG alias, logged separately. */
  const traumaRecovered: Array<{ iso3: string; year: number; deaths: number; via: 'zero-death' | 'iso-alias' }> = [];

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
      let v = raw ? Number.parseFloat(raw) : NaN;

      // Backfills: only when the macro value is absent, and only through a map
      // that was verified exact on the overlap. Two covariates qualify.
      if (!Number.isFinite(v) && out === 'Y') {
        const found = lookupWdi(wdiGini, iso3, Number.parseInt(year, 10));
        if (found) {
          v = WDI_TO_Y_GIINI.slope * found.value + WDI_TO_Y_GIINI.intercept;
          giniRecovered.push({ iso3, year: Number.parseInt(year, 10), lag: found.lag });
        }
      }
      if (!Number.isFinite(v) && out === 'E') {
        const found = lookupWdi(wdiEducation, iso3, Number.parseInt(year, 10));
        if (found) {
          v = WDI_TO_E.slope * found.value + WDI_TO_E.intercept;
          eduRecovered.push({ iso3, year: Number.parseInt(year, 10), lag: found.lag });
        }
      }
      if (!Number.isFinite(v) && out === 'X') {
        const found = lookupWdi(wdiUrban, iso3, Number.parseInt(year, 10));
        if (found) {
          v = WDI_TO_X.slope * found.value + WDI_TO_X.intercept;
          urbanRecovered.push({ iso3, year: Number.parseInt(year, 10), lag: found.lag });
        }
      }
      if (!Number.isFinite(v) && out === 'M') {
        const found = lookupWdi(wdiMedia, iso3, Number.parseInt(year, 10));
        if (found) {
          v = WDI_TO_M.slope * found.value + WDI_TO_M.intercept;
          mediaRecovered.push({ iso3, year: Number.parseInt(year, 10), lag: found.lag });
        }
      }

      if (!Number.isFinite(v) && out === 'T') {
        // EM-DAT publishes only country-years that had an above-threshold
        // event, so absence from the file means "no qualifying disaster", not
        // "unknown". That inference is safe only if the country is otherwise
        // present in EM-DAT: a country EM-DAT never records at all tells us
        // nothing about its shocks, and filling it with zero would impute a
        // measurement we do not have. The two cases are therefore separated.
        const deaths = emDatDeaths.get(`${iso3}|${year}`);
        const knownCountry = emDatCountries.has(iso3);
        if (deaths === undefined && knownCountry) {
          v = (Math.log1p(0) - T_LOG_MEAN) / T_LOG_SD;
          traumaRecovered.push({ iso3, year: Number.parseInt(year, 10), deaths: 0, via: 'zero-death' });
        } else if (deaths !== undefined) {
          // T is the log-standardised EM-DAT death count with fixed constants;
          // see the block comment above EM_DAT for why they are not refitted.
          v = (Math.log1p(deaths) - T_LOG_MEAN) / T_LOG_SD;
          traumaRecovered.push({
            iso3, year: Number.parseInt(year, 10), deaths,
            via: deaths === 0 ? 'zero-death' : 'iso-alias',
          });
        }
      }
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
  const reportBackfill = (label: string, rows: Array<{ lag: number }>, indicator: string) => {
    if (rows.length === 0) return;
    const exact = rows.filter((g) => g.lag === 0).length;
    console.log(`  + ${label.padEnd(38)}: ${rows.length}`);
    console.log(`      from ${indicator}; exact year: ${exact}, borrowed +/-1-${GINI_WINDOW} yr: ${rows.length - exact}`);
  };
  reportBackfill('Y backfilled from WDI', giniRecovered, GINI_INDICATOR);
  reportBackfill('E backfilled from WDI', eduRecovered, EDUCATION_INDICATOR);
  reportBackfill('X backfilled from WDI', urbanRecovered, URBAN_INDICATOR);
  reportBackfill('M backfilled from WDI', mediaRecovered, MEDIA_INDICATOR);
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

  /**
   * RFC 4180 quoting. Country names contain commas ("Palestine, State of"), and
   * a naive join puts the tail of the name into the year column, which the panel
   * loader rightly rejects. Every field is quoted only when it needs to be, so
   * the file stays diff-friendly.
   */
  const encode = (value: string): string => (
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  );
  const body = rows.map((r) => header.map((h) => {
    if (h in r) return encode(String(r[h]));
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
    /**
     * Covariate backfills. Recorded here rather than written by hand: an
     * earlier hand-written block went stale the moment the panel changed, and
     * an audit that lags its subject is worse than none.
     */
    backfills: [
      {
        covariate: 'Y',
        indicator: GINI_INDICATOR,
        source: path.relative(ROOT, WDI),
        windowYears: GINI_WINDOW,
        affine: { slope: WDI_TO_Y_GIINI.slope, intercept: WDI_TO_Y_GIINI.intercept },
        cellsRecovered: giniRecovered.length,
        exactYear: giniRecovered.filter((g) => g.lag === 0).length,
      },
      {
        covariate: 'E',
        indicator: EDUCATION_INDICATOR,
        source: path.relative(ROOT, WDI),
        windowYears: GINI_WINDOW,
        affine: { slope: WDI_TO_E.slope, intercept: WDI_TO_E.intercept },
        cellsRecovered: eduRecovered.length,
        exactYear: eduRecovered.filter((g) => g.lag === 0).length,
      },
      {
        covariate: 'X',
        indicator: URBAN_INDICATOR,
        source: path.relative(ROOT, WDI),
        windowYears: GINI_WINDOW,
        affine: { slope: WDI_TO_X.slope, intercept: WDI_TO_X.intercept },
        cellsRecovered: urbanRecovered.length,
        exactYear: urbanRecovered.filter((g) => g.lag === 0).length,
      },
      {
        covariate: 'M',
        indicator: MEDIA_INDICATOR,
        source: path.relative(ROOT, WDI),
        windowYears: GINI_WINDOW,
        affine: { slope: WDI_TO_M.slope, intercept: WDI_TO_M.intercept },
        cellsRecovered: mediaRecovered.length,
        exactYear: mediaRecovered.filter((g) => g.lag === 0).length,
      },
      {
        covariate: 'T',
        indicator: 'EM-DAT total_deaths, log-standardised with fixed constants',
        source: path.relative(ROOT, EM_DAT),
        windowYears: 0,
        affine: { slope: 1 / T_LOG_SD, intercept: -T_LOG_MEAN / T_LOG_SD },
        cellsRecovered: traumaRecovered.length,
        exactYear: traumaRecovered.length,
        zeroDeathCells: traumaRecovered.filter((t) => t.via === 'zero-death').length,
        isoAliasCells: traumaRecovered.filter((t) => t.via === 'iso-alias').length,
      },
    ],
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
