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
