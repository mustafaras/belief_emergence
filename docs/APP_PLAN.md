# Application plan — from demo to evidence surface

## The diagnosis in one paragraph

The application is a parameter explorer. Twelve sliders, forty-six buttons, one
chart, one table. It lets a reader move `X`, `Y`, `α`, `β`, `k` and watch a surface
respond, which is a legitimate thing to build — but it is not what the paper is about.
The paper is an audit: three of four configured constructs fail a reliability test,
the structural exponents cannot be identified on this panel, fifty-nine of the cells
were never in the reserved set, and the surviving construct covers 54.8% of the frame. **None
of that is on screen.** The interface therefore argues the opposite of the manuscript:
it presents a confident fitted surface where the paper reports a measurement failure.

The plan below is ordered by what makes the application true to the paper first, and
useful as a tool second. Every claim is followed by the measurement that produced it.

## Measurements taken 2026-11-11

| # | measurement | value | source |
|---|---|---|---|
| 1 | Analysis artifacts in the tree | **31** | `src/data/analysis/*.json` |
| 2 | Artifacts imported by any module | **5 of 31** | grep of all `analysis/*.json` imports |
| 3 | Artifacts whose content is visible on first paint | **0 of 7** | DOM text search for each artifact's signature terms |
| 4 | Charts on first paint | **1** Plotly surface | `document.querySelectorAll('.js-plotly-plot')` |
| 5 | Tables on first paint | **1** | `querySelectorAll('table')` |
| 6 | Interactive controls | 12 sliders, 46 buttons, 0 selects | DOM count |
| 7 | Navigation depth | **5** items, one scroll page, no routing | sidebar DOM |
| 8 | Analysis panels | 6 `h3` groups on one page | heading structure |
| 9 | First paint | DOM 593 ms, load 1242 ms, 6.9 MB bundle | navigation timing |
| 10 | Component tests | **0 of 22** `.tsx` | `tests/` inventory |
| 11 | Accessibility attributes | 25 across 18 section components | aria/role grep |
| 12 | Dead dependencies | `plotly.js-basic-dist-min`, `three` | static import scan |
| 13 | Largest component | `Surface3DSurface.tsx` 4,341 lines | line count |
| 14 | CSS | 24,035 lines, 20 files, no tokens | line count |

Row 3 is the finding that matters, and it is starker than row 2 suggests. All seven
imported artifacts are wired to a component — but searching the rendered text for each
one's signature term ("cronbach", "lockbox", "provenance", "glossary", "red team",
"screening", "construct validity", "journal") returns nothing on first paint. They sit
behind the Documentation and Advanced Parameters menus, two clicks from the landing
view, while the landing view itself is a fitted surface.

So the evidence exists, is regenerated on every push, is guarded by 68 gate assertions,
and is invisible unless you already know it is there. That is the whole problem: the
interface's front door argues that this paper is about a surface, when the paper is
about the audit that the surface failed.

## Phase 0 — Decide what the application is for

This is a design decision and it must be made before any code, because the rest of the
plan is different depending on the answer. Three coherent products are available from
the same artifacts.

**Option A — Evidence surface.** The application's job is to let a reader verify the
paper. Every artifact gets a view; the surface explorer becomes one panel among many
rather than the whole thing. A reader can see the construct audit withdraw three
channels, see the attrition cascade, see the profile likelihood put the exponents at
a bound, and then — if they want — explore the surface. This is the option that
matches the manuscript, and it is what the rest of this plan assumes.

**Option B — Teaching tool.** The application explains bounded response surfaces to
someone who has not read the paper. The audit becomes context, not content.

**Option C — Sensitivity laboratory.** The application is for analysts who want to
perturb a fitted model. The current design, taken seriously: proper controls, saved
states, comparison mode, export of every perturbation.

**Recommendation: A.** It is the only option where the interface and the manuscript
say the same thing, and it makes the existing explorer more useful rather than
deleting it — the surface panel stays, it just stops being the front door.

## Phase 1 — Make the evidence reachable

**1.1 Routing.** Five navigation items over one scroll page means a reader cannot
link to anything, cannot return to a view, and cannot tell how much is below the fold.
Introduce a router with one route per panel; deep-link every control state through the
URL. The export path already serialises state deterministically — that serialiser is
the URL encoder, and writing a second one would be the mistake.

**1.2 An evidence index.** A landing view listing every analysis artifact with its
schema version, generation timestamp, row count and a one-line description of what it
establishes. Thirty-one rows. This is the single highest-value screen in the plan
because it converts the artifact directory from a developer concern into a reader's
map.

**1.3 Render the audit.** `wvs_construct_audit.json` has, per construct: configured
items, usable items, cells emitted, cells rejected, Cronbach alpha, unidimensionality,
and a `computable` flag. One table, one row per construct, verdict column. This is the
paper's central finding and it is currently invisible.

  Trap: `S_social_support` carries `cronbachAlpha: 0.753` with `cellsEmitted: 0` and
  `computable: false`. The alpha is a leftover. Render `computable` first, or the table
  shows a reliability figure for a construct with no observations.

**1.4 Render the support picture.** The attrition cascade 442,026 respondents → 305
construct country-years → 167 complete cases, with the per-covariate blockers (Gini 94,
education 82, no macro row 22). `data_code_provenance.json` and the panel audit carry
all of it.

**1.5 Render the limits.** The exponents at their bound with the profile interval
[0, 0.016]; the 150 rows never in the reserved set; the `R`/`E` collinearity with VIF
8.74. A section titled, plainly, "what this model cannot show".

## Phase 2 — Make every displayed number checkable

**2.1 Extend `check:ui-artifacts` to the whole DOM.** Today it compares 26 values from
the data layer. Instrument the render, walk the DOM, extract every numeric token, and
match each against the artifact corpus. Values that legitimately come from arithmetic
(percentages, ratios) get computed from artifacts rather than exempted.

**2.2 Section reachability in `check:render`.** Five forbidden patterns and one page
load. It should visit every route, wait for stable render, and fail if a panel produces
less than a threshold of text, throws, or renders an empty chart.

**2.3 A visual baseline.** The export path already produces deterministic snapshots.
One golden image per panel, diffed on CI, would have caught the `630 / 23 countries`
regression the day it landed rather than the week I finally opened a browser.

## Phase 3 — Engineering the load

**3.1 Split the bundle.** 6.9 MB, of which 6.6 MB is one chunk containing Plotly, jsPDF,
html2canvas and KaTeX. None is needed for first paint. `React.lazy` the surface, the
documentation and the export path; target under 2 MB initial. This is the largest
user-visible improvement available and it is independent of everything above.

**3.2 Remove two dead packages.** `plotly.js-basic-dist-min` and `three` are imported
nowhere. Neither ships, so the saving is not bytes — it is the removal of two traps. A
package one word away from the one in use, and a WebGL renderer beside a charting
library that draws the same surface, will both attract a second implementation.

  Keep `html2canvas`: it greps as unused but loads through `await import(...)` in the
  export path. Deleting it on grep evidence breaks export and passes every test.

**3.3 Decompose `Surface3DSurface`.** 4,341 lines. Extract geometry, camera, legend,
and export into modules with their own tests. Prerequisite for 3.4, not cosmetics.

**3.4 Design tokens.** 24,035 lines of CSS with no shared scale. Every spacing and
colour decision is local, so consistency is maintained by memory.

## Phase 4 — Quality the app has never had

**4.1 Component tests** for the ten components that carry displayed numbers. Today
zero of twenty-two are tested, and every UI regression was found by hand.

**4.2 Accessibility to WCAG 2.2 AA.** Twenty-five attributes across six panels is not
conformance. Every chart needs an accessible name and a data-table alternative; every
control a visible focus state; the preset modal and theme toggle need keyboard traps
removed.

**4.3 Performance budget in CI.** Fail the build when the initial chunk exceeds 2 MB,
so the 6.9 MB does not creep back.

## Order, and what each step unblocks

Phase 0 is a decision, not work. Phase 1 is the product change and depends on that
decision. Phase 2 makes Phase 1 safe to iterate on — without it, every new panel is an
unverifiable claim. Phase 3 is orthogonal and can run in parallel by someone who is not
touching panels. Phase 4 locks in what the first three built.

**Do not start Phase 1.3–1.5 before 2.1 and 2.2 are green.** Those three panels add
roughly sixty new displayed numbers, and there is currently no automated way to tell
whether any of them is right. Adding unverified numbers to an interface whose problem
was unverified numbers would repeat the defect at a larger scale.

## What this plan does not do

It does not touch the manuscript. The paper is at 95 and its remaining gap is data —
a completed WVS and Gini panel — not software. This is about the application agreeing
with the paper, and then being worth visiting on its own terms.
