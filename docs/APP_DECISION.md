# Application decision

**Decision: Option A — Evidence surface.**

Recorded 2026-11-11. This supersedes nothing in the manuscript and touches no file
under `paper/`. It is a product decision, taken before any code, and it is written so
that someone who prefers B or C can see exactly which claim to attack.

---

## 0. The premise moved, so the premise is restated

`docs/APP_EXECUTION_PROMPTS.md` instructs each prompt to re-verify its baseline and
stop if a number has moved. Two kinds of number have moved: the panel grew, and the
artifact accounting was slightly wrong. Both change what the options cost, so they are
recorded before the decision rather than after it.

| claim in `APP_PLAN.md` / `APP_EXECUTION_PROMPTS.md` | measured now | how |
|---|---|---|
| 7 of 31 artifacts imported | **5 of 31** | `import … from '…/data/analysis/*.json'` across `src/**/*.ts{,x}` |
| 26 consistency blocks | **28** | `npm run check:manuscript-consistency` |
| panel is 167 rows / 76 countries | **207 rows / 83 countries** | `public/data/panel_canonical_v2.csv` |
| 150 rows never in the reserved set | **190** (207 − 17) | panel rows − `nLockboxCells` |
| VIF 8.74 (`APP_PLAN.md:102`) | **9.4274** | `collinearity_diagnostics.json` |
| attrition sourced from `data_code_provenance.json` (Prompt 4) | it lives in **`rawdata/wvs_construct_audit.json`** | that file carries `respondentsScanned: 442026`, `countryYears: 305` |

Unaffected and re-confirmed: 31 artifacts, 22 `.tsx` components under
`src/components/`, 24 test files, 20 CSS files / 24,035 lines, largest component
`Surface3DSurface.tsx` at 4,341 lines, `npm run ci:gate` at 68/68.

First paint, measured in headless Chrome against a running dev server rather than
inferred: 1 Plotly surface, 1 table, 12 sliders, 46 buttons, 0 selects, 11,524
characters of text, DOM-content-loaded at 565 ms, load at 1,158 ms. All eight
signature terms of the imported artifacts — *cronbach, lockbox, provenance, glossary,
red team, screening, construct validity, journal* — are absent. The 0-of-31
first-paint finding holds, and it is now slightly worse than documented, because two
of the seven "imported" artifacts are only quoted as filename strings inside prose:
`reviewer_red_team.json`, `q1_submission_gate_report.json` and `data_code_provenance.json`
are named in `MathematicalAnalysisSection.tsx` but never read as data.

One further discrepancy matters for the choice. `construct_prevalence.json` **reported**
`canonicalCompleteCases: 146` and `frameUtilisation 0.4787`, generated 2026-11-09, on the
then-146-row panel. It has since been regenerated to 207 / 0.6787, which is what the
paper's abstract already stated ("67.9% of the scanned frame", 207 of 305) — the artifact
was the stale side, not the manuscript. `construct_validity_invariance.json` — one of the
five genuinely imported artifacts — reports `nCanonicalFinite: 0` and
`fullCoverageRate: 0` for all five constructs on the 207-row panel. An artifact
already on screen asserts that nothing is covered. That is either a real finding or a
broken join, and the application currently makes no attempt to tell the reader which.

---

## 1. The decision

The application's purpose is **to let a reader verify the paper, including its
negative findings.** Every one of the 31 artifacts gets a view. The fitted-surface
explorer survives intact, as one panel among many, and stops being the front door.

The interface's current claim — implied by composition, not by any sentence — is that
this paper is about a surface. It is not. It is about an audit that the surface failed,
and the landing view is the only place in the product where that audit is not.

---

## 2. Why A, in one paragraph each

**It matches the object that already exists.** 31 artifacts, 68 gate assertions, 28
consistency blocks: the evidence layer is the most finished thing in this repository.
A is the only option that spends that asset rather than authoring around it.

**It is falsifiable.** Every panel A proposes is a restatement of a JSON file, so a
wrong panel is a detectable defect. B's panels are pedagogy and C's are interactions;
neither is checkable against an artifact the way "this table must agree with
`wvs_construct_audit.json`" is. That property is what makes the Phase 2 work in the
existing plan meaningful rather than ritual.

**It is the only option where the product cannot contradict the paper.** A surface-first
interface beside a manuscript reporting unidentified exponents and a 3-in-4 construct
failure is not a neutral design choice; it is a second, contradictory claim.

---

## 3. The two strongest arguments against A

Stated at full strength, because a decision recorded without them is not a decision.

### Argument 1 — A is an interface for a negative result, and negatives do not repay a visit

The paper's contribution is a measurement failure: three of four configured constructs
withdrawn, exponents at a bound, a lockbox that protects 17 cells of a 207-row panel.
An evidence surface renders that faithfully as tables of absence. A reader arrives,
learns that the measurement did not work, and has no reason to return — there is
nothing to *do*. A demonstration that fails is a one-shot visit, and a one-shot visit
does not justify routing, an artifact index, and four panels.

**What answers it, and how strongly.** This is the strongest objection and it is only
partly answerable. It is answered to the extent that A is a *verifier* rather than a
*reader*: the audience is a referee or a replicator checking a specific claim, and that
audience returns per claim, not per visit. That is a real audience and the paper's
submission stage makes it the relevant one. It is not answered for a general reader,
and A should not be defended as if it were.

### Argument 2 — A built in the current order scales the exact defect it exists to fix

A's premise is that displayed numbers should be checkable. Today **zero** displayed
numbers are checked against the artifact corpus in the DOM; `check:ui-artifacts`
compares 26 hand-listed values at the data layer, and `check:render` tests five
forbidden patterns on one page load. Prompts 3, 4 and 5 add roughly sixty new displayed
numbers. Built before Prompt 6 is green, A converts a small unverified interface into a
large unverified interface — a better-argued version of precisely the fault
`APP_PLAN.md` diagnoses.

**What answers it.** Only sequencing. A is chosen *conditional on* Phase 2 preceding
Phase 1.3–1.5, which the existing plan already requires and which this document
promotes from advice to precondition. If Phase 2 cannot be made green, A should be
reconsidered rather than built on trust.

---

## 4. What the other options would cost

### B — Teaching tool

**What it needs.** A curriculum: sequence, prerequisites, worked examples, exercises,
and an assessment of whether the reader learned. The surface becomes the subject and
the audit becomes context, which means the 31 artifacts degrade from content to
footnote — the most finished asset is spent, not used. It also needs the surface to be
pedagogically *true*, and the paper's own finding is that the exponents are not
identified on this panel; teaching a bounded surface means teaching a model whose
parameters the data cannot pin, and either saying so on every screen (which is A) or not
saying so (which is not honest).

**Cost profile.** Cheapest in engineering, most expensive in authored words, and the
authored words are the part no gate in this repository can check. The existing
components — `MathematicalAnalysisSection` at 2,327 lines, `BeliefEquationSection`,
`SystemDynamicsSection` — are already written in an explanatory register, so B would
partly *rename* what exists. It is a defensible product. It is not this paper's product.

### C — Sensitivity laboratory

**What it needs, and what already exists.** Saved states (absent), comparison mode
(`CAPTURE A` / `CAPTURE B` / `COMPARE` already on screen), export of every perturbation
(PDF/CSV/LINK already present), and shareable state (`src/utils/urlState.ts` already
serialises the full control state deterministically). Engineering-wise C is the
*cheapest* of the three, because roughly half of it is in the tree.

**Why cost does not decide it.** C industrialises the defect the paper reports. The
`r_collinearity_case.json` verdict is explicit: dropping `R` would cut maximum VIF from
9.43 to 2.47 and raise grouped k-fold from 0.4164 to 0.4226, and it is retained anyway
because acting on that after seeing it is post-hoc specification selection. A laboratory
built to let analysts perturb a model with VIF 9.43 and exponents pinned at a floor does
not merely tolerate that practice; it optimises for it, and it would produce confident
numbers from an unidentified fit at scale. C is a good product for a model that is
identified. It is the wrong product for this one, and the artifact set says so.

---

## 5. What survives unchanged under A

Unchanged means: same file, same props, same behaviour, no rewrite. A is additive, and
that is most of its cost argument.

| element | status under A |
|---|---|
| `Surface3DSurface.tsx` (4,341 lines) | **unchanged**, demoted to one panel; props and behaviour identical |
| the 12 parameter sliders and 46 buttons | unchanged; they become one panel's controls |
| `FormulaDisplay` / Φ decomposition | unchanged; the Mathematical Core becomes a panel |
| `TopBar` headline metrics | unchanged in behaviour; must gain an artifact citation |
| the 5 sidebar items | unchanged as labels; become navigation targets rather than scroll anchors |
| `urlState.ts` export serialiser | unchanged, and becomes the **runtime's URL encoder** — a second serialiser would be the defect |
| PDF / CSV / LINK / CAPTURE A / CAPTURE B export path | unchanged; this is the reason comparison mode is cheap if C is ever revisited |
| `PresetModal`, `AiInterpreterModal` | unchanged; both sit outside the evidence claim |
| `NotationGlossarySection` | unchanged; already artifact-bound, promoted to a first-class panel |
| `SectionTemplate` | unchanged; becomes the shell every new panel reuses |
| the entire CSS layer and its 24,035 lines | unchanged; tokenisation is orthogonal work |

**What does not survive:** the landing view's composition, the single-scroll page, and
the implied claim that the surface is the subject. Those three are the decision.

---

## 6. What would overturn this decision

Written down so that disagreement has a target.

1. **Phase 2 cannot be made green.** If DOM-wide number checking proves infeasible,
   Argument 2 stands unrefuted and A should be dropped or radically reduced.
2. **The audience is readers, not verifiers.** If the intended visitor is a
   non-specialist arriving from a link rather than a referee arriving from a citation,
   Argument 1 stands and B is correct.
3. **RESOLVED 2026-11-12.** `construct_prevalence.json` reported 146 complete cases
   while the panel had 207, because nothing regenerated it after the panel widened. The
   artifact was the stale side: the manuscript already said "67.9% of the scanned frame
   (207 of 305)". Regenerated, and `check:evidence-index` now fails if the analysable
   count disagrees with the canonical CSV — a check that needs no licence-restricted
   source data, so it runs in CI. The substantive finding was never affected: the 3-in-4
   construct failure, the 305 scanned years and the 287 computable Z cells are identical
   before and after.
4. **The exponents get identified.** Everything above rests on the fit being
   unidentified. A model that pins its exponents makes C legitimate and A optional,
   because then there is something worth perturbing.

---

## 7. Blocking issues for the prompts that follow

Recorded here because the next agent will otherwise act on them.

- **`wvs_construct_audit.json` sits in `rawdata/`, not `src/data/analysis/`.** The
  paper's central table therefore falls outside the 31-artifact evidence index that
  Prompt 2 builds, and outside the schema gate that `ci_gate.ts` enforces. A must decide
  whether the audit is an artifact or an input; today it is neither.
- **Two artifacts disagree about the sample.** `construct_prevalence.json` (146,
  generated 2026-11-09) and every 2026-11-11 artifact (207). Prompt 3's verification
  will fail against the panel and pass against the artifact, which is the worst
  outcome available: the check will report a defect in the renderer.
- **The `S_social_support` alpha trap is real and verified.** In
  `wvs_construct_audit.json`, `S_social_support` carries `cronbachAlpha: 0.753`,
  `cellsEmitted: 0`, `cellsRejected: 305`, `computable: false`. Prompt 3's instruction
  to print "not computable" is correct and its assertion — that `0.753` appear nowhere
  in that row — is the right assertion.
- **Prompt 5's `[0, 0.016]` interval is consistent with the artifact but should be
  computed, not typed.** `elasticity_profile.json` is monotone rising with
  `bestValue: 0.001`, p > 0.05 at every grid point up to 0.016 and p = 0.0113 at 0.032;
  the shipped alpha is 0.050, outside the grid entirely. The verdict says the parameter
  is not identified, which is a stronger statement than "the interval ends at 0.016".
- **This document is not yet covered by the drift check.** `check_manuscript_consistency.ts`
  scans `APP_PLAN.md` and `APP_EXECUTION_PROMPTS.md`. Adding `APP_DECISION.md` to that
  list is one line and should be done with Prompt 2, or this file will drift the way
  its siblings already have.
