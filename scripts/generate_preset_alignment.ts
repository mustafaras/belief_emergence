/**
 * generate_preset_alignment.ts — emit preset_country_alignment.json.
 *
 * Observed-versus-predicted alignment per country on year-averaged pairs, from the
 * same function the application uses. The manuscript's country table was typed by
 * hand from an earlier panel and disagreed with the application; it is now
 * checked against this artifact.
 *
 * Usage: npm run generate:preset-alignment
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { GENERATED_PRESETS } from '../src/data/presets.generated.ts';
import { computePresetCountryAlignment, PRESET_VERDICT_THRESHOLDS } from '../src/utils/validation/presetCountryAlignment.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PANEL = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'preset_country_alignment.json');
/** MAE above which a country is called out as a thin-support prediction failure. */
const FAILURE_MAE = 0.25;

function main(): void {
  const rows = parsePanelCsvText(fs.readFileSync(PANEL, 'utf8'), PANEL);
  const presets = new Set(GENERATED_PRESETS.map((p) => p.iso3));
  const countries = computePresetCountryAlignment(rows as never)
    .map((r) => ({
      iso3: r.iso3,
      name: r.countryName,
      isPreset: presets.has(r.iso3),
      nYears: r.nYears,
      meanObservedZ: r.meanObservedZ,
      meanPredictedZ: r.meanPredictedZ,
      mae: r.mae,
      bias: r.meanObservedZ - r.meanPredictedZ,
      successPct: r.successPct,
      verdictClass: r.verdictClass,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const presetRows = countries.filter((c) => c.isPreset);
  const result = {
    schemaVersion: 'phase1.preset_country_alignment.v1',
    generatedAtIso: new Date().toISOString(),
    panelSha256: CANONICAL_PANEL_SHA256,
    thresholds: PRESET_VERDICT_THRESHOLDS,
    failureMae: FAILURE_MAE,
    nCountries: countries.length,
    nPresetCountries: presetRows.length,
    presetFailures: presetRows.filter((c) => c.mae > FAILURE_MAE).map((c) => c.iso3),
    allCountryFailures: countries.filter((c) => c.mae > FAILURE_MAE).map((c) => c.iso3),
    countries,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`✅ Generated: ${OUT}`);
  console.log(`   ${result.nCountries} countries, ${result.nPresetCountries} presets; MAE>${FAILURE_MAE}: presets ${result.presetFailures.join(',')} | all ${result.allCountryFailures.join(',')}`);
}

main();
