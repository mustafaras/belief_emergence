/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by `npm run generate:evidence-consumption` from the real import statements
 * under `src/`. `npm run check:evidence-index` fails if this file disagrees with the
 * code, so the evidence index cannot claim an artifact is wired in when it is not.
 */
export const ARTIFACT_CONSUMPTION = {
  /** Imported somewhere under src/ — the artifact's values can reach the interface. */
  imported: [
    'coefficient_bootstrap',
    'coefficient_fit',
    'collinearity_ablation',
    'collinearity_diagnostics',
    'construct_item_availability',
    'construct_prevalence',
    'covariate_blocker_attribution',
    'cv_kfold',
    'elasticity_bound_sensitivity',
    'elasticity_profile',
    'failure_log',
    'functional_form_comparison',
    'gini_window_sensitivity',
    'lockbox_holdout',
    'metrics_authoritative',
    'model_ladder_metrics',
    'parameter_stability',
    'prediction_interval_coverage',
    'preset_country_alignment',
    'r_collinearity_case',
    'structural_window_sensitivity',
    'temporal_outlier_2006_sensitivity',
    'wvs_construct_audit',
    'zero_fill_sensitivity',
  ],
  /** Named in source but never imported: a reader could mistake this for wired-in. */
  referencedOnly: [
    'construct_validity_invariance',
    'cv_country_out',
  ],
} as const
