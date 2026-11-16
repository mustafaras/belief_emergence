/**
 * Open each current AppShell route in Chrome and verify its heading, active navigation,
 * interactive shell controls, URL state, and absence of uncaught page errors.
 *
 * Requires a dev server on PORT (default 5199) and local Chrome. Missing prerequisites skip.
 */
const { chromium } = require('playwright-core');
const fs = require('node:fs');

const PORT = process.env.ROUTE_CHECK_PORT || process.env.RENDER_CHECK_PORT || '5199';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_PATH = process.env.ROUTE_CHECK_BASE || '/belief_emergence/';
const ROUTES = [
  'overview',
  'data',
  'audit',
  'gates',
  'model',
  'evaluation',
  'limits',
  'countries',
  'geometry',
  'reproduce',
  'glossary',
];

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

  const rows = [];
  const failures = [];
  try {
    for (const route of ROUTES) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const url = 'http://127.0.0.1:' + PORT + BASE_PATH + '?v=' + encodeURIComponent(route);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForSelector('main#main-content h1', { timeout: 45000 });
      await page.waitForFunction(() => !document.body.innerText.includes('Loading section…'), { timeout: 45000 });
      const metrics = await page.evaluate(() => {
        const visible = (element) => {
          if (!element) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const main = document.querySelector('main#main-content');
        const activeLinks = [...document.querySelectorAll('nav[aria-label="Contents"] a[aria-current="page"]')]
          .filter(visible);
        return {
          chars: document.body.innerText.length,
          heading: main?.querySelector('h1')?.textContent?.trim() || '',
          activeLinks: activeLinks.length,
          controls: [...document.querySelectorAll('button:not([disabled]),a[href]')].filter(visible).length,
          queryRoute: new URL(location.href).searchParams.get('v'),
        };
      });
      await page.close();
      rows.push({ route, ...metrics });
      if (metrics.chars < 200) failures.push(route + ': rendered only ' + metrics.chars + ' characters');
      if (!metrics.heading) failures.push(route + ': no section heading');
      if (metrics.activeLinks !== 1) failures.push(route + ': expected one visible active Contents link, found ' + metrics.activeLinks);
      if (!metrics.controls) failures.push(route + ': no visible interactive controls');
      if (metrics.queryRoute !== route) failures.push(route + ': URL route is ' + metrics.queryRoute);
      if (pageErrors.length) failures.push(route + ': uncaught page error: ' + pageErrors[0]);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
  }

  console.log('\nPer-route shell check:');
  for (const row of rows) {
    console.log('  ' + row.route.padEnd(12) + String(row.chars).padStart(6) + ' chars  active=' + row.activeLinks + '  ' + row.heading);
  }
  if (failures.length) {
    console.error('\nFAIL  ' + failures.length + ' route assertion(s):');
    for (const failure of failures) console.error('  - ' + failure);
    process.exit(1);
  }
  console.log('PASS  all ' + rows.length + ' routes render with matching URL and navigation');
})();
