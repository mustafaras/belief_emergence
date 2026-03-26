/**
 * Paper Exports Builder — Schema-versioned JSON for supplementary material.
 *
 * Packages all evaluation outputs (global fit, temporal slices, country-slice,
 * ablation, robustness) into a stable JSON schema with provenance metadata.
 *
 * Deterministic diagnostics use the active coefficient set without fold refit;
 * refit out-of-sample protocol tables are attached separately when provided.
 */

import type { PanelRowCanonical } from '../../data/panelDataLoader';
import type { TemporalHoldoutSummary } from './computeTemporalHoldoutSummary';
import type { CountrySliceSummary } from './computeCountrySliceSummary';
import type { AblationSummary } from './computeAblationSummary';
import type { RobustnessSummary, RobustnessConfig } from './computeRobustnessSummary';
import type { PanelFitSummary } from './computePanelFitSummary';
import type { ModelLadderSummary } from './buildModelLadder';
import type { CountryOutRefitSummary } from './computeLeaveOneCountryOutRefit';
import type { RollingOriginRefitSummary } from './computeRollingOriginRefit';
import type { PredictionIntervalCoverageSummary } from './computePredictionIntervalCoverage';
import type { ParameterStabilitySummary } from './computeParameterStabilitySummary';
import type { ModelComplexitySupportSummary } from './computeModelComplexitySummary';
import type { FailureLogSummary } from './computeFailureLogSummary';
import type { LockboxHoldoutSummary } from './computeLockboxHoldoutSummary';

import { computeTemporalHoldoutSummary } from './computeTemporalHoldoutSummary';
import { computeCountrySliceSummary } from './computeCountrySliceSummary';
import { computeAblationSummary } from './computeAblationSummary';
import { computeRobustnessSummary } from './computeRobustnessSummary';
import { computePanelFitSummary } from './computePanelFitSummary';

import {
  STRUCTURAL_MIN,
  PANEL_X_MIN,
  PANEL_X_MAX,
  PANEL_Y_MIN,
  PANEL_Y_MAX,
} from '../../utils/modelContract';
import { BIAS_DEFINITION_SENTENCE } from '../metrics';

import {
  OPTIMIZED_SIGMOID_COEFFICIENTS,
  OPTIMIZED_STRUCTURAL_PARAMS,
  INTERACTION_TERMS,
  QUADRATIC_TERMS,
  Z_NORMALIZATION,
} from '../../data/feCoefficients';

export const PAPER_EXPORTS_SCHEMA_VERSION = '1.0.0';

/**
 * Coefficient provenance metadata (P4.3: estimated coefficient support).
 * Tracks source (builtin vs estimated) and estimation details when applicable.
 */
export type CoefficientProvenance = {
  activeSource: 'builtin' | 'estimated';
  fingerprint: {
    nCoefficients: number;
    sumValues: number;
    sumAbsValues: number;
    minValue: number;
    maxValue: number;
  };
  // Only present if activeSource === 'estimated'
  estimated?: {
    schemaVersion: string;
    generatedAtIso: string;
    method?: {
      name?: string;
      details?: string;
      seed?: number;
    };
    dataFingerprint?: {
      nRows?: number;
      nCountries?: number;
      yearMin?: number;
      yearMax?: number;
      source?: string;
    };
  };
};

export type PaperExports = {
  schemaVersion: string; // "1.0.0"
  generatedAtIso: string; // new Date().toISOString()
  provenance: {
    app?: { version?: string; build?: string };
    metricSemantics: {
      bias_sign_convention: 'observed_minus_predicted';
      bias_definition: string;
      residual_definition: 'observed_minus_predicted';
      observed_scale: 'normalized_to_structural_band';
      predicted_scale: 'clamped_to_structural_band';
      inferentialContract: {
        primaryEvidence: {
          family: 'refit_oos';
          intendedUse: 'primary_inferential';
          tableKeys: string[];
          metricFields: string[];
        };
        descriptiveDiagnostics: {
          family: 'fixed_or_active_coefficient_set';
          intendedUse: 'descriptive_diagnostic';
          tableKeys: string[];
          note: string;
        };
      };
      cvMetricFamilies: {
        primaryFamily: 'refit';
        refit: {
          foldRowMetricField: 'testMetricsRefit';
          foldSupportCollapsedField: 'testMetricsSupportCollapsedRefit';
          aggregateRowField: 'aggregatesRefit';
          aggregateSupportCollapsedField: 'aggregatesRefitSupportCollapsed';
        };
        canonical: {
          foldRowMetricField: 'testMetricsCanonical';
          foldSupportCollapsedField: 'testMetricsSupportCollapsedCanonical';
          aggregateRowField: 'aggregatesCanonical';
          aggregateSupportCollapsedField: 'aggregatesCanonicalSupportCollapsed';
        };
      };
    };
    dataset: {
      nRows: number;
      nCountries?: number;
      yearMin?: number;
      yearMax?: number;
      fields: string[]; // keys present in first row (sorted)
      missingness?: {
        zMissing?: number;
        yearMissing?: number;
        countryMissing?: number;
      };
    };
    modelDefaults: {
      epsDefault?: number;
      phiClampDefault?: number;
      zNormalization?: { min?: number; max?: number };
      panelBounds?: {
        xMin: number;
        xMax: number;
        yMin: number;
        yMax: number;
      };
      coefficientSource?: string;
      coefficientFingerprint?: {
        nCoefficients: number;
        sumAbs?: number;
        sum?: number;
      };
    };
    // P4.3: Coefficient provenance (estimated vs builtin source)
    coefficientProvenance?: CoefficientProvenance;
    notes: string[]; // factual notes
  };
  tables: {
    globalFit?: PanelFitSummary;
    temporalHoldout?: TemporalHoldoutSummary;
    countrySlice?: CountrySliceSummary;
    ablation?: AblationSummary;
    robustness?: RobustnessSummary;
    modelLadder?: ModelLadderSummary;
    cvCountryOut?: CountryOutRefitSummary;
    cvRollingOrigin?: RollingOriginRefitSummary;
    predictionIntervalCoverage?: PredictionIntervalCoverageSummary;
    parameterStability?: ParameterStabilitySummary;
    modelComplexitySupport?: ModelComplexitySupportSummary;
    failureLog?: FailureLogSummary;
    lockboxHoldout?: LockboxHoldoutSummary;
  };
};

/**
 * Identify country field name from row keys (preference order).
 */
function pickCountryKey(row: PanelRowCanonical | undefined): string | null {
  if (!row) return null;
  const keys = Object.keys(row);
  const preferences = ['iso3', 'ISO3', 'country', 'Country', 'country_name'];
  for (const pref of preferences) {
    if (keys.includes(pref)) return pref;
  }
  return null;
}

/**
 * Extract finite year values from rows.
 */
function getFiniteYears(rows: PanelRowCanonical[]): number[] {
  const years: number[] = [];
  for (const row of rows) {
    if (Number.isFinite(row.year)) {
      years.push(row.year);
    }
  }
  return years;
}

/**
 * Compute simple coefficient fingerprint (no crypto deps).
 */
function computeCoeffFingerprint(): {
  nCoefficients: number;
  sumAbs: number;
  sum: number;
} {
  const coeffs: number[] = [];

  // Main effects (c1-c8)
  coeffs.push(
    OPTIMIZED_SIGMOID_COEFFICIENTS.c1,
    OPTIMIZED_SIGMOID_COEFFICIENTS.c2,
    OPTIMIZED_SIGMOID_COEFFICIENTS.c3,
    OPTIMIZED_SIGMOID_COEFFICIENTS.c4,
    OPTIMIZED_SIGMOID_COEFFICIENTS.c5,
    OPTIMIZED_SIGMOID_COEFFICIENTS.c6,
    OPTIMIZED_SIGMOID_COEFFICIENTS.c7,
    OPTIMIZED_SIGMOID_COEFFICIENTS.c8
  );

  // Interactions (7 terms)
  coeffs.push(
    INTERACTION_TERMS.c_yr,
    INTERACTION_TERMS.c_tr,
    INTERACTION_TERMS.c_xy,
    INTERACTION_TERMS.c_cm,
    INTERACTION_TERMS.c_es,
    INTERACTION_TERMS.c_dt,
    INTERACTION_TERMS.c_gr
  );

  // Quadratic (4 terms)
  coeffs.push(
    QUADRATIC_TERMS.c_c2,
    QUADRATIC_TERMS.c_m2,
    QUADRATIC_TERMS.c_t2,
    QUADRATIC_TERMS.c_e2
  );

  // Structural params (α, β, k, φ₀)
  coeffs.push(
    OPTIMIZED_STRUCTURAL_PARAMS.alpha,
    OPTIMIZED_STRUCTURAL_PARAMS.beta,
    OPTIMIZED_STRUCTURAL_PARAMS.k,
    OPTIMIZED_STRUCTURAL_PARAMS.phi0
  );

  const sum = coeffs.reduce((acc, c) => acc + c, 0);
  const sumAbs = coeffs.reduce((acc, c) => acc + Math.abs(c), 0);

  return {
    nCoefficients: coeffs.length,
    sumAbs,
    sum,
  };
}

/**
 * Safe runner for evaluation utilities (catches errors and appends notes).
 */
function safeRun<T>(
  name: string,
  fn: () => T,
  notes: string[]
): T | undefined {
  try {
    return fn();
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    notes.push(
      `${name} failed: ${errorMsg}. Table omitted from export.`
    );
    return undefined;
  }
}

/**
 * Build paper exports object with all evaluation tables and provenance.
 *
 * @param rows - canonical panel rows
 * @param options - configuration for each evaluation table, or precomputed tables
 * @returns PaperExports object (JSON-serializable)
 */
export function buildPaperExports(
  rows: PanelRowCanonical[],
  options?: {
    temporal?: {
      splitYears?: number[];
      minRowsPerSlice?: number;
    };
    country?: {
      minRowsPerCountry?: number;
      sortBy?: 'country' | 'nUsed_desc' | 'r2_desc';
      maxCountries?: number;
    };
    ablation?: { minRows?: number };
    robustness?: {
      minRows?: number;
      configs?: RobustnessConfig[];
      maxRowsSampled?: number;
    };
    phase1Refit?: {
      modelLadder?: ModelLadderSummary;
      cvCountryOut?: CountryOutRefitSummary;
      cvRollingOrigin?: RollingOriginRefitSummary;
      predictionIntervalCoverage?: PredictionIntervalCoverageSummary;
      parameterStability?: ParameterStabilitySummary;
      modelComplexitySupport?: ModelComplexitySupportSummary;
      failureLog?: FailureLogSummary;
      lockboxHoldout?: LockboxHoldoutSummary;
    };
    includeGlobalFit?: boolean;
    /**
     * Precomputed tables to use directly instead of recomputing.
     * If provided, these exact objects are used in the export, ensuring
     * identity equality with UI-rendered tables and avoiding double computation.
     */
    precomputed?: Partial<PaperExports['tables']>;
    /**
     * P4.3: Coefficient provenance (estimated vs builtin source).
     * If provided, includes active coefficient source and metadata in export.
     */
    coefficientProvenance?: CoefficientProvenance;
    /**
     * Optional coefficient overrides to apply when computing tables (keeps parity with UI summaries).
     */
    coefficients?: Record<string, number>;
  }
): PaperExports {
  const generatedAtIso = new Date().toISOString();
  const notes: string[] = [
    'Deterministic diagnostics (globalFit, temporalHoldout, countrySlice, ablation, robustness) use fixed coefficients or the active estimated coefficient set and do not refit per fold.',
    'Observed Z is normalized to the structural band using the canonical panel preprocessing pipeline.',
    'Metrics computed only on rows with finite observed and predicted Z (nUsed).',
    `${BIAS_DEFINITION_SENTENCE}.`,
  ];

  // Dataset provenance
  const nRows = rows.length;
  const fields =
    nRows > 0
      ? Object.keys(rows[0]).slice().sort()
      : [];

  const countryKey = pickCountryKey(rows[0]);
  let nCountries: number | undefined;
  if (countryKey) {
    const uniqueCountries = new Set<string>();
    for (const row of rows) {
      const val = (row as unknown as Record<string, unknown>)[countryKey];
      if (val !== null && val !== undefined) {
        uniqueCountries.add(String(val));
      }
    }
    nCountries = uniqueCountries.size;
    notes.push(`Country field used: ${countryKey}`);
  }

  const finiteYears = getFiniteYears(rows);
  const yearMin =
    finiteYears.length > 0 ? Math.min(...finiteYears) : undefined;
  const yearMax =
    finiteYears.length > 0 ? Math.max(...finiteYears) : undefined;

  // Missingness
  let zMissing = 0;
  let yearMissing = 0;
  let countryMissing = 0;

  for (const row of rows) {
    if (!Number.isFinite(row.Z)) zMissing++;
    if (!Number.isFinite(row.year)) yearMissing++;
    if (countryKey && !(row as unknown as Record<string, unknown>)[countryKey]) {
      countryMissing++;
    }
  }

  const missingness =
    zMissing || yearMissing || countryMissing
      ? { zMissing, yearMissing, countryMissing }
      : undefined;

  // Model defaults
  const epsDefault = STRUCTURAL_MIN;
  const phiClampDefault = 50; // documented in calculateModel
  const zNormalization = {
    min: Z_NORMALIZATION.min,
    max: Z_NORMALIZATION.max,
  };
  const panelBounds = {
    xMin: PANEL_X_MIN,
    xMax: PANEL_X_MAX,
    yMin: PANEL_Y_MIN,
    yMax: PANEL_Y_MAX,
  };

  const coefficientSource = 'feCoefficients.ts';
  const coefficientFingerprint = computeCoeffFingerprint();

  // P4.3: Build coefficient provenance if provided
  const coeffProvenance: CoefficientProvenance | undefined = options?.coefficientProvenance;
  const tables: PaperExports['tables'] = {};

  // If precomputed tables provided, use them directly
  if (options?.precomputed) {
    if (options.precomputed.globalFit !== undefined) {
      tables.globalFit = options.precomputed.globalFit;
    }
    if (options.precomputed.temporalHoldout !== undefined) {
      tables.temporalHoldout = options.precomputed.temporalHoldout;
    }
    if (options.precomputed.countrySlice !== undefined) {
      tables.countrySlice = options.precomputed.countrySlice;
    }
    if (options.precomputed.ablation !== undefined) {
      tables.ablation = options.precomputed.ablation;
    }
    if (options.precomputed.robustness !== undefined) {
      tables.robustness = options.precomputed.robustness;
    }
    if (options.precomputed.modelLadder !== undefined) {
      tables.modelLadder = options.precomputed.modelLadder;
    }
    if (options.precomputed.cvCountryOut !== undefined) {
      tables.cvCountryOut = options.precomputed.cvCountryOut;
    }
    if (options.precomputed.cvRollingOrigin !== undefined) {
      tables.cvRollingOrigin = options.precomputed.cvRollingOrigin;
    }
    if (options.precomputed.predictionIntervalCoverage !== undefined) {
      tables.predictionIntervalCoverage = options.precomputed.predictionIntervalCoverage;
    }
    if (options.precomputed.parameterStability !== undefined) {
      tables.parameterStability = options.precomputed.parameterStability;
    }
    if (options.precomputed.modelComplexitySupport !== undefined) {
      tables.modelComplexitySupport = options.precomputed.modelComplexitySupport;
    }
    if (options.precomputed.failureLog !== undefined) {
      tables.failureLog = options.precomputed.failureLog;
    }
    if (options.precomputed.lockboxHoldout !== undefined) {
      tables.lockboxHoldout = options.precomputed.lockboxHoldout;
    }
    if (Object.keys(tables).length > 0) {
      notes.push('Tables provided via precomputed option; used directly without recomputation.');
    }
  }

  if (options?.phase1Refit) {
    const {
      modelLadder,
      cvCountryOut,
      cvRollingOrigin,
      predictionIntervalCoverage,
      parameterStability,
      modelComplexitySupport,
      failureLog,
      lockboxHoldout,
    } = options.phase1Refit;

    if (modelLadder) tables.modelLadder = modelLadder;
    if (cvCountryOut) tables.cvCountryOut = cvCountryOut;
    if (cvRollingOrigin) tables.cvRollingOrigin = cvRollingOrigin;
    if (predictionIntervalCoverage) tables.predictionIntervalCoverage = predictionIntervalCoverage;
    if (parameterStability) tables.parameterStability = parameterStability;
    if (modelComplexitySupport) tables.modelComplexitySupport = modelComplexitySupport;
    if (failureLog) tables.failureLog = failureLog;
    if (lockboxHoldout) tables.lockboxHoldout = lockboxHoldout;

    if (
      modelLadder ||
      cvCountryOut ||
      cvRollingOrigin ||
      predictionIntervalCoverage ||
      parameterStability ||
      modelComplexitySupport ||
      failureLog ||
      lockboxHoldout
    ) {
      notes.push('Phase 1 refit OOS evidence attached (country-out, rolling-origin, stability, coverage, complexity/support, failure log).');
      if (lockboxHoldout) {
        notes.push('Lockbox holdout artifact attached as release-gated final check and should be interpreted separately from development CV folds.');
      }
      notes.push('Primary inferential protocol metrics are the refit family fields (testMetricsRefit / aggregatesRefit); canonical fixed-model fields (testMetricsCanonical / aggregatesCanonical) are diagnostic contrasts only.');
      notes.push('Tier A/B comparisons are based on fold distributions; Tier C is exploratory unless independent stability and OOS adequacy are established.');
    }
  }

  // Otherwise compute tables from rows
  if (nRows > 0 && !options?.precomputed) {
    // Global fit (optional)
    const includeGlobalFit = options?.includeGlobalFit ?? true;
    if (includeGlobalFit) {
      tables.globalFit = safeRun(
        'computePanelFitSummary',
        () => computePanelFitSummary(rows, { coefficients: options?.coefficients }),
        notes
      );
    }

    // Temporal holdout
    tables.temporalHoldout = safeRun(
      'computeTemporalHoldoutSummary',
      () => computeTemporalHoldoutSummary(rows, { ...options?.temporal, coefficients: options?.coefficients }),
      notes
    );

    // Country slice
    tables.countrySlice = safeRun(
      'computeCountrySliceSummary',
      () => computeCountrySliceSummary(rows, { ...options?.country, coefficients: options?.coefficients }),
      notes
    );

    // Ablation
    tables.ablation = safeRun(
      'computeAblationSummary',
      () => computeAblationSummary(rows, { ...options?.ablation, coefficients: options?.coefficients }),
      notes
    );

    // Robustness
    tables.robustness = safeRun(
      'computeRobustnessSummary',
      () => computeRobustnessSummary(rows, { ...options?.robustness, coefficients: options?.coefficients }),
      notes
    );
  } else {
    notes.push('Empty dataset; all tables omitted.');
  }

  return {
    schemaVersion: PAPER_EXPORTS_SCHEMA_VERSION,
    generatedAtIso,
    provenance: {
      metricSemantics: {
        bias_sign_convention: 'observed_minus_predicted',
        bias_definition: BIAS_DEFINITION_SENTENCE,
        residual_definition: 'observed_minus_predicted',
        observed_scale: 'normalized_to_structural_band',
        predicted_scale: 'clamped_to_structural_band',
        inferentialContract: {
          primaryEvidence: {
            family: 'refit_oos',
            intendedUse: 'primary_inferential',
            tableKeys: [
              'cvCountryOut',
              'cvRollingOrigin',
              'parameterStability',
              'predictionIntervalCoverage',
              'modelComplexitySupport',
              'failureLog',
              'lockboxHoldout',
            ],
            metricFields: [
              'testMetricsRefit',
              'testMetricsSupportCollapsedRefit',
              'aggregatesRefit',
              'aggregatesRefitSupportCollapsed',
              'lockboxEvaluation.byTier.*.testMetricsRefit',
              'lockboxEvaluation.comparisonVsDevelopmentByTier',
            ],
          },
          descriptiveDiagnostics: {
            family: 'fixed_or_active_coefficient_set',
            intendedUse: 'descriptive_diagnostic',
            tableKeys: [
              'globalFit',
              'temporalHoldout',
              'countrySlice',
              'ablation',
              'robustness',
            ],
            note: 'These tables summarize deterministic bounded-scale diagnostics under the active coefficient contract and are not fold-refit OOS evidence.',
          },
        },
        cvMetricFamilies: {
          primaryFamily: 'refit',
          refit: {
            foldRowMetricField: 'testMetricsRefit',
            foldSupportCollapsedField: 'testMetricsSupportCollapsedRefit',
            aggregateRowField: 'aggregatesRefit',
            aggregateSupportCollapsedField: 'aggregatesRefitSupportCollapsed',
          },
          canonical: {
            foldRowMetricField: 'testMetricsCanonical',
            foldSupportCollapsedField: 'testMetricsSupportCollapsedCanonical',
            aggregateRowField: 'aggregatesCanonical',
            aggregateSupportCollapsedField: 'aggregatesCanonicalSupportCollapsed',
          },
        },
      },
      dataset: {
        nRows,
        nCountries,
        yearMin,
        yearMax,
        fields,
        missingness,
      },
      modelDefaults: {
        epsDefault,
        phiClampDefault,
        zNormalization,
        panelBounds,
        coefficientSource,
        coefficientFingerprint,
      },
      coefficientProvenance: coeffProvenance,
      notes,
    },
    tables,
  };
}
