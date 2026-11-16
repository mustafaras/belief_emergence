# Paper sync report

Date: 2026-11-15. Validation target: local worktree on `work/paper-artifact-sync`, based on `c6eb26a`; the 59-file working-tree diff is intentionally preserved from the rate-limit handoff.

## Decision rules (applied to every change)

1. **Artifacts are authoritative.** They are regenerated deterministically from the committed panel and code (`generate:functional-form` reproduced the committed values exactly); the manuscript is prose that had drifted from them.
2. **A number is never changed without its sentence.** Where the new number makes an old claim false, the claim was rewritten to the weaker, true version and is listed below under "Claims that changed".
3. **Unverifiable numbers are not kept.** If no artifact or generator exists, the number was removed or its provenance stated; where a generator was cheap to write, one was written and the table now reads from it.
4. **No claim was strengthened.** No test was weakened; twelve consistency guards were added (38 blocks now; the main ones negative-tested).

Verification: main 35 pp, supplementary 36 pp, highlights and cover letter compile; 0 undefined references; `check:manuscript-consistency` (35 blocks), `check:section-references`, `check:evidence-index`, `tsc -b` and the full vitest suite (315/315) pass. `ci:gate`: 81/87 checks passed, the 6 browser checks were skipped (no server), nothing failed.

## New generators (every typed table now has a source)

| Script | Artifact | Replaces |
|---|---|---|
| `generate:functional-form` (extended) | `functional_form_comparison.json` + `pairedKfold` | typed headline table; adds paired fold differences |
| `generate:marginal-effects` | `marginal_effects.json` | marginal-effects table (it still described active C, D, G, S and E with the wrong sign) |
| `generate:preset-alignment` | `preset_country_alignment.json` | hand-typed 23-country table (same function the app uses) |
| `generate:supplement-tables` | `supplementary_tables.json` | temporal/ablation table (167 rows), country and temporal slice tables, and the "training UQ" table (R² 0.948, retired 630-row panel) |
| `generate:coefficient-bootstrap` | `coefficient_bootstrap.json` | forest plots (showed the retired model with C = +5.08); adds country-level bootstrap intervals |
| `generate:window-sensitivity` | `structural_window_sensitivity.json` | the false claim that the X/Y bounds are the realised ranges (see below) |
| `generate:data-figures` | `paper/**/figure_*.pdf` | Figure 1, S1, S2 (forests), S5 (marginal curves), A2/A3 (correlation heatmaps) |

## Claims that changed (read these)

| Where | Before | After | Why |
|---|---|---|---|
| Abstract, §1, Results, Conclusion, cover letter, Supp. note | out of sample the two models are "statistically indistinguishable" (0.4063 vs 0.4006) | "close": 0.4207 vs 0.3976; bounded leads on 75 of 100 identical folds by a median of 0.0146 (IQR 0.0001–0.0276), against a fold-to-fold IQR near 0.31; no significance test, because folds are not independent | There was no test behind "statistically". The paired data show a small, fairly consistent edge for the bounded form, so "indistinguishable" overstated; "near-tie in magnitude" is what the data support. In-sample the linear form still leads (0.4564 vs 0.3461). |
| §8 Tier paragraph | "tier ordering does not survive"; C gains +0.0035 over B; 26:1 exchange rate | B improves on A out of sample (0.5239 vs 0.4207, IQRs overlap); C does **not** improve on B (−0.0201 median; ahead in 9 of 20 repeats, 42 of 100 folds) | Old numbers came from an earlier run and contradicted Step 2d (−0.0302). The corrected reading supports the paper's own tier discipline (B primary, C exploratory) more strongly. |
| §8 fixed coefficients | "B and C transfer better as fixed maps than refit" | fixed map is below refit in every tier (by 0.199/0.198/0.178) | The old sentence contradicted its own numbers. |
| Step 2c (trauma composite) | stability argument with "eight seeds" and composite flips | composite recorded as not adopted; its numbers not reproduced (raw EM-DAT persons-affected is not versioned); shipped T retained as the pipeline definition | On the present panel the shipped T's own C-vs-B sign also flips across repeats, so the old argument is not supported. |
| §5 coverage | "closest to nominal in the mid tertile" | no regime-conditional coverage claim; Table S20 itself says tertile coverage is not archived | Claim had no artifact. |
| §5 rolling coverage | 57 / 31 / 24 % | mean coverage 0.84 / 0.86 / 0.79; 44 / 44 / 56 % of folds fall short (country-out 0.91 / 0.91 / 0.92) | `prediction_interval_coverage.json`. Still "below nominal", milder. |
| §5 country slices | "countries with ≥30 observations: RMSE median 0.0878" | countries contribute 1–6 rows; 35 of 83 have ≥3, so within-country R² is not reported | No country has 30 rows. |
| Limitations | failures = EST, RUS, SVK (MAE > 0.25) | CHN, CZE, FRA, GEO, ITA, POL (1–3 rows each); 15 of 83 countries exceed 0.25 | `preset_country_alignment.json`; RUS and SVK are now "good". |
| Limitations, 2006 | ΔR² only (−0.115/−0.199/−0.935); 12 rows | 20 rows / 20 countries; ΔRMSE −0.0155/−0.0059/−0.0087 and ΔR² −0.60/−0.06/−0.88; "effect depends on the metric" | Artifact. The old "does not rescue the fit" is no longer true for RMSE. |
| Limitations, C exclusion | Y partial R² 0.1096 | 0.0829 | Artifact. |
| Marginal-effects table | C, D, G, S rows; E negative; baseline Z ≈ 0.004–0.053 | M, T, E, R only; E +0.09 (matches c_E = +0.39); baseline Z ≈ 0.57–0.61; α, β at the bound make baselines nearly equal except for R | Regenerated from the production map. |
| Supp. S17 | "all 18 ≥ 0.80; no demotion warranted" | 17 of 18; the x_safe:y_safe interaction is 0.747 and is flagged for exploratory demotion; no headline claim rests on it | `tier_b_stability_sweep.json`. Main text already said this. |

## Number-only corrections (claims unchanged)

Panel size and country count (66/23/48/167/87 → 207/83), Gini window (±5; exact-year 102), zero-fill (42 of 207; 165 remaining), support per parameter (18.82/11.50/9.41), LOO folds (83; 48 without R²; 35 with), rolling folds (25), p-values at α = 0.016 / 0.064, loss function and bounds (unpenalised MSE, per `fit_coefficients_v2.py`), duplicated Multiplicity paragraph, `c_tr` term label (T·R), z-bound typo (1.8541262393), OOS medians/IQRs/RMSE, pooled LOO values, parameter-stability minimum (0.747), VIF counterfactual (2.47; cost 0.0085; k-fold 0.4207 → 0.4248 and 0.5239 → 0.5315), temporal tertile cuts (2002/2011), the in-sample Tier values (0.4654/0.5599/0.5658), the supplementary CV summary, S2 (83 countries), S5, S6, headline table, S14, S18, VIF table, preset and marginal tables, AI Interpreter removal.

## Second pass (figures, coefficients, structural window)

### Claims that changed

| Where | Before | After | Why |
|---|---|---|---|
| Fig. 1(B) | slices by withdrawn social support S | slices by retained welfare capacity R | `marginal_effects.json` |
| Fig. S5 | eight channels incl. C, D, G, S; E negative | M, T, E, R only; E positive | regenerated from the production map |
| Fig. S2 | forests with C = +5.08 and amplifier/suppressor legend | production parameters with 300-draw country-level bootstrap intervals; φ0 − ln k instead of φ0 and k separately | `coefficient_bootstrap.json` |
| Fig. A2/A3 | Z and C perfectly correlated (the retired panel) | the seven retained variables on the 207-row panel (E–R 0.88) | panel |
| §8 coefficients | "four identified main effects and two interactions"; "both interactions remain identified"; c_E "twice the size of any other channel"; R "sign is stable" | only c_E ([+0.10, +0.76]) and c_yr ([+0.10, +1.15]) have 95% bootstrap intervals that exclude zero; c_E is 1.5× the next main effect; R's interval includes zero (sign matches in 92% of draws); the Y·R interaction makes the inequality gradient depend on R (positive above the mean, negative below) instead of "welfare damps inequality" | bootstrap; the old sentence had the sign direction wrong |
| §3, §5 | "the X/Y bounds are the realised ranges of the v2 panel"; z-bounds quoted as (−1.609, 1.585) | fixed constants; realised ranges X ∈ [0.103, 0.954], Y ∈ [−1.558, 5.216]; fitting and evaluation windows differ; z anchors differ (−2.397/1.857 vs −1.889/1.854) | `structural_window_sensitivity.json` |
| §5 "single auditable mapping" | no qualifier | holds within the TypeScript pipeline; the Python fit is the exception | same |
| §5 Estimation | an earlier window clamping "drove α to its lower bound" | refit with no clamping: α and β still on the bound (R² 0.3786 vs 0.3466); c_M, c_T, c_E move < 0.003 | same |
| Supp. S3, S4, S10 | variable dictionary and sources described the 11-variable design (C standardised, G scenario rows, T from UCDP, R from SOCX) | retained block X, Y, Z, M, T, E, R; C, D, G, S withdrawn (NA in every row); T = EM-DAT deaths; R = HDI affine; E = SE.SEC.ENRR; G withdrawn | main text §3–4 |

### New finding to be aware of (KI-18)

Holding the shipped coefficients fixed, in-sample R² is 0.3466 under the fitting window, 0.3396 under the evaluation window and 0.3755 under the realised ranges; against different outcome anchors the bounded-scale R² moves between 0.332 and 0.376. The headline fit therefore depends on conventions that are fixed but not unified. The paper now states this and quantifies it; unifying the windows and anchors and refitting was deliberately **not** done, because it would change every downstream number. It does not change the central finding (exponents on the bound; φ0 − ln k is the only identified part of the structural block).

## Third pass: decisions on the remaining items

| Item | Decision | Why |
|---|---|---|
| KI-18 unify windows/anchors and refit | **Not executed now; protocol fixed in advance** (realised X/Y ranges, current-panel 1st/99th percentile Z anchors, same constants everywhere; report old and new side by side) | Choosing the convention by principle, not by fit, avoids post-hoc selection; the refit shifts every number, so it is cheaper and safer once the Claim Registry and guards drive the app and the paper. The finding does not depend on it (exponents stay on the bound without clamping). Stated in the paper and KNOWN_ISSUES. |
| S0 claim–evidence table | **Rewritten** | It listed claims the paper no longer makes (C effect, curvature, culture–media coupling) and the lockbox row printed RMSE 0.000016 for Tiers B/C (the identity-defect signature). Rows now cite the artifacts of the current claims. |
| Lockbox table | **Corrected from the artifact, provenance stated** | 17 of 87 cells drawn before the panel widened; metrics reported as a descriptive check; no claim rests on them. Not regenerated (would discard the pre-registration). |
| S15 glossary, S16 regimes | **Regenerated** from `notation_glossary.json`, which is now produced by `scripts/update_notation_glossary.py` | Old text described C as an amplifier, T from UCDP, ridge shrinkage, 0.4–0.9 bounds, 146-row densities. Regime counts now come from the 207 predictions (30 / 134 / 38 / 43 / 1). |
| "Secular/Religious" schematics | **Redrawn** from the model algebra (σ(Φ+s); mean-field free energy with a single minimum) | The old energy figure showed a bistable "tipping point", which the fitted monostable map does not have. |
| UI screenshots | **Kept, with a provenance note** | They cannot be regenerated before v2; the note states they show an earlier interface and no model results. Replaced in P34. |
| S4 auxiliary rows | **Kept, flagged** as not reproducible from committed data | Raw macro table is not versioned. |
| Table 1, S usable items | 2 → 3 | `construct_item_availability.json` (7 configured, 4 absent). |
| Lockbox scope sentence | "59" → 120 additional country–years (207 vs 87) | Arithmetic. |

## Fourth pass (items first deferred, then fixed)

| Item | Action |
|---|---|
| Keywords | Visible keywords now match the PDF metadata (measurement validity, composite indicators, model comparison, World Values Survey) instead of the earlier macro-urban framing. |
| §2 Related Works (closing) and Supp. S1 context | Claimed the paper fills a methodological gap and "unifies" the literatures, contradicting §1 ("the contribution is not the bounded framework"). Now: the framework is the object of an audit; the literature motivates the checks. |
| Unverifiable history | Removed the 167-row Multiplicity comparison, the "At 167 rows the deletion widened the gap" clause, and the 87-cell coefficient comparisons (+0.11/+1.80, +1.77, +0.002/−0.05). The bootstrap now carries that argument directly. |
| Fig. 2 | Checked: pure (Φ, s) geometry, no stale labels; no change needed. |

## Fifth pass (final rebuild, 2026-11-15)

All generators were re-run in dependency order and every artifact reproduced identically (only timestamps changed). All five PDFs were rebuilt in cross-reference order: main 35 pp, supplementary 37 pp, title page 2 pp, highlights 3 pp, cover letter 3 pp; no fatal errors and no undefined references in the main paper.

Updated in this pass: title page (83 countries, 207 rows, correct SHA-256 prefix `5A37D543…F055B9`); `paper/README.md` (it still reported 87 rows, R² 0.3854 and "READY 24/24"); cover letter (support 207 / 18.82–11.50–9.41; failure cases now CHN, GEO, ITA, POL, CZE, FRA; regime shares 14.5 / 64.7 / 20.8 %; lockbox described as a descriptive check; contribution stated as an audit, not a framework; 13 claims in Table S0); highlights (same framing, S usable items, 13 claims); the supplement's `fig_eval_pair` copy (was out of date); the supplement bibliography now points at `../main/references.bib`.

## Sixth pass (rate-limit takeover, 2026-11-15)

The fifth-pass status table below was historical and is superseded here. The live worktree was rebuilt after the latest analysis artifacts and the KI-18 contract update.

| Check | Current result |
|---|---|
| Main manuscript | 31 US-letter pages; cross-reference-order LaTeX build succeeds. |
| Supplement | 28 pages; `biber` is available and the rebuilt bibliography resolves. |
| Abstract | 191 words. |
| Source word count | TeXcount 3.1.1 reports 14,025 words for the manuscript source, excluding references. The target journal's maximum is 10,000 words including references, so the draft exceeds the limit before its bibliography is counted. A PDF text extraction also exceeds 17,000 tokens; this is a secondary estimate, not the journal's formal count. |
| KI-18 windows/anchors | Resolved in the local artifacts and prose: fit, runtime, and evaluation now use the same canonical X/Y ranges and Z anchors; KI-15 records the unified refit and weak-identification result. |
| Manuscript consistency | Latest local run: 36 claim blocks pass; three optional legacy files are skipped because they are absent. |
| UI evidence | The submitted main text and supplement do not include UI screenshots; old image files remain unreferenced repository assets and are not presented as current-interface evidence. |
| Source-data reproducibility | Source-level counts rely on raw inputs that are not version-controlled. The replication runbook documents acquisition steps and available fingerprints. Current Table S4 contains only two availability rows calculated from the committed canonical panel; the earlier three auxiliary rows are absent. |

The journal's length rule is a material remaining submission gate. [Social Indicators Research guidance](https://link.springer.com/journal/11205/submission-guidelines) sets a 5,000–10,000-word range including references. Reducing from 14,025 source words before references to at most 10,000 total requires substantial editorial restructuring. The user chose to keep the current draft and leave this gate open; no shortening was authorized in this pass.

## Seventh pass (rate-limit takeover verification, 2026-11-15)

The user chose to preserve the draft and leave O5 open. The paper remains over the journal's length limit; no submission-readiness claim is made.

| Check | Current result |
|---|---|
| Full reproducibility gate | `npm run ci:gate`: **91/91**, all browser checks ran with the local Vite server and Chrome; no skipped checks. |
| Unit suite | `npm run test:run`: **315/315**. |
| Lint and build | Lint: 0 errors, 7 existing warnings. `npm run build`: pass; Vite reports existing chunk-size and mixed dynamic/static import warnings. |
| Rendered number provenance | 1,511 distinct values across 12 routes; all resolve to an artifact, a source-bound display, or a checked derivation. |
| Route and visual checks | Route reachability, render/stale-value checks, support picture, stated limits, and surface snapshot pass. `check:visual-baselines`: 12/12 routes within tolerance; the presets reference was refreshed after reviewing its panel-derived table values. |
| Evidence index | 38 artifacts: 10 imported, 12 referenced only, 16 untouched; all described. |
| Diff hygiene | `git diff --check`: pass. |

The takeover also corrected stale validator expectations for current artifacts and metric values, made the number scanner preserve mathematical minus signs, and updated the limits and coefficients explanations to current source semantics. The surface baseline now reflects the current canonical panel Y range; the old range ended at 3.0 while the current panel reaches 5.216.

## Current open gates

| # | Item | Why it stays |
|---|---|---|
| O1 | **Resolved locally** — supplementary references | Rebuilt successfully with the installed `biber`; confirm zero unresolved citations in the final log. |
| O2 | **Resolved for the submission files** — UI screenshots | No UI screenshots are included or referenced in the current main text or supplement; no current-interface claim depends on the legacy images. The unused image files remain in the repository. |
| O3 | **Open source-input limitation** — raw-source counts | The manuscript reports source-level WVS/macro coverage counts that cannot be rebuilt from a clean checkout alone because raw inputs are not version-controlled. The runbook documents acquisition and available fingerprints. Current Table S4 has only two rows, both derived from the committed canonical panel; the earlier three auxiliary rows are no longer present. The separately linked raw-data Drive file could not be verified through the connected Drive account; confirm its access and contents before submission. |
| O4 | **Resolved locally** — KI-18 unified windows and anchors | Current fit/runtime/evaluation contract and refit are recorded in `structural_window_sensitivity.json` and KI-15. |
| O5 | **Open, blocking submission length** | Official Social Indicators Research guidance sets a 5,000–10,000-word range including references. TeXcount is 14,025 before references; the user chose to keep the draft length and leave this gate open. No shortening was authorized. |
