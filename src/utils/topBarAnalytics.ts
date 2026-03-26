import {
  clamp01,
  clampToStructuralBand,
  normalizePanelXToStructural,
  normalizePanelYToStructural,
  STRUCTURAL_MAX,
  STRUCTURAL_MIN,
} from './modelContract';

export interface TopBarAnalyticsInput {
  zValue: number;
  phiValue: number;
  params: {
    X: number;
    Y: number;
    C: number;
    M: number;
    T: number;
    D: number;
    G: number;
    E: number;
    S: number;
    R: number;
  };
  structuralBase: number;
  phiComponents: {
    baseline: number;
    mainEffects: number;
    interactions: number;
    quadratic: number;
  };
  alpha: number;
  beta: number;
  k: number;
}

export interface TopBarAnalytics {
  exponentialFactor: number;

  effects: {
    amplifyingEffects: number;
    suppressingEffects: number;
    netEffect: number;
  };

  sensitivities: {
    structuralX: number;
    structuralY: number;
    phiInExpIsClamped: boolean;
    zSlope: number;
    dZ_dPhi: number;
    dZ_dX: number;
    dZ_dY: number;
    sensitivityNorm: number;
    structuralSensitivity: number;
    modifierSensitivity: number;
    mostSensitiveTo: 'Modifiers (Φ)' | 'Structural (X/Y)';
    progress: {
      dZ_dPhi: number;
      dZ_dX: number;
      dZ_dY: number;
      structuralX: number;
      structuralY: number;
      structuralSensitivity: number;
      modifierSensitivity: number;
      phiClamp: number;
    };
  };

  information: {
    zSafe01: number;
    localEntropyHz: number;
    localComplexity01: number;
    phiStrength01: number;
    netEffectStrength01: number;
    emergenceIndex: number;
    progress: {
      localEntropy: number;
      localComplexity: number;
      phiStrength: number;
      netEffectStrength: number;
    };
  };

  componentStats: {
    structuralMean: number;
    amplifierMean: number;
    suppressorMean: number;
  };
}

const toProgress01 = (magnitude: number): number => {
  const a = Math.abs(magnitude);
  return clamp01(a / (a + 1));
};

export function computeTopBarAnalytics(input: TopBarAnalyticsInput): TopBarAnalytics {
  const { zValue, phiValue, params, phiComponents, alpha, beta } = input;

  // Keep this derived term centralized so both UI and PDF can reference it.
  const PHI_EXP_CLAMP = 50;
  const phiForExp = Math.max(-PHI_EXP_CLAMP, Math.min(PHI_EXP_CLAMP, phiValue));
  const exponentialFactor = Math.exp(phiForExp);

  // Φ effects (deterministic; derived strictly from phiComponents)
  const mainTerms = phiComponents.mainEffects;
  const interactionTerms = phiComponents.interactions;
  const quadraticTerms = phiComponents.quadratic;

  const amplifyingEffects =
    (mainTerms > 0 ? mainTerms : 0) +
    (interactionTerms > 0 ? interactionTerms : 0) +
    (quadraticTerms > 0 ? quadraticTerms : 0);

  const suppressingEffects =
    (mainTerms < 0 ? Math.abs(mainTerms) : 0) +
    (interactionTerms < 0 ? Math.abs(interactionTerms) : 0) +
    (quadraticTerms < 0 ? Math.abs(quadraticTerms) : 0);

  const netEffect = amplifyingEffects - suppressingEffects;

  // Sensitivity Analysis (analytic; consistent with canonical Z form)
  // computeStructuralBase maps raw panel-like X/Y into the structural domain [0.0001, 0.9999].
  // Mirror that mapping here.
  const structuralX = normalizePanelXToStructural(params.X);
  const structuralY = normalizePanelYToStructural(params.Y);

  // Structural inputs are already mapped into [0.0001, 0.9999]; use the same epsilon
  // as our global contract to keep dZ/dX and dZ/dY numerically well-behaved.
  const xSafe = Math.max(structuralX, STRUCTURAL_MIN);
  const ySafe = Math.max(structuralY, STRUCTURAL_MIN);

  const phiInExpIsClamped = phiValue <= -50 || phiValue >= 50;
  const zSlope = zValue * (1 - zValue);

  const dZ_dPhi = phiInExpIsClamped ? 0 : zSlope;
  const dZ_dX = zSlope * (alpha / xSafe);
  const dZ_dY = zSlope * (beta / ySafe);

  const sensitivityNorm = Math.sqrt(dZ_dX * dZ_dX + dZ_dY * dZ_dY + dZ_dPhi * dZ_dPhi);
  const structuralSensitivity = Math.max(Math.abs(dZ_dX), Math.abs(dZ_dY));
  const modifierSensitivity = Math.abs(dZ_dPhi);
  const mostSensitiveTo = modifierSensitivity > structuralSensitivity ? 'Modifiers (Φ)' : 'Structural (X/Y)';

  // Emergence / information-style indicators (local / point-wise; deterministic)
  // These do NOT use panel distributions and should not be interpreted as inferential statistics.
  // Canonical interior band epsilon (matches training + UI contract): Z ∈ [0.0001, 0.9999].
  // This keeps entropy/log terms well-defined without inventing a separate epsilon.
  const zSafe01 = clampToStructuralBand(zValue);

  const localEntropyHz = -(zSafe01 * Math.log2(zSafe01) + (1 - zSafe01) * Math.log2(1 - zSafe01)); // in [0,1]
  const localComplexity01 = 4 * zSafe01 * (1 - zSafe01); // in [0,1]
  const phiStrength01 = Math.tanh(Math.abs(phiValue)); // in [0,1)
  const netEffectStrength01 = Math.tanh(Math.abs(netEffect)); // in [0,1)
  const emergenceIndex = (localEntropyHz + localComplexity01 + phiStrength01 + netEffectStrength01) / 4;

  // Component Analysis - show bounded, scale-safe averages for UI (0..1).
  // These are NOT inferential statistics; they just summarize current slider/input magnitudes.
  const yProgress = clamp01((params.Y - (-2)) / (4 - (-2))); // UI slider domain fallback

  const structuralMean = (clamp01(params.X) + yProgress) / 2;
  const amplifierMean =
    [params.C, params.M, params.T, params.D, params.G].reduce((sum, v) => sum + toProgress01(v), 0) / 5;
  const suppressorMean =
    [params.E, params.S, params.R].reduce((sum, v) => sum + toProgress01(v), 0) / 3;

  return {
    exponentialFactor,

    effects: {
      amplifyingEffects,
      suppressingEffects,
      netEffect
    },

    sensitivities: {
      structuralX,
      structuralY,
      phiInExpIsClamped,
      zSlope,
      dZ_dPhi,
      dZ_dX,
      dZ_dY,
      sensitivityNorm,
      structuralSensitivity,
      modifierSensitivity,
      mostSensitiveTo,
      progress: {
        dZ_dPhi: toProgress01(dZ_dPhi),
        dZ_dX: toProgress01(dZ_dX),
        dZ_dY: toProgress01(dZ_dY),
        structuralX: (() => {
          return clamp01((structuralX - STRUCTURAL_MIN) / (STRUCTURAL_MAX - STRUCTURAL_MIN));
        })(),
        structuralY: (() => {
          return clamp01((structuralY - STRUCTURAL_MIN) / (STRUCTURAL_MAX - STRUCTURAL_MIN));
        })(),
        structuralSensitivity: toProgress01(structuralSensitivity),
        modifierSensitivity: toProgress01(modifierSensitivity),
        phiClamp: phiInExpIsClamped ? 1 : 0
      }
    },

    information: {
      zSafe01,
      localEntropyHz,
      localComplexity01,
      phiStrength01,
      netEffectStrength01,
      emergenceIndex,
      progress: {
        localEntropy: clamp01(localEntropyHz),
        localComplexity: clamp01(localComplexity01),
        phiStrength: clamp01(phiStrength01),
        netEffectStrength: clamp01(netEffectStrength01)
      }
    },

    componentStats: {
      structuralMean,
      amplifierMean,
      suppressorMean
    }
  };
}
