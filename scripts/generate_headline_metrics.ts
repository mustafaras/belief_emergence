import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { calculateModel } from '../src/utils/calculateModel';
import { METRIC_DEFINITIONS, computeBias, computeMAE, computePearsonCorr, computeR2, computeRMSE } from '../src/utils/metrics';
import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader';
import type { PanelRowCanonical } from '../src/types/panel';
import { OPTIMIZED_STRUCTURAL_PARAMS, Z_NORMALIZATION } from '../src/data/feCoefficients';
import { normalizeObservedToStructuralBand, STRUCTURAL_MIN } from '../src/utils/modelContract';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CANONICAL_DATASET_PATH = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_23_countries_v1.csv');
const OUTPUT_PATH = path.join(REPO_ROOT, 'src', 'data', 'metrics', 'headline_metrics_authoritative.json');

function computeSha256(text: string): string {
  const hash = createHash('sha256');
  hash.update(text, 'utf8');
  return hash.digest('hex').toUpperCase();
}

function computeHeadlineMetrics(panel: PanelRowCanonical[]) {
  const observed: number[] = [];
  const predicted: number[] = [];
  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = Number.NEGATIVE_INFINITY;
  const countries = new Set<string>();

  for (const row of panel) {
    const cStd =
      (row.C - 2.613602) / 0.542138;
    const computed = calculateModel(
      {
        X: row.X,
        Y: row.Y,
        alpha: OPTIMIZED_STRUCTURAL_PARAMS.alpha,
        beta: OPTIMIZED_STRUCTURAL_PARAMS.beta,
        k: OPTIMIZED_STRUCTURAL_PARAMS.k,
        C: cStd,
        M: row.M,
        T: row.T,
        D: row.D,
        G: row.G,
        E: row.E,
        S: row.S,
        R: row.R,
      },
      {
        inputsAreStandardized: false,
        modifiersAreStandardized: true,
      },
    );

    const zhat = computed.Z;
    const zobs = normalizeObservedToStructuralBand(row.Z, Z_NORMALIZATION.min, Z_NORMALIZATION.max);
    if (Number.isFinite(zhat) && Number.isFinite(zobs)) {
      observed.push(zobs);
      predicted.push(zhat);
    }

    if (row.year < minYear) minYear = row.year;
    if (row.year > maxYear) maxYear = row.year;
    countries.add(row.iso3);
  }

  return {
    observed,
    predicted,
    minYear: Number.isFinite(minYear) ? minYear : 0,
    maxYear: Number.isFinite(maxYear) ? maxYear : 0,
    countriesCount: countries.size,
  };
}

export async function generateHeadlineMetrics(): Promise<void> {
  const csvText = fs.readFileSync(CANONICAL_DATASET_PATH, 'utf8');
  const hash = computeSha256(csvText);
  if (hash !== CANONICAL_PANEL_SHA256) {
    throw new Error(`Checksum mismatch for canonical panel. Expected ${CANONICAL_PANEL_SHA256}, got ${hash}`);
  }

  const panel = parsePanelCsvText(csvText, CANONICAL_DATASET_PATH);
  const { observed, predicted, minYear, maxYear, countriesCount } = computeHeadlineMetrics(panel);

  const r2 = computeR2(observed, predicted);
  const corr = computePearsonCorr(observed, predicted);
  const mae = computeMAE(observed, predicted);
  const rmse = computeRMSE(observed, predicted);
  const bias = computeBias(observed, predicted);

  const output = {
    schema_version: 1,
    generated_at_utc: new Date().toISOString(),
    dataset: {
      path: '/data/panel_canonical_23_countries_v1.csv',
      checksum_sha256: CANONICAL_PANEL_SHA256,
      n_rows: panel.length,
      year_range: [minYear, maxYear],
      countries_count: countriesCount,
    },
    model: {
      id: 'production_model_v1',
      uses_clamped_Z: true,
      clamp_epsilon: STRUCTURAL_MIN,
      coefficients_source: 'src/data/feCoefficients.ts',
      calculation_source: 'src/utils/calculateModel.ts',
    },
    definitions: { ...METRIC_DEFINITIONS },
    values: {
      r2,
      corr,
      mae,
      rmse,
      bias,
    },
  } satisfies Record<string, unknown>;

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`✅ Wrote headline metrics -> ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
}

// If invoked directly via node scripts/generate_headline_metrics.ts
if (process.argv[1] && process.argv[1].endsWith('generate_headline_metrics.ts')) {
  generateHeadlineMetrics().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
