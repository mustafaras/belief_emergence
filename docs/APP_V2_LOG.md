# Application v2 execution log

## P00

- Date: 2026-11-16
- Branch: `app-v2` (isolated worktree at `/Users/m_ras/Downloads/BE_repo_rev/repo-app-v2`)
- Baseline commit: `b3596de` (`docs(report): record final paper sync pass`)
- `npm ci`: PASS; installed 822 packages. npm reported 37 dependency advisories (8 low, 7 moderate, 15 high, 7 critical); no audit fix was applied.
- `npm run test:run`: PASS; 42 test files, 315 tests passed, 0 failed.
- `npm run build`: PASS; TypeScript and Vite production build completed.
- `dist/assets` total: 10,779,362 bytes (about 10.28 MiB).
- Build warnings: several modules are both statically and dynamically imported; the largest current chunk is `Surface3DOverlay` at 4,706.30 kB (1,425.26 kB gzip).
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P01

- Dependencies added: Source Serif 4, Inter Variable, JetBrains Mono, d3-scale, d3-shape, d3-array, d3-hexbin, zod; development dependencies include the matching D3 types, stylelint, stylelint-config-standard, and Playwright Test.
- Added `.stylelintrc.json` and the `lint:css` script. The first run exposed that legacy `src/App.css`, `src/index.css`, and `src/styles/**` are also outside the prompt's original ignore list; those are ignored until the planned P16 UI replacement. New v2 CSS paths remain lintable.
- `npm run lint:css`: PASS.
- `npx tsc -b`: PASS.
- `npm run lint`: PASS with 0 errors and 7 existing warnings.
- `npm run test:run -- tests/dependencies.hygiene.test.ts`: PASS; 9 tests.
- After dependency changes, npm reported 33 advisories (8 low, 6 moderate, 12 high, 7 critical); no audit fix was applied.
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P02

- Confirmed the authoritative metrics artifact keys without reading its values: `n`, `r2`, `corr`, `mae`, `rmse`, `bias`, `bias_definition`, `observed_scale`, `predicted_scale`, `dataset_id`, `model_id`, `timestamp`.
- Added the `ClaimFormat`, `PaperRef`, and `Claim` types; the formatter; an empty registry with `getClaim` and `listClaims`; and the `useClaim` accessor.
- Added nine tests covering two examples for each of the eight formats and an unknown-claim error. The pre-implementation run failed because the format module did not exist; after implementation all 9 tests pass.
- `npx tsc -b`: PASS.
- `npm run lint`: PASS with 0 errors and 7 existing warnings.
- `npm run test:run -- claims`: PASS; 9 tests.
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P03 — resolved using the authoritative artifact

- The user selected the artifact value for the D alpha discrepancy. `wvs_construct_audit.json` stores `D_social_atomization.cronbachAlpha = -1.2284774929408622`; the claim retains that raw value and `p3` formatting displays `-1.228`.
- Updated the P03 test to assert the exact artifact value and its three-decimal display. No source artifact was changed.
- The artifact reports 442,026 respondents; the prompt notes that the manuscript sometimes reports 442,473. The artifact value is used in the claim.
- The canonical panel CSV independently reports 207 rows and 83 countries. Other P03 values match: 305 country-years; Z 0.8187/287; C 0.3482/303; D 296; S 0 cells and uncomputable; 3 failed non-outcome constructs; frame share 0.6787; Gini windows 102/140/167/184/207.
- `npm run test:run -- tests/claims.audit.test.ts`: PASS; 7 tests.
- `npx tsc -b`: PASS.
- `npm run lint`: PASS with 0 errors and 7 existing warnings.
- Paper source files were not changed in this app-v2 lane; manuscript-specific consistency remains tracked by the paper sync report.

## P04 — evaluation claims use live artifact values

- Added 35 evaluation claims and a `selectEvaluationSeries()` accessor. The series contains 300 tier/fold points across 20 recorded seeds and 100 grouped refit folds; tests verify the tier medians reproduce `cv_kfold.json`.
- The prompt's expected numbers were stale. The live artifacts report linear/bounded in-sample R² `0.462273/0.406140`, grouped k-fold medians `0.407413/0.407420`, pooled country-out R² `0.405262/0.405267`, and paired median difference `0.000001926` with the bounded model ahead in 56% of 100 folds.
- Primary grouped refit tier medians are A/B/C `0.407420/0.521621/0.482418`. Headline metrics come from `metrics_authoritative.json`: corr `0.639340`, MAE `0.138743`, RMSE `0.179949`, bias `+0.004827` (mean observed minus predicted).
- Empirical interval coverage reads `prediction_interval_coverage.json`: rolling-origin means A/B/C `0.867405/0.844921/0.817317`, with under-coverage rates `0.36/0.48/0.48`; country-out means `0.915863/0.913655/0.907631`, with under-coverage rates `0.156627/0.144578/0.144578`. Claim notes identify the empirical interval method and fold-conditional interpretation.
- In-sample tier R² comes from `model_ladder_metrics.json`: `0.462273/0.559057/0.563414`; Tier C is marked exploratory. Full-design C-minus-B median is `-0.039203`, and the full-panel per-repeat median is `-0.007917`.
- The legacy `pooledLoo` claim IDs remain for route compatibility, but their visible labels and notes identify these values as pooled country-out diagnostics rather than primary OOS inference.
- `npm run test:run -- tests/claims.evaluation.test.ts`: PASS; 5 tests. Full claim suite: PASS; 21 tests.
- `npx tsc -b`: PASS. `npm run lint`: PASS with 0 errors and 7 existing warnings. `npm run build`: PASS; existing large-chunk warning remains.
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P10

- Added the full light/dark token sets, system dark-mode token mapping, fontsource imports, and global reset with a visible focus ring and reduced-motion rules.
- Added five tests that verify all 45 token names in light, explicit dark, and system dark contexts; text/state contrast; and contrast for data-series colors.
- `npm run test:run -- design.tokens`: PASS; 5 tests.
- `npm run lint:css`: PASS.
- `npx tsc -b`: PASS.
- `npm run lint`: PASS with 0 errors and 7 existing warnings.
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P11

- Added Button, IconButton, Badge, Card, Callout, SectionHeader, Kbd, Skeleton, and ErrorState with CSS Modules and design-token variables.
- Badge exposes its visible label as the accessible name; IconButton requires an accessible label; ErrorState uses the plan's build-defect message.
- Added render coverage for all nine components, Badge accessible-name coverage, and a disabled Button click check.
- `npm run test:run -- ui.kit1`: PASS; 2 tests.
- `npx tsc -b`: PASS.
- `npm run lint`: PASS with 0 errors and 7 existing warnings.
- `npm run lint:css`: PASS.
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P12

- Added Tabs, SegmentedControl, Slider, Toggle, Popover, Tooltip, Drawer, generic DataTable, FigureFrame, and Num.
- Slider supports arrows, PageUp/PageDown, Home/End, marks, paper marker, and `aria-valuetext`. DataTable sorting exposes `aria-sort` and has a horizontally scrollable wrapper. Num reads the claim registry and carries `data-claim-id` plus artifact provenance in `title`.
- Popover and Drawer share a focus trap; Escape closes them and returns focus to the explicit trigger ref.
- Added five interaction tests for slider keys, table sort state/order, registry formatting, Drawer Escape/focus return, and Popover focus trapping.
- `npm run test:run -- ui.kit2`: PASS; 5 tests.
- `npx tsc -b`: PASS.
- `npm run lint`: PASS with 0 errors and 7 existing warnings.
- `npm run lint:css`: PASS.
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P13

- Implemented the shared SVG chart frame and responsive size observer plus CompareBars, DistStrip, LineProfile, Heatmap, Funnel, HexScatter, and Calibration. Each chart exposes an accessible title/description and a visually hidden data table; empty chart data renders ErrorState.
- Added the development-only `?v=__kit` gallery with the full component kit and sample charts in light and dark themes, plus `scripts/shoot.cjs` using the system Chrome binary.
- Visual inspection found and fixed a ResizeObserver feedback loop that expanded chart SVGs, legacy `body { overflow: hidden }` preventing gallery page scrolling, low-contrast global heading styles, and mobile horizontal overflow. Charts retain a readable 720px minimum canvas inside their own horizontal scroller; the page itself stays within the viewport.
- Funnel bars use per-unit scales and only show losses between adjacent steps with the same unit. The gallery reports 18 and 80 country-year losses and does not subtract respondents from country-years.
- Visual checks: desktop 1440px light/dark full-page screenshots and a 390px mobile screenshot. At mobile width, `documentElement.scrollWidth` is 390px and chart-local horizontal scrolling works.
- `npm run test:run -- tests/charts.render.test.tsx`: PASS; 8 tests.
- `npx tsc -b`: PASS.
- `npm run lint`: PASS with 0 errors and 7 existing warnings.
- `npm run lint:css`: PASS.
- `npm run build`: PASS; existing large-chunk warning remains (`Surface3DOverlay` 4,706.30 kB, 1,425.26 kB gzip).
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P05

- Added the limits selector and profile series from the current artifacts. The prompt's expected profile limits (`0.016/0.032`), bound R² (`0.3622/0.4034`), structural-window metrics (`0.3466/0.3396/0.3755`), and anchor R² (`0.3763/0.3317`) are stale: current artifacts yield `0.064/0.064`, `0.3786/0.3990`, `0.3786/0.3786/0.3786`, and `0.4062/0.4062`, respectively. No source artifacts were edited.
- Other current values: shipped alpha 0.050; VIF R/E 9.4274/4.8275; max VIF without R 2.4722; lockbox 17 cells across 11 countries; refit alpha and beta both at the lower bound; two exponents on bound; 2006 sensitivity retains the current artifact's 20 excluded rows and 187 remaining rows.
- Added tests for the claims and profile calculation; direct assertions cover source booleans because the registry Claim value type is numeric.
- `npm run test:run -- claims`: PASS; 26 tests across four files.
- `npx tsc -b`: PASS.
- `npm run lint`: PASS with 0 errors and 7 existing warnings.
- `npm run build`: PASS. Existing mixed static/dynamic import warnings and the large `Surface3DOverlay` chunk remain (4,706.30 kB; 1,425.26 kB gzip).
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P06

- Added model claims backed by the fitted coefficients and cluster-bootstrap artifacts, plus the country alignment selector backed by `preset_country_alignment.json`. The selector cross-checks all 83 countries and the 34 preset ISO3 codes against `presets.generated.ts`.
- Live coefficient values are E `0.386522`, R `0.288161`, M `-0.137477`, T `-0.084917`, tr `-0.158004`, yr `0.746818`; the prompt's R and yr examples (`0.26` and `0.63`) are stale. The bootstrap intervals excluding zero are c_E `[0.120900, 0.736120]` and c_yr `[0.131682, 1.435241]`; the app exposes a zero-exclusion status only for E and yr. The current `phi0_minus_lnk` estimate and interval are `0.658768 [0.494379, 0.850325]`; separate phi0 and k are not identified.
- The four withdrawn production channels C/D/G/S are verified to have zero coefficients. The failure log records 324 folds and zero nonconverged folds; pooled stability has one unstable term in Tier B and none in A/C.
- Country source check: `presetFailures` has six preset countries (CHN, CZE, FRA, GEO, ITA, POL), while `allCountryFailures` has nine of 83 (adding PSE, UGA, VNM). The earlier `15 of 83` statement is stale; the current main manuscript and supplementary material both report 9/83. `npm run check:manuscript-consistency`: PASS; 36 claim blocks checked, 3 optional checks skipped because their files are absent.
- Added model and country selector tests; `npm run test:run -- claims`: PASS; 31 tests across six files.
- `npx tsc -b`: PASS.
- `npm run lint`: PASS with 0 errors and 7 existing warnings.
- `npm run build`: PASS; existing mixed static/dynamic import warnings and `Surface3DOverlay` size warning remain (4,706.30 kB; 1,425.26 kB gzip).
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P07

- Added registry uniqueness enforcement and an integrity suite for unique IDs, finite numeric values, on-disk artifact provenance, resolvable artifact paths, and nonempty manuscript section references when present.
- The path resolver supports nested JSON paths, filtered array selectors, array lengths, and the two canonical-panel CSV paths used by the existing data claims (`rows` and `iso3`).
- `npm run test:run -- claims`: PASS; 34 tests across seven files, including all three integrity checks.
- `npx tsc -b`: PASS.
- `npm run lint`: PASS with 0 errors and 7 existing warnings.
- `npm run build`: PASS; prior import and large-chunk warnings remain.
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P14

- Added the 11-route AppShell, route loaders, legacy redirects, query-string navigation, previous/next links, sticky header and contents rail, responsive Contents drawer, reading progress, and persisted light/dark theme toggle. Each route now has its temporary SectionHeader and In progress callout.
- `main.tsx` now renders AppShell; `index.html` has the requested app title and description. The old App and router remain for the explicitly later P16 migration.
- Restored the ThemeContext stub and tested theme persistence. An initial case-sensitive filename collision was caught in browser review and resolved by moving the shared context value to `themeContextValue.ts`.
- Refreshed the generated artifact-consumption projection after the P05/P06 selectors landed: 38 artifacts, 27 imported, 7 referenced-only, and 4 untouched. `npm run check:evidence-index`: PASS.
- Route, shell, and theme tests: PASS; 7 tests. Full suite: PASS; 375 tests across 55 files. `npx tsc -b`: PASS; ESLint: 0 errors and 7 existing warnings; CSS lint: PASS; `npm run build`: PASS.
- Visual acceptance: `node scripts/shoot.cjs overview desk light` and `node scripts/shoot.cjs overview mob light` both saved screenshots. Desktop title bar stays on one line with no overlap. At 390px, page width remains 390px; browser navigation opened the Contents drawer, selected Countries, updated `?v=countries`, closed the drawer, and produced no page errors.
- Build warnings remain for Zod annotations and a 1,553.41 kB chunk (413.47 kB gzip); they do not fail production output.
- Commit: deferred; the active session's existing instruction is to keep work uncommitted.

## P15

- Added the Claim Inspector with source artifact, JSON path, generator/paper reference when available, artifact filename copy, and an Open artifact link. Numeric claims open the inspector and return keyboard focus to the selected number.
- Added the Ctrl/Cmd+K command palette with fuzzy route, claim, and artifact search; keyboard selection; route navigation; claim-to-inspector navigation; and artifact selection. Claim navigation clears any stale artifact query parameter.
- Added inspector and palette tests. The focused suite passed 10 tests; the final full suite passed 378 tests across 57 files. `npx tsc -b`, CSS lint, evidence-index check, and production build passed. ESLint reports 0 errors and the same 7 existing warnings.
- Browser verification through system Chrome: artifact search opened `?v=reproduce&artifact=preset_country_alignment.json`; claim search opened the Evaluation route, showed the Claim Inspector, and linked the `eval.kfold.folds` claim to `cv_kfold.json`. A previous artifact query was cleared when selecting a claim. No browser page errors; settled Evaluation section and inspector were screenshot-checked.
- Build warnings remain for Zod annotations and a 1,567.16 kB chunk (418.31 kB gzip). Tests emit expected PDF-font fallback warnings. Commit: deferred; work remains uncommitted.

## P16

- Removed the legacy root App, global CSS, `src/components/`, and `src/router/`; moved the geometry, camera, and color-scale engines under `src/sections/geometry/engine/` and adapted consumers. Current route state is centralized in `src/app/routes.ts`.
- Removed the 12 v1 visual baselines and the old component/router/export test files: `tests/components.numericPanels.test.tsx`, `tests/router.routes.test.ts`, and `tests/surface.export.test.ts`. Also removed the now-unused `tests/fixtures/supportAuditFixture.ts`. Kept the accessibility and theme context coverage; theme coverage now lives in `tests/theme.context.test.tsx`.
- Replaced the visual-baseline check with the planned P37 SKIP, updated render/route/a11y checks to the 11 current routes, and removed the components exception from Stylelint. The number audit now reads current app sources and route-specific construct/preset rows; obsolete AI-prompt and legacy-slider checks were removed.
- Removed `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `react-katex`, `@types/react-katex`, `html2canvas`, and `framer-motion`. Kept direct `katex` for P31, plus Plotly/D3 for later geometry and chart stages. The legacy PDF exporter remains as a P32 migration input; its old canvas renderer is disabled.
- Regenerated artifact-consumption facts from current imports: 38 artifacts, 22 imported, 3 named-only, 13 untouched. `npm run check:evidence-index`: PASS.
- Acceptance: `npm run test:run` PASS (346 tests / 54 files); `npx tsc -b` PASS; `npm run lint` PASS (0 errors, 1 existing Fast Refresh warning); `npm run lint:css` PASS; `git diff --check` PASS. `npm run check:visual-baselines` correctly reports SKIP until P37.
- Browser verification: `npm run check:routes` and `npm run check:render` PASS on all 11 current routes with correct route URL/navigation, no uncaught page errors, and no forbidden legacy copy.
- `npm run build` PASS. Existing Zod annotation warnings remain; the main chunk is 1,567.17 kB (418.33 kB gzip). The dependency removal command reported 29 audit advisories; no automatic audit fix was applied.
- Commit: deferred; work remains uncommitted.

## P17

- Replaced the Overview placeholder with the article hero, a sub-title, and a 22-word lede summarizing the first two abstract sentences. Added four responsive finding cards and the three-item “How to read this” guide.
- Connected the cards to live claims: failed constructs and the artifact-derived four-construct denominator; grouped k-fold R² for bounded and linear models; and the profile alpha upper point. The current artifact-backed profile claim is `0.064`, while the prompt's `0.03` example is stale. The identity-correlation card remains a labeled Skeleton until P22 creates `gates.original.identityCorr`.
- Added `FindingCard` and `audit.constructCount`; updated `SectionHeader` with an optional subtitle. Route links now dispatch route changes to every `useRoute` subscriber so the section and AppShell stay in sync.
- Axe found low contrast in the muted text and active-route numbers, a visible Search shortcut missing from its accessible name, and an unnamed findings `div`. Adjusted the light `ink-3` token, active-route number color, Search accessible name, and findings group role. The token test now asserts muted text contrast.
- `npm run test:run`: PASS (347 tests / 55 files); `npx tsc -b`: PASS; `npm run lint`: PASS (0 errors, 1 existing Fast Refresh warning); `npm run lint:css`: PASS; `npm run build`: PASS. Existing Zod annotation warnings remain; main chunk is 1,568.36 kB (418.80 kB gzip).
- Browser checks: all 11 routes pass route and render checks. Axe reports zero violations across 11 routes in light and dark themes; dark Overview keyboard traversal reaches 26/26 stops and theme toggle passes Space/Enter. A 390px viewport has `scrollWidth === innerWidth`, the audit card link changes the URL to `?v=audit` and renders Construct Audit, with no page errors.
- Visual review: `tmp/shots/overview-desk-light.png` and `tmp/shots/overview-mob-light.png`; no overflow or card collision observed. Commit deferred; work remains uncommitted.

## P19 — PARTIAL; stopped at Figure 1.2 source gate

- Added Figure 1.1 with four clickable claims for 442,026 respondents, 305 scanned country-years, 287 outcome cells, and 207 estimation rows. Each value opens its artifact and JSON path in Claim Inspector.
- Inspected the two allowed blocker sources. `construct_prevalence.json` has no variable-wise Y/E/T blocker totals or `meta` field; `gini_window_sensitivity.json` has no `meta` field and its rows report Gini backfills, not variable blockers. In particular, `giniBackfilled=92` at window ±3 is not the planned E-blocker count. The planned Y=131, E=92, T=46 bars were not plotted or fabricated; Figure 1.2 shows an explicit source-availability note.
- Broader source check: the historical `docs/data_plan_blockers.py`, run read-only against the ignored raw inputs in the main worktree, reports 99 candidate cells, 22 without a macro row, and Y=63/E=51/T=20. The current `npm run build:panel:dry` also wrote no files and reported 305 construct rows, 207 complete cases, and 61 missing retained covariates attributed first to Y=31/E=23/R=3/X=4. Both are different calculations and neither matches or replaces the prompt's required artifact-backed 131/92/46. The ignored raw inputs are absent from this isolated app-v2 worktree; Drive metadata searches for `wvs_combined` and a raw-data/WVS folder found no exact match in either connected account.
- Added Figure 1.3 from the DataContext panel: 83 countries × 34 calendar years, sorted by row count with ISO3 tie-breaks; absent country-years are hatched. Year ticks are thinned to five-year intervals plus endpoints, while the screen-reader table retains every year and cell. The heatmap scrolls horizontally within its frame and supports keyboard scrolling without page overflow.
- Fixed AppShell test setup to include the DataProvider required by the new data route. Fixed the hidden accessible data table's intrinsic width so it no longer expands the heatmap's horizontal scroll area.
- Acceptance: full suite PASS (349 tests / 56 files); TypeScript, ESLint (0 errors, 1 existing Fast Refresh warning), CSS lint, production build, evidence-index check, and `git diff --check` PASS. The build retains existing Zod annotation and large-chunk warnings.
- Browser checks: all 11 routes pass route and render checks. Data route axe checks report 0 violations in light and dark themes. All four funnel claims open their inspector; at 390px the page width remains 390px, the heatmap scroll area is 720px, and ArrowRight advances the focused heatmap. Desktop and mobile screenshots: `tmp/shots/v-data-desk-light.png`, `tmp/shots/v-data-mob-light.png`.
- Migrated the P19 browser verifier from removed v1 blocker-table selectors to the current Data & Support route. It now compares the four claim values and their inspectors with the registry, requires Figure 1.2's explicit source warning, and compares all 83 accessible country rows × 34 years against the canonical panel matrix. Browser result: PASS; at 390px the page remains 390px wide, the heatmap scrolls 720/358px, and ArrowRight advances scrollLeft 0→31.
- Fixed rendered-number parsing for comma-grouped values and added the same continuous calendar years used by `buildSupportMatrix` to the derivation corpus. `check:dom-numbers` now passes all 180 distinct values across 11 routes with zero unresolved tokens.
- Revalidation after those checker changes: full suite PASS (351 tests / 56 files); `npx tsc -b`, CSS lint, production build, and bundle budget PASS. ESLint has 0 errors and 1 existing Fast Refresh warning. The landing route requests 1,540 KiB JavaScript (budget 2,048 KiB); median cold FCP is 112 ms (budget 2,500 ms). Existing Zod annotation and large-chunk warnings remain.
- Full `ci:gate` under Chrome and the running app server: 89/91 checks passed. P19's rendered-number and support checks pass. The two failures are ordered later: Construct Audit table (P21, not started) and Geometry Lab surface snapshot (P29, not started); neither was implemented out of sequence.
- Status: P19 remains open because the execution prompt says to stop if the specified blocker totals cannot be found. P20 has not been started. Resume when an authoritative Y/E/T blocker source is supplied or the P19 scope is explicitly revised. Commit deferred; work remains uncommitted.

### P19 re-verification (2026-11-16)

- `npm run test:run`: PASS, 351 tests across 56 files. `npm run build`: PASS (TypeScript and Vite); existing Zod annotation and large-chunk warnings remain.
- `npm run lint`: PASS, 0 errors and 1 existing Fast Refresh warning. `npm run lint:css`: PASS. `npm run check:evidence-index`: PASS, 38 artifacts (22 imported, 3 referenced only, 13 untouched).
- `npm run check:dom-numbers`: PASS, 180 distinct rendered values across 11 routes, 0 unresolved.
- `npm run check:support-picture`: PASS; four claims match the registry and inspectors, Figure 1.2 shows its source warning, all 83 × 34 support cells match the panel, and mobile remains 390/390px with a keyboard-scrollable 720/358px heatmap.
- `npm run check:bundle-budget` first could not find Playwright's default Chromium binary. Re-running with the installed system Chrome through `CHROME_PATH` passed: 1,540 KiB across 4 requested chunks; median cold FCP 184 ms (2,048 KiB / 2,500 ms budgets).
- Main-worktree `npm run verify:q1:docs`: PASS; 36 manuscript claim blocks and section references validated. Both worktrees pass `git diff --check`.
- The P19 source gate remains open: the two permitted blocker artifacts still contain neither `meta` nor Y/E/T totals. P20 remains unstarted. Commit deferred; work remains uncommitted.

### P19 authoritative-source recheck (2026-11-16)

- Searched both worktrees and all reachable Git history for an artifact containing the required variable-wise blocker totals. No authoritative version was found; exact values elsewhere are unrelated (for example, 131 Gini-join losses and 92 Gini backfills at window ±3).
- Searched both connected Drive accounts for the exact permitted artifact filenames; neither account returned a matching file. The user selected the authoritative-artifact path, but no attachment or file link is present in the workspace/conversation.
- P19 remains stopped at Figure 1.2. Do not substitute the historical raw-input calculation or derive the requested values from unrelated counts. Resume when the authoritative artifact is attached or linked; P20 remains unstarted.

### P19 closed (2026-11-16) — the gate was a definition, not a missing source

The earlier sessions searched for an artifact that would *contain* Y/E/T blocker totals and, not finding one, stopped. That search assumed the numbers were stored somewhere. They were not, and could not be: the attribution is a property of the raw extract, so it needs a generator rather than a lookup. Deriving it resolved the gate.

- **Reproduced the planned values exactly.** Walking the construct rows in the builder's own order — resolve ISO, require a computable outcome, require a macro row, then examine covariates — yields 268 country-years at the covariate stage, 87 raw-complete, and 181 short of at least one driver. Among those 181, exposure is **Y 132, E 93, T 46**. The prompt's 131/92/46 is the same measurement one cell smaller: `MV→MDV 2021` is the only country-year that resolves through the ISO-2 map and is missing both `Y_gini` and `E_education_capacity`, so it is the single cell that moves all three counts by one.
- **The manuscript's sentence was wrong in two ways, and arithmetic showed it.** "Of the 180 cells lost, 131 were lost to Y alone; education 92 and trauma 46" sums to 269 against a stated 180. The counts overlap; a cell short of both Y and E appears in both. They are exposure, not a partition, and "alone" was the specific false word. A disjoint first-failure attribution over the same 181 cells gives Y 128, E 26, T 20, X 4, M 2, R 1 and does sum to 181.
- **A second contradiction in the same subsection:** the prose said "79 recovered cells" while the table two paragraphs above it reported 97 for the adopted ±5 window. 79 is the ±2 figure; the sentence was never updated after the panel widened.
- New generator `scripts/generate_covariate_blockers.ts` (`npm run generate:blockers`) writes `src/data/analysis/covariate_blocker_attribution.json`, recording exposure, first-failure, exclusive single-covariate, the missing-covariate histogram, the resolution arithmetic, and a cross-check that the permanently-lost count equals the panel audit's 61.
- Shared RFC 4180 reader extracted to `scripts/lib/csv.ts`. The first draft of the generator used `split(',')` and produced Y=128, losing four cells to quoted fields in the macro extract; the panel builder already had the correct parser, so both now import one copy. Panel rebuild after the refactor is byte-identical: SHA-256 `5A37D543…CF055B9`, 207 rows.
- Manuscript Step 2b restated as exposure with the artifact named, and 79 corrected to 97.
- Two guards added to `check_manuscript_consistency.ts` (36 → 38 blocks): `COVARIATE_BLOCKERS_DRIFT` re-reads the artifact and refuses both numeric drift and the wording "alone", "were lost to", "were lost after"; `GINI_RECOVERED_COUNT_DRIFT` compares the prose count with the adopted-window artifact row. Both were mutation-tested — reintroducing "alone" and 79 fails the check with the expected messages — and the clean tree passes.
- Figure 1.2 now plots both series from the artifact (exposure, overlapping, as the manuscript quotes it; first-failure, disjoint, summing to the frame) and states that the overlapping bars must not be added. `CompareBars` gained claim click-through (`data-claim-id`), a `format` option, wrapped axis labels, a stacked legend and bar-centred value labels; it previously accepted `claimId` and ignored it.
- `check_dom_numbers` now detaches `[data-scale-label]` subtrees before reading `innerText`. Axis ticks are chosen by d3 `.nice()` and are not measurements; without this the first axis-bearing section demanded artifacts for "60.00" and "80.00". Hiding them was not enough — `innerText` aggregates SVG `<text>` regardless of `display`, so the nodes are removed and restored in place. Result: 203 distinct values across 11 routes, 0 unresolved, allowlist still 3 entries.
- Updated for the new artifact: evidence index (39 artifacts), `artifactDescriptions`, and the pinned inventory test.
- Acceptance: `npm run test:run` **351/351** (56 files); `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`, `check:support-picture`, `check:dom-numbers` all PASS. `npm run ci:gate` **89/91**: the two failures are Construct Audit (P21) and Geometry surface (P29), both unstarted and recorded as such in the earlier P19 entry.
- Commit deferred; work remains uncommitted.

## P20 — Data labs: Gini window and zero-fill

- Figure 1.4 "How far may a Gini value be borrowed?" — `SegmentedControl` over exact/±1/±2/±3/±5, the adopted value defaulted and marked on the `LineProfile`. Two large readouts move with the selection: complete-case rows and the number of cells borrowed from a neighbouring year, plus that count as a share of the rows. Every readout is a registered claim, so the click target and the plotted point are the same number.
- Figure 1.5 "Do the imputed zero-death cells carry the result?" — `Toggle` between the full panel and the panel with all `nZeroAnchor` inferred-zero rows deleted, comparing Tier C − Tier B on grouped k-fold and on the per-repeat median.
- URL state: `gw=0|1|2|3|5` (deleted at the adopted ±5) and `zf=0|1`. Lab changes `replaceState` so they do not fill the back stack, and preserve unrelated keys so a claim deep link survives. `useLabUrlState` owns this, not the router.
- New claims: per-window `recovered` counts, both splits' `n`, both `perRepeatMedianCminusB`. `giniSchema` and `zeroFillSchema` extended to cover the fields the labs read, so a renamed artifact field fails at load rather than rendering blank.

### Corrections the artifact forced

- The prompt's fixed caution ("The ordering is conditional on the zero-death inference") is not what the artifact says, and the artifact is right. `zero_fill_sensitivity.json` reports `resultSurvivesRemoval: true`: the k-fold gap keeps its sign (−0.029 → −0.009) when the 42 rows are deleted. The per-repeat median does cross zero (−0.008 → +0.000). So the honest statement is *partly* conditional, and it names which metric survives. The callout says that and cites the two numbers; `resultSurvivesRemoval` is shown as the recorded verdict.
- Signed values print at three places in this lab. At two, the crossing that the whole argument rests on renders as `+0.00` and disappears. Added `signed3` to `ClaimFormat` with a test asserting it differs from `signed2` on exactly that value.

### Three defects found while building this

- **`CompareBars` accepted `claimId` and ignored it.** Values were never clickable, so the chart's numbers had no route to their artifact. Now every `claimId` renders a focusable button that opens the Claim Inspector, and the chart switches `role="img"` → `role="group"` when it contains interactive children (axe `nested-interactive`, which flagged both Data charts the moment the buttons appeared; `Funnel` already did this).
- **Every clickable chart value was unreadable.** `text-decoration: underline dotted` on SVG `<text>` draws through the glyphs — `442,026` rendered as `4̶4̶2̶,̶0̶2̶6̶`. This was already true of `Funnel` before P20 and no check caught it, because the accessible table carries the value and the audit reads `innerText`. Replaced with a colour affordance and a focus ring; verified at 3× on the running page.
- **`LineProfile` clipped a marker label at the right edge** ("paper ±5" rendered as "paper") and formatted year ticks as `0.00 … 5.00`. Labels now anchor inward when they would overflow, and `xFormat`/`yFormat` let a caller print integer ticks while the data table keeps its own precision.

### Verification

- `npm run test:run`: PASS, 352 tests across 56 files. `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- `npm run check:a11y`: PASS, 0 violations across 11 routes × 2 themes, exit 0. Focusable targets rose to 41 on the Data route (24 buttons).
- `npm run check:dom-numbers`: PASS, 221 distinct values across 11 routes, 0 unresolved, allowlist still 3 entries. The labs' rounded displays are supplied by `deriveLabDisplayValues`, which re-applies the same rounding to the same artifact fields rather than widening the corpus policy.
- `npm run check:support-picture`, `check:routes`, `check:render`, `check:bundle-budget`: PASS. Landing route 1,545 KiB in 4 chunks (budget 2,048 KiB).
- `npm run ci:gate`: **89/91**. The two failures remain Construct Audit (P21) and the Geometry surface snapshot (P29); both are unstarted.
- Browser: segmented control and toggle both move their readouts and write `?gw=` / `?zf=`, with no page errors. Screenshots `tmp/shots/p20-gini.png`, `tmp/shots/p20-zerofill.png`.
- Commit: `feat(app-v2): gini window and zero-fill labs [P20]`.

## P21 — Construct Audit

- Table 2.1 renders one row per construct from `constructRows`, the same builder `npm run check:construct-audit` validates: construct, configured items, usable items, cells, alpha, verdict badge, and the reason. Rows carry `data-construct` and `data-verdict` so a verifier addresses a row by identity rather than position; `DataTable` gained a general `rowAttributes` prop for this instead of hard-coding construct knowledge into the table.
- `S_social_support` renders the words "not computable". It carries `cronbachAlpha: 0.753` beside `cellsEmitted: 0` — above the 0.70 floor — so printing the alpha would show a reliability pass for the one construct the paper says cannot be estimated. `buildConstructRows` withholds it and the table has no path to it; a test asserts `0.753` appears nowhere on the page.
- Scope note reconciles eight proposed channels with four audited constructs and says the other four are "not estimated", so a reader cannot compare 3/4 with the manuscript's three-of-eight and conclude one is wrong.
- Decision Lab 3 — reliability floor slider, 0.30–0.90 step 0.05, paper value 0.70. The admitted count is recomputed by `admittedAt(floor)`, which re-filters each alpha rather than reading a stored verdict: moving the slider asks "how many would survive *my* threshold", which is a different question from the paper's verdict and has to be answered by the alpha. A withheld alpha never counts, at any floor — S is "not admitted — no observations" even at 0.30, where C joins and the count becomes 2.
- The table's alpha colour reflects the *paper's* verdict, not the slider. Colouring it by the live floor made Z turn red at 0.90, which reads as a finding when it is a hypothetical.
- **Figure 2.2 skipped, deliberately.** No artifact here carries an item-level correlation matrix; `wvs_construct_audit.json` reports aggregate alpha only and `itemOverlaps` is a two-construct overlap list, not a matrix. The prompt's rule is to skip and log rather than fabricate, so the section states the omission in a Callout. A reconstructed matrix would be the exact failure the section documents.

### Defects found

- **`check:construct-audit` read a field that does not exist.** It asserted `sRow.suppressedAlpha`, but `ConstructRow` names the flag `alphaWithheld`. The check had never run against a rendered page, so the assertion was dead and the guard it was supposed to provide was absent; the script is outside `tsc -b`'s include, which is why nothing caught it. Fixed, and the check now passes on real output.
- **The same check loaded the wrong route.** It navigated to the app root (Overview) and waited 9 s for a table that route never renders, so it reported "0 rows" against a correct page. It now loads `?v=audit` and waits for the rows.
- **`Slider` drew the paper marker twice.** A caller that labelled the paper value in `marks` got the component's own "paper" marker at the same offset, and the two strings overprinted ("paper 0.70" over "paper"). The component now skips its marker when a mark already sits there.
- **Badge `pass` was 4.39:1**, below the 4.5 floor for 12px text, and axe flagged it the moment a retained badge rendered in the light theme. `--pass` darkened `#1A7F4B` → `#157347` (5.1:1). This was latent: no retained badge existed on any route before this section.
- Claim pointers for the verdict counts named `wvs_construct_audit.json` while the values live in `construct_prevalence.json`; the registry-integrity test caught it and the specs now carry the correct artifact.

### Verification

- `npm run test:run`: PASS, 357 tests across 57 files (five new audit tests). `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- `npm run check:construct-audit`: **PASS** — 4 constructs, 1 retained, 2 withdrawn, 1 uncomputable, failure rate 75% at floor 0.70.
- `npm run check:a11y`: PASS, exit 0, 0 violations across 11 routes × 2 themes.
- `npm run check:dom-numbers`: PASS, 242 distinct values, 0 unresolved, allowlist still 3 entries. The audit's two-place alphas, its percentage and the Data labs' signed three-place values are supplied by `deriveConstructAuditDisplays` / `deriveLabDisplayValues`, which re-apply the same rounding to the same artifact fields rather than loosening the corpus policy.
- `npm run ci:gate`: **90/91**. The only remaining failure is the Geometry surface snapshot (P29, unstarted).
- Browser: slider moves 0.70 → 1 admitted, 0.30 → 2, 0.90 → 0; table colours stay fixed at the paper floor; no page errors. Screenshots `tmp/shots/p21-audit-table.png`, `tmp/shots/p21-lab-fixed.png`.
- Commit: `feat(app-v2): construct audit [P21]`.

## P22 — Design Gates

- Four `GateCard`s render the manuscript's four rules with their measured values and a badge, switched by a `SegmentedControl` between the submitted and rebuilt panels. `panel=original|rebuilt` is written with `replaceState` and read back on popstate; the default is the original panel, so the key is dropped rather than set to it.
- Every measured value is a claim, so a reader can open `design_gates.json` and check "1.000" against the field. The rank gate prints as a count (`7 of 8`) rather than `7.000`, because a rank is not a correlation.
- Root-cause diagram: `A006 → Z item 1` and `A006 → C index`, the second arrow drawn as a broken red path into `C = a·Z + b, r = 1 by construction`. Inline SVG with title and desc, not a diagram library: the topology is fixed and the point is the arrow direction.
- P17's placeholder is gone. The "Outcome identity" finding card now renders `gates.original.identityCorr` instead of a Skeleton, and the overview test asserts the claim id rather than a pending status.
- Provenance block states which numbers a clean clone can reproduce: the 630-row design matrix is read from `8f5c06b`, while the upstream 1,128-row deviation is recomputed only when the restricted extract is present.

### What the gates actually measure — and the two panels

The manuscript's claim is that all four rules failed on the submitted panel and all four pass on the rebuilt one. Both halves were prose; nothing computed them. Measured now:

| Gate | Rule | Submitted | Rebuilt |
|---|---|---|---|
| identity | \|corr(xⱼ,Z)\| < 0.999 | **1.000** (C) | 0.577 (R) |
| duplicates | \|corr(xⱼ,xₖ)\| < 0.9999 | **1.000** (D / S) | 0.885 (E / R) |
| rank | rank(X) = p | **7 of 8** | 6 of 6 |
| singlePredictor | R²(xⱼ→Z) < 0.99 | **1.000** (C) | 0.334 (R) |

Two things had to be got right for these to match the paper, and both were wrong on the first attempt:

- **The predictor list must be the submitted design matrix**, which includes `S_support_index` and excludes `M_internet_daily` (that column is empty). Narrowing to the columns with full coverage silently raises the rank gate from 7/8 to 7/7 and turns a failing gate into a passing one. The list is now an explicit constant with that failure written beside it.
- **The upstream deviation is not the 630-row panel.** `4.4e-15` and `1,128 rows` come from `rawdata/panel_model_data.csv`, a different and larger file. Measuring the deviation on the committed v1 panel gives 8.9e-16 over 630 rows — a real number, but not the one the paper prints.

### Defects found

- **Naive `split(',')` again.** The first version of the upstream measurement parsed the macro extract by splitting on commas; quoted country names shifted every column after them and it reported 1,181 rows with a deviation of 5.78. Switched to PapaParse, which the panel loader already uses. This is the second time in two prompts that a hand-rolled parser produced a plausible-looking wrong number.
- **Kahan summation was required to reproduce the published figure.** With a plain `reduce` sum the deviation is 1.13e-14; compensated, it is 4.44e-15. The reported quantity is the floating-point residue of an exact identity, so the summing order dominates it — and reporting 1.13e-14 would have contradicted the manuscript while looking like rigor.
- **Rounding to twelve places reported the deviation as 0.** `4.4e-15.toFixed(12)` is `0.000000000000`, which would have claimed perfect equality. Now stored via `toPrecision(3)`.
- **`heading-order` on both themes**: the gate cards are `h3` with no `h2` above them, since the section header is the `h1`. Added the lab heading; a11y is back to 0 across all routes.
- **`4.44e-15` broke the number audit.** The scanner tokenises rendered text and read `4.44` and `-15` as two values, leaving the exponent unresolved. The figure is now written `4.44 × 10⁻¹⁵`, and the audit derives the mantissa from the artifact — the value the reader sees, not a loosened policy.

### Verification

- `npm run generate:design-gates`: submitted 0/4 pass, rebuilt 4/4 pass, upstream deviation `4.44e-15` **recomputed** from the sibling worktree's extract over 1,128 rows.
- `npm run test:run`: PASS, 362 tests across 58 files (five new gate tests). `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- `npm run check:a11y`: PASS, exit 0, **0 violations** on all 11 routes × 2 themes.
- `npm run check:dom-numbers`: PASS, 262 distinct values, 0 unresolved, allowlist still 3 entries.
- `npm run ci:gate`: **90/91**. The only remaining failure is the Geometry surface snapshot (P29, unstarted).
- Browser: switching panels moves the summary 0/4 to 4/4 and writes `?panel=rebuilt`; no page errors. Screenshots `tmp/shots/p22-original.png`, `tmp/shots/p22-diagram.png`.
- Commit: `feat(app-v2): design gates [P22]`.

## P18 — Audit Replay

- A five-state replay under the Overview findings: the submitted panel, then three repairs, then the honest comparison. The prompt says "four steps" and then lists Step 0–4, so the counter reads 0/4 at rest and the steps are labelled Start, 1, 2, 3, 4 — Step 0 is the starting state, not a step.
- Panel state is derived, not written: `statesAfter(index)` unions the gates each step names and falls back to the artifact's `rebuilt.allPass` for the last step. If `design_gates.json` ever stopped reporting all-pass, the replay would show it instead of claiming completion.
- Active step is tracked by scroll geometry against a reading line at 35% of the viewport, not by an `IntersectionObserver`. The observer variant fired only on threshold crossings, so once a step left the banded `rootMargin` the panel kept the last value it saw — it reported 4 gates passing at rest because the last step had been the last entry to cross.
- Step navigation buttons exist for keyboard use and are shown at narrow widths; `prefers-reduced-motion` disables the only transition (a colour change).
- The last step renders the bounded-vs-linear `CompareBars` in its own column. It was first placed inside the sticky card, where it was clipped: the card is `position: sticky` and sized to its content, so a chart appended at its bottom ran past the viewport and was never seen.

### Defects found

- **`window.matchMedia` was called unguarded.** jsdom does not implement it, and neither do older embedded webviews; the Overview threw and every test that rendered the page failed. The reduced-motion rule is CSS, so the flag only decides whether to animate — it now degrades to "animate" instead of throwing.
- **A layout-less environment selected the last step.** jsdom reports every `getBoundingClientRect().top` as 0, which satisfies "top <= reading line" for all five steps. Guarded: if every step measures zero, stay at the start.
- **`p4` printed the model gap as `0.0000`** while the sentence around it said the difference was tiny. The gap is 7.1e-6. Added `p6` to `ClaimFormat` and the replay now prints `0.000007` next to both R² values at `r2`, so the sentence and the number agree.
- **`opacity: 0.72` on inactive steps** dropped the step number and the repair tags to **2.74:1** contrast on both themes. The dimming is now a colour change on the title only, which is what the hierarchy was for.
- **The a11y keyboard walk stopped at 26 of 29** on Overview. The three unreachable stops existed because `document.activeElement` returns an `SVGElement` for a focusable `<text>` in the mini chart, and the audit tested `instanceof HTMLElement` — so it read a valid tab stop as the document boundary and reported a failure on a page whose order was intact. Fixed in `scripts/a11y_check.cjs`; the walk now reports 29/29.

### Verification

- `npm run test:run`: PASS, 367 tests across 59 files (five new replay tests). `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- `npm run check:a11y`: PASS, exit 0, **0 violations** on 11 routes × 2 themes, and the Overview keyboard walk reaches **29/29** stops with visible focus rings.
- `npm run check:dom-numbers`: PASS, 266 distinct values, 0 unresolved, allowlist still 3 entries.
- `npm run ci:gate`: **90/91**. The only remaining failure is the Geometry surface snapshot (P29, unstarted).
- Browser: scrolling moves the counter 0 → 1 → 3 → 4 and the mini chart is present at rest; no page errors. Screenshots `tmp/shots/p18-replay-start.png`, `tmp/shots/p18-replay-end.png`.
- Commit: `feat(app-v2): audit replay [P18]`.

## P23 — The Model

- Four equations rendered serverlessly with `katex.renderToString`: the structural product with its field, the saturation map, the equivalent logit form, and the logistic form. A callout states the point the four share — they are one model, so a claim about one is a claim about all four.
- The Φ term map separates what was estimated from what was named. Six chips carry their coefficient and an `identified` / `not identified` badge driven by the bootstrap interval; four withdrawn chips carry the reason in their accessible name rather than only a strike-through, because colour and line-through are both invisible to a screen reader.
- Table 4.1 lists the six estimated terms with coefficient, 95% country-cluster interval, and an identification column. Only education capacity and the inequality × welfare interaction have intervals excluding zero.
- Four specification cards: Tier A (11 parameters, 18.818 obs/parameter), B (18, 11.5), C (22, 9.409, exploratory), plus the linear baseline.
- "Reading the signs" gives the three paragraphs from §5, applies the directional vocabulary only to the four surviving channels, and derives the identified count from the intervals rather than typing it.

### The M row, and why the prompt's shorthand was not usable

The prompt asked Table 4.1 to annotate M with "sign flipped across panels; not identified". No artifact recorded a flip, so it was measured — `scripts/generate_sign_diagnostics.ts` → `sign_diagnostics.json`. The answer splits, and the split is the finding:

| | submitted panel | rebuilt panel |
|---|---|---|
| `corr(M, Z)` — marginal | **−0.690** | **+0.356** |
| single-variable slope | −1.143 | +0.368 |
| partial coefficient (X, Y, T, E, R controlled) | −0.520 | −0.105 |
| 95% interval on the partial coefficient | [−0.296, +0.019] | same artifact |

The marginal association reverses; the partial coefficient does not; and the partial interval includes zero, so neither sign is a finding. The prompt's shorthand is true of the first quantity and false of the second, and a coefficient table reports the second. The row and its callout now state both.

The nonlinear refit on the submitted panel is degenerate and is recorded as such rather than resolved: the outcome there is an exact affine rescaling of `C`, so the design matrix is rank-deficient and the optimiser has no unique basin. That is the same defect the design gates report, arrived at from a different direction.

### Defects found

- **`render_check`'s FORBIDDEN list banned `amplifier` and `suppressor` outright**, while the manuscript's §5 quotes that vocabulary as prior framing it declines to adopt, and this section repeats the quotation. Banning the words forces a paraphrase of a term the paper quotes verbatim; allowing them lets a future section use them as findings. Replaced with a positional rule — the words may appear only inside quotation marks — and unit-checked against both a quoted and a bare occurrence.
- **`model.bootstrap.M.lo` does not exist**; the ids are `model.bootstrap.c_M.lo`. The section threw on every panel until corrected, which is why the first browser run reported zero KaTeX blocks and zero rows.
- **`Table 4.1` was passing the number audit by coincidence** — an unrelated artifact happens to contain the string `4.1`. The label is now marked `data-scale-label`, the same mechanism the axis ticks use, so a label is excluded because it is a label and not because some artifact contains the digits.
- **`p2` printed 9.409 as `9.41` and 18.818 as `18.82`**, which the audit read as two values that resolve nowhere. Now `p3`, matching what the artifact records.
- **Inline KaTeX rendered at display scale**, so a lone `Φ` inside a paragraph dwarfed its line. Scoped to `1em` for inline math only.

### Verification

- `npm run test:run`: PASS, 373 tests across 60 files (six new model tests). `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- `npm run check:render`: **RENDER OK** — 11 routes, no forbidden text, no page errors, with the quoted-only rule live.
- `npm run check:a11y`: PASS, exit 0, **0 violations** on all 11 routes × 2 themes.
- `npm run check:dom-numbers`: PASS, **301** distinct values, 0 unresolved, allowlist still 3 entries.
- `npm run ci:gate`: **90/91**. The only remaining failure is the Geometry surface snapshot (P29, unstarted).
- Browser: 7 KaTeX blocks, 6 coefficient rows, 6 + 4 chips, 4 specification cards; no page errors. Screenshots `tmp/shots/p23-equations.png`, `tmp/shots/p23-table.png`.
- Commit: `feat(app-v2): model section [P23]`.

## P24 — Evaluation: functional-form comparison (hero)

- Figure 5.1 plots three groups — in-sample, grouped k-fold, pooled country-out — for both forms. The caption says they are three different evaluations rather than three estimates of one quantity, because the contrast between them *is* the argument: the bounded form loses in sample (0.4061 vs 0.4623) and ties out of sample (0.4074 vs 0.4074).
- The hero sentence prints both held-out medians as `InlineClaim` buttons, so the section's headline numbers open their artifact like every other value. They were `<span>`s on the first attempt, which broke the interface's own rule that every number is inspectable — and the number audit would not have caught it, because a span's text is just text.
- A `DistStrip` shows the per-fold distribution with the raw 100 folds per model. The artifact previously carried only `{median, q25, q75, n}`; a strip built from quartiles would have been a drawing of the summary rather than of the data, so `block()` now also emits `values` and `FoldSummary` names the type. Regenerating the artifact changed no headline number.
- Two callouts take positions the prompt did not ask for but the artifacts support: the earlier "linear won decisively" claim is recorded as withdrawn rather than revised, and the country-out bars are labelled a spatial stress test with its degenerate per-fold median printed (both models −1.82), so a reader does not mistake the pooled figure for a per-fold one.

### Defects found

- **The hero numbers were not claims.** Caught by inspection, not by a check: the section read "0.4074 against 0.4074" in a `<span>` while the chart below it made the same two values clickable. `InlineClaim` now renders a button that opens the inspector, keeps the sentence's typography, and carries the artifact path in its title.
- **`-1.8199223791720796` printed as `-1.82`** in prose for both models, which then required the exact value in the derived corpus. Rather than allowlisting, the evaluation section's rounded forms (`r2` at four places, strip-table quartiles at three, and the degenerate per-fold medians) are now computed from `functional_form_comparison.json` in the same rounding the components apply.

### Verification

- `npm run generate:functional-form`: unchanged headline values (0.4623 / 0.4074 / 0.4053), now with 100 raw folds per model.
- `npm run test:run`: PASS, 380 tests across 61 files (seven new evaluation tests). `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- `npm run check:a11y`: PASS, exit 0, **0 violations** across 11 routes × 2 themes.
- `npm run check:dom-numbers`: PASS, **323** distinct values, 0 unresolved, allowlist still 3 entries.
- `npm run ci:gate`: **90/91**. The only remaining failure is the Geometry surface snapshot (P29, unstarted).
- Browser: two charts, eight claim nodes, headline opens the inspector, no page errors. Screenshot `tmp/shots/p24-hero.png`.
- Commit: `feat(app-v2): functional form comparison [P24]`.

## P25 — Evaluation protocols and tiers

- Four tabs, one per protocol, rather than one figure with twelve bars: grouped k-fold is the primary held-out protocol, country-out is a spatial stress test whose per-fold median is degenerate, rolling origin is a temporal scope diagnostic, and coverage asks a different question again. Averaging four answers to four questions was the failure mode this structure avoids.
- Grouped k-fold: a `DistStrip` over the raw 100 folds per tier, median cards, and Decision Lab 5 with a `SegmentedControl` over the twenty seeds.
- Country-out: per-fold median beside pooled R², with the degenerate figure labelled as such and the variance-ratio caveat stated.
- Rolling origin: RMSE by test year as a `LineProfile`, labelled a trajectory rather than a sample.
- Coverage: observed coverage against nominal 95% for both protocols.
- In-sample context below the tabs: the ladder table with R², Corr, MAE, RMSE and bias per tier, Tier C badged exploratory everywhere it appears.
- URL state `tab=` and `seed=`, both written with `replaceState` and preserving unrelated keys. `Tabs` gained optional `activeId`/`onActiveChange` so a section can mirror the selection without giving up the uncontrolled behaviour the earlier callers rely on.

### What the seed sweep shows

**Tier C trails Tier B on 13 of 20 seeds.** That is a majority, and it is the number that justifies calling Tier C exploratory rather than merely noisy — eleven extra parameters help the training fit and cost transfer on most draws. The lab's readout is a per-seed claim (`eval.seed.<n>.cMinusB`), so the value on screen opens the repeat it came from.

### Defects found

- **Four artifacts carry `null` where a metric is undefined**, not zero: a country-out fold with one or two rows has no measurable variance, so R² does not exist. The zod schemas rejected the artifact outright, which was the correct first reaction and the wrong final one — the fix is to model the null and drop those entries, not to coerce them to 0, which would report a perfect fit for a fold that could not be scored.
- **`Tabs` was uncontrolled**, so the section could not mirror the tab into the query string without duplicating its keyboard handling. Added `activeId`/`onActiveChange` as optional props; existing callers are untouched.
- **`DataTable` columns must name a row field**, and the ladder's metrics nest under `trainMetrics`. Rather than loosen the table's contract, the rows are flattened once at module scope.
- **Per-seed deltas have no single artifact field** — they are `C.r2 - B.r2` within one repeat. The claim path names `perRepeatRefit` and the note records the derivation, because pointing at a field that does not exist would be a worse lie than admitting the value is computed.

### Verification

- `npm run test:run`: PASS, 386 tests across 62 files (six new protocol tests). `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- `npm run check:a11y`: PASS, exit 0, **0 violations** across 11 routes × 2 themes.
- `npm run check:dom-numbers`: PASS, **357** distinct values, 0 unresolved, allowlist still 3 entries.
- `npm run ci:gate`: **90/91**. The only remaining failure is the Geometry surface snapshot (P29, unstarted).
- Browser: four tabs switch and write `?tab=`, the seed control writes `?seed=`, Lab 5 reads −0.087 with 13/20 seeds failing; no page errors. Screenshot `tmp/shots/p25-kfold.png`.
- Commit: `feat(app-v2): evaluation protocols [P25]`.

### P25 bundle regression, found by running the app

- Running the app locally surfaced two problems the gate had not: a React hydration error on the Model route, and a bundle overrun on Evaluation.
- **Model:** `MathBlock` returned a `<div>` in both display and inline modes, and three of its uses sit inside a `<p>`. A `<div>` there is invalid HTML; React reported a hydration error on every Model visit. The smoke test caught it and `ci:gate` could not — the gate asserts text and numbers, and this was a console warning. Inline math is now a `<span>`; no console errors remain on `?v=model`, 7 KaTeX blocks still render.
- **Evaluation:** importing the four cross-validation artifacts directly put **2,295 KiB** into the initial payload against a 2,048 KiB budget. The cause is that `cv_kfold.json` is 1.8 MB and `cv_country_out.json` 0.9 MB, because each fold carries its full coefficient vector plus observed/predicted arrays; the section renders a few hundred numbers. `src/evidence/evidenceIndex.ts` already documents this hazard and loads artifacts with `eager: false`.
- Fix: `scripts/generate_evaluation_summary.ts` projects the four artifacts onto exactly what the section renders — per-fold R² series, aggregate quartiles, the rolling RMSE series, coverage rates, the ladder, and the seed deltas. The projection is **16 KiB** and every claim still names the raw artifact, so the inspector points at the evidence of record rather than at the summary.
- Result: initial payload **2,295 → 1,616 KiB**, budget PASS, and the rendered-number audit still resolves all 357 values with nothing added to the allowlist. The raw artifacts remain on disk, in the evidence index, and reproducible.

Verified after the fix: `npm run build`, `check:bundle-budget` PASS (1,616 KiB), `test:run` 386/386, `check:render` RENDER OK, `check:dom-numbers` 357 with 0 unresolved, `ci:gate` **90/91** with only the unstarted Geometry surface remaining.

## P26 — Limits: the structural exponent

- Figure 6.1 plots the profile likelihood-ratio statistic across the grid with both thresholds drawn, and marks where the shipped exponent sits. Decision Lab 6 toggles the Bonferroni correction.

### Two things the data said that the prompt did not

**The correction changes nothing, and that is the finding.** The prompt expected the upper bound to move between 0.016 and 0.032 as multiplicity was charged. It does not move at all: **0.064 in both states**, because the largest statistic anywhere on the grid is **3.02** — below even the uncorrected χ²₁ threshold of 3.84, let alone the Bonferroni threshold of 7.24. There is no rejected point for a correction to reject. The toggle stays and the readout says "grid edge — no point is rejected", because an interval that is the edge of the tested grid is a different statement from an interval the data located.

**The shipped exponent was never a tested value.** `α = 0.050` is not one of the seven grid points; it lies between 0.032 and 0.064. The profile therefore brackets the shipped value without testing it, which is precisely why the parameter reads as unidentified rather than estimated. My first draft said "outside the tested grid", which the test caught as wrong in the other direction — 0.050 < 0.064.

### Defects found

- **`profileUpperBound` returned the grid maximum silently.** It computed `max(value | p > threshold)`; when every point clears the threshold that expression returns the largest grid value, so both the plain and the Bonferroni bound printed 0.064 and read as "the interval ends here". Rewritten to return `{ value, gridLimited, maxStatistic, threshold }`, computing the χ² quantile from the p-value by the closed form rather than typing 3.84, so a Bonferroni correction is a real recomputation.
- **`LineProfile` computed its y-domain from the data points only**, so any threshold above the largest point was drawn outside the viewBox — the Bonferroni line was invisible, which removed the comparison the chart exists to make. The domain now includes the thresholds.
- **Threshold labels were anchored at the right edge**, where they collided with a vertical marker placed near the axis end ("Bonferroni" printed through "shipped 0.050"). They now sit at the left, alternating rows.
- **`FigureFrame`'s figure number was passing the number audit by coincidence**, like `Table 4.1` did. Now marked `data-scale-label`, so every figure number is excluded because it is a label.

### Verification

- `npm run test:run`: PASS, 391 tests across 63 files (five new limits tests). `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- `npm run check:a11y`: PASS, exit 0, **0 violations** across 11 routes × 2 themes.
- `npm run check:dom-numbers`: PASS, **376** distinct values, 0 unresolved, allowlist still 3 entries.
- `npm run ci:gate`: **90/91**; payload 1,616 KiB. The only remaining failure is the Geometry surface snapshot (P29, unstarted).
- Browser: the toggle moves nothing (0.064 both ways) and says why; the chart draws both thresholds; no page errors. Screenshots `tmp/shots/p26-limits.png`, `tmp/shots/p26-chart.png`.
- Commit: `feat(app-v2): exponent limits [P26]`.

## P27 — Limits: collinearity, lockbox, 2006

- Table 6.2 lists the six retained covariates' variance inflation factors, R first at 9.43 and flagged above the conventional threshold of 5. The condition number (23.52 on 207 rows) is stated alongside, and the consequence — affected coefficients are associations under a fixed design, not separately identified effects — is spelled out rather than implied.
- Decision Lab 7 toggles R out of the specification. Dropping it lowers the maximum VIF from 9.43 to 2.47, costs 0.0115 in sample, and *improves* k-fold R² by 1.3e-5. The lab shows all three, and the mandatory caution says why the improvement is not acted on: it is discovered in the same data that would then validate it.
- A counterfactual banner appears above the section while the toggle is on, so a reader cannot mistake the lower VIF for the reported model.
- Lockbox card: 17 cells across 11 countries, with the distinction the paper draws — 59 cells recovered by the covariate backfill are out of sample but not blind, and 17 cells cannot resolve a difference as small as the one this paper reports.
- 2006 card: construct correlation 0.699 in that year against a median of 0.932 elsewhere, with the Tier C country-out R² shift (1.270) reported as how much one year can move an aggregate on a panel this sparse — not as a reason to exclude it.
- `R = 7.30·HDI − 6.01` was re-derived from the macro extract (18,948 overlapping rows, slope 7.3038, intercept −6.0054) before being quoted.

### Defects found

- **The bracket sentence indexed the grid instead of deriving it.** It printed "between 0.016 and 0.032" for a shipped value of 0.050, which those two points do not bracket at all — 0.050 sits between **0.032 and 0.064**. The test that caught the earlier "outside the grid" error did not catch this one, because it only asserted membership; it now derives the bracketing pair from the value and checks the rendered sentence against it.
- **Two components rendered the same heading.** `LimitsSection` and `Collinearity` both printed "Table 6.2 — collinearity"; the section's copy was left behind when the table moved into its own component, and it kept the unmarked label after the other was fixed.

### Verification

- `npm run test:run`: PASS, 396 tests across 64 files (five new collinearity tests). `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- `npm run check:a11y`: PASS, exit 0, **0 violations** across 11 routes × 2 themes.
- `npm run check:dom-numbers`: PASS, **396** distinct values, 0 unresolved, allowlist still 3 entries.
- `npm run ci:gate`: **90/91**, payload 1,618 KiB. The only remaining failure is the Geometry surface snapshot (P29, unstarted).
- Browser: 6 VIF rows with R flagged, banner appears only in the counterfactual, 0.699/0.932 both render; no page errors. Screenshot `tmp/shots/p27-collinearity.png`.
- Commit: `feat(app-v2): collinearity, lockbox, 2006 [P27]`.

## P28 — Countries

- A sortable table over all 83 countries: name, ISO3, years, mean observed Z, mean predicted Ẑ, MAE, and a verdict badge. Search by name or ISO3, and a verdict filter. Withdrawn channels have no column because `preset_country_alignment.json` was computed from the retained covariates — there is no estimate to put in one.
- Clicking a row opens a drawer with the country's observed and predicted series over its survey years, a per-year table of observed/predicted/residual, and a link to the Geometry Lab carrying `iso=`.
- URL state `q=` and `iso=`, both written with `replaceState` and preserving other keys, so a link to `?v=countries&iso=EST` reopens Estonia's drawer.

### The prompt's "failure log note (EST/RUS/SVK)" is not supportable

The prompt asked the drawer to show a failure-log note for those three countries. The failure log records **zero nonconverged folds** in every tier, and none of the three appears in it. What the artifacts do show is different, so the drawer states that instead:

| Country | Years | MAE | Verdict | In the failure list? |
|---|---|---|---|---|
| EST | 2 | 0.232 | **poor** | no (threshold is 0.25) |
| RUS | 3 | 0.124 | acceptable | no |
| SVK | 2 | 0.117 | acceptable | no |

Estonia carries the largest residuals in the preset set (0.271 in 1996, 0.193 in 2011) and is the only one of the three classified poor. The drawer names the largest residual and says plainly that zero folds failed to converge, so a wide residual is a fit difference rather than an estimation failure.

### Defects found

- **`LineProfile` could draw only one series.** The country drawer needs observed and predicted on one pair of axes, so the chart gained a `series` prop; the extra lines participate in the y-domain, because a second line clipped to the first line's range would misrepresent the comparison.
- **`--accent` and `--tier-b` are the same hex** (`#2F43C8`), so drawing the second series in `--tier-b` produced two indistinguishable lines. The predicted line now uses the neutral comparator token, and a legend appears whenever there is more than one series.
- **Year ticks rendered as "2,008"** because `int` formatting applies a thousands separator. Added a `year` claim format that prints the number bare.
- **`button` kept its user-agent background.** The reset normalised `font` but not `background`, so the row triggers rendered as grey boxes with white text — a **2.1:1** contrast failure in the dark theme, and a latent defect application-wide rather than specific to this section. The reset now clears background, border, padding and colour on `button`; components that want a surface opt in.
- **`Drawer` was uncontrolled**, so the open country could not live in the URL. Added optional `open`/`onOpenChange`.

### Verification

- `npm run test:run`: PASS, 403 tests across 65 files (seven new country tests). `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- `npm run check:a11y`: PASS, exit 0, **0 violations** across 11 routes × 2 themes.
- `npm run check:dom-numbers`: PASS, **629** distinct values (83 countries × 6 numeric columns joined the corpus), 0 unresolved, allowlist still 3.
- `npm run check:render`: RENDER OK.
- `npm run ci:gate`: **90/91**, payload 1,619 KiB. The only remaining failure is the Geometry surface snapshot (P29).
- Browser: 83 rows, search narrows to 2 for "est", drawer opens and writes `iso=EST`, legend reads Observed/Predicted, year ticks are 1996–2008. Screenshot `tmp/shots/p28-drawer.png`.
- Commit: `feat(app-v2): countries [P28]`.

## P29 — Geometry Lab: controls and surface

**`ci:gate` is green: 91/91.** This closes the last gate that had been failing since the v2 work began.

- Persistent caution banner, controls for the six retained channels with slider bounds from the panel's realised ranges, and a locked withdrawn-channel list (C, D, G, S) with a reason and a §2 link each.
- Four live values above the surface — Z, Φ, s, Z(1−Z) — rendered through a `ComputedValue` component labelled "computed live", because they follow the sliders and have no artifact behind them.
- The surface itself: Plotly, lazily imported so the landing route never requests it, drawing a 48×48 grid of the fitted map across the panel's realised X and Y ranges with the other four channels held where the reader put them.
- `?iso=` fills the controls from that country's mean rows, which is what makes the Countries drawer's "Open in Geometry Lab" link honest rather than decorative.
- Every slider value travels in the URL, so a shared link reproduces the picture.

### The withdrawn-channel claim, verified two ways

The prompt asks that the model receive C, D, G and S as zero and that a test pin this. Pinning the inputs is the weaker half. The stronger statement, now asserted, is that feeding a non-zero value through those channels leaves the output **bit-identical** — their coefficients are 0, so the channels are structurally inert rather than merely defaulted:

```
C=2.61, D=1.5, G=1, S=1  →  ΔZ < 1e-12 in every case
E = +1                   →  Z moves (the retained channels do respond)
```

### Defects found — most of them in the rendering, not the logic

- **`s` was computed as `logit(Z)`.** The model is `Z = σ(Φ + s)`, so `s = logit(Z) − Φ`; the first version printed 0.612, which is the *total* log-odds and duplicates the meaning of a different card. Correct value: 6.523, cross-checked two independent ways.
- **The surface rendered as a thin wedge with unreadable axes.** Three separate causes, found in sequence: `margin: 0` clipped the axis titles off the canvas; `aspectmode` left to `auto` scaled the axes to Y's 6.8-wide range against X's 0.85; and a camera placed at 2.4 units pushed the scene past the viewBox. The layout now mirrors the v1 component's working configuration — plain `title` plus `tickformat`, `aspectmode: 'cube'`, camera at 1.7 — and reads as a surface with labelled axes.
- **Plotly 3 ignores sibling `titlefont`.** Font sizes set that way changed nothing on screen; the title block takes `title.font`, and the simplest fix was to drop the override and match v1.
- **`check_surface_snapshot` navigated to the landing route** and then clicked a `/3D SURFACE/` toggle that no longer exists, so it reported "nothing to compare" against a page that never renders Plotly. It now loads `?v=geometry` and waits for the canvas.
- **The committed baseline was the v1 surface** (1076×421). The v2 surface is a different shape at a different size (574×507), and the v1 component it was captured from has been deleted — so the baseline is re-captured from the reviewed v2 render and the check passes at 0 pixels outside tolerance.
- **Plotly's SVG has no accessible name**, reported as an unclassified chart on both themes. The container now carries `role="img"` and a sentence describing what the surface shows.

### Verification

- **`npm run ci:gate`: 91/91 PASS** — every gate green for the first time, payload 1,620 KiB against the 2,048 KiB budget.
- `npm run test:run`: PASS, 408 tests across 66 files (five new geometry tests). `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- `npm run check:surface-snapshot`: **PASS**, 574×507, 0 pixels outside tolerance.
- `npm run check:a11y`: PASS, exit 0, **0 violations** across 11 routes × 2 themes.
- `npm run check:dom-numbers`: PASS, **637** distinct values, 0 unresolved, allowlist still 3 entries — the four live geometry values are recomputed from the same model and defaults rather than allowlisted.
- Browser: Plotly renders one canvas, six sliders, Z 0.648 / Φ −5.911 / s 6.523 / Z(1−Z) 0.2280, no console errors. Screenshots `tmp/shots/p29-geometry.png`, `tmp/shots/p29-surface.png`.
- Commit: `feat(app-v2): geometry lab controls and surface [P29]`.

## P30 — Geometry Lab: observed support, 2D companions, A/B capture

`ci:gate` remains green at **91/91** after this prompt.

- **Support overlay**, on by default. The 207 observed panel rows are plotted on the fitted surface. It answers the question the surface alone cannot: whether the fitted map sits where the data actually is, or extrapolates across a region no country occupies.
- **Extrapolation shading.** The grey sheet is not a threshold or a radius — it is every grid cell outside the **convex hull of the observed (X, Y) points**. Measured on the shipped panel: a 12-vertex hull over a 48 × 48 grid marks **608 of 2,304 cells (26.4%)** as extrapolation. A number someone chose would have been arbitrary; the hull is a statement about where the observations are.
- **Three 2D companions**, because a 3D surface is a bad instrument for reading a number: a Φ×s heatmap of Z with the Z = 0.5 crossing, a Z(Φ) profile at the current s, and a Z(1−Z) gain profile at the current Φ. Each marker follows the sliders.
- **A/B capture.** Two snapshots of the full channel state, a ΔZ/ΔΦ table between them, a copyable link, CSV export, and a PNG export of the surface via Plotly `toImage`.

### The support overlay was wrong at first, and the fix is the interesting part

The first capture showed the Z axis blown out to **±3000** with the surface squashed flat. The panel stores `Z` raw (−2.656 … 3.369); `calculateModel` does not return that quantity, it returns Z inside the training band after `Z_NORMALIZATION` (min −2.397, max 1.857). Two different variables on one axis.

The overlay now maps each observed `Z` through the same normalisation the model uses. Re-captured: surface at 0.2–1.0 with 207 points distributed over it.

**Then the clamp came off.** The mapped values were being clamped into [1e-4, 1−1e-4] so every point would touch the surface. Measuring first showed that **six of the 207 rows normalise outside the model's output band** (−0.061 … 1.355 across the panel): the fitted map cannot represent those six observations at all. Pinning them to the edge made the overlay agree with the surface by hiding the disagreement. They are now plotted where they land, above and below the surface, and the caption says so.

### Defects found

- **The heatmap's two axes shared one range.** Φ spans [−8, 2] and s spans [0, 10]; drawing both against the field's range saturated nearly every cell to one colour. Each axis now carries its own extent (`PHI_RANGE`, `S_RANGE`), which is what makes the diagonal ridge visible.
- **`Heatmap`'s tick rule was a year rule.** `showTick` was `index === 0 || last || year % 5 === 0`, written for year columns. On a Φ axis spanning [−8, 2] no interior label is divisible by five, so the axis printed its two endpoints and nothing else. The rule is now a `tickLabel` prop with the year behaviour as the default, and the Φ×s heatmap supplies its own.
- **The Z axis title was clipped off the canvas.** At `margin: 8` all titles were cut; at 56 the rotated Z title was still cut, because a 3D scene's titles sit outside the plot box. Titles are now the bare letters X / Y / Z, with the words spelled out in the caption beneath — the honest fix at a 574-pixel canvas, and it cannot clip.
- **The 3D camera was too close for the box it had to hold**, so the scene's top edge was cut. Pulling back to 1.7 fixed the clipping but left the surface small; 2.15 with the centre nudged down is the version that frames it.
- **`document.body.insertBefore` threw when restoring detached `data-scale-label` nodes.** Removing a labelled subtree and reinserting it breaks when the recorded `nextSibling` was inside the removed subtree. The restore path now re-anchors against a still-attached sibling.
- **The heatmap's axis ticks and its accessible table's coordinate headers were being number-audited.** They are grid coordinates, not claims, and they exist in no artifact. `ChartSvg` gained a `coordinateHeaders` prop that marks only `<th>` and the first `<td>` of each row; the marks are scoped, so the table's *values* are still audited.
- **`Φ + s` joined the derived-value set.** It is the total log-odds the model applies, it appears in the companion caption, and it has no artifact — recomputed in `check_dom_numbers.ts` rather than allowlisted.

### Verification

- **`npm run ci:gate`: 91/91 PASS**, payload 1,620 KiB against the 2,048 KiB budget.
- `npm run test:run`: PASS, **414 tests across 67 files** — three companion tests plus three hull tests (convex ordering drops interior points, collinear input yields a hull with no interior, the mask marks only outside cells).
- `npm run check:surface-snapshot`: **PASS**, 574×471, 0 pixels outside tolerance, against the capture reviewed above.
- `npm run check:dom-numbers`: PASS, **618** distinct values, 0 unresolved, allowlist still 3 entries.
- `npm run check:a11y`: PASS, **0 violations across 22 route-theme pairs**; geometry reports 37 focusable elements, 6 ranges, 2 charts, 0 unnamed charts.
- `npx tsc -b`, `npm run lint` (0 errors, 1 existing warning), `npm run lint:css`, `npm run build`: PASS.
- Browser (`?v=geometry`, 1440×1000): three Plotly traces — `Observed support`, `Outside observed support`, `surface`; support switch reports `aria-checked="true"`; three companion tabs; PNG button enabled; A/B table three rows; no console errors. Screenshots `tmp/shots/p30-geometry.png`, `tmp/shots/p30-surface.png`, `tmp/shots/p30-heat.png`.
- Commit: `feat(app-v2): geometry support and companions [P30]`.

## P31 — Evidence & Reproducibility, and Notation

`ci:gate` goes from 91 to **93/93**: this prompt added two checks of its own.

- **The artifact index.** 42 artifacts with their schema, timestamp, row count, consumption status and the command that would rebuild each. Filterable by name and by consumption; a row opens the JSON.
- **A JSON tree** with `?artifact=` deep links, so a review comment can point at the file rather than describe where to look.
- **A provenance chain** in the order the paper argues: microdata → construct audit → panel → fit → artifacts → this application. Each link names the artifact that establishes it, and two are marked because they narrow or remove something.
- **Commands**, copied verbatim, and the gate's own step list.
- **Notation**: 47 symbols in five groups, KaTeX-rendered, searchable, each with its source and the window it was fitted over. Plus the five regimes with their formal definitions and the support each actually has, and the three specification tiers.

### Three claims the prompt asked for that no artifact supports

- **"paperRef per claim."** The prompt asks the artifact table to carry each claim's manuscript location. **Zero of 227 claims have a `paperRef`.** The claim type has the optional field and nothing populates it, so the column would have been blank for every row — or filled in by hand, which is the failure mode this repository exists to avoid. Routes are mapped to paper sections instead (`§3, §4 Step 2b–2d` and so on), which *is* in `routes.ts`.
- **"used in sections."** Measured first: a naive transitive walk gives **every artifact the same answer (26)**, because the claim registry imports every selector and the shell imports the registry on all 11 routes. Restricted to files under `src/sections/<route>/` the answer becomes meaningful: 5 artifacts are displayed by a route, the other 37 are reachable but not shown.
- **"claims per artifact."** True but misleading as a column: `cv_kfold` backs 36 claims, `prediction_interval_coverage` 25, and eight artifacts back none. The 16 with none are exactly the ones a reader should be told about, so they are listed rather than hidden.

### Defects found

- **Generators were invisible.** The first pass found **0 of 42** artifacts with a producer, because a generator does not import what it writes — it builds a path and calls `writeFileSync`. Five spellings are now recognised: `path.join(REPO_ROOT, 'src', 'data', 'analysis', ...)`, `path.join(ANALYSIS_DIR, ...)`, Python's `ROOT / "src" / "data" / "analysis" / ...`, `writeJson('x.json', ...)`, and a bare literal. 27 of 42 resolve to a named `npm run` script.
- **An audit is not a producer.** `check_support_picture.ts` names `covariate_blocker_attribution.json` because it reads the committed copy to verify it. Reporting that as the generator would tell a reader to run a check to rebuild an artifact, which does not rebuild it. `isArtifactProducer` excludes `check_*` and `ci_gate.ts`.
- **`design_gates.json` and `sign_diagnostics.json` have generator scripts with no npm entry**, so nothing in the workflow would rebuild them. Recorded in the manifest as `recorded` rather than papered over with a plausible-looking script name.
- **`wvs_construct_audit.json` is a hand-copy.** `build:wvs-constructs` writes it to `rawdata/`; nothing writes it to `src/data/analysis/`. It arrived in commit `04f751d` as a byte-identical copy. The manifest classifies this as `copied` — verified by content comparison, not assumed — and says so only when `rawdata/` is present, because on a clean clone the check cannot be made at all.
- **The gate step list undercounted by 63.** 28 steps are written as literals; 63 more are emitted from loops over the expected artifacts (32), schema versions (25) and canonical metrics (6). 28 + 63 = **91**, matching the gate exactly at the time of writing, and 93 after this prompt's two additions. The generator reads all three loop bounds from the gate's own tables, so the page cannot claim a number the gate does not run.
- **The JSON tree withheld 98% of `cv_kfold`.** It flattened the whole 105,771-entry document and then cut at 2,000, so opening the file showed its first two keys and a number nobody could act on. It now walks only expanded branches: the root is open, everything below is opt-in, and the withheld count names the subtree it applies to. Verified 13 → 1 → 13 → 16 entries across a collapse/expand cycle.
- **The heatmap-style year tick rule leaked into the tree's sibling components** in the previous prompt; here the same class of bug appeared in `selectorClaimFacts`, whose export regex required `= [` and therefore missed every selector that builds its claims with `.map(...)`. `seedClaims` emits one claim per seed and was being reported as declaring none. Now detected as "exports a claims array, yields no literal ids".
- **`--ink-3` on `--surface-2` is 4.29:1**, below the 4.5:1 floor. Both new pages failed the contrast rule on their secondary text; both now use `--ink-2`. Caught by axe, not by eye.

### Verification

- **`npm run ci:gate`: 93/93 PASS**, payload 1,627 KiB against the 2,048 KiB budget.
- `npm run test:run`: PASS, **429 tests across 69 files** (15 new: 3 tree, 2 selector extraction, 2 provenance extraction, 2 manifest invariants, 1 gate arithmetic, 5 glossary).
- `npm run check:reproduction-manifest`: **PASS** (11 routes, 42 artifacts, 148 claims) — mutation-tested by flipping one `provenance` value, which failed at the exact line and restored the file.
- `npm run check:gate-steps`: **PASS** (30 literal steps, 93 total) — mutation-tested by adding two checks to the gate, which failed immediately until regenerated.
- `npm run check:dom-numbers`: PASS, **693** distinct values, 0 unresolved, allowlist still 3 entries. The manifest counts, gate total and glossary values are re-derived from the same committed files rather than allowlisted.
- `npm run check:a11y`: PASS, **0 violations across 22 route-theme pairs**.
- `npx tsc -b`, `npm run lint` (0 errors, 2 existing warnings), `npm run lint:css`, `npm run build`: PASS.
- Browser: reproduce route renders 42 artifact rows, the consumption filter switches 11 → 42, `?artifact=cv_kfold` opens the drawer and the tree expands; glossary renders 47 symbols in 6 tabs, 99 KaTeX nodes, and a search for "gini" narrows 97 rows to 7. No console errors. Screenshots `tmp/shots/p31-reproduce.png`, `tmp/shots/p31-drawer.png`, `tmp/shots/p31-glossary.png`.
- Commit: `feat(app-v2): reproduce and glossary [P31]`.

## P32 — The evidence bundle

`ci:gate` goes from 93 to **94/94**: the audit below added one check.

- **`src/export/evidenceBundle.ts`** replaces a 2,038-line narrative generator. It writes a PDF carrying a cover page (title, timestamp, commit, source URL), one section per route listing the claims that route displays with their `id`, artifact, JSON path and rebuild command, and an index of all 42 artifacts with their provenance.
- **`VITE_COMMIT`** is defined in `vite.config.ts` from `git rev-parse --short HEAD`, not from an environment variable a CI step has to remember to set. Read at config time, so a build from a fresh clone carries its commit without anyone knowing to pass it.
- **The `/api/ai/interpret` middleware is deleted**, along with the 180 lines of `handleAiInterpret` and `readJsonBody` it needed. Nothing in `src/` ever called it.
- **Deleted with the old generator:** `src/utils/pdfFonts.ts` (132 lines), `tests/pdfFonts.fallback.test.ts`, and `src/content/reportNarrative.ts` — the last of which was imported by nothing.
- The button imports jsPDF on click. jsPDF plus the claim-registry walk lands in its own 361 KiB chunk; the landing route stays at **1,628 KiB** against the 2,048 KiB budget.

### The old export printed a withdrawn number

`exportBehavioralDynamicsReport.ts` opened with the 630-row panel's **r² = 0.8461**. That is the figure the construct audit withdrew in P18 — the model in which C was an exact rescaling of the outcome, which `gates.original.identityCorr` measures at r = 1. A PDF that hands a reader a retracted metric is worse than no export, so the generator is deleted rather than repaired, and the guardrail test that pointed at it now points at the new module.

### Defects found

- **The standard PDF fonts cannot encode U+2212.** `formatClaim` prints a minus as `−`, correct in HTML and unrepresentable in WinAnsi. `doc.text()` emitted a control byte and every `signed2` value rendered as mojibake — which is precisely the family of claims about the *direction* of a coefficient. Verified against a real download, not assumed: 3 occurrences of `−` and 1 of `→` across the printed claims. `pdfSafe` now substitutes hyphen-minus and `->`, and `write()` **throws** on any codepoint it still cannot encode rather than emitting a broken glyph. A test asserts both halves.
- **A registered claim is not a displayed claim.** `eval.paired.median` is `exact`-formatted and its raw value is `0.000001926431755006064` — 21 digits, printed nowhere in the interface, which shows the two medians it is derived from. The first bundle printed it in full. The bundle now takes claims from the generated manifest's `directClaimIds`, so a claim with no route shows on no page, and a test asserts that value's absence.
- **`exact` needed a second format for print.** Even displayed values can be too long for a cell. `formatBundleValue` keeps `exact` verbatim when it is short and switches to three-place scientific notation when it is not, so magnitude survives without pretending to a precision no reader can use.
- **The header overflowed a 390px viewport by 11px.** Adding the export button pushed `Contents` past the right edge — caught by `check:support-picture` at `mobile 401/390px`, not by eye. The label now drops below 768px exactly as Search and Paper already did.

### Verification

- **`npm run ci:gate`: 93/93 PASS**, landing payload 1,628 KiB.
- `npm run test:run`: PASS, **432 tests across 69 files** (9 new for the bundle).
- Downloaded the bundle in a browser and read it back: **11 pages**, 258 text runs, title, `Build commit: 8fac710`, source URL with its query string, 8 route sections, artifact index, and **0 occurrences of U+2212** in the text stream.
- `npm run check:support-picture`: PASS, `mobile 390/390px`, `keyboard 0→21`.
- `npm run check:a11y`: PASS, 0 violations across 22 route-theme pairs.
- `npm run check:readme-links`: PASS, 30 relative links resolve.
- `npx tsc -b`, `npm run lint` (0 errors, 2 existing warnings), `npm run lint:css`, `npm run build`: PASS.

### Post-implementation audit

Every item in the prompt was re-checked against the built artifact rather than against the
commit message, and the audit found six defects — five of them documentation.

- **The README still documented the deleted endpoint.** An "AI Interpretation Endpoint"
  section showed the exact `/api/ai/interpret` middleware that was being removed, with a
  `process.env.OPENAI_API_KEY` example. The feature's own component does not exist in `src/`;
  only a screenshot survived in `figures/screenshots/`. Removed, along with its env-var block.
- **Two README links pointed at deleted files**, and three more at components the v2 rebuild
  had already replaced (`src/App.tsx`, `Surface3DSurface.tsx`, `ModernSidebar.tsx`). Five
  broken links, only two of them caused by this prompt — the rest had been dead since earlier
  prompts and nothing checked.
- **The README described the retired 630-row panel** in its data pipeline, its file tree and
  a CSV sample: `panel_canonical_23_countries_v1.csv`, "630 rows × 13 cols", "N=23 countries,
  2000-2022". All replaced with the current panel; the v1 file is now described as readable
  at commit `8f5c06b`, which is where the audit actually goes to measure the rebuild.
- **`check:readme-links` is new** and in the gate. A dead link is worse than no link: a reader
  who follows one concludes the checkout is broken rather than that the file moved. Mutation-
  tested by adding a link to `src/does/not/exist.ts`, which failed on that exact path.
- **Verified rather than assumed:** the PDF was downloaded three times and parsed back. 11
  pages, 258 text runs, **78 distinct claim ids**, 8 route sections with their paper
  references, the artifact index with provenance on every row, and **zero U+2212** in the text
  stream. jsPDF appears only in `evidenceBundle-*.js`, never in `index-*.js`.

Two items in the prompt could not be honoured and are stated rather than faked:

- **`paperRef` per claim.** Zero of 227 claims carry one. The PDF prints the route's paper
  reference instead, which is where that mapping actually exists (`routes.ts`).
- **`React.lazy`.** It wraps a component; this is an imperative save triggered by a click.
  The property the prompt wanted — jsPDF off the landing route — is met by `await import()`
  and measured in the build output, which is a stronger guarantee than a lazy component.

- Commit: `feat(app-v2): evidence bundle export [P32]`.
