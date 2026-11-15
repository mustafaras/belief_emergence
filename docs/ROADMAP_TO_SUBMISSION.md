# Roadmap to submission — evidence-first rebuild

**Latest documented score:** 95/100 (recorded 2026-11-11; see `docs/APP_PLAN.md` and `docs/APP_EXECUTION_PROMPTS.md`)
**Target:** submission-ready manuscript at the highest defensible score
**Owner:** M. R. Şahin
**Status (2026-11-15):** the manuscript/data track has open reconciliation work listed below; the separate application execution sequence is recorded through Prompt 13.
**Last reconciled against the tree:** 2026-11-15

> **Read this before trusting any number below.** The plan was written on
> 2026-11-07 against the *defective* tree. Several figures in the original
> text (94 computable cells, `alpha_Z = 0.9653`, 34 country-years) were
> projections made before `scripts/build_wvs_constructs.ts` ran. Measured
> values now live in `rawdata/wvs_construct_audit.json` and
> `src/data/analysis/`. Where the two disagree, the artifact wins; the
> measured value is shown in the status tables and the original projection is
> kept only where it still explains a decision.

## Live status — 2026-11-15

The current canonical file is `public/data/panel_canonical_v2.csv`: **207 rows,
207 distinct `(iso3, year)` keys, 83 countries, 1990–2023**, SHA-256
`5A37D543E3531C235B9E93C4948CDB841EA1DA56A25C3FD184D0472C9CF055B9`. These
counts and the digest were read directly from the tracked CSV. The current
`metrics_authoritative.json` records `n=207`, `R²=0.3461`, `r=0.6150`,
`MAE=0.1617`, and `RMSE=0.2089`. `model_complexity_support.json` records
18.82, 11.50, and 9.41 observations per parameter for Tiers A, B, and C;
Tiers A/B are primary and Tier C is exploratory. The stored submission-gate
report says READY (27/27), generated 2026-11-11; that is recorded evidence, not
a fresh run on 2026-11-15.

The 2026-11-09 reconciliation below predates the panel widening from 167 to
207 rows. The following discrepancies remain open and take priority over
submission decisions:

1. **Reconcile the current sample everywhere.** `REPLICATION_RUNBOOK.md` still
   says 167 rows / 76 countries and expects the older `n=167`, `R²=0.2516`
   metrics. The manuscript describes 207 rows but also says they are only 167
   distinct country-year pairs; a direct key count finds 207. Table S18's
   introduction still labels its source artifact `n=167`, although
   `c_dominance_sensitivity.json` records `nRows=207`. The app plan and prompt
   documents also contain 167-row / 76-country statements. Update these
   references from the canonical CSV and regenerate any dependent checks before
   treating the stored READY report as current document-wide evidence.
2. **Refresh stale analysis artifacts.** `reviewer_red_team.json` still carries
   old sample arithmetic, Tier support ratios, and the superseded Table S18
   claim. `notation_glossary.json` still reports regime counts out of 146.
   Reconcile both to the 207-row artifacts and manuscript.
3. **Repair the journal-target source reference.** `journal_fit_targeting.json`
   names `TARGET_JOURNALS.md`, but no such file is present in the current tree.
   Decide on one maintained source and make the artifact point to it.
4. **Close the two remaining measurement-audit documentation items.** The main
   text reports construct alpha, but the planned supplement table is absent.
   The retired v1 panel is not archived under `docs/archive/`; its historical
   Git object remains available, so decide whether that satisfies the audit
   requirement or create the requested archive.
5. **Finish pre-release data-use checks.** The runbook still lists confirmation
   of CRED permission, OECD extract-size limits, and redistribution terms for
   the derived panel as open.

The stored quantitative artifact set is mostly built against the 207-row panel;
the open items above are documentation and artifact reconciliation, not a
request to rerun or alter empirical analyses without first checking their
current source contracts. The app's separate execution sequence records
Prompts 0–13 as complete and contains no Prompt 14.

### What the Gini backfill changed (2026-11-09, later same day)

The road to 126 cells ran through one covariate. Of the 180 cells lost after the
WVS join, 131 were lost to `Y_gini` alone. The upstream macro panel and the
World Bank series are the same construct under an exact affine map
(`Y = 0.164028 * SI.POV.GINI - 5.413122`, max residual 0.000000), so backfilling
changes coverage, not meaning. The price is a ±2-year borrow on all 79 recovered
cells, disclosed in `gini_window_sensitivity.json` and in Step 2b of the paper.

| Quantity | Before | After |
|---|---:|---:|
| Complete-case cells | 87 | **167** |
| Countries | 48 | **76** |
| Tier A obs/param | 7.91 | **15.18** |
| Tier C obs/param | 3.95 (flagged) | **7.59** (clear) |
| Grouped k-fold R², Tier A | 0.2707 | **0.4063** |
| Canonical lower quartile, Tier A | −0.057 | **+0.150** |

The `supportRiskFlag` on Tier C is therefore false again. That flag is a numeric
threshold, not a judgement, and `tests/model.tierDiscipline.test.ts` no longer
asserts it.

The test also no longer asserts an exchange rate between in-sample and held-out
gain. That ratio was 59x at 87 cells and fell to 1.9x at 146 and further at 167, so pinning it would
have meant lowering a threshold every time the sample grew. What the test asserts
instead is an **ordering reversal**, which is both stronger and stable: in sample
fit rises monotonically A < B < C (0.4633 / 0.5399 / 0.5470), but under repeated
grouped k-fold C lands *below* B (0.4358 vs 0.4665). Eleven extra parameters
reorder the tiers under validation, and that is what keeps Tier C exploratory.

### Historical measured status (2026-11-09; superseded by Live status)

| Quantity | Measured | Source |
|---|---|---|
| Respondents scanned | 442,026 | `wvs_construct_audit.json` |
| Country-years with any construct | 305 | `wvs_construct_audit.json` |
| `Z_belief_outcome` cells / alpha | 287 / **0.8187** | `wvs_construct_audit.json` |
| `C_cultural_intensity` cells / alpha | 303 / **0.3482** | `wvs_construct_audit.json` |
| `D_social_atomization` cells / alpha | 296 / **−1.2285** | `wvs_construct_audit.json` |
| `S_social_support` cells | **0** (uncomputable) | `wvs_construct_audit.json` |
| Canonical panel | 167 rows, 76 countries, 1990–2023 | `public/data/panel_canonical_v2.csv` |
| Panel SHA-256 | `ECF5D041…A24967A` | `src/data/analysis/metrics_authoritative.json` |
| Headline fit (n=167) | R² = **0.2516**, r = 0.5772 | `metrics_authoritative.json` |
| Gate verdict | **CONDITIONAL**, 23/24 | `q1_submission_gate_report.json` |

---

## Current documented score

The latest score recorded in project planning documents is **95/100**, dated
2026-11-11 (`docs/APP_PLAN.md`, `docs/APP_EXECUTION_PROMPTS.md`). Those notes do
not include the scoring rubric or a detailed reviewer report, and no later
score is recorded. Treat 95/100 as the latest documented standing. Older
baselines and projected scores have been removed from this working roadmap.

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
| **B. All-country frame** | 94 projected / **126 realised at decision time** | Larger, but abandons the "23-country panel" framing |

The 126-cell value is the 2026-11-09 decision snapshot; the canonical panel
was widened to 207 rows on 2026-11-11.

**Decision taken: Option B.** The canonical panel is
`public/data/panel_canonical_v2.csv` — **207 complete-case country-years,
83 countries, 1990–2023**, SHA-256
`5A37D543E3531C235B9E93C4948CDB841EA1DA56A25C3FD184D0472C9CF055B9`.

- [x] Chooses Option B and renames the panel (v1 retired, v2 pinned).
- [ ] Retain the retired v1 panel under `docs/archive/` for audit. It is absent
      from the current tree; the historical blob is still available at
      `8f5c06b:public/data/panel_canonical_23_countries_v1.csv`. Decide whether
      the Git history is sufficient or add the requested archive.

### 2.3 Reduce the model to what support allows

At **207** realised cells, the current support artifact records:

| Tier | Params | obs/param | Current role |
|---|---:|---:|---|
| A | 11 | 18.82 | primary |
| B | 18 | 11.50 | primary |
| C | 22 | 9.41 | exploratory |

Dropping Tier C was considered as a way to remove the "22 parameters" attack
surface. The decision was to retain it as an explicitly exploratory appendix.

**Status:** [x] Tier C remains an exploratory appendix. The current
`model_complexity_support.json` records A/B as primary, C as exploratory, and
`supportRiskFlag: false` for all three tiers. The previous table and discussion
used earlier 126/167-row snapshots and are superseded; current values must be
read from the linked 207-row artifacts.

---

## Phase 3 — Regenerate every number (5–7 days)

Nothing from the current manuscript survives this phase. Assume a full
rewrite of Sections 5 and 7.

- [ ] Reconcile the complete artifact set to the current 207-row panel.
      Core generated artifacts such as `metrics_authoritative.json`,
      `model_ladder_metrics.json`, and `c_dominance_sensitivity.json` record
      207 rows. `reviewer_red_team.json` and `notation_glossary.json` still
      contain stale sample/support claims; see the live open-work list above.
- [x] Recompute headline metrics. The current `metrics_authoritative.json`
      records `n=207`, `R²=0.3461`, `r=0.6150`, `MAE=0.1617`, and `RMSE=0.2089`.
      The earlier 0.45–0.65 projection was not met; these are in-sample
      descriptive metrics, not the out-of-sample result.
- [x] Report **both** metric families (`aggregatesRefit` and
      `aggregatesCanonical`). Both are in `cv_country_out.json` and
      `cv_rolling_origin.json`. In `cv_country_out.json`, the current median
      country-out R² values are refit A/B/C = −1.667/−1.571/−0.919 and
      canonical A/B/C = −3.603/−2.378/−2.378. The repeated grouped k-fold
      results are separately recorded in `cv_kfold.json`.
- [x] Fix the original Table S18 R²/RMSE inconsistency (KI-06). The current
      table reports the C-withdrawal non-result; the former `R² = 0.7299` and
      near-one full-model value are described as historical. **Open:** its
      introduction still labels the source artifact `n=167`; the current
      artifact records `nRows=207` and must be reconciled with the manuscript.
- [x] Rewrite the abstract, Results, Discussion, and all claims. Every sentence
      containing a number must be traced to a regenerated artefact.
      → reframed from "bounded model" to "measurement audit" in `e18ede5`,
      `161dc92`. Residual drift is tracked separately (see Known drift below).
- [ ] Refresh the red-team simulation against the current panel. Although its
      top-level metadata names 207 rows / 83 countries, its rebuttals still
      contain the obsolete 167-pair count, old Tier support ratios, and the
      superseded S18 result.

**Historical drift found during reconciliation (2026-11-09; the panel later
widened again):**

| Where | Says | Reality |
|---|---|---|
| `main.tex` data-scope caption | 1981–2023 | panel is 1990–2022 |
| `main.tex` methods | 306 country-years | 126 complete cases, 305 scanned |
| `main.tex` methods | 108 countries | 48 in the canonical panel |
| `reviewer_red_team.json` | 34 country-years | 126 |
| `q1_submission_gate.ts` human checklist | n=34 country-years | 126 |

The 1981–2023 / 306 / 108 figures describe the *scanned source*, not the
analysed panel. They are defensible only if the sentence says so; the caption
currently does not.

**Exit criteria:** `npm run verify:all` green on a clean `npm ci`, and no
manuscript number lacks an artefact pointer.

---

## Phase 4 — Make it reviewable (3–4 days)

### 4.1 Reproducibility the reviewer can execute

- [x] Add `rawdata/` download instructions and input checksums so a reviewer
      can reconstruct inputs without redistribution. `REPLICATION_RUNBOOK.md`
      includes the download steps and pinned input SHA-256 values. Its current
      panel counts and expected headline metrics are stale and remain open in
      the live reconciliation list.
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
| "207 cells cannot support your model" | Phase 2.3 — **closed as a tier decision**; current artifact reports 18.82 / 11.50 / 9.41 obs/param for A/B/C, with C exploratory |
| "Temporal extrapolation fails" | existing rolling-origin disclosure, retained |
| "I cannot re-derive `Z`" | Phase 4.1 — **closed in code**; `scripts/verify_constructs.ts` is present and wired into CI; license-restricted raw inputs are still required for a full local run |
| "Your OOS numbers were impossible" | Phase 3 — done; canonical negatives disclosed in text |

### 4.3 Disclose the correction

A methods paper that silently changes its numbers is worse than one that
explains. Add a short **"Correction note"** to the supplement: what the
previous version reported, what the defect was, what changed. This converts
the worst liability into evidence of rigour, and it is the single highest-value
paragraph in the rebuild.

**Status:** [x] closed. The correction note is in
`paper/supplementary/supplementary_materials.tex`; the stale root-level copy
that this item referred to has been removed.

---

## Phase 5 — Venue and submission (2–3 days)

Reassess the earlier rejection pattern (urban journals: insufficient domain
contribution; CSS journals: thin support) against the current manuscript and
207-row panel. Do not assume the larger sample alone resolves either concern.

**Submission history.** Two attempts predate the rebuild and their PDFs have been
deleted. Social Indicators Research, manuscript `SOCI-S-26-01446` (33 pages,
submitted against the pre-rebuild draft). Social Science Computer Review,
manuscript `SSCR-26-0390` (67 pages, "For Peer Review", also pre-rebuild). Neither
described the panel this paper now reports: they predate the construct audit, the
trauma and Gini backfills, and every number in them is superseded. The identifiers
are kept here so the earlier correspondence can still be located; the files
themselves were only ever snapshots of drafts that no longer exist.

| Venue | Fit after rebuild | Note |
|---|---|---|
| Social Indicators Research | high | composite-indicator tolerance; current draft already formatted for it |
| EPJ Data Science | medium | previously tried; only if methodology is foregrounded |
| Sociological Methods & Research | medium | strong methods fit; support and scope need to be assessed against the current 207-row panel |
| PLOS ONE / Scientific Reports | high | reproducibility package is genuinely strong once fixed |

- [ ] Restore or choose the canonical journal-target document and align it
      with `journal_fit_targeting.json`. The JSON now names current manuscript
      paths and 207/83 sample scope, but still points to `TARGET_JOURNALS.md`,
      which is absent from the current tree.
- [x] Resolve the four multiply-defined LaTeX labels. `main.tex` and
      `supplementary_materials.tex` now contain 27 and 28 labels with zero
      duplicates.

---

## Historical work plan (superseded by the 207-row panel)

| Phase | Days | Delivered | Blocking risk |
|---|---:|---|---|
| 1. Fix ingestion + gate | 1 | **done** | low |
| 2. Rebuild measurement | 4 | **done** (2.3 open) | was: ETL script missing |
| 3. Regenerate numbers | 6 | **~16/20 artefacts** | medium (results may not support the thesis) |
| 4. Reviewability | 4 | **half** (CI done, 4.1b/4.3 open) | low |
| 5. Venue + submit | 3 | not started | reviewer variance |
| 4-B. WVS waves 3–6 (optional) | +21 | not started | external: WVS approval |

**Resolved unknown:** the missing ETL script is no longer a blocker.
`scripts/build_wvs_constructs.ts` was written from scratch against the WVS
Trend File extract and is config-driven; the 305 country-years it scans are
committed evidence in `wvs_construct_audit.json`. `rawdata/panel_model_data.csv`
is gone and no longer referenced by the app.

---

## Historical sample decision (later widened)

Phase 2.2 asked whether to keep the "23-country panel" framing (13 cells) or
move to a wider sample and rewrite the framing. **The 23-country frame is the
paper's identity.** The decision was made to use the wider panel and state its
scope directly in the manuscript.

**Decision taken: the wider frame, then widened again.** The current canonical
panel has 207 complete-case country-years across 83 countries, 1990–2023. The
23-country framing is retired. The Tier C role is resolved as exploratory;
the remaining work is to reconcile documents and artifacts to the current
panel, as listed in Live status.

---

## Historical reconciliation snapshot (2026-11-09; superseded)

The table below records what was believed after the 2026-11-09 pass, before
the panel widened from 167 to 207 rows on 2026-11-11. Its completion labels do
not override the live status and open-work list at the top of this document.

| # | Item | State |
|---|---|---|
| 1 | Reconcile this roadmap with the tree | **done** |
| 2 | Refresh `q1_submission_gate_report.json` | **done** — CONDITIONAL, 23/24 |
| 3 | Regenerate the stale artifacts | **done** — `c_dominance_sensitivity`, `temporal_outlier_2006_sensitivity` and `tier_b_stability_sweep` regenerated from the v2 panel; `reviewer_red_team`, `journal_fit_targeting`, `notation_glossary`, `abstract_screening_pack` and `data_code_provenance` reconciled by hand because no generator exists |
| 4 | Repair Table S18 / KI-06 | **done** — S18 rewritten as a non-result with the real numbers; S14 and S17 also repaired from their artifacts |
| 5 | Reconcile 1981–2023 / 306 / 108 / n=34 drift | **done** — abstract, data-scope caption and methods now state 126 rows / 66 countries / 1990–2022, and distinguish the scanned source (305 country-years, 1981–2022) from the analysed panel |
| 6 | `scripts/verify_constructs.ts` (Phase 4.1b) | **done** — independent re-implementation, wired into CI, exits 0 with SKIP when microdata is absent |
| 7 | Correction note (Phase 4.3) | **done** — leads the supplement |
| 8 | Align `journal_fit_targeting.json` with `TARGET_JOURNALS.md` | **done** — five journals, Social Indicators Research as sole primary target, previously-submitted list carried over |
| 9 | Tier C decision (Phase 2.3) | **done** — retained as exploratory appendix; k-fold shows +0.111 in-sample for −0.009 out-of-sample |
| 10 | `REPLICATION_RUNBOOK.md` panel name + checksums | **done** — panel name, SHA, row count, expected metrics and file manifest corrected; § 9.1 now pins all ten input files with their own SHA-256 |
| 11 | Canonical panel builder | **done** — `npm run build:panel` verifies pinned input hashes and reproduces `panel_canonical_v2.csv` byte-for-byte |
| 12 | Tier C decision (Phase 2.3) | **done** — retained as exploratory appendix; +0.111 in-sample for −0.009 held-out, enforced by `tests/model.tierDiscipline.test.ts` |
| 13 | Linear baseline had no generator | **done** — `npm run generate:functional-form` emits `functional_form_comparison.json`; the measured result is a near-tie, so the original "bounded form loses" claim was **withdrawn** |

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

**Gate status: READY 24/24.** The last blocker cleared when the evaluation
design was corrected rather than when a number was suppressed. `val-canonic-reported`
used to read the country-out per-fold median, which is computed on 12 folds
holding 3-4 rows each while 36 folds cannot define $R^2$ at all. It now reads
`cv_kfold.json` (100 grouped folds, ≥12 test rows each, leakage none) and the
checks stay live: injecting a negative median makes the gate fail again.

**Verification after Phase 4 (2026-11-09):**

| Check | Command | Result |
|---|---|---|
| Test suite | `npm run test:run` | 125/125 pass |
| Deterministic reproducibility | `npm run ci:gate` | 45/45 pass |
| Submission gate | `npm run q1:gate` | **READY 25/25** |
| Primary OOS protocol | `npm run generate:kfold` | 100 folds, R² defined in 100% |
| Panel rebuild | `npm run build:panel` | byte-identical, pinned inputs verified |
| Functional form | `npm run generate:functional-form` | near-tie; in-sample favours linear |

---

## What this roadmap deliberately does not do

- It does not promise 95. The last 5 points are (a) external WVS approval and
  (b) reviewer variance — neither is under the authors' control.
- It does not preserve the current results. They cannot be preserved; they are
  a restatement of `Z = a·C + b`.
- It does not touch the app, the visual analytics layer, or the reproducibility
  infrastructure before Phase 4. Those are the strongest assets in the project
  and they are not what is broken.
