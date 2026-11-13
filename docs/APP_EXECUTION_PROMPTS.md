# Application work — sequential execution prompts

Each prompt below is self-contained: a fresh agent can be handed one, without this
file or any conversation, and it will have the context, the constraint, the
verification and the stopping condition it needs. Run them in order. Each ends with a
state that the next one assumes.

**Baseline measured 2026-11-11** (re-verify before starting; if a number has moved,
stop and say so rather than working from a stale premise):

| quantity | value |
|---|---|
| analysis artifacts in `src/data/analysis/` | 33 |
| artifacts imported by any module | 10 |
| artifacts named in source but never imported | 11 |
| artifacts whose content appears on first paint | 0 |
| `.tsx` components under `src/components/` | 22 |
| test files under `tests/` | 24 |
| CSS files / lines under `src/` | 20 / 24,035 |
| largest component | `Surface3DSurface.tsx`, 4,341 lines |
| first-paint charts / tables | 1 / 1 |
| sliders / buttons on landing | 12 / 46 |
| gate checks (`npm run ci:gate`) | 80 |
| consistency blocks | 28 |

**Corrected 2026-11-12.** Two numbers above were wrong when this file was written. Seven
was never the import count: three of the seven (`reviewer_red_team`,
`q1_submission_gate_report`, `data_code_provenance`) are only *named* in prose inside
`MathematicalAnalysisSection.tsx` and are never imported, so **5 of 31** is the real
figure. A further 11 are named without being imported. The consistency-block count is 28,
not 26. `npm run check:evidence-index` now derives both from the tree.

**Standing rules for every prompt.** Do not touch `paper/`. Do not weaken a check to
make it pass. Run `npm run lint && npm run build && npm run ci:gate && npm run
check:manuscript-consistency` before declaring done, and report the numbers rather
than the word "passing". If a change makes a number in the manuscript wrong, stop and
report — the manuscript is at 95 and its remaining gap is data, not software.

---

## Prompt 0 — Decide the product

You are working in `/Users/m_ras/Downloads/BE_repo_rev/repo`, a Vite + React + Plotly
application that accompanies an academic paper. Read `docs/APP_PLAN.md` for context.

Your only job is to produce a one-page decision document at `docs/APP_DECISION.md`,
choosing between three coherent products that the same 31 artifacts could power:

**A — Evidence surface.** Every artifact gets a view; the fitted-surface explorer
becomes one panel among many. The application's purpose is to let a reader verify the
paper, including its negative findings.

**B — Teaching tool.** The application explains bounded response surfaces to someone
who has not read the paper. The audit is context, not content.

**C — Sensitivity laboratory.** The application is for analysts who perturb a fitted
model. The current design taken seriously: proper controls, saved states, comparison
mode, export of every perturbation.

The document must contain: the choice, the two strongest arguments against it, what
each of the other options would cost to build instead, and a list of the interface
elements that survive unchanged under the chosen option. Do not write code.

**Done when** `docs/APP_DECISION.md` exists, names one option, and a reader who disagrees
can see exactly what they would be arguing with.

---

## Prompt 1 — Route the application

The application is one scrolling page with 5 sidebar items (Advanced Parameters, Φ
Contributions, Documentation, AI Interpreter, Presets) and 6 `h3` analysis groups stacked
vertically. A reader cannot link to a view, cannot return to one, and cannot tell how
much is below the fold.

Add routing. One route per analysis group, one per menu item, with the existing export
serialiser reused as the URL encoder — it already produces deterministic state
snapshots and a second serialiser would be the defect.

Constraints:
- Deep links must restore control state, not just the panel. A link to a slider position
  must survive being pasted into a fresh tab.
- Unknown routes must fall back to the landing route, not a blank screen.
- The 5 existing sidebar items and 6 analysis groups must all be reachable and must all
  appear in the sitemap the router produces.

**Verify** by driving a headless browser: visit each route from a cold start, wait for
stable render, and assert that the panel produced at least 500 characters of text, no
page error, and at least one interactive control. Report the per-route character counts.

**Done when** every route passes that check and the export serialiser is the only place
state is encoded.

**Built 2026-11-12.** 12 routes, each rendering 10,000+ characters cold. The route lives in
the query string (`?v=`), not the path: the app is served from `base: '/belief_emergence/'`,
so a path-based deep link 404s on static hosting. `urlState.ts` remains the only place state
is written — audited by grepping for `history.pushState` / `replaceState` outside it, which
returns nothing. `npm run check:routes` drives every route in a browser and was confirmed to
fail by doctoring its own thresholds (18 named failures, exit 1).

---

## Prompt 2 — An evidence index

Add a landing view that lists all 31 artifacts in `src/data/analysis/`. For each: file
name, schema version, generation timestamp, row count where the schema has one, and a
one-sentence description of what the artifact establishes.

Do not hardcode the list. Read the directory at build time (Vite `import.meta.glob` with
`eager: false` is the idiomatic form) so a new artifact appears without a code change.

For each artifact, also state whether any component currently consumes it. **5 of 31
do** (this prompt originally said seven; see the correction in the baseline table). A
further 11 are only named in prose, which looks like wiring and is not. The other 24 are
the gap this whole plan exists to close, and the index should say so plainly rather than
implying the artifact set is fully wired.

Three states are therefore required, not two: *imported*, *named only*, *untouched*.
Collapsing the middle case into "consumed" is the error that produced the seven.

**Verify** by rendering the index and counting rows against `ls src/data/analysis/*.json
| wc -l`. They must be equal. Also assert that no artifact is listed twice and that the
consumed/unconsumed split sums to 31.

**Done when** the index renders 31 rows, the split is visible, and adding a file to the
directory adds a row without touching the component.

**Built 2026-11-12.** `npm run check:evidence-index` derives the split from real imports
and fails if it drifts from the committed facts; the landing route renders the index and
`npm run check:routes` asserts one row per artifact on disk.

Two rules in this prompt had no enforcement and therefore decayed, so both are now
mechanical rather than advisory:

- **"a one-sentence description"** — seven of the first thirty-one were two sentences.
  `npm run check:description-numbers` counts sentences per description.
- **numbers inside a description** — "maximum VIF of 9.43" is a displayed number, so it
  needs an artifact behind it like any other. That check recomputes each one from the
  artifact it cites and fails on drift. Adding a number without declaring its source
  fails; so does keeping a declaration whose artifact changed shape.

Also fixed while auditing this prompt: descriptions were written with JSON-style `\u2019`
escapes inside TypeScript string literals, so they reached the page as literal `\u2019`
and leaked the digits `2019` into the rendered row.

---

## Prompt 3 — Render the construct audit

The paper's central finding is that three of four configured constructs fail a
reliability test. None of it is on screen. `rawdata/wvs_construct_audit.json` contains,
per construct: `itemsConfigured`, `itemsUsed`, `cellsEmitted`, `cellsRejected`,
`cronbachAlpha`, `unidimensional`, `computable`.

Render one table, one row per construct, with a verdict column: *retained* when
`computable` and alpha meets the floor the paper states, *withdrawn* otherwise, with the
reason.

**Read this before writing the row renderer.** `S_social_support` carries
`cronbachAlpha: 0.753` together with `cellsEmitted: 0` and `computable: false`. The alpha
is a leftover from a partial run. A renderer that prints the alpha field without
checking `computable` will show a reliability figure for a construct with no
observations — the opposite of the paper's claim. Print "not computable" and the reason.

**Verify** with three assertions: the rendered row count equals the construct count in
the artifact; the S row shows the string "not computable" and does not show "0.753"
anywhere in its cells; and every withdrawn construct names a reason.

**Done when** the table is on the landing route, the three assertions pass, and a reader
who knows nothing about the paper can tell which constructs survived.

**Built 2026-11-12.** The table opens the landing route, above the evidence index.
`npm run check:construct-audit` asserts all three conditions against the artifact and the
rendered DOM, and it was tested by removing the `computable` guard: the check then reports
`S_social_support verdict is "retained", expected "uncomputable"` and exits 1, which is the
exact defect the prompt warns about.

The artifact moved from `rawdata/wvs_construct_audit.json` (gitignored) to
`src/data/analysis/`, resolving the blocking question recorded in `docs/APP_DECISION.md`:
the audit is evidence, not an input. That decision raises the artifact count to 32 and the
imported count to 6, and the evidence index picked up the new file without a code change.

**Two corrections made 2026-11-12 after review.**

1. The S row said "7 of 7 configured items are unavailable", reading the empty `itemsUsed`
   list as a total shortfall. Four of seven items are absent (A101, A106, F185, F186) and
   three survive where the coverage floor requires four, so the composite was never
   assembled. That is what the paper states and what the row now says. The availability is
   recorded in `construct_item_availability.json` rather than inferred from an empty array,
   and `check:construct-audit` fails if the reason stops naming the absent items.
2. The table audits four constructs while the paper reports "three of eight". Both counts
   are correct: eight channels were proposed, four are declared but not estimated, and
   three of the four testable ones fail. The audit now says so explicitly in a scope note,
   because otherwise a reader comparing 3/4 with 3/8 concludes one of the two is wrong.

---

## Prompt 4 — Render the support picture

Add a panel showing how 442,026 respondents became 167 complete cases: 305
construct-bearing country-years, 167 complete cases, and the per-covariate blockers
(Gini 94, education 82, no macro row 22, trauma 30, welfare 13, media 12,
urbanisation 4 — the counts overlap, a cell can miss several).

Source the numbers from `data_code_provenance.json` and
`public/data/panel_canonical_v2.audit.json`; do not retype them.

The panel's job is to make the attrition comprehensible, not decorative. A reader should
finish it knowing that Gini is the binding constraint and roughly how much of the frame
survives (54.8%).

**Verify**: the rendered totals must equal the artifact totals; the percentage shown
must equal `panel_rows / 305` computed at render time rather than typed; and the panel
must not claim a cause the artifacts do not support.

**Done when** Gini is visibly the largest blocker and the 54.8% is computed, not written.

**Built 2026-11-12, with the premise corrected.** This prompt was written for a 167-row
panel, so its figures are stale: 167 is now 207, 54.8% is now **67.9%**, and the
per-covariate counts it lists (Gini 94, education 82, no-macro 22, …) appear in no
artifact and sum to 257 against a recorded total of 61 for covariate losses. They are not
reproduced.

The audit did not attribute covariate losses at all before this prompt. `build_canonical_panel.ts`
counted `missingByCovariate` for a console line and dropped it, so the only recorded fact
was `missingCovariate: 61`. The builder now writes the attribution, which makes the
binding constraint a derived fact rather than a claim: **Y (Gini) 31, E 23, X 4, R 3**,
summing to 61. The counts are of first failure, so a cell missing several covariates is
attributed once.

---

## Prompt 5 — State the limits

Add a section titled plainly, "What this model cannot show", covering:
- the structural exponents sit at their lower bound, and the profile likelihood gives
  an interval of `[0, 0.016]` — the panel bounds the exponent from above only;
- the shipped value 0.050 lies outside that interval;
- the lockbox split drew 17 cells from a panel of 87, and the panel is now 167 rows, so
  150 rows were never in the reserved set — the split protects 17 cells, not the sample;
- `R` and `E` share a component (VIF 9.43 for R).

Source from `elasticity_profile.json`, `lockbox_holdout.json`,
`collinearity_diagnostics.json`. Each statement must cite its artifact on screen — not
in a footnote.

This section exists because the interface currently looks decisive while the paper
reports a measurement failure. The section does not need to look apologetic; it needs
to be accurate.

**Verify**: every number rendered must appear in its cited artifact; assert one by one
against the JSON, not by eyeballing.

**Done when** a reader can see all four limits without leaving the landing route.

**Built 2026-11-12, with two premises corrected.** The prompt was written for a 167-row
panel: the rows outside the reserved set are **190**, not 150. And the fourth limit
attributes the dependence to a shared R/E component, which no artifact states —
`collinearity_diagnostics.json` holds only the VIF table. What `r_collinearity_case.json`
does say is stronger and is what the section reports: dropping R cuts maximum VIF from
9.43 to 2.47 and raises grouped k-fold from 0.4164 to 0.4226, and R is retained anyway to
avoid post-hoc specification selection.

`npm run check:limits` performs the verification the prompt asks for — every figure
re-read from its cited artifact, one by one. It was tested by quoting a VIF of 8.74 (fails,
"absent from collinearity_diagnostics.json") and by claiming the exponent sits inside the
interval (fails, "the 'outside the interval' limit is not true and must not be stated").
Wiring this section also raised the consumed-artifact count from 7 to 10, and
`check:evidence-index` caught the stale ledger immediately.

---

## Prompt 6 — Make every displayed number checkable

Extend `scripts/check_ui_agrees_with_artifacts.ts` from 26 hand-listed values to the
whole DOM.

Method: launch the headless browser, walk `document.body.innerText`, extract every
numeric token (`\d+(\.\d+)?`), and for each one assert it appears somewhere in the
artifact corpus, or is derivable from values that do. Maintain an explicit allowlist for
genuine constants (year ranges, parameter counts that come from code) and keep that list
short and commented — an allowlist that grows is a check that has stopped checking.

Then extend `scripts/render_check.cjs` from 5 forbidden patterns and one page load to
visiting every route, with per-route assertions on character count, page errors, and
chart render.

**Verify** both checks by reintroducing a known-wrong value (for instance change one
rendered metric by 0.001) and confirming each check fails with a message naming the
offending value. A check that cannot be made to fail has not been tested.

**Done when** both checks fail on a deliberately wrong number and pass on the real tree,
and the allowlist is under 10 entries.

**Built 2026-11-12.** `npm run check:dom-numbers` scans every route and resolves each
token by exact value, artifact rounding, recomputation, or a 3-entry allowlist; 1375
distinct numbers across 11 routes. `npm run check:render` now visits all 12 routes.

Four real defects were found and fixed while building it, which is the point of the
exercise: `c1`/`c4`/`c5`/`c7` tooltips claimed coefficients of `+1.003`, `-0.635`,
`+0.0227` and `-0.393` while the module holds `0` for four channels that are structurally
unavailable; the preset table said "167 observations" in all 23 rows; two sections said
"23 countries"; and the country-fit chart averaged R2 values it was drawing clamped at
zero, reporting a mean of -113.7 while every bar sat at zero height.

**The allowlist is exact and capped.** An earlier version matched by rounding, which let a
deliberate 0.001 shift through because an artifact happened to contain a nearby number.
Deriving values (`src/verification/derivedValues.ts`) is the escape hatch, not extending
the list — it started at twelve entries and is now three, because slider extents and panel
ranges are read from the markup instead of exempted.

---

## Prompt 7 — Split the bundle

The production bundle is 6.9 MB, of which 6,664 KB is one chunk containing Plotly,
jsPDF, html2canvas and KaTeX. None is needed for first paint.

Lazy-load the surface, the documentation and the export path with `React.lazy` +
`Suspense`. Target an initial chunk under 2 MB. Do not change behaviour to achieve it —
if a component must load eagerly for correctness, say so rather than bending it.

Add a CI budget: fail when the initial chunk exceeds 2 MB, so the number cannot creep
back.

**Verify** with `npm run build`, reporting the chunk sizes before and after, and with a
measured first-paint timing from the browser (navigation timing `domContentLoadedEventEnd`)
before and after. Report both numbers.

**Done when** the initial chunk is under 2 MB, no route regressed in the reachability
check from Prompt 6, and the CI budget is enforced.

**Built 2026-11-12.** 6.6 MB -> **699 kB** in one chunk. `Surface3DOverlay` (4.5 MB of
Plotly), `InteractiveDocumentation` (KaTeX), `AiInterpreterModal` and the PDF exporter are
now behind `React.lazy` / dynamic import, and the surface no longer mounts on arrival —
which was also the last place the interface still led with the 3D view rather than the
audit.

Two design decisions taken while measuring:

- The budget check **measures the network**, it does not inspect the bundle. Rollup writes
  every lazy chunk name into a `__vite__mapDeps` table at the top of the entry, so the entry
  always names Plotly, and `React.lazy(() => import(...))` is byte-identical to an eager
  import. A static check here produced two false positives before the measurement replaced
  it.
- The evidence index no longer reads artifact payloads to print schema, timestamp and row
  count. That cost 3.3 MB of JSON on the landing route (`cv_kfold.json` alone is 1.8 MB) and
  by itself exceeded the budget. `scripts/generate_artifact_facts.ts` extracts the three
  fields at build time into one small module; `check:evidence-index` fails if the table
  drifts from the artifacts.

---

## Prompt 8 — Remove the dead weight

`plotly.js-basic-dist-min` and `three` appear in `dependencies` and are imported
nowhere. Remove them.

**Before removing anything else on the same evidence, read this.** `html2canvas` also
greps as unused — there is no static import — but it loads through `await import(...)`
inside `src/utils/pdf/exportBehavioralDynamicsReport.ts`. Deleting it on grep evidence
breaks PDF export at runtime while passing every test that does not exercise export.
Verify by exporting a PDF before and after any dependency removal.

**Verify**: `npm run build` succeeds, the export path still produces a PDF (drive it in
the browser and assert a non-zero download), and no test regresses.

**Done when** both dead packages are gone, export still works, and the reason
`html2canvas` stays is recorded in a comment where the next person will look.

**Built 2026-11-12.** `plotly.js-basic-dist-min`, `three` and the orphaned `@types/three`
removed; no static or dynamic import for any of the three. Export verified before and
after against the built site: 66,031 bytes before, 66,017 after, both `%PDF-`, no dialog.

`html2canvas` is kept, with the reason written at the import site rather than in a
changelog, and `tests/dependencies.hygiene.test.ts` now fails if it is removed — the test
was confirmed by deleting the dependency and watching it fail.

---

## Prompt 9 — Decompose the largest component

`src/components/visualization/Surface3DSurface.tsx` is 4,341 lines. Extract, in this
order, each as its own module with its own tests:

1. surface geometry generation (pure functions, no React)
2. camera and view-state handling
3. legend and colour-scale rendering
4. the export hook

Keep the component's public props identical so callers do not change. Move code; do not
rewrite it. If a function is untestable after the move, that is a finding — report it
rather than working around it.

**Verify**: the file drops below 800 lines; a snapshot of the rendered surface before
and after the refactor is pixel-identical (this is the acceptance test, not "it looks
right"); and new unit tests cover the extracted geometry functions.

**Done when** the surface renders identically, the component is under 800 lines, and the
extracted modules have tests.

**PARTIALLY BUILT 2026-11-12 — the line target was not met, and the reason is structural.**

Extracted, verified, tested:
  `surface/geometry.ts` (168 lines) — grid construction, slice polylines, nearest-index,
    numeric coercion. 25 unit tests. Prompt 9's instruction to move rather than rewrite was
    followed: every body is verbatim.
  `surface/camera.ts` (57 lines) — four camera presets, documentation axis bounds, logit.

Acceptance test built and committed: `npm run check:surface-snapshot` renders the surface in
a browser and compares the PNG byte-for-byte against `tests/fixtures/surface-baseline.png`,
captured before any extraction. Confirmed to fail by changing one camera component by 0.1
(44,922 bytes -> 44,691). The screenshot was verified deterministic across repeated
captures, which is what makes it usable rather than a flaky test.

**The 800-line target cannot be reached by extraction.** After moving everything that is
separable the component is 4,164 lines, and what remains is not misplaced helpers:

  - 46 `useState` hooks and 3,781 lines of JSX in one function.
  - The dock panel alone is ~1,100 lines of markup driven by ~20 of those hooks.
  - Every handler closes over the surface cache refs, the camera state and the URL
    serialiser simultaneously.

Splitting that requires threading props and callbacks through new boundaries — a rewrite
with a different failure mode, not a move. Prompt 9 explicitly says "move code; do not
rewrite it", so the honest outcome is: the separable part is done and verified, and the
remaining work is a state-management refactor that this prompt's own constraint forbids
doing casually.

**Finding, as the prompt asked to report rather than work around:** the component is not
large because helpers are in the wrong file. It is large because it owns 46 pieces of state
in one function. Extraction addresses the first problem and cannot address the second.

---

## Prompt 10 — Design tokens

There are 20 CSS files and 24,035 lines with no shared scale: every spacing, radius,
duration and colour is decided locally.

Introduce a token layer (CSS custom properties are sufficient; a build step is not
required). Populate it from the values already in use — count them first and report the
distribution, because a token layer invented before measuring produces tokens nothing
uses.

Migrate incrementally, file by file, verifying visually after each. Do not attempt a
single sweeping replacement.

**Verify**: after each file, the golden images from Prompt 6 are unchanged; at the end,
report how many distinct spacing and colour values existed before and how many tokens
replaced them.

**Done when** the tokens are used by every section component and the rendered output is
visually unchanged.

---

## Prompt 11 — Component tests

Zero of 22 components under `src/components/` have a test. Every UI regression in this
project's history was found by hand or by the render check's pattern list.

Write tests for the ten components that carry displayed numbers, in this priority: the
metrics panel, the coefficient provenance panel, the construct audit table from Prompt 3,
the support panel from Prompt 4, the limits section from Prompt 5, then five more.

Test behaviour, not implementation: what appears on screen for a given artifact, and what
happens when the artifact is missing a field. The second case matters more — the
`S_social_support` alpha trap is exactly a missing-`computable` case.

**Verify**: run the suite, report the count, and confirm that deleting a required field
from a fixture makes at least one test fail. A component test suite that cannot fail on
broken data is decoration.

**Done when** the ten components are covered and at least one test per component asserts
graceful behaviour on incomplete artifact data.

---

## Prompt 12 — Accessibility to WCAG 2.2 AA

There are 25 `aria-*`/`role=` attributes across the section components, which is not a
demonstration of conformance.

Work through, in this order: accessible names for every chart (each Plotly surface needs
a text alternative and a data-table fallback), visible focus states for every one of the
46 controls, keyboard operation of the preset modal and the theme toggle, and contrast
checking against AA for both themes.

Do not claim conformance without evidence. For each criterion touched, record how it was
verified — axe-core output, a keyboard walkthrough, or a measured contrast ratio.

**Verify**: run axe-core against every route and report violation counts by impact level
before and after. Do not suppress rules to reach zero.

**Done when** axe reports no critical or serious violations on any route, and the
verification method for each fix is recorded.

---

## Prompt 13 — Performance budget and visual baseline

Two things that keep the previous twelve true.

**Performance**: add a CI step that measures the initial chunk and first-paint timing and
fails on regression beyond a stated budget. State the budget as a number in the workflow
file, not in prose.

**Visual baseline**: one golden screenshot per route, committed, diffed on CI. The export
path already serialises state deterministically; the screenshot harness should reuse that
serialisation so the baseline is reproducible. A diff above a stated pixel threshold
fails the build. This is the check that would have caught the `630 / 23 countries`
regression the day it landed, rather than the week a human finally opened a browser.

**Verify**: deliberately change one rendered string and confirm the visual check fails
with the route named. Then revert.

**Done when** both budgets are enforced in CI and both have been proven to fail on a
deliberate regression.

---

## Sequence and dependencies

```
Phase 0  Prompt 0                 decision only, no code
Phase 1  Prompts 1-5              product change
Phase 2  Prompt 6                 ← must be green before 3, 4, 5
Phase 3  Prompts 7-10             engineering
Phase 4  Prompts 11-13            quality
```

**Prompt 6 is a gate, not a step.** Prompts 3, 4 and 5 add roughly sixty new displayed
numbers. Running them before 6 means adding unverified numbers to an interface whose
defining defect was unverified numbers. If you must reorder, run 6 first.

Prompts 7 and 8 are orthogonal to 1–5 and can run in parallel with them. Prompt 9 touches
the surface component, which Prompts 1 and 7 also touch — run it after both.
