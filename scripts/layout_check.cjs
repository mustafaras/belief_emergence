/**
 * Layout guards: five invariants checked across every route, viewport and theme.
 *
 * `check:a11y` proves the page can be read by a screen reader and `check:support-picture`
 * proves specific sections are not clipped on a phone. Neither catches the class of defect
 * this check exists for: text that fits, passes axe, and is nonetheless unreadable because it
 * is 9px, or because two elements sit on top of each other, or because a table's content is
 * wider than the box that hides the overflow.
 *
 * The five rules are deliberately mechanical. Each states a property that is either true or
 * false of the rendered box model, so a failure is a measurement rather than an opinion.
 *
 *   1. The document does not scroll horizontally.
 *   2. No two visible text elements overlap by more than 10% of the smaller one's area,
 *      unless one contains the other (which is how every icon-in-button is built).
 *   3. Every visible text element renders at 12px or larger.
 *   4. No text element hides its own overflow while its content is wider than its box,
 *      unless the element carries a `title` (the whole content is available on hover).
 *   4b. No `<select>`-like control is smaller than 24px, which is the WCAG 2.2 target size.
 *   5. On the landing route the document is taller than the viewport, so there is something
 *      to read rather than an empty shell that would pass every other rule.
 *
 * Usage:
 *   npm run check:layout [-- --route=overview --viewport=390x844 --theme=dark]
 *
 * Requires the Vite server (RENDER_CHECK_PORT, default 5199) and a local Chrome.
 */
const { chromium } = require('playwright-core');

const PORT = process.env.RENDER_CHECK_PORT || '5199';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_PATH = process.env.RENDER_CHECK_BASE || '/belief_emergence/';

const ALL_ROUTES = [
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

/**
 * Three viewports: a phone, a tablet, and a laptop.
 *
 * 390 rather than 375 because the support-picture check measures 390 and a second phone width
 * would only double the run time for the same class of defect. 1440 rather than 1920 because
 * above ~1500 the layout stops responding and one desktop width is enough.
 */
const VIEWPORTS = [
  { id: 'mobile', width: 390, height: 844 },
  { id: 'tablet', width: 768, height: 1024 },
  { id: 'desktop', width: 1440, height: 900 },
];

const THEMES = ['dark', 'light'];

const TEXT_SELECTOR = 'p,h1,h2,h3,h4,span,td,th,button,label,li,a';

function parseArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const routeFilter = parseArg('route');
const viewportFilter = parseArg('viewport');
const themeFilter = parseArg('theme');

const ROUTES = routeFilter ? routeFilter.split(',').map((r) => r.trim()) : ALL_ROUTES;
const THEMES_TO_RUN = themeFilter ? themeFilter.split(',').map((t) => t.trim()) : THEMES;

/**
 * The browser-side audit.
 *
 * Serialised as a string and evaluated in the page: it must not close over anything in this
 * file, and it must not define a named inner function — a bundler that wraps functions in a
 * `__name()` helper breaks the same way it did in the figure capture.
 */
function auditInPage() {
  const problems = [];
  const textSelector = 'p,h1,h2,h3,h4,span,td,th,button,label,li,a';
  const minFont = 12;
  const overlapLimit = 0.1;

  const isVisible = (el) => {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (Number(style.opacity) === 0) return false;

    /*
     * `clip-path: inset(50%)` is how `.visuallyHidden` removes a subtree from the visual page
     * while leaving it for a screen reader. The element keeps a real bounding box, so a
     * rectangle test accepts it and then reports it overlapping whatever is drawn on top.
     * Three routes failed that way on their chart's accessible table — all three were false
     * positives on a table no sighted reader can see.
     */
    for (let node = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.clipPath && cs.clipPath !== 'none') return false;
      if (Number(cs.opacity) === 0) return false;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    // Clipped-to-nothing helpers are legitimately 1px.
    if (rect.width <= 1 && rect.height <= 1) return false;
    return true;
  };

  /*
   * KaTeX emits zero-width and 1px spans as layout scaffolding — struts, vlist markers, spacing
   * nodes. They are not text a reader sees, and measuring them against a font-size floor
   * reported twenty-one findings on the Model route alone, none of them defects. The maths
   * itself renders at whatever size the surrounding prose sets.
   */
  const inMath = (el) => el.closest('.katex, .katex-display, [role="math"]') !== null;

  const hasText = (el) => {
    // Only direct text, so a container is not judged by its descendants' text.
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim().length > 0) return true;
    }
    return false;
  };

  /* 1. no horizontal document scroll */
  const docScroll = {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  };
  if (docScroll.scrollWidth > docScroll.clientWidth + 1) {
    // Name the widest offender so the failure is actionable rather than a number.
    let widest = null;
    for (const el of document.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.right > docScroll.clientWidth + 1 && (!widest || rect.right > widest.right)) {
        widest = {
          right: Math.round(rect.right),
          tag: el.tagName,
          cls: String(el.className || '').slice(0, 40),
          // The element itself, so containment can be checked on its real ancestors rather
          // than by matching class names — which failed silently when two elements shared one.
          el,
        };
      }
    }
    /*
     * A table inside its own horizontally scrollable box is not a layout failure: the page
     * still fits, and the box announces itself with `scrollLabel`. Only a width that leaks
     * past such a box to the document counts.
     */
    /*
     * No containment escape hatch. An earlier version exempted any width whose ancestor had
     * `overflow-x: auto`, intending to allow a table to scroll inside its own box — but that
     * let the evaluation route ship 955px wide on a 390px screen while this check passed,
     * because an unrelated chart on the same page satisfied the condition. A table that
     * legitimately scrolls does not widen the document: the box clips it. So the document's
     * own scrollWidth is the whole test.
     */
    const contained = false;
    if (!contained) {
      problems.push({
        rule: 'no-horizontal-scroll',
        detail: `document scrolls horizontally: ${docScroll.scrollWidth} > ${docScroll.clientWidth}`,
        offender: widest,
      });
    }
  }

  const elements = [...document.querySelectorAll(textSelector)].filter(
    (el) => isVisible(el) && hasText(el) && !inMath(el),
  );

  /* 2. no overlapping text */
  const boxes = elements.map((el) => ({ el, rect: el.getBoundingClientRect() }));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const overlapX = Math.max(0, Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left));
      const overlapY = Math.max(0, Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top));
      if (overlapX <= 0 || overlapY <= 0) continue;
      const smaller = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
      if (smaller <= 0) continue;
      const fraction = (overlapX * overlapY) / smaller;
      if (fraction > overlapLimit) {
        problems.push({
          rule: 'no-text-overlap',
          detail:
            `${a.el.tagName}<${String(a.el.textContent || '').trim().slice(0, 24)}> overlaps ` +
            `${b.el.tagName}<${String(b.el.textContent || '').trim().slice(0, 24)}> by ` +
            `${Math.round(fraction * 100)}%`,
        });
        // One report per element is enough; a single overlap produces many pairs.
        i = boxes.length;
        break;
      }
    }
  }

  /* 3. every text element is at least 12px */
  for (const el of elements) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (Number.isFinite(size) && size > 0 && size < minFont) {
      problems.push({
        rule: 'min-font-size',
        detail:
          `${el.tagName}<${String(el.textContent || '').trim().slice(0, 32)}> renders at ` +
          `${size}px, below the ${minFont}px floor`,
      });
    }
  }

  /* 4. nothing hides overflow that it actually overflows, unless it says so in a title */
  for (const el of elements) {
    const style = getComputedStyle(el);
    const hidden = ['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY);
    if (!hidden) continue;
    if (el.scrollWidth > el.clientWidth + 1 && !el.getAttribute('title')) {
      problems.push({
        rule: 'no-hidden-overflow',
        detail:
          `${el.tagName}<${String(el.textContent || '').trim().slice(0, 32)}> hides ` +
          `${el.scrollWidth - el.clientWidth}px of overflow with no title attribute`,
      });
    }
  }

  /*
   * 4b. interactive controls meet the 24px target size.
   *
   * Scoped to real controls. Including `span`/`td` in the selector produced findings like
   * "text<0.4074> is 43x16" — a numeral inside a card, not a target. And WCAG 2.2 exempts a
   * link that flows inline in a sentence, whose height is set by the surrounding line box;
   * applying the rule to those gave fifty findings on this application, none of them defects.
   */
  for (const el of document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="switch"],[role="tab"]')) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    const labelled =
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      String(el.textContent || '').trim().length > 0;
    if (!labelled) continue;

    /*
     * SVG is not a control. A chart's `<text>` nodes pick up `[role="button"]` when the chart
     * marks a value interactive, and their box is the glyph run: 43x16 for a printed number.
     * They have no hit target of their own — the chart handles the click — so measuring them
     * against a 24px target is a category error.
     */
    if (el.ownerSVGElement !== null) continue;

    if (el.tagName === 'A') {
      const parentDisplay = el.parentElement ? getComputedStyle(el.parentElement).display : '';
      const ownDisplay = getComputedStyle(el).display;
      // A link inside a run of text inherits the line's height and cannot be enlarged without
      // breaking the paragraph, which is exactly the exemption WCAG describes.
      if (/^inline/.test(ownDisplay) && parentDisplay !== 'flex') continue;
    }

    if (rect.width < 24 || rect.height < 24) {
      problems.push({
        rule: 'target-size-v2',
        detail: `${el.tagName}<${String(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}> is ${Math.round(rect.width)}x${Math.round(rect.height)}, below 24x24`,
      });
    }
  }

  /* 5. the landing route has content below the fold */
  return {
    problems,
    metrics: {
      textElements: elements.length,
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    },
  };
}

async function runOne(browser, route, viewport, theme) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: theme,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(String(error.message)));
  try {
    await page.goto(`${BASE}/?v=${route}`, { waitUntil: 'networkidle', timeout: 60000 });
    // The landing route loads lazily and the three chart routes import Plotly on demand.
    await page.waitForTimeout(route === 'geometry' ? 3500 : 1200);

    const result = await page.evaluate(auditInPage);
    const problems = [...result.problems];

    // Rule 5: an empty document passes every other rule.
    if (route === 'overview' && result.metrics.documentHeight <= result.metrics.viewportHeight) {
      problems.push({
        rule: 'landing-has-content',
        detail:
          `document is ${result.metrics.documentHeight}px tall in a ` +
          `${result.metrics.viewportHeight}px viewport, so nothing is below the fold`,
      });
    }

    return {
      route,
      viewport: viewport.id,
      theme,
      problems,
      metrics: result.metrics,
      consoleErrors,
    };
  } finally {
    await context.close();
  }
}

const BASE = `http://127.0.0.1:${PORT}${BASE_PATH}`;

async function main() {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const results = [];
  try {
    for (const route of ROUTES) {
      for (const viewport of VIEWPORTS) {
        if (viewportFilter && viewport.id !== viewportFilter) continue;
        for (const theme of THEMES_TO_RUN) {
          const result = await runOne(browser, route, viewport, theme);
          results.push(result);
          const label = `${theme.padEnd(5)} ${route.padEnd(10)} ${viewport.id.padEnd(8)}`;
          if (result.problems.length === 0 && result.consoleErrors.length === 0) {
            console.log(
              `  ok   ${label} ${String(result.metrics.textElements).padStart(4)} text nodes`,
            );
          } else {
            console.log(`  FAIL ${label} ${result.problems.length} problem(s)`);
            for (const problem of result.problems) {
              console.log(`         ${problem.rule}: ${problem.detail}`);
              if (problem.offender) {
                console.log(
                  `           widest: ${problem.offender.tag}.${problem.offender.cls} right=${problem.offender.right}`,
                );
              }
            }
            for (const error of result.consoleErrors) console.log(`         pageerror: ${error}`);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.problems.length > 0 || r.consoleErrors.length > 0);
  const byRule = {};
  for (const result of failed) {
    for (const problem of result.problems) byRule[problem.rule] = (byRule[problem.rule] || 0) + 1;
  }

  console.log('');
  if (failed.length === 0) {
    const checked = results.length;
    const textNodes = results.reduce((total, r) => total + r.metrics.textElements, 0);
    console.log(
      `PASS  ${checked} route/viewport/theme combinations, ${textNodes} rendered text nodes, ` +
        `no horizontal scroll, no overlap above 10%, no text under 12px, no hidden overflow`,
    );
    process.exit(0);
  }

  console.log(`FAIL  ${failed.length} of ${results.length} combinations have layout problems`);
  for (const [rule, count] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${rule}: ${count}`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error('FAIL  the layout check could not run');
  console.error(error);
  process.exit(1);
});
