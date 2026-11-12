import type { BeliefParameters } from '../../types';
import { formatNumeric } from '../formatNumeric';
import type { TopBarAnalytics } from '../topBarAnalytics';
import { STRUCTURAL_MAX, STRUCTURAL_MIN } from '../modelContract';
import type { PanelRowCanonical } from '../../types/panel';
import {
  getHeadlineProvenance,
  getProductionDatasetMetadata,
  getProductionHeadlineMetrics,
  getProductionTrainingMetadata,
} from '../../data/modelMetrics';
import { BIAS_DEFINITION_PHRASE } from '../metrics';
import { computePanelFitSummary } from '../validation/computePanelFitSummary';
import { REPORT_NARRATIVE, REPORT_REPRODUCIBILITY_APPENDIX, type NarrativeBlock, type NarrativeTopic } from '../../content/reportNarrative';
import { registerPdfFonts } from '../pdfFonts';

type JsPdfNewable = new (orientation: 'l' | 'p', unit: 'mm', format: 'a4' | 'a3') => {
  setFillColor: (...args: unknown[]) => void;
  rect: (...args: unknown[]) => void;
  setFont: (...args: unknown[]) => void;
  setTextColor: (...args: unknown[]) => void;
  setFontSize: (...args: unknown[]) => void;
  setCharSpace?: (n: number) => void;
  text: (...args: unknown[]) => void;
  getTextWidth: (text: string) => number;
  addPage: (...args: unknown[]) => void;
  addImage: (...args: unknown[]) => void;
  addFileToVFS: (fileName: string, base64: string) => void;
  addFont: (postScriptName: string, fontName: string, fontStyle: string) => void;
  save: (fileName: string) => void;
};

export type ExportInterpretation = { label: string; message: string };

type PanelRange = [number, number];
type PanelRanges = Partial<Record<'X' | 'Y' | 'Z' | 'C' | 'M' | 'T' | 'D' | 'G' | 'E' | 'S' | 'R', PanelRange>>;

export type ExportPanelStats = {
  totalRows: number;
  zDistribution: { mean: number; std: number; min: number; max: number };
  zSorted: number[];
  ranges: PanelRanges;
};

export type ScenarioSnapshot = {
  capturedAt: number;
  params: BeliefParameters;
  presetName?: string;
  zValue: number;
  phiValue: number;
};

export type ExportBehavioralDynamicsReportOptions = {
  fileName?: string;
  fileStem?: string;
  documentTitle?: string;
  documentSubtitle?: string;
  reportTitle?: string;
  reportSubtitle?: string;
  zValue: number;
  phiValue: number;
  interpretation: ExportInterpretation;
  presetName?: string;
  params: {
    X: number;
    Y: number;
    C: number;
    M: number;
    T: number;
    D: number;
    G: number;
    E: number;
    S: number;
    R: number;
  };
  structuralBase: number;
  phiComponents: {
    baseline: number;
    mainEffects: number;
    interactions: number;
    quadratic: number;
  };
  alpha: number;
  beta: number;
  k: number;
  analytics: TopBarAnalytics;
  panelStats?: ExportPanelStats;
  panelData?: PanelRowCanonical[] | null;
  scenarioA?: ScenarioSnapshot | null;
  scenarioB?: ScenarioSnapshot | null;
  shareUrl?: string;
  captureSelector?: string;
  disableFigureCapture?: boolean;
  style?: {
    showRules?: boolean;
  };
  extraSections?: Array<{
    heading: string;
    paragraphs?: string[];
    bullets?: string[];
    notes?: string[];
    equations?: Array<{ latex: string; label?: string }>;
    tables?: Array<{ title?: string; rows: Array<{ k: string; v: string }> }>;
  }>;
};

function upperBound(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function isDigitChar(ch: string | undefined): boolean {
  return typeof ch === 'string' && ch >= '0' && ch <= '9';
}

function safeNumber(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

async function loadJsPdfCtor(): Promise<JsPdfNewable> {
  const jspdfModule = await import('jspdf');
  const JsPDFCtor = (jspdfModule as unknown as { jsPDF?: unknown; default?: unknown }).jsPDF
    ?? (jspdfModule as unknown as { default?: unknown }).default;
  if (typeof JsPDFCtor !== 'function') {
    throw new Error('Failed to load jsPDF constructor from the jspdf module.');
  }
  return JsPDFCtor as unknown as JsPdfNewable;
}

/**
 * DO NOT REMOVE the `html2canvas` dependency on grep evidence.
 *
 * It has no static import anywhere in `src/`, so a dependency audit reports it as unused
 * and removing it looks safe. It loads here, through `await import(...)`, and only when a
 * reader presses Export PDF. Deleting it breaks the export at runtime while passing every
 * test that does not drive the button — which is most of them.
 *
 * Verified after removal of the genuinely dead packages (Prompt 8): the live export
 * produces a 66 kB `%PDF-` download, before and after.
 */
async function loadHtml2Canvas(): Promise<(element: HTMLElement, options: Record<string, unknown>) => Promise<HTMLCanvasElement>> {
  const html2canvasModule = await import('html2canvas');
  const html2canvas = (html2canvasModule as unknown as { default?: unknown }).default
    ?? (html2canvasModule as unknown as { html2canvas?: unknown }).html2canvas
    ?? (html2canvasModule as unknown as unknown);
  if (typeof html2canvas !== 'function') {
    throw new Error('Failed to load html2canvas export from the html2canvas module.');
  }
  return html2canvas as unknown as (element: HTMLElement, options: Record<string, unknown>) => Promise<HTMLCanvasElement>;
}

function safeIsoTimestampUTC(): string {
  try {
    return new Date().toISOString();
  } catch {
    return 'unknown';
  }
}

export async function exportBehavioralDynamicsReport(options: ExportBehavioralDynamicsReportOptions): Promise<void> {
  const {
    fileName: fileNameOverride,
    fileStem,
    documentTitle: documentTitleOverride,
    documentSubtitle: documentSubtitleOverride,
    reportTitle: reportTitleOverride,
    reportSubtitle: reportSubtitleOverride,
    zValue,
    phiValue,
    interpretation,
    presetName,
    params,
    structuralBase,
    phiComponents,
    alpha,
    beta,
    k,
    analytics,
    panelStats,
    panelData,
    scenarioA,
    scenarioB,
    shareUrl,
    captureSelector = '.belief-emergence-top-bar',
    disableFigureCapture,
    extraSections,
  } = options;

  const showRules = options.style?.showRules ?? true;

  const devQaOverrides = (() => {
    if (!import.meta.env.DEV) return null;
    try {
      const w = window as unknown as { __BDE_PDF_QA__?: unknown };
      if (!w.__BDE_PDF_QA__ || typeof w.__BDE_PDF_QA__ !== 'object') return null;
      return w.__BDE_PDF_QA__ as {
        mode?: 'minimal' | 'full' | 'stress';
        disableFigureCapture?: boolean;
        shareUrlOverride?: string;
      };
    } catch {
      return null;
    }
  })();

  const effectiveShareUrl = (() => {
    const base = devQaOverrides?.shareUrlOverride ?? shareUrl;
    if (import.meta.env.DEV && devQaOverrides?.mode === 'stress') {
      const seed = base ?? (() => {
        try {
          return window.location.href;
        } catch {
          return 'Unavailable';
        }
      })();
      // Deterministic long URL string for stress testing wrapping.
      const pad = 'x'.repeat(2200);
      return seed.includes('?') ? `${seed}&qa=${pad}` : `${seed}?qa=${pad}`;
    }
    return base;
  })();

  const effectivePanelStats = import.meta.env.DEV && devQaOverrides?.mode === 'minimal' ? undefined : panelStats;
  const effectivePanelData = import.meta.env.DEV && devQaOverrides?.mode === 'minimal' ? null : panelData;
  const effectiveScenarioA = import.meta.env.DEV && devQaOverrides?.mode === 'minimal' ? null : scenarioA;
  const effectiveScenarioB = import.meta.env.DEV && devQaOverrides?.mode === 'minimal' ? null : scenarioB;
  const enableFigureCapture = !disableFigureCapture && !(import.meta.env.DEV && (devQaOverrides?.mode === 'minimal' || devQaOverrides?.disableFigureCapture));

  const JsPDFCtor = await loadJsPdfCtor();
  const pdf = new JsPDFCtor('p', 'mm', 'a4');

  // Embed Unicode-capable fonts so symbols render correctly and width measurement stays accurate.
  const fonts = await registerPdfFonts(pdf as unknown as Parameters<typeof registerPdfFonts>[0]);

  // A4 portrait dimensions in mm
  const pageWidth = 210;
  const pageHeight = 297;

  // Dense, paper-like layout
  const margin = 14;
  const headerH = 16;
  const footerH = 10;
  const contentTop = margin + headerH;
  const contentBottom = pageHeight - margin - footerH;
  const contentW = pageWidth - 2 * margin;

  const lineH = 4.4;
  const paraGap = 0.8;

  const PAPER: [number, number, number] = [255, 255, 255];
  const INK: [number, number, number] = [15, 15, 15];
  const MUTED: [number, number, number] = [90, 90, 90];
  const RULE: [number, number, number] = [40, 40, 40];
  const LIGHT_RULE: [number, number, number] = [200, 200, 200];

  const EXPORT_BRAND_TITLE = 'INTERACTIVE VISUAL DIAGNOSTICS';
  const EXPORT_BRAND_SUBTITLE = 'PDF EXPORT';
  const documentTitle = (documentTitleOverride ?? EXPORT_BRAND_TITLE).trim() || EXPORT_BRAND_TITLE;
  const documentSubtitle = (documentSubtitleOverride ?? EXPORT_BRAND_SUBTITLE).trim() || EXPORT_BRAND_SUBTITLE;
  const DEFAULT_REPORT_TITLE = 'Belief Emergence — Response Surface Report';
  const reportTitle = (reportTitleOverride ?? DEFAULT_REPORT_TITLE).trim() || DEFAULT_REPORT_TITLE;
  const reportSubtitle = (reportSubtitleOverride ?? documentSubtitle).trim() || documentSubtitle;

  const safeRect = (x: number, y: number, w: number, h: number, style: 'F' | 'S' | 'FD' | 'DF' = 'F') => {
    const xx = safeNumber(x);
    const yy = safeNumber(y);
    const ww = safeNumber(w);
    const hh = safeNumber(h);
    if (!Number.isFinite(xx) || !Number.isFinite(yy) || !Number.isFinite(ww) || !Number.isFinite(hh)) return;
    if (ww < 0 || hh < 0) return;
    (pdf as unknown as { rect: (...args: unknown[]) => void }).rect(xx, yy, ww, hh, style);
  };

  const drawBackground = () => {
    (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...PAPER);
    safeRect(0, 0, pageWidth, pageHeight, 'F');
  };

  const drawBackgroundAt = (w: number, h: number) => {
    (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...PAPER);
    safeRect(0, 0, w, h, 'F');
  };

  const drawHeader = (subtitle: string) => {
    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'bold');
    (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...INK);
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(14);
    (pdf as unknown as { text: (...args: unknown[]) => void }).text(documentTitle, pageWidth / 2, margin + 7.5, { align: 'center' });

    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'italic');
    (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...MUTED);
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(9.5);
    (pdf as unknown as { text: (...args: unknown[]) => void }).text(subtitle, pageWidth / 2, margin + 13.5, { align: 'center' });

    if (showRules) {
      (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...RULE);
      safeRect(margin, margin + headerH, contentW, 0.35, 'F');
    }
  };

  const drawHeaderAt = (w: number, subtitle: string, m: number, hH: number, cW: number) => {
    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'bold');
    (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...INK);
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(14);
    (pdf as unknown as { setCharSpace?: (n: number) => void }).setCharSpace?.(0);
    (pdf as unknown as { text: (...args: unknown[]) => void }).text(documentTitle, w / 2, m + 7.5, { align: 'center' });

    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'italic');
    (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...MUTED);
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(9.5);
    (pdf as unknown as { text: (...args: unknown[]) => void }).text(subtitle, w / 2, m + 13.5, { align: 'center' });

    if (showRules) {
      (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...RULE);
      safeRect(m, m + hH, cW, 0.35, 'F');
    }
  };

  const drawFooter = (pageNo: number) => {
    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'normal');
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(8);
    (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...MUTED);
    (pdf as unknown as { text: (...args: unknown[]) => void }).text(documentTitle, margin, pageHeight - 8);
    (pdf as unknown as { text: (...args: unknown[]) => void }).text(`Page ${pageNo}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  };

  const drawFooterAt = (w: number, h: number, m: number, pageNo: number) => {
    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'normal');
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(8);
    (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...MUTED);
    (pdf as unknown as { setCharSpace?: (n: number) => void }).setCharSpace?.(0);
    (pdf as unknown as { text: (...args: unknown[]) => void }).text(documentTitle, m, h - 8);
    (pdf as unknown as { text: (...args: unknown[]) => void }).text(`Page ${pageNo}`, w - m, h - 8, { align: 'right' });
  };

  const splitByWidth = (
    text: string,
    maxW: number,
    options: { font?: 'times' | 'courier' | 'helvetica' | 'Serif' | 'Mono'; style?: 'normal' | 'bold' | 'italic'; size?: number } = {},
  ): string[] => {
    const font = options.font ?? 'times';
    const style = options.style ?? 'normal';
    const size = options.size ?? 9;

    if (!Number.isFinite(maxW) || maxW <= 0) return [String(text ?? '')];

    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(font, style);
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(size);

    const measure = (s: string) => (pdf as unknown as { getTextWidth: (t: string) => number }).getTextWidth(s);
    const out: string[] = [];
    const paragraphs = String(text ?? '').split(/\r?\n/);

    const breakToken = (token: string): string[] => {
      const parts: string[] = [];
      let i = 0;
      const breakChars = new Set(['/', '?', '&', '=', '#', ':', '-', '_', '.']);
      while (i < token.length) {
        let lo = i + 1;
        let hi = token.length;
        let best = i + 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const slice = token.slice(i, mid);
          if (measure(slice) <= maxW) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }

        let cut = best;
        for (let j = best - 1; j > i; j -= 1) {
          const ch = token[j];
          if (!breakChars.has(ch)) continue;

          // URL-smart + decimal-safe wrapping:
          // - Prefer wrapping at separators like &,?,=,/,#
          // - Never split a decimal number at '.' (e.g., 0.39 should not become 0. + 39)
          if (ch === '.') {
            const prev = token[j - 1];
            const next = token[j + 1];
            if (isDigitChar(prev) && isDigitChar(next)) continue;
          }

          cut = j + 1;
          break;
        }

        // If we couldn't find a safe break char, avoid splitting decimals by shifting
        // the cut left to the start of a digit-run when the boundary would split X.Y.
        if (cut === best) {
          const left = token[cut - 1];
          const right = token[cut];
          // Splitting between '.' and digit: "0." | "39" (left='.', right='3')
          // or between digit and '.': "0" | ".39" (left='0', right='.')
          if ((left === '.' && isDigitChar(right) && isDigitChar(token[cut - 2]))
            || (right === '.' && isDigitChar(left) && isDigitChar(token[cut + 1]))) {
            let k = cut;
            while (k > i && (isDigitChar(token[k - 1]) || token[k - 1] === '.')) k -= 1;
            if (k > i) cut = k;
          }
        }

        if (cut <= i) cut = Math.min(i + 1, token.length);
        parts.push(token.slice(i, cut));
        i = cut;
      }
      return parts;
    };

    for (let p = 0; p < paragraphs.length; p += 1) {
      const para = paragraphs[p];
      if (para.trim() === '') {
        out.push('');
        continue;
      }

      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate) <= maxW) {
          line = candidate;
          continue;
        }

        if (line) {
          out.push(line);
          line = '';
        }

        if (measure(word) <= maxW) {
          line = word;
          continue;
        }

        const chunks = breakToken(word);
        for (const chunk of chunks) {
          if (!chunk) continue;
          if (!line) line = chunk;
          else {
            out.push(line);
            line = chunk;
          }
        }
      }
      if (line) out.push(line);
      if (p < paragraphs.length - 1) out.push('');
    }

    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return out.length ? out : [''];
  };

  const fitLineToWidth = (
    line: string,
    maxW: number,
    options: { font?: 'times' | 'courier' | 'helvetica' | 'Serif' | 'Mono'; style?: 'normal' | 'bold' | 'italic'; size?: number; ellipsis?: string } = {},
  ): string => {
    const font = options.font ?? 'times';
    const style = options.style ?? 'normal';
    const size = options.size ?? 9;
    const ellipsis = options.ellipsis ?? '…';

    const s = String(line ?? '');
    if (!Number.isFinite(maxW) || maxW <= 0) return s;

    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(font, style);
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(size);

    const getW = (t: string) => (pdf as unknown as { getTextWidth: (u: string) => number }).getTextWidth(t);
    if (getW(s) <= maxW) return s;

    const ellW = getW(ellipsis);
    const budget = Math.max(0, maxW - ellW);
    let lo = 0;
    let hi = s.length;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const sub = s.slice(0, mid);
      if (getW(sub) <= budget) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const clipped = s.slice(0, best).trimEnd();
    return clipped ? `${clipped}${ellipsis}` : ellipsis;
  };

  const debug = {
    pageBreaks: [] as Array<{ from: number; to: number; subtitle: string; reason: string }>,
    sections: [] as string[],
    pageUsage: [] as Array<{ pageNo: number; subtitle: string; usedMm: number; hasContent: boolean; sectionsOnPage: string[] }>,
    blankPageAvoided: [] as Array<{ pageNo: number; subtitle: string; reason: string }>,
    figure: {
      attempted: false,
      included: false,
      skippedReasons: [] as string[],
    },
  };

  const state = {
    pageNo: 1,
    subtitle: documentSubtitle,
    y: contentTop,
    pageHasMeaningfulContent: false,
    footerDrawnForPage: false,
    sectionsOnPage: [] as string[],
  };

  const markContent = () => {
    state.pageHasMeaningfulContent = true;
  };

  const beginPage = (subtitle: string) => {
    state.subtitle = subtitle;
    drawBackground();
    drawHeader(subtitle);
    (pdf as unknown as { setCharSpace?: (n: number) => void }).setCharSpace?.(0);
    state.y = contentTop;
    state.pageHasMeaningfulContent = false;
    state.footerDrawnForPage = false;
    state.sectionsOnPage = [];
  };

  const newPage = (reason: string) => {
    if (!state.pageHasMeaningfulContent) {
      // Hard guarantee: never create a blank page.
      debug.blankPageAvoided.push({ pageNo: state.pageNo, subtitle: state.subtitle, reason });
      if (import.meta.env.DEV) {
        console.error('[PDF QA] newPage requested on an empty page; reusing current page to avoid blank page.', {
          pageNo: state.pageNo,
          subtitle: state.subtitle,
          reason,
          area: 'src/utils/pdf/exportBehavioralDynamicsReport.ts:newPage',
        });
      }
      beginPage(state.subtitle);
      return;
    }

    debug.pageUsage.push({
      pageNo: state.pageNo,
      subtitle: state.subtitle,
      usedMm: Math.max(0, safeNumber(state.y) - contentTop),
      hasContent: state.pageHasMeaningfulContent,
      sectionsOnPage: [...state.sectionsOnPage],
    });

    if (!state.footerDrawnForPage) {
      drawFooter(state.pageNo);
      state.footerDrawnForPage = true;
    }

    const from = state.pageNo;
    (pdf as unknown as { addPage: () => void }).addPage();
    state.pageNo += 1;
    beginPage(state.subtitle);

    debug.pageBreaks.push({ from, to: state.pageNo, subtitle: state.subtitle, reason });
    if (import.meta.env.DEV) {
      console.log('[PDF] page break', { from, to: state.pageNo, subtitle: state.subtitle, reason });
    }
  };

  const ensureSpace = (needed: number, reason: string) => {
    const n = safeNumber(needed, 0);
    if (n <= 0) return;
    if (state.y + n > contentBottom) {
      newPage(reason);
    }
  };

  const ensureLine = (lh = lineH) => {
    if (state.y + lh > contentBottom) {
      newPage('line-wrap');
    }
  };

  const fmtFinite = (value: unknown, digits: number): string =>
    (typeof value === 'number' && Number.isFinite(value)) ? formatNumeric(value, digits) : '—';

  const writeWrappedLines = (lines: string[], opts: { x: number; w: number; font: 'times' | 'courier' | 'Serif' | 'Mono'; style: 'normal' | 'bold' | 'italic'; size: number; color: [number, number, number] }) => {
    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(opts.font, opts.style);
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(opts.size);
    (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...opts.color);
    (pdf as unknown as { setCharSpace?: (n: number) => void }).setCharSpace?.(0);

    for (const raw of lines) {
      if (raw === '') {
        ensureLine(lineH);
        state.y += lineH * 0.55;
        continue;
      }
      ensureLine(lineH);
      const safeLine = fitLineToWidth(raw, opts.w, { font: opts.font, style: opts.style, size: opts.size });
      (pdf as unknown as { text: (...args: unknown[]) => void }).text(safeLine, opts.x, state.y);
      state.y += lineH;
      markContent();
    }
  };

  // Section registry: each heading should render once.
  const renderedSectionHeadings = new Set<string>();

  const writeSectionHeading = (title: string, opts?: { minBodyMm?: number }) => {
    if (renderedSectionHeadings.has(title)) {
      if (import.meta.env.DEV) {
        console.warn('[PDF] Duplicate section heading suppressed', { title });
      }
      return;
    }
    renderedSectionHeadings.add(title);
    debug.sections.push(title);
    state.sectionsOnPage.push(title);
    // Orphan-heading guard: never place a heading unless some body content can follow.
    const minBodyMm = Math.max(0, safeNumber(opts?.minBodyMm ?? 12, 12));
    ensureSpace(7.5 + minBodyMm, `section:${title}`);

    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'bold');
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(11.5);
    (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...INK);
    (pdf as unknown as { text: (...args: unknown[]) => void }).text(title, margin, state.y);
    markContent();

    if (showRules) {
      (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...RULE);
      safeRect(margin, state.y + 1.6, Math.min(52, contentW), 0.35, 'F');
    }

    state.y += 6.2;
  };

  const writeParagraph = (text: string) => {
    const lines = splitByWidth(text, contentW, { font: fonts.serif as 'Serif', style: 'normal', size: 9 });
    writeWrappedLines(lines, { x: margin, w: contentW, font: fonts.serif as 'Serif', style: 'normal', size: 9, color: INK });
    state.y += paraGap;
  };

  const writeNote = (text: string) => {
    const lines = splitByWidth(`Note — ${text}`, contentW, { font: fonts.serif as 'Serif', style: 'italic', size: 9 });
    writeWrappedLines(lines, { x: margin, w: contentW, font: fonts.serif as 'Serif', style: 'italic', size: 9, color: MUTED });
    state.y += paraGap;
  };

  const writeEquation = (latex: string, label?: string) => {
    const prefix = label ? `${label}: ` : '';
    // Render as monospace text (stable, layout-independent). Keep it compact.
    writeCodeBlock([`${prefix}${latex}`]);
  };

  const writeNarrativeBlocks = (blocks: NarrativeBlock[]) => {
    for (const b of blocks) {
      if (b.kind === 'heading') {
        // Map to exporter headings; avoid forced pages (flows naturally).
        if (b.level === 1 || b.level === 2) writeSectionHeading(b.text);
        else writeSubheading(b.text);
        continue;
      }
      if (b.kind === 'paragraph') {
        writeParagraph(b.text);
        continue;
      }
      if (b.kind === 'bullets') {
        writeBullets(b.items);
        continue;
      }
      if (b.kind === 'equation') {
        writeEquation(b.latex, b.label);
        continue;
      }
      if (b.kind === 'note') {
        writeNote(b.text);
      }
    }
  };

  const writeNarrativeTopic = (topic: NarrativeTopic) => {
    writeNarrativeBlocks(REPORT_NARRATIVE[topic]);
  };

  const writeBullets = (items: string[], opts?: { keepWithNextMm?: number; minItemsOnPage?: number }) => {
    const maxItems = 120;
    const take = items.slice(0, maxItems);

    // Keep-with-next for lists: if we can't fit at least the first bullet (and optionally one more),
    // break BEFORE starting the list so we don't leave a 1-line fragment.
    const minItemsOnPage = Math.max(1, Math.floor(safeNumber(opts?.minItemsOnPage ?? 2, 2)));
    const previewItems = take.slice(0, Math.min(minItemsOnPage, take.length));
    const previewLines = previewItems.flatMap((it) => splitByWidth(`• ${it}`, contentW - 4, { font: fonts.serif as 'Serif', style: 'normal', size: 9 }));
    const previewMm = previewLines.length * lineH + 0.5 + paraGap;
    const keepWithNextMm = Math.max(0, safeNumber(opts?.keepWithNextMm ?? 0, 0));
    ensureSpace(previewMm + keepWithNextMm, 'bullets-keep-with-next');

    for (const it of take) {
      const lines = splitByWidth(`• ${it}`, contentW - 4, { font: fonts.serif as 'Serif', style: 'normal', size: 9 });
      writeWrappedLines(lines, { x: margin + 2, w: contentW - 4, font: fonts.serif as 'Serif', style: 'normal', size: 9, color: INK });
      state.y += 0.15;
    }
    if (items.length > maxItems) {
      const more = splitByWidth(`…and ${items.length - maxItems} more`, contentW - 4, { font: fonts.serif as 'Serif', style: 'italic', size: 9 });
      writeWrappedLines(more, { x: margin + 2, w: contentW - 4, font: fonts.serif as 'Serif', style: 'italic', size: 9, color: MUTED });
    }
    state.y += paraGap;
  };

  const writeCodeBlock = (lines: string[]) => {
    // Simple LaTeX-like code: monospaced, minimal rule, wrap long lines.
    ensureSpace(4, 'codeblock');

    if (showRules) {
      (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...RULE);
      safeRect(margin, state.y - 1.8, contentW, 0.35, 'F');
    }
    state.y += 2.0;

    const wrapped = lines.flatMap((ln) => splitByWidth(ln, contentW - 12, { font: fonts.mono as 'Mono', style: 'normal', size: 9.15 }));
    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.mono, 'normal');
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(9.15);
    (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...INK);
    (pdf as unknown as { setCharSpace?: (n: number) => void }).setCharSpace?.(0);

    for (const line of wrapped) {
      ensureLine(lineH);
      (pdf as unknown as { text: (...args: unknown[]) => void }).text(
        fitLineToWidth(line, contentW - 8, { font: fonts.mono as 'Mono', style: 'normal', size: 9.15 }),
        margin + 4,
        state.y,
      );
      state.y += lineH;
      markContent();
    }
    state.y += paraGap;
  };

  const writeKeyValueTable = (rows: Array<{ k: string; v: string }>) => {
    const x = margin;
    const w = contentW;

    if (!isFinitePositive(w)) return;

    const keyW = clamp(w * 0.56, 52, 110);
    const valueX = x + keyW;
    const valueW = w - keyW;

    if (!isFinitePositive(valueW)) return;

    // Avoid starting a table so low that it yields a tiny fragment on the current page.
    const minRowsToStartHere = Math.min(rows.length, 4);
    const minStartHeight = 2.2 + 0.35 + minRowsToStartHere * (lineH + 0.9);
    if (state.y + minStartHeight > contentBottom) {
      newPage('table-start-minspace');
    }

    ensureSpace(5, 'table-start');
    if (showRules) {
      (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...RULE);
      safeRect(x, state.y - 1.8, w, 0.35, 'F');
    }
    state.y += 2.2;

    const rowLH = lineH;

    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'normal');
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(9);
    (pdf as unknown as { setCharSpace?: (n: number) => void }).setCharSpace?.(0);

    const splitUrlByWidth = (url: string, maxW: number): string[] => {
      // URL wrapping rule: break at separators, but never split decimals like 0.39.
      const font = fonts.serif;
      const style = 'normal' as const;
      const size = 9;
      (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(font, style);
      (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(size);

      const measure = (s: string) => (pdf as unknown as { getTextWidth: (t: string) => number }).getTextWidth(s);
      if (!Number.isFinite(maxW) || maxW <= 0) return [String(url ?? '')];

      const token = String(url ?? '');
      const out: string[] = [];
      let i = 0;
      const preferred = new Set(['/', '?', '&', '=', '#']);
      while (i < token.length) {
        let lo = i + 1;
        let hi = token.length;
        let best = i + 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const slice = token.slice(i, mid);
          if (measure(slice) <= maxW) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }

        let cut = best;
        for (let j = best - 1; j > i; j -= 1) {
          if (preferred.has(token[j])) {
            cut = j + 1;
            break;
          }
        }

        // Decimal-preserving fallback: if we didn't find a preferred separator,
        // avoid cutting inside a decimal like 0.39 by shifting cut left.
        if (cut === best) {
          const left = token[cut - 1];
          const right = token[cut];
          if ((left === '.' && isDigitChar(right) && isDigitChar(token[cut - 2]))
            || (right === '.' && isDigitChar(left) && isDigitChar(token[cut + 1]))) {
            let k = cut;
            while (k > i && (isDigitChar(token[k - 1]) || token[k - 1] === '.')) k -= 1;
            if (k > i) cut = k;
          }
        }

        if (cut <= i) cut = Math.min(i + 1, token.length);
        out.push(token.slice(i, cut));
        i = cut;
      }
      while (out.length > 0 && out[out.length - 1] === '') out.pop();
      return out.length ? out : [''];
    };

    for (const r of rows) {
      const kLines = splitByWidth(r.k, keyW - 2, { font: fonts.serif as 'Serif', style: 'normal', size: 9 });
      const vLines = r.k === 'Share URL'
        ? splitUrlByWidth(r.v, valueW - 2)
        : splitByWidth(r.v, valueW - 2, { font: fonts.serif as 'Serif', style: 'normal', size: 9 });
      const n = Math.max(1, kLines.length, vLines.length);
      const rowH = n * rowLH;

      if (state.y + rowH > contentBottom) {
        newPage('table-row');
        ensureSpace(5, 'table-start-continued');
        if (showRules) {
          (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...RULE);
          safeRect(x, state.y - 1.8, w, 0.35, 'F');
        }
        state.y += 2.2;
      }

      for (let i = 0; i < n; i += 1) {
        (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...MUTED);
        (pdf as unknown as { text: (...args: unknown[]) => void }).text(
          fitLineToWidth(kLines[i] ?? '', keyW - 2, { font: fonts.serif as 'Serif', style: 'normal', size: 9 }),
          x,
          state.y + i * rowLH,
        );

        (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...INK);
        (pdf as unknown as { text: (...args: unknown[]) => void }).text(
          fitLineToWidth(vLines[i] ?? '', valueW - 2, { font: fonts.serif as 'Serif', style: 'normal', size: 9 }),
          valueX,
          state.y + i * rowLH,
        );

        markContent();
      }

      state.y += rowH;
      if (showRules) {
        (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...LIGHT_RULE);
        safeRect(x, state.y + 0.5, w, 0.12, 'F');
      }
      state.y += 0.9;
    }

    state.y += 0.3;
  };

  const splitUrlVerbatimByWidth = (url: string, maxW: number): string[] => {
    // Verbatim URL wrapping for mono code blocks: break only at safe delimiters and never split decimals.
    // IMPORTANT: do NOT break at '=' to avoid rendering "k=" on one line and the value on the next.
    // Delimiters: ?, &, #.
    const token = String(url ?? '');
    if (!Number.isFinite(maxW) || maxW <= 0) return [token];

    const measure = (s: string) => {
      (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.mono, 'normal');
      (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(9.15);
      return (pdf as unknown as { getTextWidth: (t: string) => number }).getTextWidth(s);
    };

    const preferred = new Set(['?', '&', '#']);
    const out: string[] = [];
    let i = 0;

    while (i < token.length) {
      let lo = i + 1;
      let hi = token.length;
      let best = i + 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const slice = token.slice(i, mid);
        if (measure(slice) <= maxW) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      let cut = best;
      for (let j = best - 1; j > i; j -= 1) {
        if (preferred.has(token[j])) {
          cut = j + 1;
          break;
        }
      }

      // Decimal-preserving fallback: avoid cutting inside 0.39 style tokens.
      if (cut === best) {
        const left = token[cut - 1];
        const right = token[cut];
        if ((left === '.' && isDigitChar(right) && isDigitChar(token[cut - 2]))
          || (right === '.' && isDigitChar(left) && isDigitChar(token[cut + 1]))) {
          let k = cut;
          while (k > i && (isDigitChar(token[k - 1]) || token[k - 1] === '.')) k -= 1;
          if (k > i) cut = k;
        }
      }

      if (cut <= i) cut = Math.min(i + 1, token.length);
      out.push(token.slice(i, cut));
      i = cut;
    }

    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return out.length ? out : [''];
  };

  const writeSubheading = (title: string, opts?: { minBodyMm?: number }) => {
    // Orphan guard for subheadings (tighter than section headings).
    const minBodyMm = Math.max(0, safeNumber(opts?.minBodyMm ?? 8, 8));
    ensureSpace(4.6 + minBodyMm, `subheading:${title}`);
    (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'bold');
    (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(9.5);
    (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...MUTED);
    (pdf as unknown as { text: (...args: unknown[]) => void }).text(title, margin, state.y);
    state.y += 4.6;
    markContent();
  };

  type TableColumnSpec<Row> = {
    key: keyof Row;
    label: string;
    wMm: number;
    align?: 'left' | 'right';
    font?: 'serif' | 'mono';
  };

  const writeTable = <Row extends Record<string, unknown>>(
    columns: Array<TableColumnSpec<Row>>,
    rows: Row[],
    opts?: {
      headerRepeat?: boolean;
      headerMinBodyMm?: number;
      fontSize?: number;
      leadingMm?: number;
      cellPadMm?: number;
    },
  ) => {
    if (!rows.length) return;

    const x = margin;
    const w = contentW;
    if (!isFinitePositive(w)) return;

    const fontSize = safeNumber(opts?.fontSize ?? 8.4, 8.4);
    const leadingMm = safeNumber(opts?.leadingMm ?? 4.05, 4.05);
    const cellPad = safeNumber(opts?.cellPadMm ?? 0.7, 0.7);
    const headerRepeat = opts?.headerRepeat ?? true;

    const totalW = columns.reduce((a, c) => a + safeNumber(c.wMm, 0), 0);
    const scale = totalW > w ? w / totalW : 1;
    const scaled = columns.map((c) => ({
      ...c,
      wMm: safeNumber(c.wMm, 0) * scale,
      align: c.align ?? 'left',
      font: c.font ?? 'serif',
    }));

    const measureCellLines = (text: string, colW: number, font: 'serif' | 'mono', style: 'normal' | 'bold') => {
      const maxW = Math.max(1, colW - 2 * cellPad);
      const f = font === 'mono' ? fonts.mono : fonts.serif;
      return splitByWidth(String(text ?? ''), maxW, { font: f as 'Mono' | 'Serif', style, size: fontSize });
    };

    const drawHeaderRow = () => {
      const headerMinBodyMm = Math.max(0, safeNumber(opts?.headerMinBodyMm ?? 8, 8));
      // Keep-with-next for tables: header must fit with at least one body row.
      ensureSpace(2.1 + leadingMm + headerMinBodyMm, 'table-header-keep-with-next');

      if (showRules) {
        (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...RULE);
        safeRect(x, state.y - 1.8, w, 0.35, 'F');
      }
      state.y += 2.1;

      (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'bold');
      (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(fontSize);
      (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...MUTED);
      (pdf as unknown as { setCharSpace?: (n: number) => void }).setCharSpace?.(0);

      let cx = x;
      for (const c of scaled) {
        const label = fitLineToWidth(c.label, c.wMm - 2 * cellPad, { font: fonts.serif as 'Serif', style: 'bold', size: fontSize });
        const tx = c.align === 'right' ? cx + c.wMm - cellPad : cx + cellPad;
        (pdf as unknown as { text: (...args: unknown[]) => void }).text(label, tx, state.y, { align: c.align === 'right' ? 'right' : 'left' });
        cx += c.wMm;
      }
      state.y += leadingMm;
      markContent();

      if (showRules) {
        (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...LIGHT_RULE);
        safeRect(x, state.y - 1.0, w, 0.12, 'F');
      }
      state.y += 0.5;
    };

    const drawBodyRow = (row: Row) => {
      const cellLines = scaled.map((c) => {
        const raw = row[String(c.key)] as unknown;
        const txt = raw == null ? '' : String(raw);
        return measureCellLines(txt, c.wMm, c.font, 'normal');
      });
      const maxLines = Math.max(1, ...cellLines.map((ls) => ls.length));
      const rowH = maxLines * leadingMm + 2 * cellPad;

      if (state.y + rowH > contentBottom) {
        newPage('table-row');
        if (headerRepeat) drawHeaderRow();
      }

      let cx = x;
      for (let ci = 0; ci < scaled.length; ci += 1) {
        const c = scaled[ci];
        const lines = cellLines[ci] ?? [''];
        const f = c.font === 'mono' ? fonts.mono : fonts.serif;
        (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(f, 'normal');
        (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(fontSize);
        (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...INK);
        (pdf as unknown as { setCharSpace?: (n: number) => void }).setCharSpace?.(0);

        for (let li = 0; li < maxLines; li += 1) {
          const y = state.y + cellPad + li * leadingMm;
          const text = fitLineToWidth(lines[li] ?? '', c.wMm - 2 * cellPad, { font: f as 'Mono' | 'Serif', style: 'normal', size: fontSize });
          const tx = c.align === 'right' ? cx + c.wMm - cellPad : cx + cellPad;
          (pdf as unknown as { text: (...args: unknown[]) => void }).text(text, tx, y, { align: c.align === 'right' ? 'right' : 'left' });
        }

        cx += c.wMm;
      }

      state.y += rowH;
      if (showRules) {
        (pdf as unknown as { setFillColor: (...args: unknown[]) => void }).setFillColor(...LIGHT_RULE);
        safeRect(x, state.y - 1.0, w, 0.12, 'F');
      }
      state.y += 0.35;
      markContent();
    };

    drawHeaderRow();
    for (const r of rows) drawBodyRow(r);
    state.y += 0.8;
  };

  const writeCalibrationBinsTable = (bins: Array<{
    binStart: number;
    binEnd: number;
    n: number;
    meanPred: number;
    meanObs: number;
    meanRes: number;
    q25Obs: number;
    q75Obs: number;
  }>) => {
    if (!bins.length) return;

    // Render as a real wrapped table with numeric alignment and repeating headers.
    const fmt4 = (v: number) => (Number.isFinite(v) ? formatNumeric(v, 4) : '—');
    const tableRows = bins.map((b) => ({
      start: fmt4(b.binStart),
      end: fmt4(b.binEnd),
      n: Number.isFinite(b.n) ? String(b.n) : '—',
      pred: fmt4(b.meanPred),
      obs: fmt4(b.meanObs),
      res: fmt4(b.meanRes),
      q25: fmt4(b.q25Obs),
      q75: fmt4(b.q75Obs),
    }));

    writeTable(
      [
        { key: 'start', label: 'start', wMm: 18, align: 'right', font: 'mono' },
        { key: 'end', label: 'end', wMm: 18, align: 'right', font: 'mono' },
        { key: 'n', label: 'n', wMm: 10, align: 'right', font: 'mono' },
        { key: 'pred', label: 'pred', wMm: 22, align: 'right', font: 'mono' },
        { key: 'obs', label: 'obs', wMm: 22, align: 'right', font: 'mono' },
        { key: 'res', label: 'res', wMm: 22, align: 'right', font: 'mono' },
        { key: 'q25', label: 'obs q25', wMm: 20, align: 'right', font: 'mono' },
        { key: 'q75', label: 'obs q75', wMm: 20, align: 'right', font: 'mono' },
      ],
      tableRows,
      { headerRepeat: true, headerMinBodyMm: 10, fontSize: 8.25, leadingMm: 3.95, cellPadMm: 0.65 },
    );
  };

  const resolvedShareUrl = effectiveShareUrl ?? (() => {
    try {
      return window.location.href;
    } catch {
      return 'Unavailable';
    }
  })();

  const structuralBandLabel = `[${STRUCTURAL_MIN.toFixed(4)}, ${STRUCTURAL_MAX.toFixed(4)}]`;

  const productionHeadline = getProductionHeadlineMetrics();
  const productionDataset = getProductionDatasetMetadata();
  const productionTraining = getProductionTrainingMetadata();
  const headlineProvenance = getHeadlineProvenance();

  const panelPercentile = (() => {
    if (!panelStats) return null;
    if (!Number.isFinite(zValue) || !Array.isArray(panelStats.zSorted) || panelStats.zSorted.length === 0) return null;
    const n = panelStats.zSorted.length;
    const countLE = upperBound(panelStats.zSorted, zValue);
    return (countLE / n) * 100;
  })();

  const runtimeFit = (() => {
    try {
      return computePanelFitSummary(effectivePanelData);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[PDF] computePanelFitSummary failed; continuing without runtime fit.', e);
      }
      return null;
    }
  })();

  // -----------------------------
  // Begin document
  // -----------------------------
  beginPage(documentSubtitle);

  // Title block (dense)
  (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'bold');
  (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(16.5);
  (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...INK);
  (pdf as unknown as { text: (...args: unknown[]) => void }).text(reportTitle, pageWidth / 2, state.y + 5.5, { align: 'center' });
  markContent();

  (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'italic');
  (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(10.5);
  (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...MUTED);
  (pdf as unknown as { text: (...args: unknown[]) => void }).text(reportSubtitle, pageWidth / 2, state.y + 11.5, { align: 'center' });

  (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, 'italic');
  (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(9.5);
  (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...MUTED);
  (pdf as unknown as { text: (...args: unknown[]) => void }).text(`Generated: ${safeIsoTimestampUTC()} (UTC)`, pageWidth / 2, state.y + 16.0, { align: 'center' });

  state.y += 20;

  writeSectionHeading('Abstract');
  writeParagraph(
    'This report is a deterministic export of the current UI state. The model maps a parameter vector into a bounded score Z ∈ (0,1). '
      + 'Z is constructed by combining a structural base term derived from normalized structural inputs (X, Y) with elasticities (α, β), '
      + 'and a field term Φ aggregating baseline, main effects, interactions, and quadratic components. '
      + 'A positive numerator is passed through a saturating transform Z = numerator / (numerator + k). '
      + 'Numerical safety constraints are applied to Φ before exponentiation and to Z via epsilon-clamping.'
  );

  writeSectionHeading('Key Results (Current State)');
  writeKeyValueTable([
    { k: 'Z (model score; epsilon-clamped)', v: formatNumeric(zValue, 6) },
    { k: 'Φ (field term)', v: formatNumeric(phiValue, 6) },
    { k: 'Structural base (X_safe^α · Y_safe^β)', v: formatNumeric(structuralBase, 6) },
    { k: 'Exponential factor (exp(Φ) after clamp)', v: formatNumeric(analytics.exponentialFactor, 6) },
    { k: 'k (saturation constant)', v: formatNumeric(k, 6) },
    { k: 'Interpretation label', v: interpretation.label },
  ]);

  writeParagraph(
    'Interpretation — The label above is a coarse qualitative mapping of Z into regimes. The narrative below is descriptive; it summarizes the model’s implied state under the current parameterization. '
      + 'It should not be interpreted as a causal claim without external identification and uncertainty quantification.'
  );
  writeParagraph(interpretation.message);
  // Narrative sections sourced from a single structured content file
  writeNarrativeTopic('BeliefEquation');
  writeNarrativeTopic('CoreVariables');
  writeNarrativeTopic('Amplifiers');
  writeNarrativeTopic('Suppressors');

  writeSectionHeading('Methods');
  writeParagraph(
    'The export reuses the analytics already computed for the TopBar UI (no recomputation drift). Φ is clamped inside exp(·) for stability, and Z is epsilon-clamped to remain strictly within (0,1).'
  );

  writeSectionHeading('Canonical pipeline (compact)');
  writeCodeBlock([
    'b = X_safe^α · Y_safe^β',
    'Φ = baseline + main + interactions + quadratic',
    'num = b · exp(clamp(Φ, -50, 50))',
    'Z_raw = num / (num + k)',
    'Z = clamp(Z_raw, ε, 1-ε), ε=1e-4',
  ]);

  writeSectionHeading('Field decomposition');
  writeKeyValueTable([
    { k: 'Φ baseline (φ₀)', v: formatNumeric(phiComponents.baseline, 6) },
    { k: 'Φ main effects', v: formatNumeric(phiComponents.mainEffects, 6) },
    { k: 'Φ interactions', v: formatNumeric(phiComponents.interactions, 6) },
    { k: 'Φ quadratic', v: formatNumeric(phiComponents.quadratic, 6) },
    { k: 'Φ⁺ (amplifying contribution)', v: formatNumeric(analytics.effects.amplifyingEffects, 6) },
    { k: 'Φ⁻ (suppressing contribution)', v: formatNumeric(analytics.effects.suppressingEffects, 6) },
  ]);

  writeSectionHeading('Inputs (Current Parameterization)');
  writeKeyValueTable([
    { k: 'X', v: formatNumeric(params.X, 6) },
    { k: 'Y', v: formatNumeric(params.Y, 6) },
    { k: 'α', v: formatNumeric(alpha, 6) },
    { k: 'β', v: formatNumeric(beta, 6) },
    { k: 'C', v: formatNumeric(params.C, 6) },
    { k: 'M', v: formatNumeric(params.M, 6) },
    { k: 'T', v: formatNumeric(params.T, 6) },
    { k: 'D', v: formatNumeric(params.D, 6) },
    { k: 'G', v: formatNumeric(params.G, 6) },
    { k: 'E', v: formatNumeric(params.E, 6) },
    { k: 'S', v: formatNumeric(params.S, 6) },
    { k: 'R', v: formatNumeric(params.R, 6) },
  ]);

  if (Array.isArray(extraSections) && extraSections.length > 0) {
    for (const section of extraSections) {
      if (!section || typeof section.heading !== 'string' || !section.heading.trim()) continue;
      writeSectionHeading(section.heading.trim());

      if (Array.isArray(section.paragraphs)) {
        for (const p of section.paragraphs) {
          if (typeof p === 'string' && p.trim()) writeParagraph(p.trim());
        }
      }

      if (Array.isArray(section.equations)) {
        for (const eq of section.equations) {
          if (!eq || typeof eq.latex !== 'string' || !eq.latex.trim()) continue;
          writeEquation(eq.latex.trim(), typeof eq.label === 'string' && eq.label.trim() ? eq.label.trim() : undefined);
        }
      }

      if (Array.isArray(section.bullets) && section.bullets.length > 0) {
        writeBullets(section.bullets.filter((b) => typeof b === 'string' && b.trim()).map((b) => b.trim()));
      }

      if (Array.isArray(section.tables)) {
        for (const t of section.tables) {
          if (!t || !Array.isArray(t.rows) || t.rows.length === 0) continue;
          if (typeof t.title === 'string' && t.title.trim()) writeSubheading(t.title.trim());
          writeKeyValueTable(
            t.rows
              .filter((r) => r && typeof r.k === 'string' && typeof r.v === 'string')
              .map((r) => ({ k: r.k, v: r.v })),
          );
        }
      }

      if (Array.isArray(section.notes)) {
        for (const n of section.notes) {
          if (typeof n === 'string' && n.trim()) writeNote(n.trim());
        }
      }
    }
  }

  writeSectionHeading('Local sensitivities');
  writeParagraph('Sensitivities are local derivatives around the current point and should be interpreted as small-signal slopes.');
  writeKeyValueTable([
    { k: 'Most sensitive to', v: String(analytics.sensitivities.mostSensitiveTo) },
    { k: '∂Z/∂X_safe', v: formatNumeric(analytics.sensitivities.dZ_dX, 9) },
    { k: '∂Z/∂Y_safe', v: formatNumeric(analytics.sensitivities.dZ_dY, 9) },
    { k: '∂Z/∂Φ', v: formatNumeric(analytics.sensitivities.dZ_dPhi, 9) },
    { k: 'Sensitivity norm', v: formatNumeric(analytics.sensitivities.sensitivityNorm, 9) },
    { k: 'Φ in exp clamped', v: analytics.sensitivities.phiInExpIsClamped ? 'yes' : 'no' },
  ]);

  writeSectionHeading('Information-theoretic descriptors');
  writeKeyValueTable([
    { k: 'Local entropy H(Z) (bits)', v: formatNumeric(analytics.information.localEntropyHz, 9) },
    { k: 'Local complexity 4Z(1−Z)', v: formatNumeric(analytics.information.localComplexity01, 9) },
    { k: 'Φ strength (0–1)', v: formatNumeric(analytics.information.phiStrength01, 6) },
    { k: 'Net effect strength (0–1)', v: formatNumeric(analytics.information.netEffectStrength01, 6) },
    { k: 'Emergence index', v: formatNumeric(analytics.information.emergenceIndex, 9) },
  ]);

  // Remaining documentation-derived narrative topics (kept text-based; no DOM capture)
  writeNarrativeTopic('SystemDynamics');
  writeNarrativeTopic('MathematicalAnalysis');

  writeSectionHeading('Evaluation & Fit');
  writeParagraph(
    'This section reports (i) canonical headline panel-fit metrics packaged with this build and (ii) optional in-session panel diagnostics computed from the loaded panel rows. Training/optimizer metrics are shown separately and should not be substituted for the headline.'
  );

  writeSubheading('Headline panel-fit metrics (canonical; packaged)');
  writeKeyValueTable([
    { k: 'R²', v: formatNumeric(productionHeadline.r2, 6) },
    { k: 'Correlation r', v: formatNumeric(productionHeadline.correlation, 6) },
    { k: 'MAE', v: formatNumeric(productionHeadline.mae, 6) },
    { k: 'RMSE', v: formatNumeric(productionHeadline.rmse, 6) },
    { k: `Bias (${BIAS_DEFINITION_PHRASE})`, v: formatNumeric(productionHeadline.bias, 6) },
  ]);

  writeSubheading('Dataset metadata (production panel)');
  writeKeyValueTable([
    { k: 'Observations', v: String(productionDataset.observations) },
    { k: 'Countries', v: String(productionDataset.countries) },
    { k: 'Year start', v: String(productionDataset.yearStart) },
    { k: 'Year end', v: String(productionDataset.yearEnd) },
  ]);

  writeSubheading('Training metadata (optimizer summary; not headline)');
  writeKeyValueTable([
    { k: 'Training date', v: String(productionTraining.date) },
    { k: 'R² (training)', v: formatNumeric(productionTraining.metrics.r2, 6) },
    { k: 'Correlation r (training)', v: formatNumeric(productionTraining.metrics.correlation, 6) },
    { k: 'MAE (training)', v: formatNumeric(productionTraining.metrics.mae, 6) },
    { k: 'RMSE (training)', v: formatNumeric(productionTraining.metrics.rmse, 6) },
    { k: `Bias (training; ${BIAS_DEFINITION_PHRASE})`, v: formatNumeric(productionTraining.metrics.bias, 6) },
  ]);

  writeSubheading('Provenance (headline metrics)');
  writeParagraph(
    `Generated at (UTC): ${String(headlineProvenance.generated_at_utc)}. `
    + `Dataset: ${String(headlineProvenance.dataset?.path)} (N=${String(headlineProvenance.dataset?.n_rows)}, `
    + `years=${String(headlineProvenance.dataset?.year_range?.[0])}–${String(headlineProvenance.dataset?.year_range?.[1])}, `
    + `countries=${String(headlineProvenance.dataset?.countries_count)}). `
    + `Model: ${String(headlineProvenance.model?.id)} with Z clamped=${String(headlineProvenance.model?.uses_clamped_Z)} (ε=${String(headlineProvenance.model?.clamp_epsilon)}). `
    + `Sources: ${String(headlineProvenance.model?.coefficients_source)} + ${String(headlineProvenance.model?.calculation_source)}.`
  );

  if (panelData && panelData.length > 0) {
    writeSubheading('In-session panel diagnostics (loaded this session)');
    if (panelPercentile != null) {
      writeKeyValueTable([{ k: 'Current Z percentile in panel', v: `${formatNumeric(panelPercentile, 2)}%` }]);
    }

    if (runtimeFit && runtimeFit.n > 0) {
      writeKeyValueTable([
        { k: 'Rows used (N)', v: String(runtimeFit.n) },
        { k: 'Dropped rows', v: String(runtimeFit.droppedRows) },
        { k: 'R² (runtime)', v: fmtFinite(runtimeFit.r2, 6) },
        { k: 'Correlation r (runtime)', v: fmtFinite(runtimeFit.corr, 6) },
        { k: 'MAE (runtime)', v: fmtFinite(runtimeFit.mae, 6) },
        { k: 'RMSE (runtime)', v: fmtFinite(runtimeFit.rmse, 6) },
        { k: `Bias (runtime; ${BIAS_DEFINITION_PHRASE})`, v: fmtFinite(runtimeFit.bias, 6) },
      ]);

      writeParagraph('Calibration bins (deciles) are formed by sorting rows by predicted Z and slicing into 10 equal-count groups. Values below summarize mean predicted/observed Z and observed IQR per bin.');
      writeCalibrationBinsTable(runtimeFit.bins);

      writeKeyValueTable([
        { k: 'Residual summary N', v: String(runtimeFit.residualSummary.n) },
        { k: `Mean residual (${BIAS_DEFINITION_PHRASE})`, v: fmtFinite(runtimeFit.residualSummary.meanResidual, 6) },
        { k: 'RMSE (from residuals)', v: fmtFinite(runtimeFit.residualSummary.rmse, 6) },
      ]);
    } else {
      writeParagraph('In-session panel diagnostics were not computable from the loaded rows (no valid predicted/observed pairs).');
    }
  } else {
    writeSubheading('In-session panel diagnostics');
    writeParagraph('Not available in this session: panel rows are not loaded (or still loading). Calibration bins and residual diagnostics are omitted, but the canonical headline metrics remain available.');
  }

  writeSectionHeading('Panel context', { minBodyMm: 26 });
  if (effectivePanelStats) {
    writeParagraph(
      'This section reports two distinct quantities: (i) the observed outcome Z from the panel CSV (raw scale; may fall outside (0,1)), '
      + 'and (ii) model-predicted Z and observed Z mapped into the structural band for comparability.'
    );

    const summarize = (xs: number[]) => {
      const vs = xs.filter(Number.isFinite);
      if (!vs.length) return { n: 0, mean: NaN, std: NaN, min: NaN, max: NaN };
      let sum = 0;
      let sum2 = 0;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (const v of vs) {
        sum += v;
        sum2 += v * v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const mean = sum / vs.length;
      const variance = sum2 / vs.length - mean * mean;
      const std = variance > 0 ? Math.sqrt(variance) : 0;
      return { n: vs.length, mean, std, min, max };
    };

    const predictedStats = runtimeFit && runtimeFit.points && runtimeFit.points.length > 0
      ? summarize(runtimeFit.points.map((p) => p.x))
      : null;
    const observed01Stats = runtimeFit && runtimeFit.points && runtimeFit.points.length > 0
      ? summarize(runtimeFit.points.map((p) => p.y))
      : null;

    const predictedPercentile = (() => {
      if (!predictedStats || !runtimeFit?.points?.length || !Number.isFinite(zValue)) return null;
      const zs = runtimeFit.points.map((p) => p.x).filter(Number.isFinite).sort((a, b) => a - b);
      if (!zs.length) return null;
      const countLE = upperBound(zs, zValue);
      return (countLE / zs.length) * 100;
    })();

    writeKeyValueTable([
      { k: 'Panel rows (N)', v: String(effectivePanelStats.totalRows) },
      { k: 'Observed outcome Z (raw) mean', v: fmtFinite(effectivePanelStats.zDistribution.mean, 9) },
      { k: 'Observed outcome Z (raw) std', v: fmtFinite(effectivePanelStats.zDistribution.std, 9) },
      { k: 'Observed outcome Z (raw) min', v: fmtFinite(effectivePanelStats.zDistribution.min, 9) },
      { k: 'Observed outcome Z (raw) max', v: fmtFinite(effectivePanelStats.zDistribution.max, 9) },
    ]);

    if (predictedStats && observed01Stats) {
      writeKeyValueTable([
        { k: `Observed Z mapped to structural band mean (${structuralBandLabel})`, v: fmtFinite(observed01Stats.mean, 9) },
        { k: `Observed Z mapped to structural band std (${structuralBandLabel})`, v: fmtFinite(observed01Stats.std, 9) },
        { k: `Observed Z mapped to structural band min (${structuralBandLabel})`, v: fmtFinite(observed01Stats.min, 9) },
        { k: `Observed Z mapped to structural band max (${structuralBandLabel})`, v: fmtFinite(observed01Stats.max, 9) },
        { k: `Predicted Z (model; ${structuralBandLabel}) mean`, v: fmtFinite(predictedStats.mean, 9) },
        { k: `Predicted Z (model; ${structuralBandLabel}) std`, v: fmtFinite(predictedStats.std, 9) },
        { k: `Predicted Z (model; ${structuralBandLabel}) min`, v: fmtFinite(predictedStats.min, 9) },
        { k: `Predicted Z (model; ${structuralBandLabel}) max`, v: fmtFinite(predictedStats.max, 9) },
        { k: 'Current percentile (predicted Z in-session)', v: predictedPercentile == null ? '—' : `${formatNumeric(predictedPercentile, 2)}%` },
      ]);
    } else {
      writeParagraph('Predicted-Z and mapped-observed-Z summaries are not available (no valid predicted/observed pairs in-session).');
      writeKeyValueTable([{ k: 'Current percentile (panel stats)', v: panelPercentile == null ? '—' : `${formatNumeric(panelPercentile, 2)}%` }]);
    }

    const extrapolationWarnings = (() => {
      const ranges = effectivePanelStats.ranges;
      const warnings: string[] = [];
      const keys: Array<keyof typeof params> = ['X', 'Y', 'C', 'M', 'T', 'D', 'G', 'E', 'S', 'R'];
      for (const key of keys) {
        const range = ranges[key];
        const value = params[key];
        if (!range || !Number.isFinite(value)) continue;
        const [min, max] = range;
        if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
        if (value < min) warnings.push(`${key}=${formatNumeric(value, 3)} below panel min (${formatNumeric(min, 3)})`);
        if (value > max) warnings.push(`${key}=${formatNumeric(value, 3)} above panel max (${formatNumeric(max, 3)})`);
      }
      return warnings;
    })();

    if (extrapolationWarnings.length > 0) {
      writeParagraph('Extrapolation notes — One or more parameters lie outside the empirical panel min/max bounds.');
      writeBullets(extrapolationWarnings.slice(0, 12));
    } else {
      writeParagraph('Extrapolation notes — No parameter range violations were detected relative to panel min/max bounds.');
    }
  } else {
    writeParagraph('Panel context is not available in the current session. Load the panel dataset to include distribution statistics, percentiles, and range checks.');
  }

  // Scenario compare section (handles missing snapshots gracefully)
  const currentFullParams: BeliefParameters = {
    X: params.X,
    Y: params.Y,
    alpha,
    beta,
    k,
    C: params.C,
    M: params.M,
    T: params.T,
    D: params.D,
    G: params.G,
    E: params.E,
    S: params.S,
    R: params.R,
  };

  const a = effectiveScenarioA ?? null;
  const b = effectiveScenarioB ?? null;

  const comparisonMode: 'A-vs-B' | 'A-vs-Current' | 'B-vs-Current' | null = (() => {
    if (a && b) return 'A-vs-B';
    if (a) return 'A-vs-Current';
    if (b) return 'B-vs-Current';
    return null;
  })();

  if (comparisonMode) {
    writeSectionHeading('Scenario comparison');

    const left = comparisonMode === 'B-vs-Current' ? b! : a!;
    const right = comparisonMode === 'A-vs-B' ? b! : currentFullParams;

    const rightZ = comparisonMode === 'A-vs-B' ? b!.zValue : zValue;
    const rightPhi = comparisonMode === 'A-vs-B' ? b!.phiValue : phiValue;

    const leftZ = left.zValue;
    const leftPhi = left.phiValue;

    const modeLabel = (() => {
      if (comparisonMode === 'A-vs-B') return 'A vs B (Δ = B − A)';
      if (comparisonMode === 'A-vs-Current') return 'A vs Current (Δ = Current − A)';
      return 'B vs Current (Δ = Current − B)';
    })();

    writeKeyValueTable([
      { k: 'Comparison mode', v: modeLabel },
      { k: 'Left preset', v: left.presetName ?? 'Manual' },
      { k: 'Right preset', v: comparisonMode === 'A-vs-B' ? (b!.presetName ?? 'Manual') : (presetName ?? 'Manual') },
      { k: 'ΔZ', v: formatNumeric(rightZ - leftZ, 9) },
      { k: 'ΔΦ', v: formatNumeric(rightPhi - leftPhi, 9) },
    ]);

    const keys: Array<keyof BeliefParameters> = ['X', 'Y', 'alpha', 'beta', 'k', 'C', 'M', 'T', 'D', 'G', 'E', 'S', 'R'];
    const leftParams = left.params;
    const rightParams = right as BeliefParameters;

    const rows = keys
      .map((key) => {
        const lv = leftParams[key];
        const rv = rightParams[key];
        return { key, lv, rv, d: rv - lv };
      })
      .filter((r) => Number.isFinite(r.lv) && Number.isFinite(r.rv));

    writeParagraph('Parameter deltas are row-wise (right − left).');

    // Render as a compact KV table in chunks to keep pagination simple and dense.
    // Each row is one line like: "X: 0.123 → 0.456 (Δ +0.333)".
    const deltaLines = rows.map((r) => {
      const sign = r.d >= 0 ? '+' : '';
      return `${String(r.key)}: ${formatNumeric(r.lv, 4)} → ${formatNumeric(r.rv, 4)} (Δ ${sign}${formatNumeric(r.d, 4)})`;
    });
    writeBullets(deltaLines);
  }

  writeSectionHeading('Reproducibility');
  writeNarrativeBlocks(REPORT_REPRODUCIBILITY_APPENDIX);
  writeKeyValueTable([
    { k: 'Preset', v: presetName ?? 'Manual' },
    { k: 'Structural band', v: structuralBandLabel },
    { k: 'Clamp notes', v: 'Z is epsilon-clamped; Φ is clamped inside exp() to avoid overflow.' },
  ]);

  // Share URL rendering: avoid fragile mid-token wrapping by separating base URL and params.
  writeSubheading('Share URL');
  const parsed = (() => {
    try {
      const u = new URL(resolvedShareUrl);
      const baseUrl = `${u.origin}${u.pathname}`;
      const hash = u.hash ? u.hash.replace(/^#/, '') : '';

      const entries = Array.from(u.searchParams.entries())
        .map(([k2, v2]) => ({ k: k2, v: v2 }))
        .sort((a, b) => (a.k === b.k ? a.v.localeCompare(b.v) : a.k.localeCompare(b.k)));

      return { ok: true as const, baseUrl, params: entries, hash, full: u.toString() };
    } catch {
      return { ok: false as const };
    }
  })();

  if (parsed.ok) {
    writeKeyValueTable([
      { k: 'Base URL', v: parsed.baseUrl },
      { k: 'Fragment (#)', v: parsed.hash ? parsed.hash : '—' },
    ]);

    if (parsed.params.length) {
      writeParagraph('Query parameters (sorted for determinism):');
      writeTable(
        [
          { key: 'k', label: 'param', wMm: 45, align: 'left', font: 'mono' },
          { key: 'v', label: 'value', wMm: 120, align: 'left', font: 'mono' },
        ],
        parsed.params,
        { headerRepeat: true, headerMinBodyMm: 10, fontSize: 8.8, leadingMm: 4.0, cellPadMm: 0.6 },
      );
    } else {
      writeParagraph('No query parameters present in this Share URL.');
    }

    writeSubheading('Share URL (verbatim)');
    const verbatimLines = splitUrlVerbatimByWidth(parsed.full, contentW - 12);
    writeCodeBlock(verbatimLines);
  } else {
    writeParagraph('Share URL (unparsed):');
    const verbatimLines = splitUrlVerbatimByWidth(resolvedShareUrl, contentW - 12);
    writeCodeBlock(verbatimLines);
  }

  writeSectionHeading('Parameter snapshot');
  writeKeyValueTable([
    { k: 'X', v: formatNumeric(params.X, 6) },
    { k: 'Y', v: formatNumeric(params.Y, 6) },
    { k: 'α', v: formatNumeric(alpha, 6) },
    { k: 'β', v: formatNumeric(beta, 6) },
    { k: 'k', v: formatNumeric(k, 6) },
    { k: 'C', v: formatNumeric(params.C, 6) },
    { k: 'M', v: formatNumeric(params.M, 6) },
    { k: 'T', v: formatNumeric(params.T, 6) },
    { k: 'D', v: formatNumeric(params.D, 6) },
    { k: 'G', v: formatNumeric(params.G, 6) },
    { k: 'E', v: formatNumeric(params.E, 6) },
    { k: 'S', v: formatNumeric(params.S, 6) },
    { k: 'R', v: formatNumeric(params.R, 6) },
  ]);

  // -----------------------------
  // Optional figure capture (non-breaking)
  // -----------------------------
  const tryCaptureFigure = async (): Promise<HTMLCanvasElement | null> => {
    debug.figure.attempted = true;
    if (!enableFigureCapture) {
      debug.figure.skippedReasons.push('disabled (DEV QA override)');
      return null;
    }

    let element: HTMLElement | null = null;
    try {
      element = document.querySelector(captureSelector) as HTMLElement | null;
    } catch {
      debug.figure.skippedReasons.push('document.querySelector threw');
      return null;
    }
    if (!element) {
      debug.figure.skippedReasons.push(`element not found for selector: ${captureSelector}`);
      return null;
    }

    const rect = element.getBoundingClientRect();
    const captureWidth = Math.ceil(rect.width);
    const captureHeight = Math.ceil(rect.height);

    if (!isFinitePositive(captureWidth) || !isFinitePositive(captureHeight)) {
      if (import.meta.env.DEV) {
        console.warn('[PDF] Skipping figure capture due to invalid element geometry.', { captureWidth, captureHeight, selector: captureSelector });
      }
      debug.figure.skippedReasons.push('invalid element geometry');
      return null;
    }

    let html2canvas: (element: HTMLElement, options: Record<string, unknown>) => Promise<HTMLCanvasElement>;
    try {
      html2canvas = await loadHtml2Canvas();
    } catch (e) {
      debug.figure.skippedReasons.push('failed to load html2canvas');
      if (import.meta.env.DEV) {
        console.warn('[PDF] html2canvas import failed; skipping figure.', e);
      }
      return null;
    }

    const tryCapture = async (allowTaint: boolean) => html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint,
      backgroundColor: '#ffffff',
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      scrollX: 0,
      scrollY: 0,
    });

    try {
      const canvas = await tryCapture(false);
      if (!isFinitePositive(canvas.width) || !isFinitePositive(canvas.height)) return null;
      return canvas;
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[PDF] html2canvas strict capture failed; retrying allowTaint=true.', e);
      }
      try {
        const canvas = await tryCapture(true);
        if (!isFinitePositive(canvas.width) || !isFinitePositive(canvas.height)) return null;
        return canvas;
      } catch (e2) {
        if (import.meta.env.DEV) {
          console.warn('[PDF] html2canvas capture failed; skipping figure.', e2);
        }
        debug.figure.skippedReasons.push('html2canvas capture failed');
        return null;
      }
    }
  };

  // -----------------------------
  // Export-safe figure snapshot hook
  // -----------------------------
  // WebGL canvases often render blank in html2canvas. The UI layer (Surface3DOverlay)
  // listens for these events and temporarily swaps the WebGL plot for a PNG snapshot.
  const exportRequestId = (() => {
    try {
      return `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    } catch {
      return `pdf-${Date.now()}`;
    }
  })();

  const dispatchExportEvent = (type: string) => {
    try {
      window.dispatchEvent(new CustomEvent(type, { detail: { requestId: exportRequestId } }));
    } catch {
      // no-op
    }
  };

  const waitForSnapshotReady = async (timeoutMs: number): Promise<boolean> => {
    // Best-effort: do not block export if the snapshot mechanism isn't present.
    return new Promise((resolve) => {
      let done = false;
      let timer: number | null = null;

      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        if (timer != null) window.clearTimeout(timer);
        window.removeEventListener('app:export-pdf:snapshot-ready', onMsg as EventListener);
        resolve(ok);
      };

      const onMsg = (evt: Event) => {
        const e = evt as CustomEvent | null;
        const detail = (e && typeof e === 'object' ? (e as CustomEvent).detail : null) as
          | { requestId?: unknown; ok?: unknown }
          | null;
        if (!detail || detail.requestId !== exportRequestId) return;
        finish(Boolean(detail.ok));
      };

      window.addEventListener('app:export-pdf:snapshot-ready', onMsg as EventListener);
      timer = window.setTimeout(() => finish(false), timeoutMs);
    });
  };

  // Toggle a global flag so sections can apply export-specific (print-friendly) styles.
  let prevPdfExportAttr: string | null = null;
  try {
    prevPdfExportAttr = document.documentElement.getAttribute('data-pdf-export');
    document.documentElement.setAttribute('data-pdf-export', 'true');
  } catch {
    prevPdfExportAttr = null;
  }

  dispatchExportEvent('app:export-pdf:start');

  try {
    await waitForSnapshotReady(1400);

    const canvas = await tryCaptureFigure();
    if (canvas) {
      const naturalW = canvas.width;
      const naturalH = canvas.height;

      if (isFinitePositive(naturalW) && isFinitePositive(naturalH)) {
        const aspect = naturalW / naturalH;
        const wantLandscape = aspect > 1.6;

        let imgData: string | null = null;
        try {
          imgData = canvas.toDataURL('image/png');
        } catch {
          imgData = null;
        }

        if (typeof imgData === 'string' && imgData.startsWith('data:image/png')) {
          // Finish the current page before adding a special-orientation page.
          if (state.pageHasMeaningfulContent && !state.footerDrawnForPage) {
            drawFooter(state.pageNo);
            state.footerDrawnForPage = true;
          }

          const from = state.pageNo;
          const figOrientation: 'p' | 'l' = wantLandscape ? 'l' : 'p';
          const figW = wantLandscape ? 297 : 210;
          const figH = wantLandscape ? 210 : 297;
          const figMargin = 12;
          const figHeaderH = headerH;
          const figFooterH = footerH;
          const figContentTop = figMargin + figHeaderH;
          const figContentBottom = figH - figMargin - figFooterH;
          const figContentW = figW - 2 * figMargin;

          try {
            // jsPDF v3 supports addPage(format, orientation)
            (pdf as unknown as { addPage: (...args: unknown[]) => void }).addPage('a4', figOrientation);
          } catch {
            // Fallback: explicit dimensions
            (pdf as unknown as { addPage: (...args: unknown[]) => void }).addPage([figW, figH]);
          }

          state.pageNo += 1;
          state.subtitle = 'Figure 1';
          state.y = figContentTop;
          state.pageHasMeaningfulContent = false;
          state.footerDrawnForPage = false;
          state.sectionsOnPage = [];

          debug.pageBreaks.push({ from, to: state.pageNo, subtitle: state.subtitle, reason: 'figure-page' });
          drawBackgroundAt(figW, figH);
          drawHeaderAt(figW, documentSubtitle, figMargin, figHeaderH, figContentW);

          // Caption + optional figure notes (layout filler only; reuses already-reported values).
          const headlineR2 = typeof productionHeadline?.r2 === 'number' && Number.isFinite(productionHeadline.r2)
            ? formatNumeric(productionHeadline.r2, 4)
            : null;
          const headlineCorr = typeof productionHeadline?.correlation === 'number' && Number.isFinite(productionHeadline.correlation)
            ? formatNumeric(productionHeadline.correlation, 4)
            : null;
          const runtimeR2 = typeof runtimeFit?.r2 === 'number' && Number.isFinite(runtimeFit.r2)
            ? formatNumeric(runtimeFit.r2, 4)
            : null;
          const runtimeCorr = typeof runtimeFit?.corr === 'number' && Number.isFinite(runtimeFit.corr)
            ? formatNumeric(runtimeFit.corr, 4)
            : null;

          const notes = [
            `Z=${formatNumeric(zValue, 4)}; Φ=${formatNumeric(phiValue, 4)}; k=${formatNumeric(k, 4)}`,
            `Label: ${interpretation.label}`,
            headlineR2 == null
              ? 'Headline fit: R²=—'
              : `Headline fit: R²=${headlineR2}; ${headlineCorr == null ? 'Corr: not available' : `Corr=${headlineCorr}`}`,
            runtimeR2 == null
              ? 'Runtime fit: R²=—'
              : `Runtime fit: R²=${runtimeR2}; ${runtimeCorr == null ? 'Corr: not available' : `Corr=${runtimeCorr}`}`,
          ];

          const writeFigureLine = (text: string, x: number, y: number, maxW: number, fontStyle: 'normal' | 'italic' | 'bold', size: number, color: [number, number, number]) => {
            (pdf as unknown as { setFont: (...args: unknown[]) => void }).setFont(fonts.serif, fontStyle);
            (pdf as unknown as { setFontSize: (...args: unknown[]) => void }).setFontSize(size);
            (pdf as unknown as { setTextColor: (...args: unknown[]) => void }).setTextColor(...color);
            (pdf as unknown as { setCharSpace?: (n: number) => void }).setCharSpace?.(0);
            const line = fitLineToWidth(text, maxW, { font: fonts.serif as 'Serif', style: fontStyle, size });
            (pdf as unknown as { text: (...args: unknown[]) => void }).text(line, x, y);
            markContent();
          };

          const captionLines = splitByWidth('Figure 1 — Dashboard snapshot (current state).', figContentW, { font: fonts.serif as 'Serif', style: 'italic', size: 9 });
          const noteLines = notes.flatMap((n) => splitByWidth(`• ${n}`, figContentW, { font: fonts.serif as 'Serif', style: 'normal', size: 8.9 }));

          const captionH = captionLines.length * 4.2;
          const notesH = noteLines.length * 4.0;
          const imgCaptionGap = 3.6;
          const captionNotesGap = 2.0;
          const footerPad = 2.0;

          const maxImgW = figContentW;
          const maxImgH = figContentBottom - figContentTop - captionH - notesH - imgCaptionGap - captionNotesGap - footerPad;

          // If notes would force the image too small, omit notes.
          const includeNotes = maxImgH >= (wantLandscape ? 105 : 135);
          const finalNotesH = includeNotes ? (captionNotesGap + notesH) : 0;
          const finalMaxImgH = figContentBottom - figContentTop - captionH - imgCaptionGap - finalNotesH - footerPad;

          const scale = Math.min(maxImgW / naturalW, finalMaxImgH / naturalH);
          const finalW = naturalW * scale;
          const finalH = naturalH * scale;
          if (!isFinitePositive(scale) || !isFinitePositive(finalW) || !isFinitePositive(finalH)) {
            debug.figure.skippedReasons.push('figure scaling invalid');
          } else {
            // Vertical centering across image + caption (+ notes if included).
            const packH = finalH + imgCaptionGap + captionH + finalNotesH;
            const availH = figContentBottom - figContentTop;
            const topY = figContentTop + Math.max(0, (availH - packH) / 2);

            const imgY = topY;
            const imgX = figMargin + (figContentW - finalW) / 2;

            (pdf as unknown as { addImage: (...args: unknown[]) => void }).addImage(imgData, 'PNG', imgX, imgY, finalW, finalH);
            markContent();
            debug.figure.included = true;

            let y = imgY + finalH + imgCaptionGap;
            for (const ln of captionLines) {
              writeFigureLine(ln, figMargin, y, figContentW, 'italic', 9, MUTED);
              y += 4.2;
            }

            if (includeNotes) {
              // A compact “Figure Notes” block under the caption.
              y += captionNotesGap;
              writeFigureLine('Figure notes', figMargin, y, figContentW, 'bold', 9.2, INK);
              y += 4.6;
              for (const ln of noteLines) {
                writeFigureLine(ln, figMargin, y, figContentW, 'normal', 8.9, INK);
                y += 4.0;
              }
            }
          }

          drawFooterAt(figW, figH, figMargin, state.pageNo);
          state.pageHasMeaningfulContent = true;
          state.footerDrawnForPage = true;
        }
      }
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[PDF] Figure capture unexpected error; continuing with text-only export.', e);
    }
    debug.figure.skippedReasons.push('unexpected error during figure pipeline');
  } finally {
    dispatchExportEvent('app:export-pdf:end');
    try {
      if (prevPdfExportAttr == null) {
        document.documentElement.removeAttribute('data-pdf-export');
      } else {
        document.documentElement.setAttribute('data-pdf-export', prevPdfExportAttr);
      }
    } catch {
      // ignore
    }
  }

  // Finalize (footer on last page)
  if (state.pageHasMeaningfulContent && !state.footerDrawnForPage) {
    drawFooter(state.pageNo);
    state.footerDrawnForPage = true;
  }

  // Record last page usage for QA.
  debug.pageUsage.push({
    pageNo: state.pageNo,
    subtitle: state.subtitle,
    usedMm: Math.max(0, safeNumber(state.y) - contentTop),
    hasContent: state.pageHasMeaningfulContent,
    sectionsOnPage: [...state.sectionsOnPage],
  });

  if (import.meta.env.DEV) {
    const requiredSections = [
      'Abstract',
      'Key Results (Current State)',
      'Methods',
      'Canonical pipeline (compact)',
      'Evaluation & Fit',
      'Reproducibility',
      'Parameter snapshot',
    ];

    const missing = requiredSections.filter((s) => !debug.sections.includes(s));
    const failures: string[] = [];
    const warnings: string[] = [];

    if (missing.length) {
      failures.push(`Missing required section headings: ${missing.join(', ')}`);
    }

    if (debug.blankPageAvoided.length) {
      failures.push(`Blank-page prevention triggered (${debug.blankPageAvoided.length}×); investigate newPage() callers.`);
    }

    const pageCount = state.pageNo;
    for (const p of debug.pageUsage) {
      if (!p.hasContent) {
        failures.push(`Page ${p.pageNo} has no meaningful content (header/footer only).`);
      }
      // Heuristic: flag tiny-content pages in non-tiny documents.
      if (pageCount >= 3 && p.usedMm < 14) {
        warnings.push(`Page ${p.pageNo} has very low content height (${formatNumeric(p.usedMm, 1)}mm).`);
      }
    }

    // Consistency checks
    const expectedBand = `[${STRUCTURAL_MIN.toFixed(4)}, ${STRUCTURAL_MAX.toFixed(4)}]`;
    if (structuralBandLabel !== expectedBand) {
      failures.push(`Structural band label mismatch: expected ${expectedBand}, got ${structuralBandLabel}.`);
    }

    // Optional sections
    const comparisonModeLabel = (() => {
      if (a && b) return 'A-vs-B';
      if (a) return 'A-vs-Current';
      if (b) return 'B-vs-Current';
      return null;
    })();

    console.groupCollapsed('[PDF QA] Export report');
    console.log('pageCount', pageCount);
    console.log('optionalSections', {
      panelStats: Boolean(effectivePanelStats),
      panelDataRows: Array.isArray(effectivePanelData) ? effectivePanelData.length : null,
      runtimeFit: Boolean(runtimeFit && runtimeFit.bins && runtimeFit.bins.length > 0),
      scenarioCompare: comparisonModeLabel,
      figure: {
        attempted: debug.figure.attempted,
        included: debug.figure.included,
        skippedReasons: debug.figure.skippedReasons,
      },
    });
    console.log('qaOverrides', devQaOverrides ?? null);
    console.log('pageBreaks', debug.pageBreaks);
    console.log('sectionsRendered', debug.sections);
    if (warnings.length) {
      console.warn('[PDF QA] WARN', { warnings, area: 'src/utils/pdf/exportBehavioralDynamicsReport.ts:DEV-QA' });
    }
    if (failures.length) {
      console.error('[PDF QA] FAIL', { failures, area: 'src/utils/pdf/exportBehavioralDynamicsReport.ts:DEV-QA' });
    } else {
      console.log('[PDF QA] PASS');
    }
    console.groupEnd();
  }

  if (import.meta.env.DEV) {
    console.log('[PDF] export complete', {
      pageCount: state.pageNo,
      sectionsRendered: debug.sections,
      pageBreaks: debug.pageBreaks,
    });
  }

  const date = safeIsoTimestampUTC().slice(0, 10);
  const resolvedStem = (fileStem ?? 'Behavioral-Dynamics-Complete').trim() || 'Behavioral-Dynamics-Complete';
  const fileName = (fileNameOverride && fileNameOverride.trim())
    ? fileNameOverride.trim()
    : `${resolvedStem}-${date}.pdf`;
  (pdf as unknown as { save: (name: string) => void }).save(fileName);
}
