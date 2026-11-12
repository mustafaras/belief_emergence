/**
 * What each analysis artifact establishes.
 *
 * Hand-written because the artifacts do not carry a consistent description field: some
 * have `purpose`, some only a `verdict`, several have nothing. A description generated
 * from whichever key happened to exist would be accurate for ten artifacts and blank
 * for the rest, and the blank rows are precisely the ones a reader cannot evaluate.
 *
 * Keys are artifact basenames without `.json`. `EVIDENCE_INDEX` in
 * `src/data/evidenceArtifacts.ts` fails loudly if an artifact on disk has no entry here,
 * so adding a file cannot silently produce an undescribed row.
 */
export const ARTIFACT_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  abstract_screening_pack:
    'The selected title, subtitle, running head, keywords and journal shortlist, with the screened variants that lost.',
  c_dominance_sensitivity:
    'Whether the cultural-intensity channel adds anything once its shared-source overlap with Z is accounted for; its contribution is minimal and must be read with caution.',
  coefficient_fit:
    'The fitted structural and main-effect coefficients, with the panel they were fitted on and the row and country counts.',
  collinearity_ablation:
    'Whether the Tier C ordering survives removing covariates; it does not, so the reversal must not be reported as robust.',
  collinearity_diagnostics:
    'Variance inflation and condition number across the retained covariates, where a maximum VIF of 9.43 makes the affected coefficients associations under a fixed design rather than separately identified effects.',
  construct_item_availability:
    'Which configured items exist in the harmonised source per construct, which is what makes social support uncomputable rather than merely weak.',
  construct_prevalence:
    'How widely the measurement failure extends: how many configured constructs fail a routine reliability floor, and how much of the frame survives it.',
  construct_validity_invariance:
    'Coverage and slice stability for each construct on the current panel, including where invariance breaks down.',
  cv_country_out:
    'Leave-one-country-out cross-validation: refit and canonical metrics per fold, plus pooled aggregates.',
  cv_kfold:
    'Repeated grouped k-fold cross-validation with per-fold, per-repeat and aggregate refit metrics — the largest artifact in the set.',
  cv_rolling_origin:
    'Rolling-origin temporal validation, which tests whether the mapping holds forward in time rather than across countries.',
  data_code_provenance:
    'Provenance inventory for every data source and code artifact: licence, redistribution status, attribution and compliance risk.',
  elasticity_bound_sensitivity:
    'Whether the exponents sit at their lower bound because the bound is too tight or because the panel cannot identify them; relaxing the bound moves the fit, so they are driven toward zero rather than merely clipped.',
  elasticity_profile:
    'Profile likelihood over a grid of alpha: the loss rises monotonically, there is no interior optimum, and the parameter is therefore not identified on this panel.',
  failure_log:
    'Per-cell validation failures with their tiers, so a reader can see which observations the model could not reproduce.',
  functional_form_comparison:
    'Whether the bounded saturation form beats an ordinary linear regression on identical rows and folds, which it does on held-out R2.',
  gini_window_sensitivity:
    'Sample size as a function of how far a neighbouring year’s Gini may be borrowed when the exact year is missing, with ±5 years adopted.',
  journal_fit_targeting:
    'Each candidate journal against the manuscript’s major claims, with fit summaries and recommended primary targets.',
  lockbox_holdout:
    'The reserved-set protocol and its outcome, including how many cells were withheld and what the development reference achieved.',
  metrics_authoritative:
    'The headline fit statistics for the shipped model: n, R2, correlation, MAE, RMSE and bias, with the bias definition and scales.',
  model_complexity_support:
    'Parameters per tier against available support, the occupancy grid, and the boundary beyond which terms are treated as diagnostics rather than claims.',
  model_ladder_metrics:
    'The A/B/C model ladder with each tier’s metrics and the decision context for which tier carries which claim.',
  notation_glossary:
    'Machine-readable definitions of every symbol and regime used in the manuscript and supplement.',
  parameter_stability:
    'Sign consistency of each parameter across protocols and tiers, pooled, with the thresholds used to judge stability.',
  prediction_interval_coverage:
    'Empirical against nominal interval coverage by protocol and method, including where the intervals are severely under-covering.',
  q1_submission_gate_report:
    'The pre-submission gate: automated checks, their outcomes, and any blockers, with the overall verdict.',
  r_collinearity_case:
    'The decision to retain or drop the R channel given its VIF, with the in-sample and k-fold cost of dropping it, and the reasoning for the choice.',
  reviewer_red_team:
    'A hostile-but-fair reviewer simulation: high-risk criticisms, the artifact-backed rebuttal for each, and resolution status.',
  software_environment:
    'Exact interpreter and library versions used to produce the artifacts, so the pipeline can be reconstructed.',
  temporal_outlier_2006_sensitivity:
    'Whether a single year drives the aggregate pattern, by comparing full-panel and leave-one-year-out metrics.',
  tier_b_stability_sweep:
    'A sweep of Tier B parameter stability, flagging parameters that fall below the sign-consistency floor for exploratory demotion.',
  wvs_construct_audit:
    'Item-level reliability for every configured construct: items available, cells emitted and rejected, Cronbach’s alpha and unidimensionality, which is the evidence behind the finding that three of four fail.',
  zero_fill_sensitivity:
    'Whether the reported gap depends on the imputed zero cells, tested by deleting every row at the zero anchor and re-measuring.',
})
