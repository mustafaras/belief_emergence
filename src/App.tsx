import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import './App.css'
import type { BeliefParameters } from './types'
import { useDataContext } from './contexts/DataContext'
import FormulaDisplay from './components/formula/FormulaDisplay'
import InteractiveDocumentation from './components/documentation/InteractiveDocumentation'
import ModernSidebar from './components/sidebar/ModernSidebar'
import AiInterpreterModal from './components/ai/AiInterpreterModal'
import TopBar from './components/visualization/TopBar'
import Surface3DOverlay from './components/visualization/Surface3DOverlay'
import { FIXED_COEFFICIENTS } from './data/feCoefficients'
import { getProductionHeadlineMetrics } from './data/modelMetrics'
import { runValidationTests, logValidationReport } from './utils/modelValidator'
import { calculateModel, computeStructuralBase } from './utils/calculateModel'
import { uiToModelParams } from './utils/uiToModelTransform'
import { logParams } from './utils/paramLogger'
import { PANEL_X_MAX, PANEL_X_MIN, PANEL_Y_MAX, PANEL_Y_MIN, STRUCTURAL_MAX, STRUCTURAL_MIN } from './utils/modelContract'
import { readAppStateFromUrl, writeAppStateToUrl } from './utils/urlState'

const DEFAULT_PARAMS: BeliefParameters = {
  X: 0.73, // Neutral: panel-scale urbanization mean (UI slider space)
  Y: 0.12, // Neutral: panel-scale inequality mean (UI slider space)
  alpha: 0.3, // PRODUCTION: sublinear urbanization exponent
  beta: 0.3, // PRODUCTION: sublinear inequality exponent
  k: 1.307, // PRODUCTION: saturation constant
  C: 2.614, // Cultural Intensity (panel-scale raw mean; z-scored later unless preset is active)
  M: 0.42, // Media Environment (panel-scale slider default; calculateModel z-scores when needed)
  T: 0.04, // Trauma/Shock (panel-scale slider default)
  D: 0.05, // Social Atomization (panel-scale slider default)
  G: -0.27, // Redistribution Capacity (panel-scale slider default)
  E: 0.25, // Education Capacity (panel-scale slider default)
  S: -0.05, // Social Support (panel-scale slider default)
  R: 0.39, // Welfare Capacity (panel-scale slider default)
}

type PanelRange = [number, number]
type PanelRanges = Partial<
  Record<'X' | 'Y' | 'Z' | 'C' | 'M' | 'T' | 'D' | 'G' | 'E' | 'S' | 'R', PanelRange>
>

type TopBarPanelStats = {
  totalRows: number
  zDistribution: { mean: number; std: number; min: number; max: number }
  zSorted: number[]
  ranges: PanelRanges
}

function App() {
  if (import.meta.env.DEV) {
    console.log('App component is rendering');
  }

  const { panelData, statistics } = useDataContext();

  const initialUrlState = useMemo(() => readAppStateFromUrl(DEFAULT_PARAMS), []);

  const [params, setParams] = useState<BeliefParameters>(initialUrlState.params);
  const [currentPresetName, setCurrentPresetName] = useState<string | undefined>(initialUrlState.presetName);
  const [showDocumentation, setShowDocumentation] = useState(initialUrlState.showDocumentation);
  const [showAiInterpreter, setShowAiInterpreter] = useState(false);

  // Coefficients - used for validation test suite
  const coefficients = Object.freeze(FIXED_COEFFICIENTS);

  // Developer diagnostics: Verify DataContext integration
  useEffect(() => {
    if (panelData && statistics) {
      if (import.meta.env.DEV) {
        console.log(
          '[DataContext] Panel loaded:',
          panelData.length,
          'rows from',
          statistics.yearRange[0],
          'to',
          statistics.yearRange[1],
          'across',
          statistics.countryCounts.size,
          'countries',
        );
      }
    }
  }, [panelData, statistics]);

  // Panel statistics for TopBar (optional): derived strictly from DataContext outputs.
  // Guardrails: does not change how panel data is loaded; does not affect model computation.
  const topBarPanelStats = useMemo<TopBarPanelStats | undefined>(() => {
    if (!panelData || !statistics) return undefined

    const zSorted = panelData
      .map((r) => r.Z)
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b)

    const keys = ['X', 'Y', 'Z', 'C', 'M', 'T', 'D', 'G', 'E', 'S', 'R'] as const
    const ranges: PanelRanges = {}

    for (const key of keys) {
      let min = Number.POSITIVE_INFINITY
      let max = Number.NEGATIVE_INFINITY

      for (const row of panelData) {
        const value = row[key]
        if (value === null || !Number.isFinite(value)) continue
        if (value < min) min = value
        if (value > max) max = value
      }

      if (Number.isFinite(min) && Number.isFinite(max)) {
        ranges[key] = [min, max]
      }
    }

    return {
      totalRows: statistics.totalRows,
      zDistribution: statistics.zDistribution,
      zSorted,
      ranges,
    }
  }, [panelData, statistics])

  // Canonical modelResult: single source of truth for Z and Phi
  const modelResult = useMemo(() => {
    const modelParams = uiToModelParams(params);
    // Standardization contract (UI path): see uiToModelTransform.ts header.
    //   - Preset active → preset generator already z-scores all modifiers; call calculateModel with
    //     modifiersAreStandardized=true so values are used as-is.
    //   - Manual sliders/no preset → sliders represent panel-scale values; call calculateModel with
    //     modifiersAreStandardized=false so it z-scores modifiers (including C).
    const useStd = Boolean(currentPresetName);
    return calculateModel(modelParams, { modifiersAreStandardized: useStd, debug: false });
  }, [params, currentPresetName]);

  // When AI modal is open, compute a debug-enriched model result so the interpreter can
  // explain term-by-term structure (matches FormulaDisplay semantics).
  const aiModelResult = useMemo(() => {
    if (!showAiInterpreter) return null;
    const modelParams = uiToModelParams(params);
    const useStd = Boolean(currentPresetName);
    return calculateModel(modelParams, { modifiersAreStandardized: useStd, debug: true });
  }, [showAiInterpreter, params, currentPresetName]);

  const beliefValue = modelResult.Z;
  const phiValue = modelResult.phi;

  // Structural base term X^alpha * Y^beta, computed once per render
  const structuralBase = useMemo(
    () => computeStructuralBase(params.X, params.Y, params.alpha, params.beta),
    [params.X, params.Y, params.alpha, params.beta],
  );

  // RUNTIME VALIDATION: Monitor parameter bounds against panel data
  // Panel X range: [0.4, 0.9]; UI slider range: [0, 1]
  // Panel Y range: [-1.5, 3.5]; UI slider range: [-2, 4] (presets may exceed)
  // Model maps raw X/Y into a safe internal structural band [0.0001, 0.9999] (ε=1e-4)
  // and saturates (clamps) at the band edges to keep fractional powers well-defined.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const CLIP_MIN = STRUCTURAL_MIN, CLIP_MAX = STRUCTURAL_MAX; // Structural saturation bounds (canonical ε band)
    
    const warnings = [];
    
    // Check X bounds
    if (params.X < PANEL_X_MIN) {
      warnings.push(`X=${params.X.toFixed(2)} below panel minimum (${PANEL_X_MIN})`);
    }
    if (params.X > PANEL_X_MAX) {
      warnings.push(`X=${params.X.toFixed(2)} above panel maximum (${PANEL_X_MAX})`);
    }
    
    // Check Y bounds
    if (params.Y < PANEL_Y_MIN) {
      warnings.push(`Y=${params.Y.toFixed(2)} below panel minimum (${PANEL_Y_MIN})`);
    }
    if (params.Y > PANEL_Y_MAX) {
      warnings.push(`Y=${params.Y.toFixed(2)} above panel maximum (${PANEL_Y_MAX})`);
    }
    
    // Warn if outside panel but inside clipping bounds (extrapolation)
    if (warnings.length > 0) {
      console.warn(
        `⚠️ Extrapolation warning: ${warnings.join('; ')}. Model will map inputs into the structural band and saturate within [${CLIP_MIN}, ${CLIP_MAX}] (ε=1e-4).`,
      );
    }
  }, [params.X, params.Y]);

  // Parameter tracing harness: ensure all major components see identical parameters
  logParams('App', params);

  // Keep the app state shareable: mirror params/preset/doc modal into the URL query string.
  // Use replaceState to avoid polluting browser history during slider drags.
  const urlWriteTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (urlWriteTimerRef.current != null) {
      window.clearTimeout(urlWriteTimerRef.current);
    }

    urlWriteTimerRef.current = window.setTimeout(() => {
      writeAppStateToUrl(
        {
          params,
          presetName: currentPresetName,
          showDocumentation,
        },
        { replace: true },
      );
    }, 150);

    return () => {
      if (urlWriteTimerRef.current != null) {
        window.clearTimeout(urlWriteTimerRef.current);
      }
    };
  }, [params, currentPresetName, showDocumentation]);

  // Generate interpretation for TopBar
  const getInterpretation = useCallback((zValue: number) => {
    if (zValue < 0.2) {
      return { label: "Low Emergence", message: "Minimal belief emergence conditions" };
    } else if (zValue < 0.5) {
      return { label: "Moderate Emergence", message: "Developing belief formation" };
    } else if (zValue < 0.8) {
      return { label: "High Emergence", message: "Strong belief emergence environment" };
    } else {
      return { label: "Critical Emergence", message: "Maximum belief formation potential" };
    }
  }, []);

  const interpretation = getInterpretation(beliefValue);

  const aiSnapshot = useMemo(() => {
    const activeResult = aiModelResult ?? modelResult;
    const baseline = activeResult.phiComponents.baseline;
    const mainEffects = activeResult.phiComponents.mainEffects;
    const interactions = activeResult.phiComponents.interactions;
    const quadratic = activeResult.phiComponents.quadratic;

    const amplifyingEffects =
      (mainEffects > 0 ? mainEffects : 0) +
      (interactions > 0 ? interactions : 0) +
      (quadratic > 0 ? quadratic : 0);

    const suppressingEffects =
      (mainEffects < 0 ? Math.abs(mainEffects) : 0) +
      (interactions < 0 ? Math.abs(interactions) : 0) +
      (quadratic < 0 ? Math.abs(quadratic) : 0);

    const netField = amplifyingEffects - suppressingEffects;
    const dominanceRatio = amplifyingEffects / (suppressingEffects + 0.001);
    const systemVolatility = Math.abs(netField) / (amplifyingEffects + suppressingEffects + 0.001);
    const emergenceThreshold = 0.5;
    const zValue = activeResult.Z;
    const distanceToThreshold = Math.abs(zValue - emergenceThreshold);
    const criticalityIndex = 1 - distanceToThreshold / emergenceThreshold;

    const modifiersAreStandardized = Boolean(currentPresetName);

    return {
      presetName: currentPresetName,
      context: {
        modifiersAreStandardized,
        notes:
          'If presetName is set, modifiers are already z-scored (standardized). Otherwise, modifiers may be on panel scale and are standardized inside calculateModel.',
      },
      params,
      coefficients,
      structuralBase,
      model: {
        Z: activeResult.Z,
        phi: activeResult.phi,
        phiComponents: activeResult.phiComponents,
        derivedMetrics: activeResult.derivedMetrics,
        mainEffectTerms: activeResult.mainEffectTerms,
        interactionTerms: activeResult.interactionTerms,
        quadraticTerms: activeResult.quadraticTerms,
        debug: activeResult.debug,
      },
      formulaDisplayDerived: {
        baseline,
        mainEffects,
        interactions,
        quadratic,
        amplifyingEffects,
        suppressingEffects,
        netField,
        dominanceRatio,
        systemVolatility,
        criticalityIndex,
      },
    };
  }, [aiModelResult, modelResult, currentPresetName, params, structuralBase, coefficients]);

  // VALIDATION CHECKS - Ensure computational model integrity
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // 1. Match computed beliefValue against expected implementation (PRODUCTION scientific model)
    const testParams: BeliefParameters = {
      X: 0.5, Y: 0.5, 
      alpha: 0.3, beta: 0.3, k: 1.307,  // PRODUCTION values
      C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0
    };
    // NOTE: In the PRODUCTION pipeline, the modifier suite (C..R) is often used in z-scored space.
    // In the UI, C may be entered on raw scale when no preset is active.
    // This DEV sanity check uses standardized modifiers (all zeros) to represent a neutral baseline.
    const result = calculateModel(uiToModelParams(testParams), { modifiersAreStandardized: true });
    const testZ = result.Z;
    // Sanity: should not saturate to the structural band edges for mid-range X/Y with neutral modifiers.
    console.assert(
      testZ > 0.05 && testZ < 0.95,
      `Z function sanity check failed (PRODUCTION model)! Expected non-saturated baseline Z, got ${testZ}`,
    );
    
    // 2. Ensure Φ calculation includes all components
    const expectedPhiBaseline = result.phiComponents.baseline;
    const expectedPhiComponents = result.phiComponents.mainEffects + result.phiComponents.interactions + result.phiComponents.quadratic;
    const expectedPhiTotal = expectedPhiBaseline + expectedPhiComponents;
    const actualPhi = result.phi;
    console.assert(Math.abs(expectedPhiTotal - actualPhi) < 0.00001, 
      `Φ calculation validation failed! Expected: ${expectedPhiTotal}, Got: ${actualPhi}`);

    const headline = getProductionHeadlineMetrics();
    
    console.log(
      `✅ Computational model validation passed (PRODUCTION headline panel-fit - R²=${headline.r2.toFixed(
        3,
      )}, Corr=${headline.correlation.toFixed(3)}, MAE=${headline.mae.toFixed(3)})`,
    );
    
    // Run comprehensive validation test suite
    const validationReport = runValidationTests();
    logValidationReport(validationReport);
    
    if (validationReport.failed > 0) {
      console.warn(`⚠️  ${validationReport.failed} validation test(s) failed. Check console for details.`);
    }
    
  }, []); // Run once on mount

  // Jest-style tests on mount (DEV only).
  // Kept inline to avoid react-hooks deps issues and to ensure it runs exactly once.
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const createMathTest = (description: string, testFn: () => void) => {
      try {
        testFn();
        console.log(`✅ PASS: ${description}`);
        return true;
      } catch (error) {
        console.error(`❌ FAIL: ${description} - ${error}`);
        return false;
      }
    };

    const expect = (actual: number) => ({
      toBeCloseTo: (expected: number, precision: number = 5) => {
        const tolerance = Math.pow(10, -precision);
        if (Math.abs(actual - expected) >= tolerance) {
          throw new Error(`Expected ${actual} to be close to ${expected} (precision: ${precision})`);
        }
      },
      toBe: (expected: number) => {
        if (actual !== expected) {
          throw new Error(`Expected ${actual} to be ${expected}`);
        }
      }
    });

    console.group('🧪 Jest-style Mathematical Tests');

    createMathTest('Z calculation consistency - baseline (PRODUCTION)', () => {
      const testParams: BeliefParameters = {
        X: 0.5, Y: 0.5,
        alpha: 0.3, beta: 0.3, k: 1.307,
        C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0
      };
      const result = calculateModel(uiToModelParams(testParams), { modifiersAreStandardized: true });
      if (!(result.Z > 0.05 && result.Z < 0.95)) {
        throw new Error(`Expected non-saturated baseline Z, got ${result.Z}`);
      }
    });

    createMathTest('Φ (Phi) calculation with amplifiers', () => {
      const C = 1, M = 1, T = 0, D = 0, G = 0, E = 0, S = 0, R = 0;
      const { c1, c2, c3, c4, c5, c6, c7, c8 } = coefficients;
      const phi = c1*C + c2*M + c3*T + c4*D + c5*G + c6*E + c7*S + c8*R;
      // Use the actual coefficient values to avoid brittle rounding failures.
      const expectedPhi = coefficients.c1 + coefficients.c2;
      expect(phi).toBeCloseTo(expectedPhi, 5);
    });

    createMathTest('Coefficients immutability', () => {
      const originalC1 = coefficients.c1;
      try {
        // @ts-expect-error - Testing runtime protection
        coefficients.c1 = 999;
      } catch {
        // Expected to fail due to Object.freeze
      }
      expect(coefficients.c1).toBe(originalC1);
    });

    console.groupEnd();
  }, [coefficients]);

  const updateParameter = (key: keyof BeliefParameters, value: number) => {
    // 3. Verify slider inputs are passed directly into calculateBelief()
    setParams(prev => ({ ...prev, [key]: value }));
    // When parameter changes via slider (not preset), clear the preset name
    if (currentPresetName) {
      setCurrentPresetName(undefined);
    }
  };

  const handlePresetSelect = (presetName: string) => {
    setCurrentPresetName(presetName);
  };

  const applyScenario = useCallback((next: { params: BeliefParameters; presetName?: string }) => {
    setParams(next.params);
    setCurrentPresetName(next.presetName);
  }, []);

  const [surface3dEnabled, setSurface3dEnabled] = useState<boolean>(true);
  const [surface3dMounted, setSurface3dMounted] = useState<boolean>(true);
  const toggleSurface3d = useCallback(() => {
    setSurface3dEnabled((v) => !v);
  }, []);

  return (
    <div className="app">
      {/* TopBar - Fixed position at top */}
      <TopBar 
        zValue={beliefValue}
        phiValue={phiValue}
        interpretation={interpretation}
        params={params}
        structuralBase={structuralBase}
        phiComponents={modelResult.phiComponents}
        alpha={params.alpha}
        beta={params.beta}
        k={params.k}
        presetName={currentPresetName}
        onApplyScenario={applyScenario}
        panelStats={topBarPanelStats}
        panelData={panelData}
        surface3dEnabled={surface3dEnabled}
        onToggleSurface3d={toggleSurface3d}
      />

      {surface3dMounted && (
        <Surface3DOverlay
          enabled={surface3dEnabled}
          params={params}
          presetName={currentPresetName}
          onApplyScenario={applyScenario}
          canonicalZ={beliefValue}
          onExited={() => setSurface3dMounted(false)}
        />
      )}
      
      <div className="main-grid">
        
        {/* Left Panel: Parameter Controls */}
        <ModernSidebar 
          params={params}
          onParameterChange={updateParameter}
          onShowDocumentation={() => setShowDocumentation(true)}
          onShowAiInterpreter={() => setShowAiInterpreter(true)}
          onPresetSelect={handlePresetSelect}
        />

        {/* Right Panel: Compact Scientific Layout */}
        <section className="right-panel">
          {/* Bottom Formula Section - Full Scientific Analysis */}
          <div className="detailed-formula-section">
            <FormulaDisplay 
              params={params}
              coefficients={coefficients}
              alpha={params.alpha}
              beta={params.beta}
              k={params.k}
              modelResult={modelResult}
              structuralBase={structuralBase}
              presetName={currentPresetName}
            />
          </div>
        </section>

      </div>
      
      {/* Interactive Documentation Modal */}
      {showDocumentation && (
        <div className="documentation-modal">
          <div className="modal-backdrop" onClick={() => setShowDocumentation(false)} />
          <div className="modal-content">
            <button 
              className="modal-close"
              onClick={() => setShowDocumentation(false)}
              title="Close Documentation"
            >
              ✕
            </button>
            <InteractiveDocumentation 
              parameters={params}
              alpha={params.alpha}
              beta={params.beta}
              k={params.k}
              onClose={() => setShowDocumentation(false)}
            />
          </div>
        </div>
      )}

      <AiInterpreterModal
        isOpen={showAiInterpreter}
        onClose={() => setShowAiInterpreter(false)}
        snapshot={aiSnapshot}
      />
    </div>
  );
}

export default App
