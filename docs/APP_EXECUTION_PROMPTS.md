# Application work — sequential execution prompts

Each prompt below is self-contained: a fresh agent can be handed one, without this
file or any conversation, and it will have the context, the constraint, the
verification and the stopping condition it needs. Run them in order. Each ends with a
state that the next one assumes.

**Baseline measured 2026-11-11** (re-verify before starting; if a number has moved,
stop and say so rather than working from a stale premise):

| quantity | value |
|---|---|
| analysis artifacts in `src/data/analysis/` | 31 |
| artifacts imported by any module | 7 |
| artifacts whose content appears on first paint | 0 |
| `.tsx` components under `src/components/` | 22 |
| test files under `tests/` | 24 |
| CSS files / lines under `src/` | 20 / 24,035 |
| largest component | `Surface3DSurface.tsx`, 4,341 lines |
| first-paint charts / tables | 1 / 1 |
| sliders / buttons on landing | 12 / 46 |
| gate checks (`npm run ci:gate`) | 68 |
| consistency blocks | 26 |

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

---

## Prompt 2 — An evidence index

Add a landing view that lists all 31 artifacts in `src/data/analysis/`. For each: file
name, schema version, generation timestamp, row count where the schema has one, and a
one-sentence description of what the artifact establishes.

Do not hardcode the list. Read the directory at build time (Vite `import.meta.glob` with
`eager: false` is the idiomatic form) so a new artifact appears without a code change.

For each artifact, also state whether any component currently consumes it. Seven of 31
do. The other 24 are the gap this whole plan exists to close, and the index should say
so plainly rather than implying the artifact set is fully wired.

**Verify** by rendering the index and counting rows against `ls src/data/analysis/*.json
| wc -l`. They must be equal. Also assert that no artifact is listed twice and that the
consumed/unconsumed split sums to 31.

**Done when** the index renders 31 rows, the split is visible, and adding a file to the
directory adds a row without touching the component.

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
