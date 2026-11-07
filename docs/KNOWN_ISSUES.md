# KNOWN ISSUES — Blocking measurement defect

**Status:** OPEN — blocks submission
**Severity:** Critical
**Discovered:** 2026-11-07
**Affects:** all empirical claims in `paper/main/main.tex`

Every finding below is independently reproducible from the committed tree.
Reproduction commands are included and were run against
`public/data/panel_canonical_23_countries_v1.csv` and
`rawdata/panel_model_data.csv`.

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

`C` was built from `A006`, the first item of `Z`. Recomputed with the
configured item sets, the two constructs separate as intended:
`corr(Z_6item, C_5item) = 0.496`.

### Impact

- All headline metrics (`R^2 = 0.8461`, `Corr = 0.9488`, `RMSE = 0.1212`) rest
  on a model whose main predictor is the outcome.
- Table S18 ("C dominance") measures the defect, not a finding.
- The "amplifier/suppressor" interpretation attributed to `c_C` is circular.

---

## KI-02 — `Z` is a single WVS item, not a six-item composite

The supplementary materials state that `Z` is a
"WVS 6-item (A006, F028, F050-F053, F063)" composite. In practice:

```text
corr(Z_belief_outcome, Z_religion_importance) = 1.000000
Z_religion_importance = -1.000162 * mean(A006) + 5.002008   (max residual 1.8e-2)
```

The canonical file carries only two components for `Z`
(`Z_religion_importance`, `Z_violence_justifiable`), and only the former
matters. `Z` is a monotone transform of item `A006` alone.

### Why

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

## KI-07 — Submission gate does not test validity

`src/data/analysis/q1_submission_gate_report.json` reports `18/18` passed,
verdict `READY`. None of the 18 checks asks whether a predictor is identical
to the outcome, whether the design matrix is full rank, or whether
out-of-sample performance is suspiciously perfect. The gate measures artefact
hygiene, not measurement validity.

The report is also stale: generated `2026-03-25`, while `main.tex` was
compiled `2026-04-14`.

---

## KI-08 — Test suite does not run in this checkout

```text
npm run test:run      -> Cannot find module '@rollup/rollup-darwin-arm64'
npm run verify:q1:docs -> esbuild installed for another platform (@esbuild/win32-x64)
```

`node_modules/` was installed for Windows. The `100/100` test badge in
`README.md` cannot be reproduced without a clean `npm ci`.

---

## What must change before submission

1. Rebuild `Z` from its six configured items and `C` from its five, then add
   a hard gate asserting `corr(Z, C) < 1`.
2. Separate `D` and `S`.
3. Add gate checks: design-matrix rank, `abs(corr(predictor, outcome)) < 1`,
   single-predictor `R^2 < 1`, OOS `R^2` not implausibly equal to 1.
4. Report `aggregatesCanonical` alongside `aggregatesRefit`.
5. Regenerate every metric, table, and figure, then re-derive manuscript text.

Item-level WVS data for waves 3-6 is not present in the repository and cannot
be redistributed. Restoring full support requires a WVS data-use application;
until then the defensible scope is wave 7 (13 of the 34 current country-year
cells survive item-level verification).
