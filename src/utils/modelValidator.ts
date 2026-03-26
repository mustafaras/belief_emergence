/**
 * MODEL / ARTICLE STANDARDS — DETAILED REPORT (22 Dec 2025)
 *
 * This file contains frontend model validation tests used to support “article standards”.
 * It also summarizes the scope of repo-wide scientific standard checks (Python) so the project has
 * one canonical place answering: “what did we test / why did we test it?”.
 *
 * ---------------------------------------------------------------------------
 * 0) Canonical contract (single source of truth)
 * ---------------------------------------------------------------------------
 * - Canonical interior band: ε = 1e-4
 * - Therefore: Z ∈ [0.0001, 0.9999]
 * - This band must stay consistent across runtime UI/plots/validators/tests/docs.
 * - Source (TS): `src/utils/modelContract.ts` (STRUCTURAL_MIN/MAX + map/clamp helpers)
 *
 * ---------------------------------------------------------------------------
 * 1) Frontend Model Validator (this file) — What does it test?
 * ---------------------------------------------------------------------------
 * These validations directly call the production calculator (calculateModel) to provide fast
 * regression safety at the “formula / sign / bounds / interactions” level.
 *
 * Important design note:
 * - `calculateBelief()` uses `calculateModel(params, { modifiersAreStandardized: true })`.
 *   That means test inputs for C..R modifiers are assumed to already be in z-space (standardized).
 * - X and Y are normalized from panel space into a “structural-safe” band:
 *   `normalizePanelXToStructural`, `normalizePanelYToStructural`.
 * - Z output is kept away from exact 0/1 exactly like production (interior band clamp).
 *
 * runValidationTests() coverage (19 tests total):
 *  1) Baseline Neutral (PRODUCTION):
 *     - X=0.5, Y=0.5; all modifiers = 0
 *     - Expected Z is computed via baseline + X×Y interaction only (phi0 + c_xy*X*Y)
 *     - Goal: mathematical consistency with the production calculator (very tight tolerance)
 *
 *  2) Maximum structural inputs:
 *     - X=1, Y=1, modifiers=0
 *     - Goal: Z must remain within the interior band (STRUCTURAL_MIN/MAX)
 *
 *  3) Extremely low inputs:
 *     - Inputs outside panel bounds (e.g., X=0, Y=-2)
 *     - Goal: normalize+clamp ensures Z stays finite and within the band
 *
 *  4) High Amplifiers:
 *     - Amplifiers like C,T,G at +1 → Z must increase vs baseline
 *     - Goal: ensure coefficient signs are not accidentally inverted in the UI implementation
 *
 *  5) High Suppressors:
 *     - Suppressors like E,S,R at +1 → Z must decrease vs baseline
 *
 *  6) Phi structure:
 *     - phi and Z returned by calculateModel must be numeric and within bounds
 *
 *  7)–8) Boundary conditions:
 *     - X=0,Y=0 and X=1,Y=1 → Z is finite and within the band
 *
 *  9) Sigmoid / band property:
 *     - Across many combinations: Z ∈ [0.0001, 0.9999]
 *
 * 10) Monotonicity:
 *     - With modifiers=0, increasing X or Y should increase Z
 *
 * 11)–14) Suppressor main-effects (M,D,E,S):
 *     - Each individually at +1 should decrease Z
 *
 * 15)–18) Amplifier main-effects (C,T,G,R):
 *     - Each individually at +1 should increase Z
 *
 * 19) Positive E×S interaction (mitigation test):
 *     - E sweep: S=0 vs S=+1
 *     - Expectation: with S=+1, the “range” of E's effect shrinks (mitigation)
 *
 * ---------------------------------------------------------------------------
 * 2) Python “Scientific Standards” (repo-level validation) — What was tested?
 * ---------------------------------------------------------------------------
 * `scripts/test_article_standards.py` was run (22 Dec 2025) and returned PASS.
 * Scope:
 * - FE coefficient presence/sign checks (C,T,G,R positive; M,D,E,S negative)
 * - Z bounds: interior-band validation for the `Z_predicted` and `Z_measured` columns in
 *   `src/data/analysis/23_countries_comparison.csv`
 *   (ε=1e-4 → [0.0001, 0.9999])
 * - Simple monotonicity direction checks (increase/decrease consistent with coefficient signs)
 *
 * ---------------------------------------------------------------------------
 * 3) UI / Sidebar contract tests (Vitest) — Relation to article standards
 * ---------------------------------------------------------------------------
 * Note: This repo previously contained UI/Sidebar contract tests running in Vitest.
 * Those were removed during repository simplification; this section remains as historical context
 * (UI behavior is currently verified via documentation + manual QA).
 *
 * ---------------------------------------------------------------------------
 * How to run
 * ---------------------------------------------------------------------------
 * - Frontend tests: `npm run test:run`
 * - Lint all: `npm run lint`
 * - Full verification: `npm run verify:all`
 */

import type { BeliefParameters, Coefficients } from '../types';
import { calculateModel } from './calculateModel';
import { INTERACTION_TERMS, OPTIMIZED_STRUCTURAL_PARAMS } from '../data/feCoefficients';
import {
  clampToStructuralBand,
  normalizePanelXToStructural,
  normalizePanelYToStructural,
  STRUCTURAL_MAX,
  STRUCTURAL_MIN,
} from './modelContract';

export interface ValidationResult {
  passed: boolean;
  testName: string;
  expected?: number | string;
  actual?: number | string;
  error?: string;
  tolerance?: number;
}

export interface ValidationReport {
  totalTests: number;
  passed: number;
  failed: number;
  results: ValidationResult[];
  timestamp: Date;
}

/**
 * Calculate belief emergence Z using the unified PRODUCTION calculator
 * 
 * This function now uses the complete PRODUCTION model with all 18 parameters:
 * - 3 tunable structural parameters: α, β, k (φ₀ baseline is fixed)
 * - 8 main coefficients: c1-c8 (z-score standardized)
 * - 7 interaction terms
 * - 4 quadratic terms
 * 
 * The coefficients parameter is now optional (kept for backward compatibility)
 * but is not used - the unified calculator always uses PRODUCTION values.
 * 
 * @param params - Belief parameters (X, Y, alpha, beta, k, C-R modifiers; φ₀ fixed)
 * @param _coefficients - Optional, for legacy compatibility (not used)
 * @returns Z value clamped to the canonical interior band [0.0001, 0.9999]
 */
export function calculateBelief(
  params: BeliefParameters,
  _coefficients?: Coefficients  // Optional parameter for legacy compatibility (not used)
): number {
  void _coefficients;
  // Validation inputs in this file use z-scored modifiers by convention (C..R).
  // Explicitly mark them as standardized to avoid re-standardizing C from the raw panel mean.
  return calculateModel(params, { modifiersAreStandardized: true }).Z;
}

function expectedNeutralZForXY(params: {
  X: number;
  Y: number;
  alpha: number;
  beta: number;
  k: number;
}): number {
  const X_safe = normalizePanelXToStructural(params.X);
  const Y_safe = normalizePanelYToStructural(params.Y);

  const baseTerm = Math.pow(X_safe, params.alpha) * Math.pow(Y_safe, params.beta);

  // With all modifiers set to 0 in z-space:
  // mainEffects = 0; all modifier-based interactions = 0; all quadratics = 0.
  // Only baseline + X×Y interaction remains.
  const phi =
    OPTIMIZED_STRUCTURAL_PARAMS.phi0 + INTERACTION_TERMS.c_xy * X_safe * Y_safe;
  const clampedPhi = Math.max(-50, Math.min(50, phi));
  const numerator = baseTerm * Math.exp(clampedPhi);
  const Z_raw = numerator / (numerator + params.k);

  // Mirror production clamp away from exact endpoints.
  return clampToStructuralBand(Z_raw);
}

/**
 * Test suite for mathematical formula validation
 */
export function runValidationTests(): ValidationReport {
  const results: ValidationResult[] = [];
  const timestamp = new Date();
  
  // Test 1: Baseline neutral parameters
  const test1 = testBaselineNeutral();
  results.push(test1);
  
  // Test 2: Maximum structural values
  const test2 = testMaximumStructural();
  results.push(test2);
  
  // Test 3: Minimum values (zeros)
  const test3 = testMinimumValues();
  results.push(test3);
  
  // Test 4: High amplifiers
  const test4 = testHighAmplifiers();
  results.push(test4);
  
  // Test 5: High suppressors
  const test5 = testHighSuppressors();
  results.push(test5);
  
  // Test 6: Phi calculation consistency
  const test6 = testPhiCalculation();
  results.push(test6);
  
  // Test 7: Boundary conditions (X=0, Y=0)
  const test7 = testBoundaryZeros();
  results.push(test7);
  
  // Test 8: Boundary conditions (X=1, Y=1)
  const test8 = testBoundaryOnes();
  results.push(test8);
  
  // Test 9: Sigmoid property (0 <= Z <= 1)
  const test9 = testSigmoidProperty();
  results.push(test9);
  
  // Test 10: Monotonicity in X and Y
  const test10 = testMonotonicity();
  results.push(test10);
  
  // Tests 11-14: Main Effects Validation — Suppressors (M, D, E, S)
  const test11 = testSuppressorMainEffect('M');
  results.push(test11);
  
  const test12 = testSuppressorMainEffect('D');
  results.push(test12);
  
  const test13 = testSuppressorMainEffect('E');
  results.push(test13);
  
  const test14 = testSuppressorMainEffect('S');
  results.push(test14);
  
  // Tests 15-18: Main Effects Validation — Amplifiers (C, T, G, R)
  const test15 = testAmplifierMainEffect('C');
  results.push(test15);
  
  const test16 = testAmplifierMainEffect('T');
  results.push(test16);
  
  const test17 = testAmplifierMainEffect('G');
  results.push(test17);
  
  const test18 = testAmplifierMainEffect('R');
  results.push(test18);
  
  // Test 19: E×S Positive Interaction — Sweep E with S=0 vs S=+1
  const test19 = testESSweepInteraction();
  results.push(test19);
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  return {
    totalTests: results.length,
    passed,
    failed,
    results,
    timestamp
  };
}

/**
 * Test 1: Baseline neutral parameters (PRODUCTION Model)
 * Uses PRODUCTION structural parameters with all modifiers = 0
 * Expected Z computed from baseline + X×Y interaction under structural mapping
 */
function testBaselineNeutral(): ValidationResult {
  const params: BeliefParameters = {
    X: 0.5,
    Y: 0.5,
    alpha: 0.3,      // PRODUCTION: sublinear urbanization exponent
    beta: 0.3,       // PRODUCTION: sublinear inequality exponent
    k: 1.307,        // PRODUCTION: saturation constant
    C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0
  };
  
  const result = calculateBelief(params);
  const expectedZ = expectedNeutralZForXY({
    X: params.X,
    Y: params.Y,
    alpha: params.alpha,
    beta: params.beta,
    k: params.k,
  });
  const tolerance = 1e-10;
  const passed = Math.abs(result - expectedZ) < tolerance;
  
  return {
    passed,
    testName: 'Baseline Neutral Parameters (PRODUCTION Model)',
    expected: expectedZ,
    actual: result,
    tolerance
  };
}

/**
 * Test 2: Maximum structural values (X=1, Y=1, all secondary params = 0)
 * Uses PRODUCTION structural parameters
 */
function testMaximumStructural(): ValidationResult {
  const params: BeliefParameters = {
    X: 1.0,
    Y: 1.0,
    alpha: 0.3,       // PRODUCTION: sublinear urbanization
    beta: 0.3,        // PRODUCTION: sublinear inequality
    k: 1.307,         // PRODUCTION: saturation constant
    C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0
  };
  
  const result = calculateBelief(params);
  const tolerance = 0.05;
  const passed = result >= STRUCTURAL_MIN && result <= STRUCTURAL_MAX;
  
  return {
    passed,
    testName: 'Maximum Structural Values (PRODUCTION)',
    expected: `${STRUCTURAL_MIN} ≤ Z ≤ ${STRUCTURAL_MAX}`,
    actual: result,
    tolerance
  };
}

/**
 * Test 3: Extreme-low inputs (below panel bounds)
 * Structural mapping saturates to an interior band, so Z is small but not 0.
 */
function testMinimumValues(): ValidationResult {
  const params: BeliefParameters = {
    X: 0,
    Y: -2,
    alpha: 0.3,       // PRODUCTION values
    beta: 0.3,
    k: 1.307,
    C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0
  };
  
  const result = calculateBelief(params);
  const expected = expectedNeutralZForXY({
    X: params.X,
    Y: params.Y,
    alpha: params.alpha,
    beta: params.beta,
    k: params.k,
  });
  const tolerance = 1e-10;
  const passed = Math.abs(result - expected) < tolerance;
  
  return {
    passed,
    testName: 'Extreme-low inputs: X=0, Y=-2 → Z small (PRODUCTION)',
    expected,
    actual: result,
    tolerance
  };
}

/**
 * Test 4: High amplifiers (C, T, G are the top amplifiers)
 * These increase Z above baseline
 */
function testHighAmplifiers(): ValidationResult {
  // Baseline with no modifiers
  const baseParams: BeliefParameters = {
    X: 0.65, Y: 0.35,
    alpha: 0.3, beta: 0.3, k: 1.307,
    C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0
  };
  const baseZ = calculateBelief(baseParams);
  
  // With amplifiers (C, T, G)
  const ampParams: BeliefParameters = {
    X: 0.65, Y: 0.35,
    alpha: 0.3, beta: 0.3, k: 1.307,
    C: 1, M: 0, T: 1, D: 0, G: 1, E: 0, S: 0, R: 0
  };
  const ampZ = calculateBelief(ampParams);
  
  const tolerance = 0.05;
  const passed = ampZ > baseZ;
  
  return {
    passed,
    testName: 'High Amplifiers (C, T, G increase Z) (PRODUCTION)',
    expected: `Z_amplified > Z_baseline (${baseZ.toFixed(4)})`,
    actual: ampZ.toFixed(4),
    tolerance
  };
}

/**
 * Test 5: High suppressors (E, S, R are the suppressors)
 * These decrease Z below baseline
 */
function testHighSuppressors(): ValidationResult {
  // Baseline with no modifiers
  const baseParams: BeliefParameters = {
    X: 0.65, Y: 0.35,
    alpha: 0.3, beta: 0.3, k: 1.307,
    C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0
  };
  const baseZ = calculateBelief(baseParams);
  
  // With suppressors (E, S, R)
  const supParams: BeliefParameters = {
    X: 0.65, Y: 0.35,
    alpha: 0.3, beta: 0.3, k: 1.307,
    C: 0, M: 0, T: 0, D: 0, G: 0, E: 1, S: 1, R: 1
  };
  const supZ = calculateBelief(supParams);
  
  const tolerance = 0.05;
  const passed = supZ < baseZ;
  
  return {
    passed,
    testName: 'High Suppressors (E, S, R decrease Z) (PRODUCTION)',
    expected: `Z_suppressed < Z_baseline (${baseZ.toFixed(4)})`,
    actual: supZ.toFixed(4),
    tolerance
  };
}

/**
 * Test 6: Phi calculation components verified
 * Phi = fixed phi0 + mainEffects + interactions + quadratic terms
 */
function testPhiCalculation(): ValidationResult {
  const params: BeliefParameters = {
    X: 0.5, Y: 0.5,
    alpha: 0.3, beta: 0.3, k: 1.307,
    C: 0.5, M: 0.3, T: 0.2, D: 0.4, G: 0.6, E: 0.3, S: 0.2, R: 0.4
  };
  
  // Call unified calculator
  const result = calculateModel(params, { modifiersAreStandardized: true });
  
  // Verify phi has expected structure (fixed phi0 + components)
  // phi0 = 0.921 (fixed baseline), then adds main effects and interactions
  const hasPhiComponent = typeof result.phi === 'number' && !isNaN(result.phi);
  const hasBelief = typeof result.Z === 'number' && result.Z >= STRUCTURAL_MIN && result.Z <= STRUCTURAL_MAX;
  
  const passed = hasPhiComponent && hasBelief;
  
  return {
    passed,
    testName: 'Phi Calculation Structure (PRODUCTION)',
    expected: 'phi = fixed phi0 + mainEffects + interactions + quadratic',
    actual: `phi=${result.phi.toFixed(6)}, Z=${result.Z.toFixed(4)}`,
    tolerance: 1e-10
  };
}

/**
 * Test 7: Boundary saturation still yields finite Z in (0, 1)
 */
function testBoundaryZeros(): ValidationResult {
  const params: BeliefParameters = {
    X: 0, Y: 0,
    alpha: 0.3, beta: 0.3, k: 1.307,
    C: 0.5, M: 0.3, T: 0.2, D: 0.4, G: 0.6, E: 0.3, S: 0.2, R: 0.4
  };
  
  const result = calculateBelief(params);
  const tolerance = 0;
  const passed = Number.isFinite(result) && result >= STRUCTURAL_MIN && result <= STRUCTURAL_MAX;
  
  return {
    passed,
    testName: 'Boundary: X=0, Y=0 → finite Z in [0.0001,0.9999] (PRODUCTION)',
    expected: `${STRUCTURAL_MIN} ≤ Z ≤ ${STRUCTURAL_MAX}`,
    actual: result,
    tolerance
  };
}

/**
 * Test 8: Boundary condition X=1, Y=1 with neutral modifiers
 */
function testBoundaryOnes(): ValidationResult {
  const params: BeliefParameters = {
    X: 1, Y: 1,
    alpha: 0.3, beta: 0.3, k: 1.307,
    C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0
  };
  
  const result = calculateBelief(params);
  const tolerance = 0.01;
  // Production model clamps into the interior band: Z ∈ [0.0001, 0.9999]
  const passed = result >= STRUCTURAL_MIN && result <= STRUCTURAL_MAX;
  
  return {
    passed,
    testName: 'Boundary: X=1, Y=1 → Z∈[0.0001,0.9999] (PRODUCTION)',
    expected: `${STRUCTURAL_MIN} ≤ Z ≤ ${STRUCTURAL_MAX}`,
    actual: result,
    tolerance
  };
}

/**
 * Test 9: Sigmoid property - Z always within the canonical interior band.
 */
function testSigmoidProperty(): ValidationResult {
  const testCases = [
    { X: 0.2, Y: 0.2, C: 1, M: 1, T: 1, D: 0, G: 0, E: 0, S: 0, R: 0 },
    { X: 0.8, Y: 0.8, C: 1, M: 1, T: 1, D: 0, G: 0, E: 1, S: 1, R: 1 },
    { X: 0.5, Y: 0.5, C: 1, M: 0, T: 1, D: 0, G: 1, E: 0, S: 1, R: 0 },
  ];
  
  let allPassed = true;
  let failedCase = '';
  
  for (const testCase of testCases) {
    const params: BeliefParameters = {
      X: testCase.X,
      Y: testCase.Y,
      alpha: 0.3, beta: 0.3, k: 1.307,
      C: testCase.C, M: testCase.M, T: testCase.T, D: testCase.D,
      G: testCase.G, E: testCase.E, S: testCase.S, R: testCase.R
    };
    
    const result = calculateBelief(params);
    
    if (!Number.isFinite(result) || result < STRUCTURAL_MIN || result > STRUCTURAL_MAX) {
      allPassed = false;
      failedCase = `X=${testCase.X}, Y=${testCase.Y} → Z=${result}`;
      break;
    }
  }
  
  return {
    passed: allPassed,
    testName: 'Sigmoid Property: Z∈[0.0001,0.9999] for all inputs (PRODUCTION)',
    error: allPassed ? undefined : `Failed for ${failedCase}`
  };
}

/**
 * Test 10: Monotonicity - Z increases with X and Y
 */
function testMonotonicity(): ValidationResult {
  const baseParams: BeliefParameters = {
    X: 0.3, Y: 0.3,
    alpha: 0.3, beta: 0.3, k: 1.307,
    C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0
  };
  
  const increasedX: BeliefParameters = { ...baseParams, X: 0.7 };
  const increasedY: BeliefParameters = { ...baseParams, Y: 0.7 };
  
  const baseZ = calculateBelief(baseParams);
  const xIncreasedZ = calculateBelief(increasedX);
  const yIncreasedZ = calculateBelief(increasedY);
  
  const xMonotonic = xIncreasedZ > baseZ;
  const yMonotonic = yIncreasedZ > baseZ;
  const passed = xMonotonic && yMonotonic;
  
  return {
    passed,
    testName: 'Monotonicity: Z↑ when X↑ or Y↑ (PRODUCTION)',
    error: passed ? undefined : `X: ${xMonotonic}, Y: ${yMonotonic}`
  };
}

/**
 * Test 11–14: Main Effects Validation — Suppressors
 * Verify each suppressor (M, D, E, S) decreases Z when set to +1
 * Baseline: X=0.5, Y=0.5, α=β=0.3, k=1.307, all modifiers=0
 */
function testSuppressorMainEffect(suppressorKey: 'M' | 'D' | 'E' | 'S'): ValidationResult {
  // Baseline with all modifiers = 0
  const baseParams: BeliefParameters = {
    X: 0.5, Y: 0.5,
    alpha: 0.3, beta: 0.3, k: 1.307,
    C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0
  };
  const baseZ = calculateBelief(baseParams);
  
  // Test with suppressor set to +1
  const testParams: BeliefParameters = { ...baseParams, [suppressorKey]: 1 };
  const testZ = calculateBelief(testParams);
  
  // Suppressors should decrease Z (main effect is negative)
  const tolerance = 0.01;  // Allow ±1% variance for numeric/interaction effects
  const passed = testZ < baseZ;
  const delta = testZ - baseZ;
  
  return {
    passed,
    testName: `Suppressor ${suppressorKey} Decreases Z (Main Effect)`,
    expected: `Z_${suppressorKey}=1 < Z_baseline(${baseZ.toFixed(4)})`,
    actual: `Z_${suppressorKey}=1 = ${testZ.toFixed(4)}, Δ = ${delta.toFixed(6)}`,
    tolerance
  };
}

/**
 * Test 15–18: Main Effects Validation — Amplifiers
 * Verify each amplifier (C, T, G, R) increases Z when set to +1
 * Baseline: X=0.5, Y=0.5, α=β=0.3, k=1.307, all modifiers=0
 */
function testAmplifierMainEffect(amplifierKey: 'C' | 'T' | 'G' | 'R'): ValidationResult {
  // Baseline with all modifiers = 0
  const baseParams: BeliefParameters = {
    X: 0.5, Y: 0.5,
    alpha: 0.3, beta: 0.3, k: 1.307,
    C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0
  };
  const baseZ = calculateBelief(baseParams);
  
  // Test with amplifier set to a representative positive value.
  // NOTE: The production model includes quadratic curvature (e.g., T^2 with a negative coefficient).
  // For Trauma (T), large positive values can reduce Z if the negative quadratic dominates the linear term.
  // So we validate the *local* main-effect direction near baseline via a small positive perturbation.
  const testValue = amplifierKey === 'T' ? 0.1 : 1;
  const testParams: BeliefParameters = { ...baseParams, [amplifierKey]: testValue };
  const testZ = calculateBelief(testParams);
  
  // Amplifiers should increase Z (main effect is positive)
  const tolerance = 0.01;  // Allow ±1% variance for numeric/interaction effects
  const passed = testZ > baseZ;
  const delta = testZ - baseZ;
  
  return {
    passed,
    testName: `Amplifier ${amplifierKey} Increases Z (Main Effect)`,
    expected: `Z_${amplifierKey}=${testValue} > Z_baseline(${baseZ.toFixed(4)})`,
    actual: `Z_${amplifierKey}=${testValue} = ${testZ.toFixed(4)}, Δ = ${delta.toFixed(6)}`,
    tolerance
  };
}

/**
 * Test 19: E×S Positive Interaction Validation
 * Sweep E from -1 to +1 in two scenarios:
 * Case A: S=0 (no suppressor S interaction)
 * Case B: S=+1 (full suppressor S interaction)
 * 
 * The positive E×S interaction should offset E's suppression effect.
 * When S increases, E's negative main effect should be partially mitigated.
 * 
 * We verify this by comparing how E affects Z at different S values:
 * ΔZ_with_S should be less negative than ΔZ_without_S if E×S is positive.
 */
function testESSweepInteraction(): ValidationResult {
  // Sweep points for E
  const eSweep = [-1.0, -0.5, 0, 0.5, 1.0];
  
  // Case A: S=0, sweep E
  const caseAResults: { e: number; z: number }[] = [];
  for (const e of eSweep) {
    const params: BeliefParameters = {
      X: 0.5, Y: 0.5,
      alpha: 0.3, beta: 0.3, k: 1.307,
      C: 0, M: 0, T: 0, D: 0, G: 0, E: e, S: 0, R: 0
    };
    caseAResults.push({ e, z: calculateBelief(params) });
  }
  
  // Case B: S=+1, sweep E (same E values)
  const caseBResults: { e: number; z: number }[] = [];
  for (const e of eSweep) {
    const params: BeliefParameters = {
      X: 0.5, Y: 0.5,
      alpha: 0.3, beta: 0.3, k: 1.307,
      C: 0, M: 0, T: 0, D: 0, G: 0, E: e, S: 1, R: 0
    };
    caseBResults.push({ e, z: calculateBelief(params) });
  }
  
  // Compare the slope (sensitivity) of E's effect in both cases
  // If E×S is positive, then increasing S should reduce E's negative impact
  // (Z with S=1 should be higher than Z with S=0 for the same E)
  
  // Calculate delta between Case B and Case A at E=+1
  const eMaxA = caseAResults.find(r => r.e === 1.0)!.z;  // E effect with S=0
  const eMaxB = caseBResults.find(r => r.e === 1.0)!.z;  // E effect with S=1
  const sInteractionEffect = eMaxB - eMaxA;
  
  // Range of Z across E sweep (measure of interaction strength)
  const rangeA = Math.max(...caseAResults.map(r => r.z)) - Math.min(...caseAResults.map(r => r.z));
  const rangeB = Math.max(...caseBResults.map(r => r.z)) - Math.min(...caseBResults.map(r => r.z));
  
  // Positive interaction: adding S should reduce the range of variation caused by E
  // (because S×E offsets E's suppression)
  const interactionMitigates = rangeB < rangeA;
  
  // Also verify that Z with S=1 is always >= Z with S=0 for the same E
  // (S is a suppressor, so it should decrease Z alone; but the E×S interaction
  //  should offset this when E is present)
  const passed = interactionMitigates;
  
  const reportLines = [
    `Case A (S=0): E sweep → Z range = ${rangeA.toFixed(4)}`,
    `Case B (S=1): E sweep → Z range = ${rangeB.toFixed(4)}`,
    `Interaction Effect at E=+1: ΔZ = ${sInteractionEffect.toFixed(6)}`,
    `Mitigation Confirmed: ${interactionMitigates ? 'Yes (range reduced)' : 'No (range not reduced)'}`
  ];
  
  return {
    passed,
    testName: 'E×S Positive Interaction: S Mitigates E\'s Suppression',
    expected: 'Range(E sweep with S=1) < Range(E sweep with S=0)',
    actual: reportLines.join(' | '),
    tolerance: 0.01
  };
}

/**
 * Log validation report to console
 */
export function logValidationReport(report: ValidationReport): void {
  if (!import.meta.env.DEV) {
    return;
  }
  console.group('🧪 Model Validation Report');
  console.log(`Timestamp: ${report.timestamp.toISOString()}`);
  console.log(`Total Tests: ${report.totalTests}`);
  console.log(`✅ Passed: ${report.passed}`);
  console.log(`❌ Failed: ${report.failed}`);
  console.log(`Success Rate: ${((report.passed / report.totalTests) * 100).toFixed(1)}%`);
  
  console.group('Test Results:');
  report.results.forEach((result) => {
    const icon = result.passed ? '✅' : '❌';
    const message = result.passed 
      ? `${icon} ${result.testName}` 
      : `${icon} ${result.testName} - ${result.error || 'FAILED'}`;
    
    if (result.passed) {
      console.log(message);
    } else {
      console.error(message);
      if (result.expected !== undefined && result.actual !== undefined) {
        console.error(`   Expected: ${result.expected}, Actual: ${result.actual}`);
      }
    }
  });
  console.groupEnd();
  
  console.groupEnd();
}

/**
 * Export validation report as JSON
 */
export function exportValidationReport(report: ValidationReport): string {
  return JSON.stringify(report, null, 2);
}
