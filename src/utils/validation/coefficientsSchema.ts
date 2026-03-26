/**
 * Coefficient Schema Validation & Parsing
 * =========================================
 *
 * Validates estimated coefficient JSON (schemaVersion 1.0.0) and provides
 * type-safe parsing for loading external coefficient sets into the model.
 *
 * Used by P4.3 to load estimated coefficients from Python analysis pipeline
 * (analysis/output/coefficients.json) while preserving built-in coefficients
 * as a stable fallback.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Flat map of coefficient term keys to numeric values.
 * Used to inject coefficients into calculateModel.
 */
export type CoefficientSet = Record<string, number>;

/**
 * Detailed coefficient estimate with uncertainty quantification.
 */
export interface EstimatedCoefficientDetail {
  value: number;
  se?: number;  // Standard error (from bootstrap)
  ci95?: [number, number];  // 95% confidence interval [lo, hi]
}

/**
 * Method/provenance metadata for estimated coefficients.
 */
export interface CoefficientMethod {
  name?: string;  // e.g., "nonlinear_least_squares" + "cluster_bootstrap"
  details?: Record<string, unknown>;  // Extra metadata
  seed?: number;  // Random seed for reproducibility
}

/**
 * Dataset fingerprint for estimated coefficients.
 */
export interface CoefficientDatasetFingerprint {
  nRows?: number;
  nCountries?: number;
  yearMin?: number;
  yearMax?: number;
  source?: string;
}

/**
 * Term specification from estimation pipeline.
 */
export interface CoefficientTermSpec {
  key: string;
  label?: string;
  type?: string;  // 'main' | 'interaction' | 'quadratic' | 'structural'
  feature?: string;
}

/**
 * Estimated Coefficients JSON v1.0.0 schema (output from analysis pipeline).
 */
export interface EstimatedCoefficientsJsonV1 {
  schemaVersion: "1.0.0";
  generatedAtIso: string;
  method?: CoefficientMethod;
  dataFingerprint?: CoefficientDatasetFingerprint;
  termSpec?: CoefficientTermSpec[];
  estimates: Record<string, EstimatedCoefficientDetail>;
  fit?: Record<string, unknown>;  // Optional fit metrics
}

/**
 * Result of parsing estimated coefficients JSON.
 */
export interface ParsedEstimatedCoefficients {
  coeffs: CoefficientSet;  // Flat map for injection into calculateModel
  ci95Map: Record<string, [number, number]>;  // Per-coefficient 95% CI bounds (lo, hi)
  meta: {
    schemaVersion: string;
    generatedAtIso: string;
    method?: CoefficientMethod;
    dataFingerprint?: CoefficientDatasetFingerprint;
    termSpec?: CoefficientTermSpec[];
    fit?: Record<string, unknown>;
  };
  warnings: string[];
}

// ============================================================================
// RUNTIME GUARDS (Lightweight validation)
// ============================================================================

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isArrayLen2<T>(value: unknown, itemCheck: (v: unknown) => v is T): value is [T, T] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    itemCheck(value[0]) &&
    itemCheck(value[1])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value);
}

// ============================================================================
// PARSER & VALIDATORS
// ============================================================================

/**
 * Parse estimated coefficients JSON with validation.
 *
 * @param input Raw JSON input (parsed or unparsed)
 * @param requiredTermKeys Optional list of term keys that must be present; if not provided,
 *   parser requires all 23 known terms from the full model.
 *
 * @returns ParsedEstimatedCoefficients with coeffs map and metadata,
 *          or throws an error if validation fails critically.
 *
 * Validation rules:
 * - schemaVersion must be "1.0.0"
 * - generatedAtIso must be a valid ISO datetime string
 * - estimates must be a record of { key: { value: number, se?: number, ci95?: [number, number] } }
 * - all estimate values must be finite numbers
 * - ci95 if present must be [lo, hi] with lo <= hi
 * - warns if optional metadata fields are missing
 * - warns if extra unexpected keys are present
 */
export function parseEstimatedCoefficientsJson(
  input: unknown,
  requiredTermKeys?: string[]
): ParsedEstimatedCoefficients {
  const warnings: string[] = [];

  // Parse if string
  let parsed: unknown = input;
  if (isString(input)) {
    try {
      parsed = JSON.parse(input);
    } catch (err) {
      throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!isObject(parsed)) {
    throw new Error('Root must be an object');
  }

  // Validate schemaVersion
  if (parsed.schemaVersion !== "1.0.0") {
    throw new Error(
      `Unsupported schemaVersion: "${parsed.schemaVersion}". Expected "1.0.0".`
    );
  }

  // Validate generatedAtIso
  if (!isString(parsed.generatedAtIso)) {
    warnings.push("Missing or invalid generatedAtIso field");
  } else {
    // Basic ISO check (lenient)
    if (!/^\d{4}-\d{2}-\d{2}/.test(parsed.generatedAtIso)) {
      warnings.push(`generatedAtIso does not appear to be ISO format: "${parsed.generatedAtIso}"`);
    }
  }

  // Validate estimates
  if (!isRecord(parsed.estimates)) {
    throw new Error("estimates must be an object");
  }

  const estimates = parsed.estimates as Record<string, unknown>;
  const coeffs: CoefficientSet = {};
  const ci95Map: Record<string, [number, number]> = {};

  for (const [key, detail] of Object.entries(estimates)) {
    if (!isObject(detail)) {
      throw new Error(`estimates.${key} must be an object; got ${typeof detail}`);
    }

    if (!isNumber(detail.value)) {
      throw new Error(`estimates.${key}.value must be a finite number; got ${typeof detail.value}`);
    }

    coeffs[key] = detail.value;

    // Warn if SE is non-numeric but present
    if (detail.se !== undefined && !isNumber(detail.se)) {
      warnings.push(`estimates.${key}.se is not a finite number; ignoring`);
    }

    // Validate CI95 bounds
    if (detail.ci95 !== undefined) {
      if (!isArrayLen2(detail.ci95, isNumber)) {
        warnings.push(`estimates.${key}.ci95 must be [number, number]; got ${JSON.stringify(detail.ci95)}`);
      } else {
        const [lo, hi] = detail.ci95;
        if (lo > hi) {
          warnings.push(`estimates.${key}.ci95: lower bound (${lo}) > upper bound (${hi})`);
        } else {
          ci95Map[key] = [lo, hi];
        }
      }
    }
  }

  // Validate required terms if specified
  if (requiredTermKeys) {
    const missing = requiredTermKeys.filter(key => !(key in coeffs));
    if (missing.length > 0) {
      throw new Error(
        `Missing required coefficient keys: ${missing.join(", ")}`
      );
    }
  }

  // Optional metadata
  let method: CoefficientMethod | undefined;
  if (isObject(parsed.method)) {
    method = {
      name: isString(parsed.method.name) ? parsed.method.name : undefined,
      details: isRecord(parsed.method.details) ? parsed.method.details : undefined,
      seed: isNumber(parsed.method.seed) ? parsed.method.seed : undefined,
    };
  } else if (parsed.method !== undefined) {
    warnings.push("method is not an object; ignoring");
  }

  let dataFingerprint: CoefficientDatasetFingerprint | undefined;
  if (isObject(parsed.dataFingerprint)) {
    dataFingerprint = {
      nRows: isNumber(parsed.dataFingerprint.nRows) ? parsed.dataFingerprint.nRows : undefined,
      nCountries: isNumber(parsed.dataFingerprint.nCountries) ? parsed.dataFingerprint.nCountries : undefined,
      yearMin: isNumber(parsed.dataFingerprint.yearMin) ? parsed.dataFingerprint.yearMin : undefined,
      yearMax: isNumber(parsed.dataFingerprint.yearMax) ? parsed.dataFingerprint.yearMax : undefined,
      source: isString(parsed.dataFingerprint.source) ? parsed.dataFingerprint.source : undefined,
    };
  } else if (parsed.dataFingerprint !== undefined) {
    warnings.push("dataFingerprint is not an object; ignoring");
  }

  let termSpec: CoefficientTermSpec[] | undefined;
  if (Array.isArray(parsed.termSpec)) {
    termSpec = [];
    for (const spec of parsed.termSpec) {
      if (isObject(spec) && isString(spec.key)) {
        termSpec.push({
          key: spec.key,
          label: isString(spec.label) ? spec.label : undefined,
          type: isString(spec.type) ? spec.type : undefined,
          feature: isString(spec.feature) ? spec.feature : undefined,
        });
      }
    }
  } else if (parsed.termSpec !== undefined) {
    warnings.push("termSpec is not an array; ignoring");
  }

  let fit: Record<string, unknown> | undefined;
  if (isRecord(parsed.fit)) {
    fit = parsed.fit;
  } else if (parsed.fit !== undefined) {
    warnings.push("fit is not an object; ignoring");
  }

  return {
    coeffs,
    ci95Map,
    meta: {
      schemaVersion: "1.0.0",
      generatedAtIso: isString(parsed.generatedAtIso) ? parsed.generatedAtIso : new Date().toISOString(),
      method,
      dataFingerprint,
      termSpec,
      fit,
    },
    warnings,
  };
}

/**
 * List of all known coefficient keys from the full model (23 parameters).
 * Used to validate complete coefficient sets.
 */
export const ALL_KNOWN_COEFFICIENT_KEYS = [
  // Main effects (8)
  "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8",
  // Interactions (7)
  "c_yr", "c_tr", "c_xy", "c_cm", "c_es", "c_dt", "c_gr",
  // Quadratics (4)
  "c_c2", "c_m2", "c_t2", "c_e2",
  // Structural (4)
  "alpha", "beta", "k", "phi0",
] as const;

/**
 * Validate that a coefficient set contains all required keys for full model mode.
 * Returns a list of missing keys, or empty if all present.
 */
export function validateCoefficientSetCompleteness(
  coeffs: CoefficientSet,
  requiredKeys: string[] = [...ALL_KNOWN_COEFFICIENT_KEYS]
): string[] {
  return requiredKeys.filter(key => !(key in coeffs));
}

/**
 * Compute a fingerprint of a coefficient set for display/verification.
 * (Not cryptographic; for transparency only.)
 */
export interface CoefficientSetFingerprint {
  nCoefficients: number;
  sumValues: number;
  sumAbsValues: number;
  minValue: number;
  maxValue: number;
}

export function computeCoefficientSetFingerprint(coeffs: CoefficientSet): CoefficientSetFingerprint {
  const values = Object.values(coeffs).filter(isNumber);
  if (values.length === 0) {
    return { nCoefficients: 0, sumValues: 0, sumAbsValues: 0, minValue: 0, maxValue: 0 };
  }
  return {
    nCoefficients: values.length,
    sumValues: values.reduce((a, b) => a + b, 0),
    sumAbsValues: values.reduce((a, b) => a + Math.abs(b), 0),
    minValue: Math.min(...values),
    maxValue: Math.max(...values),
  };
}
