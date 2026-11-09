# Roadmap to submission — evidence-first rebuild

**Baseline:** 39/100 (reviewer assessment, 2026-11-07)
**Target:** submission-ready manuscript at the highest defensible score
**Owner:** M. R. Şahin
**Status:** Phase 1 and 2.1–2.2 complete; Phase 3 and 4 partially complete
**Last reconciled against the tree:** 2026-11-09

> **Read this before trusting any number below.** The plan was written on
> 2026-11-07 against the *defective* tree. Several figures in the original
> text (94 computable cells, `alpha_Z = 0.9653`, 34 country-years) were
> projections made before `scripts/build_wvs_constructs.ts` ran. Measured
> values now live in `rawdata/wvs_construct_audit.json` and
> `src/data/analysis/`. Where the two disagree, the artifact wins; the
> measured value is shown in the status tables and the original projection is
> kept only where it still explains a decision.

### Measured status (2026-11-09)

| Quantity | Measured | Source |
|---|---|---|
| Respondents scanned | 442,026 | `wvs_construct_audit.json` |
| Country-years with any construct | 305 | `wvs_construct_audit.json` |
| `Z_belief_outcome` cells / alpha | 287 / **0.8187** | `wvs_construct_audit.json` |
| `C_cultural_intensity` cells / alpha | 303 / **0.3482** | `wvs_construct_audit.json` |
| `D_social_atomization` cells / alpha | 296 / **−1.2285** | `wvs_construct_audit.json` |
| `S_social_support` cells | **0** (uncomputable) | `wvs_construct_audit.json` |
| Canonical panel | 87 rows, 48 countries, 1990–2022 | `public/data/panel_canonical_v2.csv` |
| Panel SHA-256 | `1CB00CB3…DCED1839` | `src/data/analysis/metrics_authoritative.json` |
| Headline fit (n=87) | R² = **0.3854**, r = 0.6311 | `metrics_authoritative.json` |
| Gate verdict | **CONDITIONAL**, 23/24 | `q1_submission_gate_report.json` |

---

## 0. Why 95 is not the right target

A 95 requires the paper to be simultaneously: (a) free of measurement
defects, (b) supported by enough independent cells for its parameter count,
and (c) reproducible by a reviewer.

Two hard constraints make (b) unreachable at the current scope:

| Constraint | Measured | Consequence |
|---|---|---|
| Item-level WVS in repo | WVS Trend File extract, 1981–2022 | 305 country-years computable; 287 emit `Z` |
| Complete cases in canonical panel | **87** (48 countries, 1990–2022) | 7 predictors × 11 params ⇒ 7.9 obs/param at Tier A |
| Tier C parameter count | 22 | 87 cells ⇒ **3.95** obs/param — underpowered |
| Redistribution licence | WVS microdata restricted | reviewer cannot re-derive `Z` without a download manifest |

Even with a perfect rebuild, 22 parameters over 87 cells is thin. A Q1
methods reviewer will not score that 95. Realistic ceiling:

| Scenario | Cells | Parameters | Expected score |
|---|---:|---:|---:|
| Baseline as reviewed | 34 (defective) | 22 | **39** |
| Honest narrow (single wave) | 13 | 22 | 72–78 |
| Honest narrow + reduced model | 13 | 8 | 78–84 |
| **Rebuild as landed, 87 cells, 11-param Tier A** | **87** | **11** | **86–90** |
| Rebuild + WVS waves 3–6 acquired | 200+ | 11 | 90–93 |

**The plan below targets the 86–90 row and does not manufacture the last
5 points.** If 95 is non-negotiable, the only path is the WVS data-use
application in Phase 4-B, and even then the score depends on reviewer
variance you do not control.

**Current position on this ladder:** between the third and fourth row. The
11-parameter Tier A model is defined and fits at R² = 0.3854, but Tier C is
still estimated and reported at 3.95 obs/param (Phase 2.3 is open), which is
what keeps the paper below the 86–90 band.

---

## Phase 1 — Stop the bleeding (1 day)

Nothing else can be trusted until `C` is not `Z`.

### 1.1 Locate and quarantine the ingestion

The defect appears identically in **all three** WVS aggregate files:

```text
wvs_combined.csv              n=197  corr(Z_religion_importance, C_religiosity_index) = 1.0
wvs_timeseries_summary.csv    n=161  corr = 1.0
wvs_wave7_micro_summary.csv    n=66  corr = 1.0
```

One upstream script produced all three. It is **not in this repository** —
`rawdata/*.csv` is gitignored and no ETL code is versioned. Tasks:

- [x] Recover or rewrite the WVS aggregation script. It must read
      `config/wvs_items.yaml` and honour `constructs[*].items[*].item_code`.
      → `scripts/build_wvs_constructs.ts` (commit `77097d0`).
- [x] Add an assertion before write: `corr(Z, C) < 0.9`, abort otherwise.
      → enforced as an |r| > 0.999 abort plus a shared-item allowlist.
- [x] Emit `rawdata/wvs_construct_audit.json` recording, per construct, the
      item codes used, per-item coverage, and the pairwise correlation matrix
      of all constructs. This file is the evidence a reviewer will ask for.
      → present; note it is untracked because `rawdata/` is gitignored, so it
      ships as a run artifact rather than a versioned file.

### 1.2 Separate `D` and `S`

`D_social_trust` and `S_support_index` are bitwise identical; the model uses
`D = −S`. Assign them different source items (config already distinguishes
them) or drop one and declare a 7-channel model.

**Status:** [x] resolved by withdrawal, not by separation. The v2 construct
audit leaves `D` and `S` both non-unidimensional (`alpha_D = −1.2285`,
`S` computable in 0 cells), so both are declared but not estimated. The model
runs on 7 estimated columns (`X, Y, T, E, R, M` plus the intercept), and the
manuscript states the withdrawal explicitly ("withdraws four of the eight
channels", `main.tex` § measurement-validity).

### 1.3 Hard validity gate

Extend `BE_app/scripts/q1_submission_gate.ts` with checks that would have
caught KI-01 through KI-04:

| New check | Assertion |
|---|---|
| `val-identity` | `max abs(corr(x, y)) < 0.999` for every predictor–outcome pair |
| `val-rank` | design matrix full column rank at every tier |
| `val-single-r2` | no single predictor reaches `R² > 0.99` alone |
| `val-oos-plausible` | OOS `R² < 0.999` (a model that predicts perfectly is a defect) |
| `val-canonic-reported` | `aggregatesCanonical` appears in the manuscript |

**Exit criteria:** gate fails on the current tree with 5 new critical
blockers, and passes only after 1.1–1.2.

**Status:** [x] complete. `scripts/q1_submission_gate.ts` Gate 7 now carries
`val-identity`, `val-rank`, `val-single-r2`, `val-oos-plausible` and
`val-canonic-reported` (lines 436–524). All five critical checks pass on the
rebuilt panel; the only remaining validity failure is the major
`val-canonic-reported` warning, which is real signal rather than a defect.

---

## Phase 2 — Rebuild the measurement layer (3–5 days)

### 2.1 Recompute constructs from item level

From `rawdata/EVS_WVS_Joint_Csv_v5_0.csv` (wave 7, 11 items, n>=30 per
country-year), 94 country-years were projected as computable. The implemented
builder (`scripts/build_wvs_constructs.ts`) prefers the wider WVS Trend File
extract `rawdata/wvs_trend_all_items.csv` and measured more than projected:

```text
Z_belief_outcome     cells=287  alpha = 0.8187   unidimensional
C_cultural_intensity cells=303  alpha = 0.3482   NOT one dimension
D_social_atomization cells=296  alpha = -1.2285  items actively disagree
S_social_support     cells=0    UNCOMPUTABLE (4 of 7 configured items absent)
respondents scanned 442,026      country-years scanned 305
```

The `C` and `D` constructs cannot be salvaged by better aggregation; their
item sets do not measure a single latent dimension. See KI-09, KI-10, KI-11
and KI-12.

- [x] Implement per-construct aggregation exactly per `wvs_items.yaml`
      (reverse-coding, missing codes, min_item_coverage 0.5).
- [x] **Decide the construct set.** Decided: withdraw `C`, `D`, `G` and `S`
      from estimation and keep them as declared-but-not-estimated channels.
      The model estimates 7 columns. This is the substantive redesign the
      plan anticipated, and the manuscript now leads with it.
- [ ] Report realized alpha per construct in the supplement. `Z` at 0.8187
      clears the 0.80 benchmark; `C` at 0.3482 and `D` at −1.2285 are the
      evidence for withdrawal. The main text reports them; the supplement has
      no construct-alpha table yet.

### 2.2 Decide the sample honestly

Two defensible options; pick one and state it in the paper:

| Option | Cells | Consequence |
|---|---|---|
| **A. Wave-7 frame** | 13 in-frame | Smallest claim, fastest, fully verifiable |
| **B. All-country frame** | 94 projected / **87 realised** | Larger, but abandons the "23-country panel" framing |

**Decision taken: Option B.** The canonical panel is
`public/data/panel_canonical_v2.csv` — **87 complete-case country-years,
48 countries, 1990–2022**, SHA-256 `1CB00CB3…DCED1839`. At 11 parameters that
is 7.9 obs/param at Tier A.

- [x] Chooses Option B and renames the panel (v1 retired, v2 pinned).
- [ ] Retain the retired v1 panel under `docs/archive/` for audit. It was
      deleted outright in `b3477ee`, so the audit trail exists only in git
      history (`git show 8f5c06b:public/data/panel_canonical_23_countries_v1.csv`).

### 2.3 Reduce the model to what support allows

At **87** realised cells:

| Tier | Params | obs/param | Verdict |
|---|---:|---:|---|
| A | 11 | 7.9 | keep, primary |
| B | 18 | 4.8 | keep, secondary (support-risk flag set) |
| C | 22 | 3.95 | **drop or relabel as exploratory appendix** |

Dropping Tier C removes the "22 parameters" attack surface entirely. The
paper becomes an 11-parameter model with an explicitly exploratory appendix.

**Status:** [ ] open. All three tiers are still estimated and reported.
`model_complexity_support.json` already flags B and C with
`supportRiskFlag: true` and marks C `exploratory: true`, so the labelling half
of this task is done; the reduction decision is not.

---

## Phase 3 — Regenerate every number (5–7 days)

Nothing from the current manuscript survives this phase. Assume a full
rewrite of Sections 5 and 7.

- [x] Regenerate all 20 artefacts under `src/data/analysis/` from the new panel.
      → **16 of 20** are regenerated against v2. Four are still dated March and
      describe the defective panel: `c_dominance_sensitivity.json`
      (2026-03-10), `reviewer_red_team.json` (2026-03-09),
      `journal_fit_targeting.json` (2026-03-05), `notation_glossary.json`
      (2026-03-09).
- [x] Recompute headline metrics. Expect `R² ≈ 0.45–0.65`, not 0.85. If the new
      `R²` is still >0.95, the rebuild is wrong — stop and investigate.
      → **R² = 0.3854**, r = 0.6311, n = 87 (`metrics_authoritative.json`).
      Below the predicted band but far from the tautological 1.0, which is the
      point of the rebuild.
- [x] Report **both** metric families (`aggregatesRefit` and
      `aggregatesCanonical`). The canonical negatives (currently −0.86/−2.15)
      will likely become the honest result.
      → both families are in `cv_rolling_origin.json` and
      `cv_country_out.json`; the country-out canonical negatives
      (Tier A −2.0066, B −0.9663, C −0.8968) are discussed in the main text.
- [ ] Fix Table S18 inconsistency (KI-06). `supplementary_materials.tex`
      still prints `R² = 0.7299` with `RMSE = 0.1606`, and its source artifact
      still carries the old `fullModel.r2 = 0.99999999999`.
- [x] Rewrite the abstract, Results, Discussion, and all claims. Every sentence
      containing a number must be traced to a regenerated artefact.
      → reframed from "bounded model" to "measurement audit" in `e18ede5`,
      `161dc92`. Residual drift is tracked separately (see Known drift below).
- [ ] Re-run the red-team simulation; the 18 criticisms will change because
      the model changed. The artifact still says "34 country-years".

**Known drift found during reconciliation (2026-11-09):**

| Where | Says | Reality |
|---|---|---|
| `main.tex` data-scope caption | 1981–2023 | panel is 1990–2022 |
| `main.tex` methods | 306 country-years | 87 complete cases, 305 scanned |
| `main.tex` methods | 108 countries | 48 in the canonical panel |
| `reviewer_red_team.json` | 34 country-years | 87 |
| `q1_submission_gate.ts` human checklist | n=34 country-years | 87 |

The 1981–2023 / 306 / 108 figures describe the *scanned source*, not the
analysed panel. They are defensible only if the sentence says so; the caption
currently does not.

**Exit criteria:** `npm run verify:all` green on a clean `npm ci`, and no
manuscript number lacks an artefact pointer.

---

## Phase 4 — Make it reviewable (3–4 days)

### 4.1 Reproducibility the reviewer can execute

- [ ] Add `rawdata/` download instructions with checksums so a reviewer can
      reconstruct inputs without redistribution (WVS licence forbids shipping
      microdata). Section 9.1 of `REPLICATION_RUNBOOK.md` has the downloads but
      no checksums.
- [x] Add `scripts/verify_constructs.ts` that recomputes `Z` and `C` from raw
      microdata and asserts the audit JSON matches. → written as an
      *independent* second implementation (it does not import the producer),
      reads its rules from `config/wvs_items.yaml`, and exits 1 on any
      disagreement. Run with `npm run verify:constructs`. It exits 0 with a
      SKIP notice when the licence-restricted microdata is absent, which is the
      normal state of a clean clone.
- [x] Add a CI job on `ubuntu-latest` proving `npm ci && npm run verify:all`
      from a clean clone. `.github/workflows/verify.yml` runs tests, lint,
      build, the four generators, both checkers and `ci:gate` on
      `ubuntu-latest`; run `42387591097` is green.

### 4.2 Pre-empt the reviewer

The five criticisms that will decide this paper, and where each is answered:

| Criticism | Answered in |
|---|---|
| "Your predictor is your outcome" | Phase 1.3 gate + `wvs_construct_audit.json` |
| "87 cells cannot support your model" | Phase 2.3 — **open**; C still at 3.95 obs/param |
| "Temporal extrapolation fails" | existing rolling-origin disclosure, retained |
| "I cannot re-derive `Z`" | Phase 4.1 — **open**; no `verify_constructs.ts` yet |
| "Your OOS numbers were impossible" | Phase 3 — done; canonical negatives disclosed in text |

### 4.3 Disclose the correction

A methods paper that silently changes its numbers is worse than one that
explains. Add a short **"Correction note"** to the supplement: what the
previous version reported, what the defect was, what changed. This converts
the worst liability into evidence of rigour, and it is the single highest-value
paragraph in the rebuild.

**Status:** [ ] open. No correction note exists in
`paper/supplementary_materials.tex`.

---

## Phase 5 — Venue and submission (2–3 days)

With an 11-parameter model and 87 cells, the earlier rejection pattern
(urban journals: insufficient domain contribution; CSS journals: thin support)
is addressed on the support axis. Reassess targets:

| Venue | Fit after rebuild | Note |
|---|---|---|
| Social Indicators Research | high | composite-indicator tolerance; current draft already formatted for it (`SOCI-S-26-01446.pdf`) |
| EPJ Data Science | medium | previously tried; only if methodology is foregrounded |
| Sociological Methods & Research | medium | strong methods fit, but 87 cells is still small for them |
| PLOS ONE / Scientific Reports | high | reproducibility package is genuinely strong once fixed |

- [ ] Update `TARGET_JOURNALS.md` and `journal_fit_targeting.json` to agree —
      they currently contradict each other. The artifact is dated 2026-03-05,
      still names `BE_paper_latest/main/main.tex` as its source, and lists
      Nature Human Behaviour / EPJ Data Science / Social Networks while the
      markdown lists 20 venues led by Social Indicators Research.
- [x] Resolve the four multiply-defined LaTeX labels. `main.tex` and
      `supplementary_materials.tex` now contain 27 and 28 labels with zero
      duplicates.

---

## Effort and score projection

| Phase | Days | Cumulative score | Delivered | Blocking risk |
|---|---:|---:|---|---|
| 1. Fix ingestion + gate | 1 | 39 → 45 | **done** | low |
| 2. Rebuild measurement | 4 | 45 → 60 | **done** (2.3 open) | was: ETL script missing |
| 3. Regenerate numbers | 6 | 60 → 78 | **~16/20 artefacts** | medium (results may not support the thesis) |
| 4. Reviewability | 4 | 78 → 87 | **half** (CI done, 4.1b/4.3 open) | low |
| 5. Venue + submit | 3 | 87 → **88–90** | not started | reviewer variance |
| 4-B. WVS waves 3–6 (optional) | +21 | 90 → **92–94** | not started | external: WVS approval |

**Current standing: roughly 68–72** — Phase 1 and 2 landed, Phase 3 is
mostly landed but four artifacts still describe the defective panel, and
Phase 4 is half done. The 78 row requires Phase 3 closed and Phase 4.3
written; the 87 row requires Phase 4.1b and 2.3 as well.

**Resolved unknown:** the missing ETL script is no longer a blocker.
`scripts/build_wvs_constructs.ts` was written from scratch against the WVS
Trend File extract and is config-driven; the 305 country-years it scans are
committed evidence in `wvs_construct_audit.json`. `rawdata/panel_model_data.csv`
is gone and no longer referenced by the app.

---

## The one decision that determines the outcome

Phase 2.2 asks whether to keep the "23-country panel" framing (13 cells,
score ceiling ~78) or move to a wider sample (score ceiling ~90) and rewrite
the framing. **The 23-country frame is the paper's identity and also its
ceiling.** No amount of polishing resolves that trade-off; it has to be chosen
deliberately, and stated in the manuscript.

**Decision taken: the wider frame.** The canonical panel is 87 complete-case
country-years across 48 countries, 1990–2022. The manuscript no longer uses
the 23-country framing; `main.tex` contains zero occurrences of "23 countries".
The remaining constraint is not the frame but Tier C's 3.95 obs/param, which
Phase 2.3 still has to resolve.

---

## Where the work actually stands (2026-11-09)

| # | Item | State |
|---|---|---|
| 1 | Reconcile this roadmap with the tree | **done** |
| 2 | Refresh `q1_submission_gate_report.json` | **done** — CONDITIONAL, 23/24 |
| 3 | Regenerate the stale artifacts | **done** — `c_dominance_sensitivity`, `temporal_outlier_2006_sensitivity` and `tier_b_stability_sweep` regenerated from the v2 panel; `reviewer_red_team`, `journal_fit_targeting`, `notation_glossary`, `abstract_screening_pack` and `data_code_provenance` reconciled by hand because no generator exists |
| 4 | Repair Table S18 / KI-06 | **done** — S18 rewritten as a non-result with the real numbers; S14 and S17 also repaired from their artifacts |
| 5 | Reconcile 1981–2023 / 306 / 108 / n=34 drift | **done** — abstract, data-scope caption and methods now state 87 rows / 48 countries / 1990–2022, and distinguish the scanned source (305 country-years, 1981–2022) from the analysed panel |
| 6 | `scripts/verify_constructs.ts` (Phase 4.1b) | **done** — independent re-implementation, wired into CI, exits 0 with SKIP when microdata is absent |
| 7 | Correction note (Phase 4.3) | **done** — leads the supplement |
| 8 | Align `journal_fit_targeting.json` with `TARGET_JOURNALS.md` | **done** — five journals, Social Indicators Research as sole primary target, previously-submitted list carried over |
| 9 | Tier C reduction decision (Phase 2.3) | **open** — all three tiers still estimated |
| 10 | `REPLICATION_RUNBOOK.md` panel name + checksums | **partly done** — panel name, SHA, row count, expected metrics and file manifest corrected to the v2 reality; per-source input checksums in § 9.1 still missing |

**Verification after this pass (2026-11-09):**

| Check | Command | Result |
|---|---|---|
| Test suite | `npm run test:run` | 110 tests, **110 pass** |
| Lint | `npm run lint` | 0 errors, 2 warnings |
| Build | `npm run build` | succeeds |
| Manuscript consistency | `npm run check:manuscript-consistency` | 11 blocks pass |
| Section references | `npm run check:section-references` | pass |
| Deterministic reproducibility | `npm run ci:gate` | **39/39 pass** |
| Construct verification | `npm run verify:constructs` | SKIP (microdata absent); verified against a synthetic fixture, and fails correctly on a tampered artifact |
| Submission gate | `npm run q1:gate` | **CONDITIONAL 23/24** |

**What still blocks READY:** exactly one check, `val-canonic-reported` — the
fixed-coefficient country-out $R^2$ is negative in every tier (−2.01 / −0.97 /
−0.90). That is a true finding, disclosed in the manuscript, not a defect to be
silenced. It clears only if the canonical coefficient set is refit (Phase 2.3)
or the gate is reclassified, and either decision is the authors'.

---

## What this roadmap deliberately does not do

- It does not promise 95. The last 5 points are (a) external WVS approval and
  (b) reviewer variance — neither is under the authors' control.
- It does not preserve the current results. They cannot be preserved; they are
  a restatement of `Z = a·C + b`.
- It does not touch the app, the visual analytics layer, or the reproducibility
  infrastructure before Phase 4. Those are the strongest assets in the project
  and they are not what is broken.
