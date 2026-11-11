# Application plan

The manuscript is done: 68 gate checks, 26 consistency blocks, 137 tests, and both
PDF sources compile clean. The application has not had the same treatment. This
plan comes from measuring it rather than from taste, and every figure below was
taken from the tree on 2026-11-11.

## What the measurements say

| finding | measurement | why it matters |
|---|---|---|
| Bundle is 6.9 MB | `dist/assets/index-*.js` = 6,664 KB | slow first load; the manuscript's own claim is that the evidence surface is inspectable |
| Two dependencies are dead | `plotly.js-basic-dist-min` never imported (only `plotly.js-dist-min` is); `three` never imported at all | two full Plotly builds and a complete WebGL renderer in the tree for code that does not use either |
| The UI does not present the paper's contribution | the construct audit appears in **1** of 18 section components, and that mention is incidental | the paper's thesis is that three of four constructs fail; the app shows none of that |
| No component is tested | 0 of 22 `.tsx` files have a test; all 137 tests are model/artifact tests | every UI regression so far was caught by hand or by the render check's 5 patterns |
| Accessibility is thin | 25 `aria-*`/`role=` attributes across 18 sections | keyboard and screen-reader access is not demonstrated |
| Two components are vast | `Surface3DSurface.tsx` 4,341 lines, `InteractiveDocumentation.tsx` 2,504 | changes there are risky and slow to review |
| CSS is not scoped by system | 20 CSS files, 24,037 lines, no design tokens | visual consistency is maintained by hand |

## Phase 1 — Truth (nothing new, only alignment)

**Goal:** every number and every sentence in the interface comes from an artifact.

1.1 Extend `check:ui-artifacts` from 26 values to **every** displayed number. Enumerate
them by instrumenting the render: walk the DOM, extract numeric text, and assert each
one appears in some artifact. The current check covers the metrics panel and the
coefficient blocks; it does not cover the tables and the chart annotations.

1.2 Extend `check:render` from five forbidden patterns to a **section reachability**
assertion. Today it reads 11,518 characters and one Plotly chart; the app has 18
sections and 46 controls. It should click each section, wait for render, and fail if
a section produces fewer than a threshold of characters or throws.

1.3 Add the numbers the manuscript reports and the app omits: the construct alphas
(0.819 / 0.348 / −1.228), the withdrawn constructs, frame coverage 54.8%, the
profile-likelihood interval [0, 0.032], and the Tier C instability. None of these is
on screen today.

  One trap to avoid while doing it: `wvs_construct_audit.json` carries a
  `cronbachAlpha` of 0.753 for `S_social_support` even though that construct has
  `cellsEmitted: 0` and `computable: false`. The field is a leftover from a run in
  which some items were momentarily available. Any panel that renders "alpha" must
  check `computable` first and print "not computable", or it will show a reliability
  figure for a construct that has no observations.

## Phase 2 — The contribution, made visible

**Goal:** an inspectable audit, not a dashboard of one fitted surface.

2.1 A **Construct Audit** section: one row per configured construct with item set,
usable items, cells emitted, Cronbach alpha, and the verdict (retained / withdrawn).
All of it already exists in `wvs_construct_audit.json`; none of it is rendered.

2.2 A **Support** panel: the attrition cascade from 442,026 respondents to 167
complete cases, with the per-covariate blockers (Gini 94, education 82, no macro row
22). `data_code_provenance` and the panel audit already carry these numbers.

2.3 A **Limits** section stating what the app cannot show: the exponents are at their
bound, the panel cannot identify them, 59 cells are not lockbox-blind, `R` and `E`
share a component. This is the paper's posture and the app contradicts it by looking
decisive.

2.4 Retire or relabel every string that still implies the retired 630-row panel. The
render check catches the literals; it cannot catch a sentence that describes the old
design in words.

## Phase 3 — Engineering

3.1 Drop two unused packages. `plotly.js-basic-dist-min` is never imported -- only
`plotly.js-dist-min` is -- and `three` is never imported either, despite Plotly
already providing the 3D surface it would be used for. Neither is in the bundle,
since Vite tree-shakes unreferenced packages, so the saving is not bytes: it is the
removal of two traps. A package named one word away from the one in use, and a whole
WebGL renderer sitting in `dependencies` next to a charting library that draws the
same surface, will both eventually attract a second implementation.

  Checked and kept: `html2canvas` is used, but through `await import(...)` inside the
  PDF export path, so a source grep for a static import finds nothing. Removing it on
  that basis would break export at runtime and pass every test that does not exercise
  the export path.

3.2 Split the bundle. `Surface3DSurface` and `InteractiveDocumentation` are the two
largest components and neither is needed for first paint. Lazy-load both behind
`React.lazy`; target under 2 MB for the initial chunk. This is the single largest
user-visible improvement available.

3.3 Decompose the two giant components. 4,341 lines in one file is not reviewable.
Extract the surface geometry, the camera controls, the legend, and the export path
into separate modules with their own tests.

3.4 Introduce design tokens. 24,037 lines of CSS with no shared scale means every
spacing and colour decision is local. This is a prerequisite for 3.5, not a
cosmetic wish.

## Phase 4 — Quality gates the app has never had

4.1 Component tests. Start with the render-critical paths: metric formatting, the
validator self-tests (already covered indirectly), the export serializer, and the
preset modal. Target the ten components that carry displayed numbers.

4.2 An accessibility pass to WCAG 2.2 AA. The 25 existing attributes are not a
demonstration of conformance. Concretely: every chart needs an accessible name and a
data-table alternative; every control needs a visible focus state; the theme toggle
and the preset modal need keyboard traps removed.

4.3 Visual regression. The export path already serialises state deterministically —
that is the same machinery a screenshot baseline needs. One golden image per section,
diffed on CI, would have caught the `630 / 23 countries` regression the moment it
landed.

## Order of work and why

Phase 1 first because a wrong number on screen is worse than a slow page, and because
1.1 and 1.2 are the checks that make everything after them safe. Phase 2 is the
highest value per unit of effort: the data exists, the rendering does not, and it is
what converts the app from a demo into the paper's evidence surface. Phase 3 pays off
in load time and in the ability to change anything without fear. Phase 4 is what keeps
it true once the other three are done.

Nothing in Phases 2–4 should start before 1.1 and 1.2 are green, because every one of
them changes what the interface displays and there is currently no automated way to
tell whether the change is correct.

## What this plan explicitly does not do

It does not touch the manuscript. The paper is at 95 and its remaining gap is data,
not software. This is about the application agreeing with the paper, and then being
worth visiting on its own terms.
