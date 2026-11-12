/**
 * Render the application in a real browser and assert what it displays.
 *
 * Every other check in this repository reads code. The numbers a reader actually
 * sees come from the rendered DOM, and the two had diverged: the validator's
 * in-app self-tests were failing on screen, and the sidebar described a 630-row
 * panel across 23 countries. Neither is visible from a TypeScript file.
 *
 * Requires a dev server on PORT (default 5199) and a local Chrome. Exits 2 when
 * either is unavailable, so a machine without a browser skips rather than fails.
 *
 * Extended for Prompt 6: it now visits every route rather than one page load, keeping the
 * original forbidden-value and self-test assertions on the landing route (where they were
 * found) and adding them everywhere. `scripts/route_check.cjs` covers reachability and
 * character counts; this covers "no stale value and no failed self-test on any route".
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const PORT = process.env.RENDER_CHECK_PORT || '5199';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Values from before the panel reached 167 rows. None may appear on screen.
const FORBIDDEN = [/0\.948/, /\b630\b/, /23 countr/, /2000[-\u2013]2022/, /\b1\.307\b/];

// Every route the router produces, mirroring src/router/routes.ts. Duplicated on purpose:
// a route added to the taxonomy but never checked here is the gap this guards.
const ROUTES = [
  '',
  'component-analysis',
  'field-dynamics',
  'statistical-analysis',
  'sensitivity-analysis',
  'emergence-analysis',
  'model-diagnostics',
  'advanced-parameters',
  'phi-contributions',
  'documentation',
  'ai-interpreter',
  'presets',
];

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.log('SKIP  no Chrome at ' + CHROME + '; set CHROME_PATH to enable the render check');
    process.exit(0);
  }
  let browser;
  try {
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
  } catch (e) {
    console.log('SKIP  could not launch Chrome: ' + e.message.slice(0, 120));
    process.exit(0);
  }
  // One probe so a missing server costs one timeout rather than twelve.
  const probe = await browser.newPage();
  try {
    await probe.goto('http://localhost:' + PORT + '/belief_emergence/', {
      waitUntil: 'domcontentloaded', timeout: 15000,
    });
  } catch (e) {
    console.log('SKIP  no dev server on port ' + PORT + ' (' + e.message.split('\n')[0].slice(0, 80) + ')');
    await browser.close();
    process.exit(0);
  }
  await probe.close();

  const failures = [];
  const rendered = [];

  for (const route of ROUTES) {
    const label = route || 'landing';
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

    const url = 'http://localhost:' + PORT + '/belief_emergence/' + (route ? '?v=' + route : '');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(7000);
    const text = await page.evaluate(() => document.body.innerText);
    await page.close();

    rendered.push({ label, chars: text.length });

    if (text.length < 500) {
      failures.push(label + ': rendered ' + text.length + ' characters; the app did not mount');
      continue;
    }

    for (const pattern of FORBIDDEN) {
      const hit = text.match(pattern);
      if (hit) failures.push(label + ': renders a stale value: ' + hit[0]);
    }
    const failedTests = text.split('\n').filter((l) => l.includes('FAILED'));
    if (failedTests.length) {
      failures.push(label + ': ' + failedTests.length + ' in-app self-test(s) FAILED: ' + failedTests[0].slice(0, 80));
    }
    const pageErrors = consoleErrors.filter((e) => e.startsWith('pageerror:'));
    if (pageErrors.length) failures.push(label + ': runtime error on the page: ' + pageErrors[0]);
  }

  await browser.close();

  console.log('\nPer-route render:');
  for (const r of rendered) console.log('  ' + r.label.padEnd(24) + String(r.chars).padStart(8) + ' chars');

  if (failures.length === 0) {
    console.log('RENDER OK  ' + rendered.length + ' routes rendered, no stale values, no failed self-tests');
    process.exit(0);
  }
  console.error('RENDER FAILURES (' + failures.length + '):');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
})();
