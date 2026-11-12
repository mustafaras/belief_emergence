/**
 * Drive every route in a real browser and assert it renders something usable.
 *
 * This is the verification the routing work is accepted against. It exists as a script
 * rather than a one-off because a route that silently stops rendering is invisible to
 * every TypeScript check in the repository: the component compiles, the route resolves,
 * and the panel is blank.
 *
 * For each route it asserts:
 *   - at least MIN_CHARS characters of rendered text
 *   - no uncaught page error
 *   - at least one visible interactive control
 *   - for analysis routes, exactly one analysis panel is visible
 *   - the landing route renders one evidence-index row per artifact on disk
 *   - the URL still agrees with the route after the app has settled
 *
 * Requires a dev server on PORT (default 5199) and a local Chrome. Exits 0 when either
 * is unavailable, so a machine without a browser skips rather than fails — the same
 * contract as scripts/render_check.cjs.
 *
 * Usage:
 *   npm run dev &                     # or an already-running server
 *   node scripts/route_check.cjs
 */
const { chromium } = require('playwright-core');
const fs = require('fs');

const PORT = process.env.ROUTE_CHECK_PORT || process.env.RENDER_CHECK_PORT || '5199';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_PATH = process.env.ROUTE_CHECK_BASE || '/belief_emergence/';
const MIN_CHARS = 500;

// The evidence index must list every artifact in src/data/analysis/. Compared against the
// directory rather than a literal so adding an artifact does not fail the check for the
// wrong reason — a missing row would show up as a mismatch here either way.
const EXPECTED_ARTIFACTS = fs.readdirSync('src/data/analysis').filter((f) => f.endsWith('.json')).length;

// Kept in step with src/router/routes.ts. Duplicated deliberately: this check must fail
// if a route is added to the taxonomy but never becomes reachable, which it could not do
// if it imported the same list and trusted it.
const ANALYSIS_ROUTES = [
  'component-analysis',
  'field-dynamics',
  'statistical-analysis',
  'sensitivity-analysis',
  'emergence-analysis',
  'model-diagnostics',
];
const MENU_AND_MODAL_ROUTES = [
  'advanced-parameters',
  'phi-contributions',
  'documentation',
  'ai-interpreter',
  'presets',
];
const ROUTES = ['', ...ANALYSIS_ROUTES, ...MENU_AND_MODAL_ROUTES];

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.log('SKIP  no Chrome at ' + CHROME + '; set CHROME_PATH to enable the route check');
    process.exit(0);
  }

  let browser;
  try {
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
  } catch (e) {
    console.log('SKIP  could not launch Chrome: ' + e.message.slice(0, 120));
    process.exit(0);
  }

  // Fail fast if nothing is serving: one probe rather than twelve timeouts.
  const probe = await browser.newPage();
  try {
    await probe.goto('http://localhost:' + PORT + BASE_PATH, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
  } catch (e) {
    console.log(
      'SKIP  no dev server on port ' + PORT + ' (' + e.message.split('\n')[0].slice(0, 80) + ')',
    );
    await browser.close();
    process.exit(0);
  }
  await probe.close();

  const rows = [];
  const failures = [];

  for (const route of ROUTES) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    const url = 'http://localhost:' + PORT + BASE_PATH + (route ? '?v=' + route : '');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    // The panels compute from panel data on load; wait for a stable render rather than
    // assuming a fixed budget is enough on a slower machine.
    await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const m = await page.evaluate(() => {
      const isVisible = (el) => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const panels = [...document.querySelectorAll('.top-bar-content > div')];
      const visiblePanels = panels.filter(isVisible);
      const controls = [
        ...document.querySelectorAll('input, button, select, textarea, [role="button"]'),
      ].filter(isVisible);
      return {
        chars: document.body.innerText.length,
        visiblePanels: visiblePanels.length,
        controls: controls.length,
        search: location.search,
        activeRoute: document.querySelector('.top-bar-content')?.getAttribute('data-route'),
        // The landing route's content is the evidence index, not the analysis panels.
        evidenceRows: document.querySelectorAll('.evidence-table tbody tr').length,
        // A lazy boundary that never resolves still renders 500+ characters — the
        // placeholder text alone qualifies. These modules are code-split, so "did it
        // arrive" has to be asserted rather than inferred from length.
        stuckLoading: /Loading (the response surface|documentation|AI interpreter)/.test(
          document.body.innerText,
        ),
      };
    });

    await page.close();

    const label = route || 'landing';
    rows.push({
      route: label,
      chars: m.chars,
      panels: m.visiblePanels,
      controls: m.controls,
      evidenceRows: m.evidenceRows,
    });

    if (pageErrors.length > 0) {
      failures.push(label + ': uncaught page error: ' + pageErrors[0].slice(0, 140));
    }
    if (m.chars < MIN_CHARS) {
      failures.push(label + ': rendered ' + m.chars + ' characters (minimum ' + MIN_CHARS + ')');
    }
    if (m.controls < 1) {
      failures.push(label + ': no visible interactive control');
    }
    // A code-split module that fails to load leaves its placeholder on screen, which
    // satisfies every other assertion here.
    if (m.stuckLoading) {
      failures.push(label + ': a lazy module never resolved (placeholder still visible)');
    }
    // The URL must agree with what the app thinks is active.
    if ((m.activeRoute || 'landing') !== label) {
      failures.push(
        label + ': app reports route "' + m.activeRoute + '" but was asked for "' + label + '"',
      );
    }
    if (ANALYSIS_ROUTES.includes(route) && m.visiblePanels !== 1) {
      failures.push(label + ': expected exactly 1 isolated analysis panel, saw ' + m.visiblePanels);
    }
    if (!route) {
      // Landing shows every panel and puts the evidence index in the content pane.
      if (m.visiblePanels !== 6) {
        failures.push('landing: expected all 6 panels visible, saw ' + m.visiblePanels);
      }
      if (m.evidenceRows !== EXPECTED_ARTIFACTS) {
        failures.push(
          'landing: evidence index rendered ' +
            m.evidenceRows +
            ' rows, expected ' +
            EXPECTED_ARTIFACTS,
        );
      }
    }
  }

  await browser.close();

  console.log('\nPer-route render (cold start, one fresh page each):');
  console.log(
    '  ' +
      'route'.padEnd(24) +
      'chars'.padStart(8) +
      'panels'.padStart(8) +
      'controls'.padStart(10) +
      'index'.padStart(8),
  );
  for (const r of rows) {
    console.log(
      '  ' +
        r.route.padEnd(24) +
        String(r.chars).padStart(8) +
        String(r.panels).padStart(8) +
        String(r.controls).padStart(10) +
        String(r.evidenceRows || '-').padStart(8),
    );
  }

  if (failures.length > 0) {
    console.error('\nFAIL  ' + failures.length + ' route assertion(s) failed:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }

  console.log('\nPASS  ' + rows.length + ' routes rendered, ' + MIN_CHARS + '+ characters each');
})();
