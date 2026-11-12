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
    'abstract_screening_pack',
    'collinearity_diagnostics',
    'construct_item_availability',
    'construct_validity_invariance',
    'elasticity_profile',
    'journal_fit_targeting',
    'lockbox_holdout',
    'notation_glossary',
    'r_collinearity_case',
    'wvs_construct_audit',
  ],
  /** Named in source but never imported: a reader could mistake this for wired-in. */
  referencedOnly: [
    'c_dominance_sensitivity',
    'cv_country_out',
    'cv_kfold',
    'cv_rolling_origin',
    'data_code_provenance',
    'metrics_authoritative',
    'parameter_stability',
    'q1_submission_gate_report',
    'reviewer_red_team',
    'temporal_outlier_2006_sensitivity',
    'tier_b_stability_sweep',
  ],
} as const
