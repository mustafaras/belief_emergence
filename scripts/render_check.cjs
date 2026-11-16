/**
 * Render each AppShell route in Chrome and reject known stale interface language or values.
 *
 * Requires a dev server on PORT (default 5199) and local Chrome. Missing prerequisites skip.
 */
const { chromium } = require('playwright-core');
const fs = require('node:fs');

const PORT = process.env.RENDER_CHECK_PORT || '5199';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_PATH = process.env.RENDER_CHECK_BASE || '/belief_emergence/';
const FORBIDDEN = [
  /Belief Emergence/i,
  /emergent signal/i,
  /\bamplifier/i,
  /\bsuppressor/i,
  /0\.8461/,
];
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
  const failures = [];
  const rendered = [];
  try {
    for (const route of ROUTES) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const url = 'http://localhost:' + PORT + BASE_PATH + '?v=' + encodeURIComponent(route);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForSelector('main#main-content h1', { timeout: 45000 });
      await page.waitForFunction(() => !document.body.innerText.includes('Loading section…'), { timeout: 45000 });
      const result = await page.evaluate(() => ({
        text: document.body.innerText,
        title: document.querySelector('main#main-content h1')?.textContent?.trim() || '',
      }));
      await page.close();
      rendered.push({ route, title: result.title, chars: result.text.length });
      if (result.text.length < 200) failures.push(route + ': rendered too little content (' + result.text.length + ' chars)');
      for (const pattern of FORBIDDEN) {
        const hit = result.text.match(pattern);
        if (hit) failures.push(route + ': forbidden text appears: ' + hit[0]);
      }
      if (pageErrors.length) failures.push(route + ': runtime error: ' + pageErrors[0]);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
  }

  console.log('\nPer-route render:');
  for (const row of rendered) {
    console.log('  ' + row.route.padEnd(12) + String(row.chars).padStart(6) + ' chars  ' + row.title);
  }
  if (failures.length) {
    console.error('\nRENDER FAILURES (' + failures.length + '):');
    for (const failure of failures) console.error('  ' + failure);
    process.exit(1);
  }
  console.log('RENDER OK  ' + rendered.length + ' current routes rendered without forbidden text or page errors');
})();
