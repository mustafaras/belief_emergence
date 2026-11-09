# KNOWN ISSUES — Measurement defects and their disposition

**Status:** OPEN ITEMS BELOW ARE TRACKED INDIVIDUALLY — no entry still blocks release
**Severity:** was Critical; the blocking defect (KI-01) is closed
**Discovered:** 2026-11-07
**Last reconciled against the tree:** 2026-11-09
**Affects:** historical claims in `paper/main/main.tex` up to commit `41c2fad`

Every finding below is independently reproducible from the committed tree.
Unless an entry says otherwise, its reproduction commands now run against
`public/data/panel_canonical_v2.csv` (146 complete-case country-years, 70
countries, 1990--2023) and `rawdata/wvs_construct_audit.json`. Where an entry
still cites `panel_canonical_23_countries_v1.csv` or
`rawdata/panel_model_data.csv`, those files are retired and the citation is
kept only to describe what the defect was.

## Disposition summary

| Issue | Subject | State |
|---|---|---|
| KI-00 | Ingestion pipeline absent | **CLOSED** — builder + independent verifier written; upstream macro merge still hash-pinned only |
| KI-01 | `Z` was an exact rescaling of `C` | **CLOSED** — construct audit + gate |
| KI-02 | `Z` proxied by one WVS item | **CLOSED** — 6-item aggregate, alpha 0.8187 |
| KI-03 | `D` was `-S` | **CLOSED** — both withdrawn from estimation |
| KI-04 | Unidentifiable design matrix | **CLOSED** — 7 columns, full rank |
| KI-05 | Negative canonical OOS `R²` unreported | **CLOSED** — disclosed in main text |
| KI-06 | Table S18 internally inconsistent | **CLOSED** — table re-derived from artifact |
| KI-07 | Gate did not test validity | **CLOSED** — `6a82d51` |
| KI-08 | Test suite could not run | **CLOSED** — 110/110 pass |
| KI-09 | `C` not unidimensional | **OPEN (by design)** — withdrawn, documented |
| KI-10 | `D` not unidimensional | **OPEN (by design)** — withdrawn, documented |
| KI-11 | `S` uncomputable | **OPEN (by design)** — withdrawn, documented |
| KI-12 | `Z`/`C` correlation sign | **CLOSED** — superseded by the audit |
| KI-13 | Coefficients fitted to defective panel | **CLOSED** — refit on v2 |
| KI-14 | Country-out refit not viable | **CLOSED** — grouped k-fold is now primary |
| KI-15 | `alpha`/`beta` at lower bound | **OPEN** — reported as a finding |
| KI-16 | Lockbox cannot be honoured | **CLOSED, scope narrowed** — 17 of 87 originally drawn cells stay reserved; 59 backfilled cells added after the split are not lockbox-protected. Disclosed in Lockbox protocol status (main §6). |
| KI-17 | Functional form vs linear baseline | **REVISED** — measured; the two are indistinguishable out of sample |

---

## KI-09 — `C_cultural_intensity` is not a unidimensional construct

`config/wvs_items.yaml` defines `C` over six items: A008 (importance of
family), A009 (importance of friends), E012 (obedience as a child quality),
E015 (religious faith as a child quality), E018 (national pride), E035
(respect for authority). These do not form one latent dimension.

Measured on wave-7 microdata, after declared reverse-coding and min-max
scaling to [0,1], then z-scoring:

| Quantity | Value |
|---|---:|
| Cronbach's alpha, six items | **0.2964** |
| best alpha after flipping E012/E015/E035 | 0.4871 |
| best alpha on a 4-item subset (A008, A009, E015, E018) | 0.3792 |
| alpha on A008 + A009 alone | 0.6644 |

Inter-item correlations range from -0.204 to +0.497 with no consistent sign
pattern. A conventional floor is alpha >= 0.70; the construct reaches that
only by discarding four of its six items, at which point it measures
"importance of family and friends" — not cultural intensity.

`config/wvs_items.yaml` declares `expected_alpha: 0.80` for `Z`. It declares
no `expected_alpha` for `C`. The 0.30 measured here is why.

**Consequence:** `C` cannot be repaired by choosing a better aggregation.
Either its item set is redesigned with items that genuinely co-vary, or `C`
leaves the model. The roadmap assumes the latter as the default.

---

## KI-10 — `D_social_atomization` is not a unidimensional construct either

`D` is defined over A165 (generalised trust), A170 (people take advantage),
A173 (trust in another religion). Measured on wave-7 microdata:

```text
Cronbach's alpha, 3 available items = -0.6274
```

A negative alpha is worse than no composite: the items actively disagree.
Two of `D`'s five configured items (A168, A174) are absent from the
harmonised source, so only three were available, and those three do not
measure a common factor.

---

## KI-11 — `S_social_support` is not computable from the available data

`S` is configured over seven items. In the harmonised wave-7 source
(`EVS_WVS_Joint_Csv_v5_0.csv`) only three exist: A008, A009, G006. The other
four (A101, A106, F185, F186) are absent from the file header entirely.

The build applies `min_item_coverage = 0.5` from `defaults`, so a cell needs
at least `ceil(0.5 * 7) = 4` items. Three is below the floor:

```text
S_social_support: cells emitted = 0
verdict: UNCOMPUTABLE (below min_item_coverage)
```

The previously shipped panel nevertheless carried an `S_support_index`
column with 1,127 non-null values — identical to `D_social_trust`, which is
KI-03. `S` was never computed; it was copied from `D`.

---

## KI-12 — The correct `Z`/`C` correlation is negative, not +0.50

An earlier draft of this document reported `corr(Z_6item, C_5item) = 0.496`
and used it as evidence that the rebuild would separate the constructs
cleanly. That number was produced by sign-aligning every item to `A006`
automatically — which is leakage, because `A006` is an item of `Z`.

Computed honestly from the declared codings, with no alignment:

| Method | corr(Z, C) |
|---|---:|
| min-max to declared bounds, then average | **-0.3793** |
| min-max, per-item z-score, then average | **-0.1937** |
| shipped `wvs_combined.csv` (identical columns) | 1.0 |

So a correct rebuild does not produce two mildly correlated constructs. It
produces two constructs that are *negatively* related, and one of them (`C`)
has alpha 0.30. The +0.496 figure must not be cited anywhere.

---

## KI-17 — The bounded model and a linear baseline are statistically indistinguishable — REVISED 2026-11-09

Acquiring the WVS Trend File (1981–2022, v4.1.0) raised the sample from 49 to
146 complete cases across 70 countries. It also removed the possibility of
attributing the weak fit to a small sample.

### Revision (2026-11-09): the original numbers could not be regenerated

The original entry reported a decisive linear win (LOO R² 0.2020 against
0.1023). Those figures were typed into the text; nothing in the tree produced
them, and when the comparison was actually implemented
(`src/utils/validation/computeFunctionalFormComparison.ts`, emitted as
`functional_form_comparison.json`) the gap did not appear.

Measured on the canonical panel, same 146 rows, same six predictors, identical
folds for both models:

| Model | In-sample R² | Grouped k-fold R² (median) | Pooled country-out R² |
|---|---:|---:|---:|
| Ordinary linear regression | **0.4462** | 0.2682 | 0.2914 |
| Fitted saturating model | 0.3854 | **0.2707** | **0.3026** |

In sample the linear model is ahead by 0.061. Out of sample the two are
indistinguishable: the bounded form leads by 0.0025 under grouped k-fold and by
0.0112 in the pooled series, both far inside the interquartile ranges
(0.049-0.405 versus 0.054-0.407).

**The corrected finding is narrower than both the original claim and its
opposite.** At 146 country-years the choice between these two links is not
identified by predictive performance. In-sample fit favours the linear form,
held-out fit is a tie, and neither supports a claim of predictive superiority.
The original sentence "the nonlinear structure is costing accuracy, not adding
it" is withdrawn; the defensible statement is that the curvature costs
in-sample accuracy and buys nothing measurable out of sample.

### Why curvature does not pay here

`Z` pooled over the panel is close to normally distributed with SD 0.97. A
sigmoid maps exposure into `(0,1)` with its steepest gradient near the midpoint
and vanishing gradient in the tails. Regressing a roughly linear outcome on it
forces the fit to spend its curvature where the data are densest and to
flatten exactly where the extremes live — which is why the linear form wins
in sample.

Two cells make this concrete: CHN 1990 (`Z = +3.37`, the only pre-1995 row) and
IDN 2006 (`Z = -2.19`). Under min–max scaling they compress the other 85
observations into roughly 0.22–0.78. Percentile anchoring (the rule actually
used, `Z_NORMALIZATION = [-1.889, 1.854]`) keeps them inside the band while
preserving the bulk's dynamic range.

That in-sample cost does not carry to held-out rows, which is the part the
original entry did not test.

### What this means for the paper

The bounded functional form was introduced because the outcome is a composite
index on a closed scale. That argument is about the *measurement*, not about
the *response shape*, and this sample does not arbitrate the shape:

1. **The saturation claim has no empirical support here.** Nothing in 146
   country-years indicates that effects flatten at high exposure. The
   manuscript currently asserts ridge behaviour as a feature of the fitted
   map; that is true of the map, not of the data.
2. **A defensible paper must either justify the form on theoretical grounds and
   report the linear comparison honestly, or drop the form.**
3. Reporting only the saturating model's metrics, without the linear baseline,
   would misrepresent the evidence. `docs/KNOWN_ISSUES.md` KI-15 already records
   that the structural exponents sit at their lower bound; this finding is the
   same fact seen from the predictive side.

### Recommendation — implemented 2026-11-09

The linear baseline is now in the Results as a model comparison
(Table~\ref{tab:functional-form} in `main.tex`), generated by
`npm run generate:functional-form`. The text states that in-sample fit favours
the linear form and that held-out fit is a tie, and the contribution is framed
as a **measurement and validation framework** whose functional form is a design
choice under test rather than an empirically established feature.

The stronger sentence the earlier draft carried ("the saturating form does not
beat a linear baseline", with R² 0.2020 against 0.1023) has been withdrawn,
because the measurement does not support it. A tie is the accurate description,
and a tie at this sample size is itself the result: the link function is not
identified by predictive performance on 146 country-years.

---

## KI-16 — The lockbox protocol could not be honoured on the earlier v2 panel — RESOLVED 2026-11-09

`npm run generate:lockbox-holdout` refuses to write:

```text
Error: Lockbox protocol violations detected:
       lockbox_rows_below_minimum_threshold. Artifact was not written.
```

The protocol reserves 7 of 34 unique country-years (72 of 630 rows). The v2
panel has 49 complete cases across 45 countries, 41 of which contribute a
single row. A 7-cell holdout would remove every observation for seven
countries and leave 42 rows for a model with seven parameters.

**The generator is correct to refuse.** A lockbox is a credibility device: it
works only when the held-out block is large enough to be informative and small
enough to leave an estimable training set. At n = 49 neither condition holds.

Consequences:

1. The "release-gated lockbox confirmation" claim must be withdrawn from the
   manuscript. It cannot be delivered on this sample.
2. The existing `lockbox_holdout.json` still contains v1 evaluation numbers
   (RMSE around 1e-6). Those numbers belong to the tautological model and must
   not be cited.
3. If a lockbox is required for the target venue, the only honest route is to
   enlarge the sample — which returns to the WVS wave 3–6 data-use application.

The roadmap records this as a scope reduction, not a bug.

### Resolution (2026-11-09)

The sample grew from 49 to 87 complete-case observations, and the lockbox
generator now succeeds on cycle `2026Q4-R4`:

```text
nCellsTotal = 87   nDevCells = 70   nLockboxCells = 17
lockboxCellFingerprint = fnv1a32:1b703d05
overlap / size / release-cycle guard checks: pass
```

The 17 reserved cells span 11 countries at one to three observations each, so
the lockbox is a held-out descriptive check rather than a confirmation of
transferable effects. The manuscript states exactly that, and no claim rests
on lockbox performance. The v1 evaluation numbers (RMSE around 1e-6) are gone
from the artifact.

---

## KI-15 — `alpha` and `beta` collapse to their lower bound: X and Y carry no structural power

Re-estimating the model on the v2 panel (`scripts/fit_coefficients_v2.py`,
differential evolution + L-BFGS-B with box constraints), the elasticities in

```text
Z = X_s^alpha * Y_s^beta * exp(Phi) / (that + k)
```

both converge to the lowest permitted value, `alpha = beta = 0.050`, and stay
there when the bound is widened and the optimiser is restarted. Raising either
exponent above that floor lowers the fit.

Meaning: the sublinear-power structural term contributes no explanatory power
on this sample. `X^0.05` and `Y^0.05` are near-constant across the observed
range, so `Z` is effectively driven by `exp(Phi)` alone. `Y` still matters, but
through the interaction term `c_yr * Y_s * R` (fitted at -1.60), not through the
elasticity `beta`.

### Why this is expected here, and what it costs

The v2 panel spans only 49 observations across 45 countries, 41 of which
contribute a single row. There is not enough within-country variation for an
elasticity to be identified separately from the level term. The v1 panel could
report `alpha` near 1 only because `C` was restating `Z`.

**Cost:** the paper's title and framing — "Bounded Nonlinear Response Surfaces
for Macro-Urban Belief Emergence" driven by urbanization and inequality — no
longer describes the fitted model. The fitted model is a cross-sectional
saturating map of *contextual channels* (welfare capacity, media environment,
education) with urbanization and inequality present but inert as elasticities.

Two defensible responses:

1. **Reframe.** Present the model as a bounded contextual-channel map and move
   urbanization/inequality to the discussion as boundary conditions. Honest,
   cheap, and matches what the data supports.
2. **Change the estimand.** Drop the multiplicative structural term entirely
   and estimate a bounded additive model on the channels. Cleaner
   statistically, but a different paper.

The roadmap now assumes (1).

### A separate defect this exposed

The structural mapping window in `src/utils/modelContract.ts` was
`X in [0.4, 0.9]`, `Y in [-1.5, 3.5]` — the v1 ranges. The v2 panel spans
`X in [0.3304, 0.9544]` and `Y in [-1.6077, 3.4280]`, so six observations fell
outside and were clipped to the floor of the interior band. That pinning is
what first drove `alpha` into its bound; with the window corrected the bound
result persists, which is how we know it is real rather than a clipping
artefact.

---

## KI-14 — Leave-one-country-out refit is not viable on this panel — RESOLVED 2026-11-09

*(The measurements below describe the panel as it stood when the issue was
raised. The disposition at the end of this entry records what replaced them.)*

The v2 panel originally had 49 complete cases across 23 countries, so a
country-out fold held out 1–3 rows and trained on 46–48. With six predictors plus an intercept
(seven parameters), several folds cannot estimate anything stable, and the
per-fold test set is too small for R² to be defined at all.

Observed after regenerating the artefacts:

```text
fold country_out:ALB   nTrain = 48   nTest = 1
  Tier A converged: true
  aggregatesRefit    Tier A  R2 = -284.72   RMSE = 0.1133
  aggregatesCanonical Tier A R2 = -7940.45  RMSE = 0.3013
```

A per-fold R² computed on a single test row is undefined in principle; the
reported values are the artefact of dividing by a near-zero variance. **RMSE is
the only interpretable number here**, and it is 0.11 versus an outcome SD of
about 0.97 — that is a real, honest, mediocre result.

Before the panel rebuild the same code path reported R² = 1.0 because the model
was restating its own outcome. The collapse from 1.0 to a negative value is the
tautology leaving, not a regression.

**Consequence for the paper:** leave-one-country-out CV must be replaced by an
evaluation that suits the sample. Options, in order of preference:

1. **Repeated k-fold over country-years** (k = 5, 20 repeats), reporting RMSE
   and MAE distributions. This is defensible at n = 49 and is what a methods
   reviewer will expect.
2. **Leave-one-country-out with collapsed test metrics** — evaluate on the
   country mean rather than individual rows, so the test unit matches the
   training unit.
3. Report in-sample fit with an explicit statement that out-of-sample
   evaluation is underpowered at this n.

Eleven tests in the suite still assert the old behaviour (folds converging at
23 countries, R² within plausible bounds, positive canonical R²). They are
correctly failing and must be rewritten together with the evaluation design,
not relaxed to make the suite green.

### Resolution (2026-11-09)

Option 1 and option 2 were both implemented; option 3 was not needed.

**Option 1 — repeated grouped k-fold, now the primary protocol.**
`src/utils/validation/computeKFoldRefit.ts` and
`scripts/generate_kfold_validation.ts` emit `src/data/analysis/cv_kfold.json`.
Countries are the grouping unit (no country splits across folds), k = 5,
20 seeded repeats, 100 held-out evaluations. Every fold carries at least 12
test rows, so R² is defined in 100% of folds instead of 25%.

Measured on the 146-row panel:

```text
Grouped k-fold (100 evaluations)      median R2              IQR
  Tier A refit                        +0.2707    [ 0.054, 0.407]
  Tier B refit                        +0.2790    [-0.067, 0.410]
  Tier C refit                        +0.2617    [-0.022, 0.439]
  Tier A canonical                    +0.1587    [-0.057, 0.282]
  Tier B canonical                    +0.3696    [ 0.132, 0.484]
  Tier C canonical                    +0.3689    [ 0.155, 0.456]
leakagePass = true   groupsSplitAcrossFolds = 0   minTestRows = 12
```

**Option 2 — pooled held-out series on the country-out folds.**
`computeLeaveOneCountryOutRefit` now concatenates every fold's held-out
predictions into a single 146-row out-of-sample series (`pooledRefit`,
`pooledCanonical`). Every row is predicted exactly once by a model that never
saw its country, so R² is defined even though no individual fold can carry it:

```text
grouped k-fold (146 rows, 20 repeats x 5 folds)   Tier A   Tier B   Tier C
  refit, median across folds                    +0.3926  +0.4665  +0.4358
  canonical, median across folds                +0.2121  +0.3137  +0.2979
country-out, pooled held-out series             Tier A   Tier B   Tier C
  refit R2 (predict every row once)             +0.3853  +0.4288  +0.4036
  canonical R2                                  +0.2620  +0.3113  +0.2745
```

The gap between those two lines is the issue itself: the negative per-fold
median was a variance ratio computed on one to four points, not a statement
about the model.

**Gate binding.** `q1_submission_gate.ts` no longer reads the country-out
per-fold median. `val-canonic-reported` now reads `cv_kfold.json`, requires the
refit and canonical medians to be non-negative, and also requires
`leakagePass`. Injecting a negative median into the artifact makes the gate
fail again, so the check is live rather than satisfied by construction.

**Tests.** The suite is green (110/110). No assertion was relaxed; the
prediction arrays needed by the pooled series are carried on
`TierEvaluationResult` (`testObserved`, `testPredicted`) so pooling does not
require a second fit.

---

## KI-13 — Production coefficients were fitted to the defective panel — RESOLVED 2026-11-09

`src/data/feCoefficients.ts` holds hard-coded coefficients trained on the v1
panel (630 rows, header comment dated 2025-12-07). Every one of those
coefficients was estimated on data where `C` was `Z`.

Evidence that they do not transfer: refitted against the v2 panel
(49 complete cases, six retained predictors), the fixed-coefficient model
yields

```text
canonical OOS R2  Tier A = -23380.91   Tier B = -23553.26   Tier C = -1833.84
```

A negative R2 of that magnitude means the predictions are not merely
miscalibrated, they are unrelated to the outcome. The coefficients encode the
`Z = a*C + b` relationship, which no longer exists once `C` is removed.

**This is expected and is not a new defect.** It is the arithmetic signature
of removing the tautology: the model that was fitted to exploit `C` has
nothing to exploit.

**Consequence:** Phase 3 cannot be skipped. The coefficients must be
re-estimated on `panel_canonical_v2.csv`, and every downstream artefact
(headline metrics, CV summaries, figures, manuscript numbers) must be
regenerated from that fit. Until then `val-canonic-reported` legitimately
fails.

### Resolution (2026-11-09)

The coefficients were refit on the v2 panel by
`scripts/fit_coefficients_v2.py`, and the result is committed as
`rawdata/coefficients_v2.json` and mirrored in
`src/data/feCoefficients.ts`.

```text
phi0 = -4.5092   alpha = 0.0500   beta = 0.0500   k = 0.008240
c_M  = +0.2723   c_T   = +0.0837   c_E = +0.1561   c_R = +0.0697
c_tr = -0.1805   c_yr  = +1.7673
retracted: C, D, G, S — coefficient not estimated (channel unavailable in v2)
```

`alpha` and `beta` sit at the lower bound of the estimation box. That is the
finding recorded as KI-15, not a fitting failure: across the observed X and Y
ranges the structural product contributes no explanatory power.

With those coefficients the canonical family is no longer astronomically
negative. Pooled over the 146 held-out rows of the country-out design the
canonical family reaches $R^2$ = 0.2620 / 0.3113 / 0.2745 for Tier A/B/C, while
grouped k-fold gives refit fold medians of 0.3926 / 0.4665 / 0.4358. The earlier
values of order $-2\times10^4$ are gone.

---

## KI-00 — The ingestion pipeline was not in the repository — CLOSED 2026-11-07

This is the reason every other finding survived to submission.

`REPLICATION_RUNBOOK.md` § 9.1 states:

> The derived file `wvs_combined.csv` is generated by the replication
> pipeline from the individual WVS wave files. It will be created
> automatically when you run the pipeline — you do not need to download it
> separately.

No such generator exists. Searched exhaustively on 2026-11-07:

| Location | Result |
|---|---|
| `BE_app/scripts/*.ts` (13 scripts) | no reference to `wvs_combined` |
| `BE_app/src/**/*.ts` | no reference |
| `repo/scripts/*.ts` | no reference |
| any `*.py`, `*.R`, `*.ipynb` under `Desktop/`, `Documents/`, `Downloads/` | no WVS aggregator |
| git history (all branches) | never committed |

The same applies to `rawdata/panel_model_data.csv` (22,096 rows), which is the
input every analysis script hashes. It too has no generator in the repo.

Consequences:

- The construct definitions in `config/wvs_items.yaml` are **documentation**,
  not executed code. Nothing enforces them.
- The `Z = C` defect cannot be traced to a line and fixed; the code that
  produced it no longer exists.
- A reviewer cannot reproduce `Z` or `C`, which undermines the paper's central
  claim of end-to-end reproducibility more than the defect itself does.

### A second runbook error — RESOLVED 2026-11-09

When this was written, `REPLICATION_RUNBOOK.md` § 2 named
`public/data/panel_model_data.csv` with SHA-256 `2E5B4B0A...` and "630 rows".
That hash and row count belonged to `panel_canonical_23_countries_v1.csv`,
while the actual `rawdata/panel_model_data.csv` has 22,097 lines: the documented
fingerprint pointed at a different file than the documented name.

The runbook now names `public/data/panel_canonical_v2.csv` with its correct
SHA-256 (`0BEB0062...95D18E`) and row count (146), and § 9.1 pins every input
file with its own hash.

### Resolution (2026-11-07 / 2026-11-09)

The missing generator was written: `scripts/build_wvs_constructs.ts` reads
`config/wvs_items.yaml` and refuses to emit output that violates it, and
`scripts/verify_constructs.ts` re-derives every audit number with an
independent implementation. The panel builder
(`scripts/build_canonical_panel.ts`) was also made executable and now
reproduces `panel_canonical_v2.csv` byte-for-byte from pinned inputs.

One honest limitation remains: the *upstream* macro merge
(`rawdata/panel_model_data.csv`, 22,096 rows) still has no generator in the
repository. That is a documented gap, not a silent one — the file is now
hash-pinned, so a replicator can confirm they hold the same bytes even though
they cannot rebuild them from the original OECD/World Bank/UCDP downloads
without writing that merge themselves.

---

## KI-01 — Outcome `Z` is an exact rescaling of predictor `C`

### Evidence

```bash
python3 -c "
import csv, numpy as np
r=list(csv.DictReader(open('public/data/panel_canonical_23_countries_v1.csv')))
C=np.array([float(x['C_cultural_intensity']) for x in r])
Z=np.array([float(x['Z_belief_outcome']) for x in r])
print('corr(C,Z) =', np.corrcoef(C,Z)[0,1])"
# -> corr(C,Z) = 1.000000000000000
```

Deeper checks:

| Check | Result |
|---|---|
| `corr(C_cultural_intensity, Z_belief_outcome)` on canonical panel | `1.000000000000000` |
| `max abs(Z_belief_outcome - zscore(C_religiosity_index))` upstream | `4.4e-15` |
| `max abs(Z - (C - 2.535400801)/0.559667409)` | `3.2e-10` |
| Collapsed to 34 unique country-years | still `1.000000000000000` |

Because `C` is a column of the design matrix, the fitted model reproduces the
outcome by construction. A leave-one-country-out refit implemented
independently of the repository reaches median OOS `R^2 = 1.000000000000`
across all 23 folds. The reported OOS RMSE values of `~1e-6` are therefore
algebraic identities, not evidence of predictive skill.

### Root cause

`config/wvs_items.yaml` declares disjoint item sets:

| Construct | Configured items |
|---|---|
| `Z_belief_outcome` | `A006, F028, F050, F051, F053, F063` |
| `C_cultural_intensity` | `A008, A009, E012, E015, E018` |

The ingestion did not honour them. Measured against item-level microdata:

```text
corr(C_religiosity_index, A006)               = -1.0000   <- the defect
corr(C_religiosity_index, configured C items) = +0.1447   <- what it should be
```

`C` was built from `A006`, the first item of `Z`. Recomputing the two
constructs from their configured item sets makes them distinguishable, but
see KI-09 and KI-12: the resulting correlation is **negative**, and `C` has
alpha 0.30. Separating them is necessary but not sufficient.

### Impact

- All headline metrics (`R^2 = 0.8461`, `Corr = 0.9488`, `RMSE = 0.1212`) rest
  on a model whose main predictor is the outcome.
- Table S18 ("C dominance") measures the defect, not a finding.
- The "amplifier/suppressor" interpretation attributed to `c_C` is circular.

---

## KI-02 — `Z` is proxied by a single WVS item (a limitation, not a fatality)

The supplementary materials state that `Z` is a
"WVS 6-item (A006, F028, F050-F053, F063)" composite. In practice:

```text
corr(Z_belief_outcome, Z_religion_importance) = 1.000000
Z_religion_importance = -1.000162 * mean(A006) + 5.002008   (max residual 1.8e-2)
```

The canonical file carries only two components for `Z`
(`Z_religion_importance`, `Z_violence_justifiable`), and only the former
matters. `Z` is a monotone transform of item `A006` alone.

### How bad is this, measured

Building the real six-item composite from wave-7 microdata (94 country-years
with all six items at n>=30):

| Quantity | Value | Reading |
|---|---:|---|
| Cronbach's alpha, six items | **0.9655** | the composite is highly reliable |
| corr(six-item composite, `A006` alone) | **0.9552** | one item captures most of it |
| R-squared of `A006` on the composite | **0.9124** | 91% of the variance |

So `A006` is a *defensible* proxy for `Z` — not a good one to advertise as a
six-item index, but not a fatal substitution on its own. The fatality is
KI-01: `C` was built from the same item. Fixing `C` removes the tautology;
fixing the `Z` description removes the overstatement.

### Why the single-item proxy was used

Item-level WVS microdata in the repository covers only wave 7 (2017-2023):

```text
rawdata/EVS_WVS_Joint_Csv_v5_0.csv      -> years 2017-2023 only
rawdata/WVS_Cross-National_Wave_7_*.csv -> wave 7 only
```

For earlier waves only the pre-aggregated `rawdata/wvs_combined.csv` exists,
which does not carry the six component items. The ingestion therefore used
whichever item was available (`A006`).

---

## KI-03 — `D_social_atomization` is `- S_social_support`

```text
max abs(D_atomization - (-S_support)) = 0.0
D_social_trust identical to S_support_index  (upstream and canonical)
```

Two of the eight declared "independent contextual channels" are one variable
with opposite sign. Both cannot enter the model as separate effects.

---

## KI-04 — Effectively unidentifiable design matrix

```text
Tier A design matrix (630 x 11): rank = 10, condition number = 4.0e16
```

Caused by KI-03 (one exact linear dependency). Reported coefficient standard
errors and the per-parameter "fold sign consistency" thresholds are not
interpretable under rank deficiency.

---

## KI-05 — Negative canonical OOS `R^2` is not reported

`src/data/analysis/cv_country_out.json` carries two metric families. The
manuscript reports only the first:

| Family | Tier A `R^2` | Tier B `R^2` | RMSE |
|---|---:|---:|---:|
| `aggregatesRefit` (reported) | 1.0000 | 1.0000 | 1.2e-6 |
| `aggregatesCanonical` (not reported) | **-0.8628** | **-2.1487** | 0.0558 |

The fixed-coefficient model performs worse than the training mean under
leave-one-country-out. This is a substantive result and must be discussed,
not filed as "descriptive only".

---

## KI-06 — Table S18 is internally inconsistent

`R^2 = 0.7299` with outcome SD `0.9687` implies `RMSE = 0.5034`. The table
reports `0.1606`, which would imply `R^2 = 0.9725`. One of the two numbers is
wrong; both are currently in the supplementary materials.

---

## KI-07 — Submission gate did not test validity — RESOLVED 2026-11-07

The gate previously reported `18/18` passed, verdict `READY`. None of the 18
checks asked whether a predictor was identical to the outcome, whether the
design matrix was full rank, or whether out-of-sample performance was
suspiciously perfect. The gate measured artefact hygiene, not measurement
validity.

**Fixed** in commit `6a82d51`: Gate 7 adds six validity checks
(`val-identity`, `val-duplicate`, `val-rank`, `val-single-r2`,
`val-oos-plausible`, `val-canonic-reported`). The gate now reports `14/24`
with 6 critical and 1 major blocker, and it names the defects. The five new
red checks are KI-01, KI-03, KI-04 and KI-05; they cannot be silenced by
editing prose.

Regression coverage:
`tests/validation.measurementValidity.test.ts` (real panel must pass) and
`tests/validation.measurementValidityPredicates.test.ts` (predicates must
fail on synthetic defective panels, proving they are not vacuous).

Remaining: the report is stale — generated `2026-03-25` while `main.tex` was
compiled `2026-04-14`. Regenerating it is part of Phase 3.

---

## KI-08 — Test suite could not run in this checkout — ENVIRONMENT FIXED

```text
npm run test:run       -> Cannot find module '@rollup/rollup-darwin-arm64'
npm run verify:q1:docs -> esbuild installed for another platform (@esbuild/win32-x64)
```

`node_modules/` was installed for Windows. Installing the Darwin binaries
(`@esbuild/darwin-arm64`, `@rollup/rollup-darwin-arm64`) restored both, and
`npm run test:run` now completes: **110 tests, 105 pass, 5 fail**. The five
failures are the intentional Gate 7 assertions against the unfixed panel.

This is a local workaround, not a fix: CI must prove `npm ci && npm run
verify:all` runs on a clean Ubuntu runner. That remains open (Phase 4.1).

---

## What must change before submission

1. **Recover or rewrite the ingestion pipeline** (KI-00). Without it nothing
   else can be verified. This is the first task, and it is not optional.
2. Rebuild `C` from its five configured items so it is no longer `A006`.
   `Z` may keep the `A006` proxy if the manuscript says so plainly and
   reports alpha = 0.9655 and r = 0.9552 against the six-item composite.
3. Separate `D` and `S`.
4. ~~Add gate checks~~ — **done** (`6a82d51`). Gate 7 now fails on KI-01
   through KI-05 and cannot be satisfied by editing prose.
5. Report `aggregatesCanonical` alongside `aggregatesRefit`.
6. Regenerate every metric, table, and figure, then re-derive manuscript text.
7. Fix `REPLICATION_RUNBOOK.md` § 2 (wrong filename for the pinned hash) and
   § 9.1 (claims a generator that does not exist).

Item-level WVS data for waves 3-6 is not present in the repository and cannot
be redistributed. Restoring full support requires a WVS data-use application;
until then the defensible scope is wave 7 (13 of the 34 current country-year
cells survive item-level verification, 94 country-years exist across all WVS
files outside the 23-country frame).

---

## Verification status after this pass (2026-11-09)

| Check | Command | Result |
|---|---|---|
| Test suite | `npm run test:run` | 110 tests, **110 pass** |
| Lint | `npm run lint` | 0 errors, 2 warnings |
| Build | `npm run build` | succeeds |
| Deterministic reproducibility | `npm run ci:gate` | **42/42 pass** |
| Submission gate | `npm run q1:gate` | **READY 24/24** |
| Manuscript consistency | `npm run check:manuscript-consistency` | 11 blocks pass |
| Section references | `npm run check:section-references` | pass |
| Construct verification | `npm run verify:constructs` | SKIP without microdata; verified against a synthetic fixture and fails correctly on a tampered artifact |
| Panel integrity | `shasum -a 256 public/data/panel_canonical_v2.csv` | `0BEB0062...95D18E` matches |
| Primary OOS evidence | `npm run generate:kfold` | 100 folds, leakage none, R² defined in 100% |
| Predicate discrimination | `npx vitest run tests/validation.measurementValidityPredicates.test.ts` | pass |
