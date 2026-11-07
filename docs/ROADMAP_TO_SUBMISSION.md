# Roadmap to submission — evidence-first rebuild

**Baseline:** 39/100 (reviewer assessment, 2026-11-07)
**Target:** submission-ready manuscript at the highest defensible score
**Owner:** M. R. Şahin
**Status:** planning

---

## 0. Why 95 is not the right target

A 95 requires the paper to be simultaneously: (a) free of measurement
defects, (b) supported by enough independent cells for its parameter count,
and (c) reproducible by a reviewer.

Two hard constraints make (b) unreachable at the current scope:

| Constraint | Measured | Consequence |
|---|---|---|
| Item-level WVS in repo | wave 7 only (2017–2023) | 21 of 34 cells cannot be verified |
| Cells with full item coverage | **94 country-years** across all WVS files | available, but only ~13 are in the 23-country frame |
| Tier C parameter count | 22 | 94 cells ⇒ 4.3 obs/param; 34 ⇒ 1.55 |
| Redistribution licence | WVS microdata restricted | reviewer cannot re-derive `Z` |

Even with a perfect rebuild, 22 parameters over ~94 cells is thin. A Q1
methods reviewer will not score that 95. Realistic ceiling:

| Scenario | Cells | Parameters | Expected score |
|---|---:|---:|---:|
| Current | 34 (defective) | 22 | **39** |
| Honest narrow (wave 7 only) | 13 | 22 | 72–78 |
| Honest narrow + reduced model | 13 | 8 | 78–84 |
| **Full rebuild, 94 cells, 11-param model** | **94** | **11** | **86–90** |
| Full rebuild + WVS waves 3–6 acquired | 200+ | 11 | 90–93 |

**The plan below targets the 86–90 row and does not manufacture the last
5 points.** If 95 is non-negotiable, the only path is the WVS data-use
application in Phase 4-B, and even then the score depends on reviewer
variance you do not control.

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

- [ ] Recover or rewrite the WVS aggregation script. It must read
      `config/wvs_items.yaml` and honour `constructs[*].items[*].item_code`.
- [ ] Add an assertion before write: `corr(Z, C) < 0.9`, abort otherwise.
- [ ] Emit `rawdata/wvs_construct_audit.json` recording, per construct, the
      item codes used, per-item coverage, and the pairwise correlation matrix
      of all constructs. This file is the evidence a reviewer will ask for.

### 1.2 Separate `D` and `S`

`D_social_trust` and `S_support_index` are bitwise identical; the model uses
`D = −S`. Assign them different source items (config already distinguishes
them) or drop one and declare a 7-channel model.

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

---

## Phase 2 — Rebuild the measurement layer (3–5 days)

### 2.1 Recompute constructs from item level

From `rawdata/EVS_WVS_Joint_Csv_v5_0.csv` (wave 7, 11 items, n≥30 per
country-year), 94 country-years are computable. Verified prototype:

```text
corr(Z_6item, C_5item) = 0.496    # was 1.000
```

- [ ] Implement per-construct aggregation exactly per `wvs_items.yaml`
      (reverse-coding, missing codes, min_item_coverage 0.5).
- [ ] Emit Cronbach's α per construct on the 94-cell set; report it. Current
      supplementary claims α=0.80 for `Z`; the realized two-item proxy was
      0.715. Recompute honestly.

### 2.2 Decide the sample honestly

Two defensible options; pick one and state it in the paper:

| Option | Cells | Consequence |
|---|---|---|
| **A. Wave-7 frame** | 13 in-frame (94 total) | Smallest claim, fastest, fully verifiable |
| **B. All-country frame** | 94 | Larger, but abandons the "23-country panel" framing |

**Recommendation: Option B.** 94 cells supports an 11-parameter model at
8.5 obs/param, which survives review. Option A does not.

Whichever is chosen, the canonical panel is renamed and its SHA-256 re-pinned;
the old file is retained under `docs/archive/` for audit.

### 2.3 Reduce the model to what support allows

At 94 cells:

| Tier | Params | obs/param | Verdict |
|---|---:|---:|---|
| A | 11 | 8.5 | keep, primary |
| B | 18 | 5.2 | keep, secondary |
| C | 22 | 4.3 | **drop or relabel as exploratory appendix** |

Dropping Tier C removes the "22 parameters" attack surface entirely. The
paper becomes an 11-parameter model with an explicitly exploratory appendix.

---

## Phase 3 — Regenerate every number (5–7 days)

Nothing from the current manuscript survives this phase. Assume a full
rewrite of Sections 5 and 7.

- [ ] Regenerate all 20 artefacts under `src/data/analysis/` from the new panel.
- [ ] Recompute headline metrics. Expect `R² ≈ 0.45–0.65`, not 0.85. If the new
      `R²` is still >0.95, the rebuild is wrong — stop and investigate.
- [ ] Report **both** metric families (`aggregatesRefit` and
      `aggregatesCanonical`). The canonical negatives (currently −0.86/−2.15)
      will likely become the honest result.
- [ ] Fix Table S18 inconsistency (KI-06).
- [ ] Rewrite the abstract, Results, Discussion, and all claims. Every sentence
      containing a number must be traced to a regenerated artefact.
- [ ] Re-run the red-team simulation; the 18 criticisms will change because
      the model changed.

**Exit criteria:** `npm run verify:all` green on a clean `npm ci`, and no
manuscript number lacks an artefact pointer.

---

## Phase 4 — Make it reviewable (3–4 days)

### 4.1 Reproducibility the reviewer can execute

- [ ] Add `rawdata/` download instructions with checksums so a reviewer can
      reconstruct inputs without redistribution (WVS licence forbids shipping
      microdata).
- [ ] Add `scripts/verify_constructs.ts` that recomputes `Z` and `C` from raw
      microdata and asserts the audit JSON matches.
- [ ] Add a CI job on `ubuntu-latest` proving `npm ci && npm run verify:all`
      from a clean clone. The local Windows-installed `node_modules` cannot
      prove this (KI-08).

### 4.2 Pre-empt the reviewer

The five criticisms that will decide this paper, and where each is answered:

| Criticism | Answered in |
|---|---|
| "Your predictor is your outcome" | Phase 1.3 gate + `wvs_construct_audit.json` |
| "94 cells cannot support your model" | Phase 2.3, 11 params, 8.5 obs/param |
| "Temporal extrapolation fails" | existing rolling-origin disclosure, retained |
| "I cannot re-derive `Z`" | Phase 4.1 verification script + download manifest |
| "Your OOS numbers were impossible" | Phase 3, new numbers + explicit discussion of the old ones |

### 4.3 Disclose the correction

A methods paper that silently changes its numbers is worse than one that
explains. Add a short **"Correction note"** to the supplement: what the
previous version reported, what the defect was, what changed. This converts
the worst liability into evidence of rigour, and it is the single highest-value
paragraph in the rebuild.

---

## Phase 5 — Venue and submission (2–3 days)

With an 11-parameter model and 94 cells, the earlier rejection pattern
(urban journals: insufficient domain contribution; CSS journals: thin support)
is addressed on the support axis. Reassess targets:

| Venue | Fit after rebuild | Note |
|---|---|---|
| Social Indicators Research | high | composite-indicator tolerance; current draft already formatted for it (`SOCI-S-26-01446.pdf`) |
| EPJ Data Science | medium | previously tried; only if methodology is foregrounded |
| Sociological Methods & Research | medium | strong methods fit, but 94 cells is still small for them |
| PLOS ONE / Scientific Reports | high | reproducibility package is genuinely strong once fixed |

- [ ] Update `TARGET_JOURNALS.md` and `journal_fit_targeting.json` to agree —
      they currently contradict each other.
- [ ] Resolve the four multiply-defined LaTeX labels.

---

## Effort and score projection

| Phase | Days | Cumulative score | Blocking risk |
|---|---:|---:|---|
| 1. Fix ingestion + gate | 1 | 39 → 45 | low |
| 2. Rebuild measurement | 4 | 45 → 60 | **ETL script missing — highest risk** |
| 3. Regenerate numbers | 6 | 60 → 78 | medium (results may not support the thesis) |
| 4. Reviewability | 4 | 78 → 87 | low |
| 5. Venue + submit | 3 | 87 → **88–90** | reviewer variance |
| 4-B. WVS waves 3–6 (optional) | +21 | 90 → **92–94** | external: WVS approval |

**Critical unknown:** Phase 2 depends on an ETL script that is not in the
repository. If it cannot be recovered, `rawdata/panel_model_data.csv` (22,096
rows) becomes the only reconstruction path, and its `Z`/`C` are already
contaminated — meaning Phase 2 must be written from scratch against
`EVS_WVS_Joint_Csv_v5_0.csv`. Budget an extra 2 days.

---

## The one decision that determines the outcome

Phase 2.2 asks whether to keep the "23-country panel" framing (13 cells,
score ceiling ~78) or move to a 94-cell sample (score ceiling ~90) and rewrite
the framing. **The 23-country frame is the paper's identity and also its
ceiling.** No amount of polishing resolves that trade-off; it has to be chosen
deliberately, and stated in the manuscript.

---

## What this roadmap deliberately does not do

- It does not promise 95. The last 5 points are (a) external WVS approval and
  (b) reviewer variance — neither is under the authors' control.
- It does not preserve the current results. They cannot be preserved; they are
  a restatement of `Z = a·C + b`.
- It does not touch the app, the visual analytics layer, or the reproducibility
  infrastructure before Phase 4. Those are the strongest assets in the project
  and they are not what is broken.
