export type NarrativeBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'equation'; latex: string; label?: string }
  | { kind: 'note'; text: string };

export type NarrativeTopic =
  | 'BeliefEquation'
  | 'CoreVariables'
  | 'Amplifiers'
  | 'Suppressors'
  | 'MathematicalAnalysis'
  | 'SystemDynamics';

export const REPORT_NARRATIVE: Record<NarrativeTopic, NarrativeBlock[]> = {
  BeliefEquation: [
    { kind: 'heading', level: 2, text: 'Belief Equation' },
    {
      kind: 'paragraph',
      text:
        'The model outputs a bounded index Z ∈ (0,1). It is a deterministic mapping from inputs into a saturating score. The pipeline is designed to be numerically stable and reproducible across runs.',
    },
    { kind: 'equation', label: 'Structural base', latex: 'b = X_{safe}^{\\alpha} \\cdot Y_{safe}^{\\beta}' },
    {
      kind: 'equation',
      label: 'Field term',
      latex:
        '\\Phi = \\phi_0 + \\sum_i \\phi_i m_i + \\sum_{i<j} \\phi_{ij} m_i m_j + \\sum_i \\phi_{ii} m_i^2',
    },
    { kind: 'equation', label: 'Exponentiated factor', latex: 'f = \\exp(\\operatorname{clamp}(\\Phi, -50, 50))' },
    { kind: 'equation', label: 'Numerator', latex: '\\text{num} = b \\cdot f' },
    { kind: 'equation', label: 'Saturation', latex: 'Z_{raw} = \\frac{\\text{num}}{\\text{num} + k}' },
    { kind: 'equation', label: 'Epsilon clamp', latex: 'Z = \\operatorname{clamp}(Z_{raw}, \\varepsilon, 1-\\varepsilon), \\varepsilon=10^{-4}' },
    {
      kind: 'note',
      text:
        'The clamp on Φ prevents overflow in exp(·). The epsilon clamp on Z prevents exact 0/1 endpoints, which avoids degeneracy in downstream diagnostics and keeps the mapping stable.',
    },
  ],

  CoreVariables: [
    { kind: 'heading', level: 2, text: 'Core Variables' },
    {
      kind: 'paragraph',
      text:
        'The structural component (X, Y) defines a baseline intensity, while the field term Φ modulates this baseline multiplicatively through exp(Φ).',
    },
    {
      kind: 'bullets',
      items: [
        'X: structural settlement proxy (mapped into a safe band before fractional powers).',
        'Y: structural inequality proxy (mapped into a safe band before fractional powers).',
        'α, β: elasticities controlling curvature of the structural base b = X_safe^α · Y_safe^β.',
        'k: saturation constant controlling how quickly Z approaches 1 as the numerator grows.',
        'Z: bounded index, not a probability model and not a causal estimator.',
      ],
    },
    {
      kind: 'note',
      text:
        'Because α and β apply after safety mapping, their effect is best understood as curvature in the safe structural domain rather than in raw units.',
    },
  ],

  Amplifiers: [
    { kind: 'heading', level: 2, text: 'Amplifiers' },
    {
      kind: 'paragraph',
      text:
        'Amplifiers are inputs and interactions that push Φ upward (positive net contribution). Because Φ enters inside exp(·), positive changes can have nonlinear impact when Φ is already high.',
    },
    {
      kind: 'bullets',
      items: [
        'Main effects: positive coefficients on modifiers increase Φ directly.',
        'Interactions: joint high values can increase Φ more than either alone.',
        'Quadratic terms: can create regime-like behavior (diminishing returns or acceleration).',
      ],
    },
    {
      kind: 'note',
      text:
        'The report decomposes Φ into baseline, main, interaction, and quadratic components, and also reports total amplifying vs suppressing contributions (Φ⁺ vs Φ⁻).',
    },
  ],

  Suppressors: [
    { kind: 'heading', level: 2, text: 'Suppressors' },
    {
      kind: 'paragraph',
      text:
        'Suppressors are inputs and interactions that push Φ downward (negative net contribution), attenuating the exponential factor and reducing Z for fixed structural conditions.',
    },
    {
      kind: 'bullets',
      items: [
        'Negative main effects: directly reduce Φ.',
        'Negative interactions: reduce Φ when certain combinations co-occur.',
        'Quadratic penalties: can cap growth or stabilize the system around moderate regimes.',
      ],
    },
    {
      kind: 'note',
      text:
        'Because Φ is clamped before exponentiation, extremely strong suppressors may saturate the exponential factor’s minimum within the clamp range.',
    },
  ],

  MathematicalAnalysis: [
    { kind: 'heading', level: 2, text: 'Mathematical Analysis' },
    {
      kind: 'paragraph',
      text:
        'Evaluation and fit are reported in two layers: (i) canonical headline panel-fit metrics packaged with this build, and (ii) optional in-session diagnostics computed from loaded panel rows. Training/optimizer summaries are reported separately and should not be treated as the headline.',
    },
    {
      kind: 'bullets',
      items: [
        'Headline metrics (R², correlation r, MAE, RMSE, bias) summarize prediction quality on the canonical panel-fit computation.',
        'Bias is defined as mean(observed − predicted); negative bias indicates over-prediction on average.',
        'Calibration bins: rows are sorted by predicted Z and partitioned into 10 equal-count bins; for each bin, the report summarizes mean predicted Z, mean observed Z, and observed IQR bands.',
      ],
    },
    {
      kind: 'note',
      text:
        'These diagnostics are descriptive. They help assess calibration and systematic error patterns, but they are not a substitute for uncertainty quantification or causal identification.',
    },
  ],

  SystemDynamics: [
    { kind: 'heading', level: 2, text: 'System Dynamics' },
    {
      kind: 'paragraph',
      text:
        'The combination of saturation (via k) and exponential modulation (via exp(Φ)) can induce regime-like behavior: small changes may have little effect in low-Φ states but can produce larger shifts when the exponential factor is strong.',
    },
    {
      kind: 'bullets',
      items: [
        'Sensitivities in this report are local derivatives around the current state (small-signal slopes).',
        'A high sensitivity to Φ indicates that changes in the field term can materially change Z at the current operating point.',
        'Information descriptors (entropy/complexity surrogates) are highest away from the endpoints and typically shrink near 0 or 1 due to saturation.',
      ],
    },
    {
      kind: 'note',
      text:
        'Interpretation is index-based: the model summarizes a state under a chosen functional form. It should not be read as a causal claim without external identification and measurement assumptions.',
    },
  ],
};

export const REPORT_REPRODUCIBILITY_APPENDIX: NarrativeBlock[] = [
  { kind: 'heading', level: 2, text: 'Appendix — Reproducibility' },
  {
    kind: 'paragraph',
    text:
      'This report is generated from the current application state. To reproduce the same results, use the share URL (which encodes the parameter vector) and ensure the same build and dataset are loaded.',
  },
  {
    kind: 'bullets',
    items: [
      'Open the share URL in a fresh browser session.',
      'Verify preset name (or manual mode) matches the report.',
      'If panel diagnostics are required, load the canonical panel dataset in this session.',
      'Re-export the PDF; results should match up to the timestamp.',
    ],
  },
  {
    kind: 'note',
    text:
      'Numerical safety notes: Φ is clamped before exponentiation and Z is epsilon-clamped away from 0 and 1 to ensure stable, deterministic reporting.',
  },
];
