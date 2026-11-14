/**
 * Run the complete axe-core rule set against every application route in both colour
 * schemes. The route list is intentionally independent from src/router/routes.ts so a
 * new route cannot silently escape this browser check.
 *
 * Usage: npm run check:a11y [-- --baseline]
 * Requires the Vite server on port 5199 and a local Chrome/CHROME_PATH.
 */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.A11Y_CHECK_PORT || '5199';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_PATH = process.env.A11Y_CHECK_BASE || '/belief_emergence/';
const ALL_ROUTES = [
  'landing',
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
const ROUTES = process.env.A11Y_ROUTES
  ? process.env.A11Y_ROUTES.split(',').map((route) => route.trim()).filter(Boolean)
  : ALL_ROUTES;
const THEMES = process.env.A11Y_THEMES
  ? process.env.A11Y_THEMES.split(',').map((theme) => theme.trim()).filter(Boolean)
  : ['dark', 'light'];
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const baselineOnly = process.argv.includes('--baseline');

function summarize(violations) {
  const result = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const violation of violations) {
    const impact = violation.impact || 'minor';
    result[impact] = (result[impact] || 0) + 1;
  }
  return result;
}

async function keyboardTabAudit(page, maxSteps = 160) {
  const expectedCount = await page.evaluate(() => [...document.querySelectorAll(
    'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[role="button"],[tabindex="0"]',
  )].filter((candidate) => {
    const style = getComputedStyle(candidate);
    return candidate.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      && !candidate.closest('[aria-hidden="true"],[inert]');
  }).length);
  const seen = new Set();
  const missingRing = [];
  let cycled = false;
  let reachedDocumentBoundary = false;
  for (let step = 0; step < maxSteps; step += 1) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) return { documentBoundary: true };
      const candidates = [...document.querySelectorAll(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[role="button"],[tabindex="0"]',
      )].filter((candidate) => {
        const candidateStyle = getComputedStyle(candidate);
        return candidate.getClientRects().length > 0 && candidateStyle.display !== 'none' && candidateStyle.visibility !== 'hidden'
          && !candidate.closest('[aria-hidden="true"],[inert]');
      });
      const style = getComputedStyle(element);
      return {
        index: candidates.indexOf(element),
        label: element.getAttribute('aria-label') || element.innerText?.trim() || element.tagName.toLowerCase(),
        outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
        focusVisible: element.matches(':focus-visible'),
      };
    });
    if (state?.documentBoundary) {
      reachedDocumentBoundary = true;
      break;
    }
    if (!state) break;
    if (seen.has(state.index)) {
      cycled = true;
      break;
    }
    seen.add(state.index);
    if (!state.outline || !state.focusVisible) missingRing.push(state.label.slice(0, 90));
  }
  return { tabStops: seen.size, expectedCount, missingRing, cycled, reachedDocumentBoundary, complete: seen.size === expectedCount };
}

(async () => {
  if (!fs.existsSync(CHROME)) {
    throw new Error(`Chrome not found at ${CHROME}; set CHROME_PATH`);
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const results = [];
  const failures = [];
  try {
    for (const theme of THEMES) {
      for (const route of ROUTES) {
        const context = await browser.newContext({ colorScheme: theme });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        if (route === 'ai-interpreter') {
          await page.route('**/api/ai/interpret', (request) =>
            request.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'AI requests are disabled during automated verification.' }),
            }),
          );
        }

        const routeQuery = route === 'landing' ? '' : `?v=${encodeURIComponent(route)}`;
        await page.goto(`http://127.0.0.1:${PORT}${BASE_PATH}${routeQuery}`, {
          waitUntil: 'domcontentloaded',
          timeout: 90000,
        });
        await page.waitForFunction(() => document.body.innerText.length > 500, { timeout: 30000 });
        await page.waitForTimeout(1800);
        await page.evaluate((selectedTheme) => {
          document.documentElement.dataset.theme = selectedTheme;
        }, theme);
        await page.addScriptTag({ path: AXE_PATH });
        const report = await page.evaluate(async () => {
          const axeResult = await window.axe.run(document);
          return {
            violations: axeResult.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              helpUrl: v.helpUrl,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                any: n.any.map((check) => ({ id: check.id, message: check.message, data: check.data })),
                all: n.all.map((check) => ({ id: check.id, message: check.message, data: check.data })),
                none: n.none.map((check) => ({ id: check.id, message: check.message, data: check.data })),
                summary: n.failureSummary,
              })),
            })),
            incomplete: axeResult.incomplete.map((check) => ({
              id: check.id,
              impact: check.impact,
              nodes: check.nodes.length,
              oneToOneContrastTargets: check.id === 'color-contrast'
                ? check.nodes
                  .filter((node) => [...node.any, ...node.all, ...node.none]
                    .some((result) => result.data?.contrastRatio === 1))
                  .map((node) => node.target)
                : [],
            })),
          };
        });
        const presetInitialFocus = route === 'presets'
          ? await page.evaluate(() => ({
              focusedCloseButton: document.activeElement?.getAttribute('aria-label') === 'Close presets',
              focusableCount: document.querySelectorAll('.preset-modal button:not([disabled]),.preset-modal a[href],.preset-modal input:not([disabled]),.preset-modal select:not([disabled]),.preset-modal textarea:not([disabled]),.preset-modal [tabindex]:not([tabindex="-1"])').length,
            }))
          : null;
        await page.keyboard.press('Tab');
        const interactionAudit = await page.evaluate(() => {
          const isVisible = (element) => {
            const style = getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
          };
          const candidates = [...document.querySelectorAll(
            'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[role="button"],[tabindex="0"]',
          )].filter((element) => {
            if (!isVisible(element)) return false;
            if (element.closest('[aria-hidden="true"]')) return false;
            return true;
          });
          const missingFocusRing = [];
          for (const element of candidates) {
            element.focus({ preventScroll: true });
            const style = getComputedStyle(element);
            if (style.outlineStyle === 'none' || parseFloat(style.outlineWidth) < 2) {
              const label = element.getAttribute('aria-label') || element.innerText?.trim() || element.tagName.toLowerCase();
              missingFocusRing.push(`${element.tagName.toLowerCase()} ${label}`.slice(0, 100));
            }
          }
          const charts = [...document.querySelectorAll('svg[viewBox]')].filter((svg) => {
            const rect = svg.getBoundingClientRect();
            const style = getComputedStyle(svg);
            return rect.width >= 150 && rect.height >= 100 && style.display !== 'none' && style.visibility !== 'hidden';
          });
          const visibleButtons = [...document.querySelectorAll('button,[role="button"]')].filter((element) =>
            isVisible(element) && !element.closest('[aria-hidden="true"]'),
          );
          const unnamedCharts = charts.filter((svg) => {
            if (svg.closest('[aria-hidden="true"]')) return false;
            const name = svg.getAttribute('aria-label') || svg.querySelector('title')?.textContent?.trim();
            const labelledBy = svg.getAttribute('aria-labelledby')
              ?.split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim())
              .filter(Boolean)
              .join(' ');
            const imageParent = svg.closest('[role="img"][aria-label], [role="img"][aria-labelledby]');
            return !(name || labelledBy || imageParent?.getAttribute('aria-label') || imageParent?.getAttribute('aria-labelledby'));
          });
          return {
            focusableCount: candidates.length,
            buttonCount: candidates.filter((element) => element.matches('button,[role="button"]')).length,
            visibleButtonCount: visibleButtons.length,
            disabledButtonCount: visibleButtons.filter((element) => element.matches(':disabled')).length,
            rangeInputCount: candidates.filter((element) => element.matches('input[type="range"]')).length,
            missingFocusRing,
            chartCount: charts.length,
            unnamedCharts: unnamedCharts.map((svg) => svg.getAttribute('class') || 'unclassified SVG'),
          };
        });
        const counts = summarize(report.violations);
        results.push({ route, theme, counts, violations: report.violations, incomplete: report.incomplete, interactionAudit });
        if (!baselineOnly) {
          for (const level of ['critical', 'serious']) {
            if (counts[level] > 0) failures.push(`${theme}/${route}: ${counts[level]} ${level} axe violation(s)`);
          }
          if (interactionAudit.missingFocusRing.length) {
            failures.push(`${theme}/${route}: ${interactionAudit.missingFocusRing.length} focusable target(s) lack a visible focus indicator`);
          }
          if (interactionAudit.unnamedCharts.length) {
            failures.push(`${theme}/${route}: unnamed chart(s): ${interactionAudit.unnamedCharts.join(', ')}`);
          }
          const prohibitedAria = report.incomplete.find((check) => check.id === 'aria-prohibited-attr');
          if (prohibitedAria?.nodes) {
            failures.push(`${theme}/${route}: ${prohibitedAria.nodes} element(s) use aria attributes unsupported by their roles`);
          }
          const oneToOneContrast = report.incomplete.find((check) => check.id === 'color-contrast')?.oneToOneContrastTargets || [];
          if (oneToOneContrast.length) {
            failures.push(`${theme}/${route}: contrast could not be computed for likely invisible text at ${JSON.stringify(oneToOneContrast)}`);
          }
        }
        if (pageErrors.length) failures.push(`${theme}/${route}: page error: ${pageErrors[0]}`);
        console.log(`${theme.padEnd(5)} ${route.padEnd(24)} ${JSON.stringify(counts)} violations=${report.violations.length} focusable=${interactionAudit.focusableCount} buttons=${interactionAudit.buttonCount}/${interactionAudit.visibleButtonCount} disabled=${interactionAudit.disabledButtonCount} ranges=${interactionAudit.rangeInputCount} charts=${interactionAudit.chartCount} unnamedCharts=${interactionAudit.unnamedCharts.length} incompleteChecks=${report.incomplete.length}`);

        if (route === 'landing' && theme === 'dark' && !baselineOnly) {
          const keyboardPage = await context.newPage();
          await keyboardPage.goto(`http://127.0.0.1:${PORT}${BASE_PATH}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
          await keyboardPage.waitForFunction(() => document.body.innerText.length > 500, { timeout: 30000 });
          await keyboardPage.waitForTimeout(1800);
          const tabAudit = await keyboardTabAudit(keyboardPage);
          await keyboardPage.close();
          if (!tabAudit.complete || !tabAudit.tabStops || tabAudit.missingRing.length) {
            failures.push(`dark/landing: keyboard Tab traversal failed (${JSON.stringify(tabAudit)})`);
          } else {
            console.log(`dark landing keyboard walk: ${tabAudit.tabStops}/${tabAudit.expectedCount} sequential tab stops reached, all focus rings visible`);
          }
        }

        if (route === 'landing' && theme === 'dark' && !baselineOnly) {
          const themeToggle = page.locator('.sidebar-theme-toggle');
          if (await themeToggle.count()) {
            await themeToggle.focus();
            await page.keyboard.press('Space');
            const afterSpace = await page.locator('html').getAttribute('data-theme');
            await page.keyboard.press('Enter');
            const afterEnter = await page.locator('html').getAttribute('data-theme');
            if (afterSpace !== 'light' || afterEnter !== 'dark') {
              failures.push(`dark/landing: theme toggle keyboard activation failed (Space=${afterSpace}, Enter=${afterEnter})`);
            } else console.log('dark landing theme toggle: Space and Enter pass');
          } else {
            failures.push('dark/landing: theme toggle is missing');
          }
        }

        if (route === 'presets' && theme === 'dark' && !baselineOnly) {
          const modal = page.locator('.preset-modal');
          const modalCheck = await modal.evaluate((dialog) => {
            const focusables = [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
            return { focusableCount: focusables.length };
          });
          if (!presetInitialFocus?.focusedCloseButton || modalCheck.focusableCount < 2) {
            failures.push(`dark/presets: modal did not open with a usable focus trap (${JSON.stringify({ presetInitialFocus, ...modalCheck })})`);
          } else {
            await page.locator('.preset-modal-close').focus();
            await page.keyboard.press('Shift+Tab');
            const wrappedToLast = await modal.evaluate((dialog) => document.activeElement === dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')[dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])').length - 1]);
            await page.keyboard.press('Tab');
            const wrappedToFirst = await modal.evaluate((dialog) => document.activeElement === dialog.querySelector('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
            await page.keyboard.press('Escape');
            await page.waitForSelector('.preset-modal', { state: 'detached', timeout: 5000 });
            const restoredFocus = await page.locator('button.modern-preset-button').evaluate((button) => document.activeElement === button);
            if (!wrappedToLast || !wrappedToFirst || !restoredFocus) {
              failures.push(`dark/presets: keyboard trap, Escape, or focus restoration failed (${JSON.stringify({ wrappedToLast, wrappedToFirst, restoredFocus })})`);
            } else console.log('dark presets modal: Tab wrap, Shift+Tab wrap, Escape, and focus restore pass');
          }
        }
        await context.close();
      }
    }

    if (process.env.A11Y_CHECK_SURFACE === '1' && !baselineOnly) {
      for (const theme of ['dark', 'light']) {
        const context = await browser.newContext({ colorScheme: theme });
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${PORT}${BASE_PATH}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => document.body.innerText.length > 500, { timeout: 30000 });
        await page.waitForTimeout(1000);
        await page.evaluate((selectedTheme) => {
          document.documentElement.dataset.theme = selectedTheme;
        }, theme);
        await page.locator('.topbar-surface3d-toggle').press('Enter');
        await page.waitForSelector('.surface3d-plot-layer[role="img"][aria-label]', { timeout: 90000 });
        await page.waitForSelector('.surface3d-data-table-details summary', { timeout: 90000 });
        await page.locator('.surface3d-data-table-details summary').focus();
        await page.keyboard.press('Enter');
        await page.waitForSelector('.surface3d-data-table-details[open] table caption', { timeout: 30000 });

        const fallbackRows = await page.locator('.surface3d-data-table tbody tr').count();
        const fallbackColumns = await page.locator('.surface3d-data-table thead th').count();
        if (fallbackRows < 2 || fallbackColumns < 2) failures.push(`${theme}/surface: table fallback did not render sampled coordinates and values`);
        await page.addScriptTag({ path: AXE_PATH });
        const surfaceReport = await page.evaluate(async () => {
          const result = await window.axe.run(document);
          return {
            violations: result.violations.map((violation) => ({ id: violation.id, impact: violation.impact })),
            incomplete: result.incomplete.map((check) => ({
              id: check.id,
              nodes: check.nodes.length,
              oneToOneContrastTargets: check.id === 'color-contrast'
                ? check.nodes
                  .filter((node) => [...node.any, ...node.all, ...node.none]
                    .some((item) => item.data?.contrastRatio === 1))
                  .map((node) => node.target)
                : [],
            })),
            missingFocusRing: [...document.querySelectorAll(
              'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[role="button"],[tabindex="0"]',
            )].filter((element) => {
              if (element.closest('[aria-hidden="true"], [inert]')) return false;
              if (element.getClientRects().length === 0) return false;
              const visibleStyle = getComputedStyle(element);
              if (visibleStyle.display === 'none' || visibleStyle.visibility === 'hidden') return false;
              element.focus({ preventScroll: true });
              const style = getComputedStyle(element);
              return style.outlineStyle === 'none'
                || parseFloat(style.outlineWidth) < 2
                || !element.matches(':focus-visible');
            }).map((element) => element.getAttribute('aria-label') || element.innerText?.trim() || element.tagName.toLowerCase()),
          };
        });
        const surfaceCounts = summarize(surfaceReport.violations);
        for (const level of ['critical', 'serious']) {
          if (surfaceCounts[level] > 0) failures.push(`${theme}/surface: ${surfaceCounts[level]} ${level} axe violation(s)`);
        }
        if (surfaceReport.incomplete.some((check) => check.id === 'aria-prohibited-attr' && check.nodes > 0)) {
          failures.push(`${theme}/surface: unsupported ARIA attribute usage detected`);
        }
        const lowContrast = surfaceReport.incomplete.find((check) => check.id === 'color-contrast')?.oneToOneContrastTargets || [];
        if (lowContrast.length) failures.push(`${theme}/surface: likely invisible text at ${JSON.stringify(lowContrast)}`);
        if (surfaceReport.missingFocusRing.length) failures.push(`${theme}/surface: ${surfaceReport.missingFocusRing.length} focus target(s) lack visible focus`);
        const surfaceIncomplete = surfaceReport.incomplete.map((check) => check.id).join(',') || 'none';
        console.log(`${theme} surface open: ${JSON.stringify(surfaceCounts)} violations=${surfaceReport.violations.length} table=${fallbackRows}×${fallbackColumns - 1} missingFocus=${surfaceReport.missingFocusRing.length} incomplete=${surfaceIncomplete}`);
        results.push({ route: 'surface3d-open', theme, counts: surfaceCounts, violations: surfaceReport.violations, incomplete: surfaceReport.incomplete });
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const outputPath = process.env.A11Y_REPORT_PATH;
  if (outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
    console.log(`Full axe report: ${outputPath}`);
  }

  if (failures.length) {
    console.error('\nAccessibility check failures:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
