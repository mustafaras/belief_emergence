/**
 * Sidebar/navigation documentation was moved out of this component to keep the file maintainable.
 *
 * See:
 * - docs/documentation/interactive-documentation-sidebar-spec.md
 * - docs/documentation/sidebar-regression-protocol.md
 * - docs/documentation/sidebar-risk-register.md
 * - docs/documentation/sidebar-dom-outline.md
 * - docs/documentation/sidebar-conflict-register.md
 * - docs/documentation/sidebar-css-responsibility-map.md
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { BeliefParameters } from '../../types';
import { calculateModel } from '../../utils/calculateModel';
import {
  BeliefEquationSection,
  CoreVariablesSection,
  AmplifiersSection,
  SuppressorsSection,
  MathematicalAnalysisSection,
  SystemDynamicsSection,
  NotationGlossarySection
} from '../sections/index.ts';
import { BeliefProgress } from '../metrics';
import { useAccessibility } from '../../contexts/AccessibilityContext';
import './InteractiveDocumentation_clean.css';

type SectionGroup = 'MODEL' | 'MECHANISMS' | 'ANALYSIS' | 'REFERENCE';

const SIDEBAR_GROUP_ORDER: SectionGroup[] = ['MODEL', 'MECHANISMS', 'ANALYSIS'];

const ENABLE_SIDEBAR_SEARCH = true;
const TYPEAHEAD_TIMEOUT_MS = 600;
const PAGE_JUMP_COUNT = 8;
const PREVIEW_OPEN_DELAY_MS = 80;
const PREVIEW_CLOSE_DELAY_MS = 120;
const PREVIEW_OFFSET_PX = 10;
const PREVIEW_WIDTH_PX = 260;

const SIDEBAR_SECTIONS: Array<{
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  description: string;
  group: SectionGroup;
  isActive?: boolean;
}> = [
  {
    id: 'equation',
    title: 'Belief Equation',
    subtitle: 'Section 1',
    icon: 'equation',
    description: 'Mathematical foundation and core formula',
    group: 'MODEL'
  },
  {
    id: 'variables',
    title: 'Core Variables',
    subtitle: 'Section 2',
    icon: 'variables',
    description: 'Primary structural components',
    group: 'MODEL'
  },
  {
    id: 'amplifiers',
    title: 'Amplifiers',
    subtitle: 'Section 3',
    icon: 'amplifiers',
    description: 'Socio-cultural intensifiers',
    group: 'MECHANISMS'
  },
  {
    id: 'suppressors',
    title: 'Suppressors',
    subtitle: 'Section 4',
    icon: 'suppressors',
    description: 'Institutional and psychological dampeners',
    group: 'MECHANISMS'
  },
  {
    id: 'analysis',
    title: 'Mathematical Analysis',
    subtitle: 'Section 5',
    icon: 'analysis',
    description: 'Ridge regression and model validation',
    group: 'ANALYSIS',
    isActive: true
  },
  {
    id: 'dynamics',
    title: 'System Dynamics',
    subtitle: 'Section 6',
    icon: 'dynamics',
    description: 'Complex behavioral patterns',
    group: 'ANALYSIS'
  },
  {
    id: 'notation',
    title: 'Notation Glossary',
    subtitle: 'Reference',
    icon: 'Σ',
    description: 'Complete symbol reference for the belief-emergence model',
    group: 'REFERENCE'
  }
];

// Modern SVG Icons Component
const Icon: React.FC<{ name: string; size?: number; className?: string }> = ({
  name,
  size = 24,
  className = ""
}) => {
  const icons = {
    equation: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} focusable="false">
        <path d="M3 12h18" />
        <path d="M12 3v18" />
        <circle cx="7" cy="7" r="2" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    ),
    variables: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} focusable="false">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
    amplifiers: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} focusable="false">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        <path d="M6 12h4" />
        <path d="M14 12h4" />
      </svg>
    ),
    suppressors: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} focusable="false">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M6 12h12" />
        <path d="M12 6v12" />
      </svg>
    ),
    analysis: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} focusable="false">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
      </svg>
    ),
    dynamics: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} focusable="false">
        <path d="M12 2L2 7v10c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V7l-10-5z" />
        <path d="M8 11l2 2 4-4" />
      </svg>
    )
  };

  return icons[name as keyof typeof icons] || null;
};

interface InteractiveDocumentationProps {
  parameters: BeliefParameters;
  alpha: number;
  beta: number;
  k: number;
  onClose?: () => void;
}

const InteractiveDocumentation: React.FC<InteractiveDocumentationProps> = ({ 
  parameters, 
  alpha, 
  beta, 
  k,
  onClose 
}) => {
  const { rovingTabindex: ENABLE_ROVING_TABINDEX } = useAccessibility();
  const prefersReducedMotion = useReducedMotion();
  const [selectedSection, setSelectedSection] = useState<string>('equation');
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [focusedId, setFocusedId] = useState<string>('equation');
  const [typeahead, setTypeahead] = useState<string>('');
  const [isCondensed, setIsCondensed] = useState<boolean>(false);
  const [a11yAnnouncement, setA11yAnnouncement] = useState<string>('');

  type ExportPhase = 'idle' | 'preparing' | 'ready' | 'blocked' | 'error';
  const [exportPhase, setExportPhase] = useState<ExportPhase>('idle');
  const exportPhaseRef = useRef<ExportPhase>('idle');
  const exportNonceRef = useRef<number>(0);
  const lastReportHtmlRef = useRef<string | null>(null);

  const navRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const selectedSectionRootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const typeaheadTimerRef = useRef<number | null>(null);
  const navHasFocusRef = useRef<boolean>(false);
  const lastMoveWasKeyboardRef = useRef<boolean>(false);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const headerScrollRafRef = useRef<number | null>(null);

  const sidebarExpanded = isPinned || isHovered;

  // ARIA live announcement when roving tabindex is toggled
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setA11yAnnouncement(
      ENABLE_ROVING_TABINDEX
        ? 'Keyboard navigation enabled'
        : 'Keyboard navigation disabled',
    );
  }, [ENABLE_ROVING_TABINDEX]);

  useEffect(() => {
    exportPhaseRef.current = exportPhase;
  }, [exportPhase]);

  // Listen to status messages from the hidden export iframe.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as unknown;
      if (!data || typeof data !== 'object') return;
      const d = data as { type?: string; phase?: string; nonce?: number };
      if (d.type !== 'DOC_EXPORT_STATUS') return;
      if (typeof d.nonce !== 'number') return;
      if (d.nonce !== exportNonceRef.current) return;

      if (d.phase === 'ready') {
        setExportPhase('ready');
      } else if (d.phase === 'afterprint') {
        setExportPhase('idle');
      } else if (d.phase === 'printed') {
        // Some browsers don't fire afterprint reliably for iframes.
        // Keep it non-blocking: reset back to idle shortly after print is called.
        window.setTimeout(() => {
          if (exportNonceRef.current === d.nonce) setExportPhase('idle');
        }, 1200);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Listen for cross-section navigation events (e.g. from MathematicalAnalysisSection glossary link)
  useEffect(() => {
    const onNav = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (typeof id === 'string' && SIDEBAR_SECTIONS.some((s) => s.id === id)) {
        setSelectedSection(id);
      }
    };
    window.addEventListener('app:navigate-section', onNav);
    return () => window.removeEventListener('app:navigate-section', onNav);
  }, []);

  const handleOpenPrintPreview = useCallback(() => {
    const html = lastReportHtmlRef.current;
    if (!html) return;

    // User-consented fallback: open a new tab/window only if iframe printing appears blocked.
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
      setExportPhase('error');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }, []);

  const escapeHtml = useCallback((input: string): string => {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }, []);

  // ╔════════════════════════════════════════════════════════════════╗
  // ║ FOOTER UPGRADE v2 — Scientific Instrument Cluster              ║
  // ║ State + Persistence + Keyboard Support                         ║
  // ╚════════════════════════════════════════════════════════════════╝
  const [footerExpanded, setFooterExpanded] = useState<boolean>(false);
  
  // Load footer expanded preference from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('docSidebar.footerExpanded');
      const initialValue = stored === '1' || stored === 'true';
      setFooterExpanded(initialValue);
    } catch {
      // no-op (storage unavailable)
    }
  }, []);

  // ╔════════════════════════════════════════════════════════════════╗
  // ║ SEMANTIC NAVIGATION v1 — Visited State + Progress Markers     ║
  // ║ Tracks user's navigation history for professional IDE feel    ║
  // ╚════════════════════════════════════════════════════════════════╝
  const [visitedSectionIds, setVisitedSectionIds] = useState<Set<string>>(new Set());

  // Load visited sections from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('docSidebar.visitedSectionIds');
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        // Validate IDs exist in section list
        const validIds = parsed.filter(id => SIDEBAR_SECTIONS.some(s => s.id === id));
        setVisitedSectionIds(new Set(validIds));
      }
    } catch {
      // no-op (invalid JSON or storage unavailable)
    }
  }, []);

  // Mark section as visited (called on activation only, not hover/focus)
  const markVisited = useCallback((sectionId: string) => {
    setVisitedSectionIds((prev) => {
      if (prev.has(sectionId)) return prev;
      const next = new Set(prev);
      next.add(sectionId);
      // Persist to localStorage on user action
      try {
        localStorage.setItem('docSidebar.visitedSectionIds', JSON.stringify([...next]));
      } catch {
        // no-op
      }
      return next;
    });
  }, []);

  // Auto-close drawer when sidebar collapses, but preserve user preference in storage
  useEffect(() => {
    if (!sidebarExpanded && footerExpanded) {
      setFooterExpanded(false);
      // Keep stored preference unchanged so it auto-reopens when sidebar re-expands
    }
  }, [sidebarExpanded, footerExpanded]);

  // Toggle footer drawer and persist preference (only on explicit user toggle)
  const toggleFooterDrawer = useCallback(() => {
    setFooterExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('docSidebar.footerExpanded', next ? '1' : '0');
      } catch {
        // no-op
      }
      return next;
    });
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // Footer Signals Available:
  // - values.Z: belief emergence scalar (0.0001–0.9999 interior band, animated)
  // - selectedSection: current active section ID
  // - sidebarExpanded: boolean (affects drawer visibility)
  // - parameters.X, parameters.Y: model inputs
  // - alpha, beta, k: model parameters
  // - isPinned: user pinned state
  // =================================================================

  // Formatting utilities (no new computation)
  const formatZ = useCallback((z: number): string => {
    if (!Number.isFinite(z)) return '—';
    // Z lives in the interior band [0.0001, 0.9999]; show enough precision so endpoints
    // do not round to 0.000 / 1.000.
    return z.toFixed(4);
  }, []);

  const truncateActiveLabel = useCallback((label: string, maxLen: number = 16): string => {
    return label.length > maxLen ? label.substring(0, maxLen - 1) + '…' : label;
  }, []);

  const getActiveSectionLabel = useCallback((): string => {
    const section = SIDEBAR_SECTIONS.find((s) => s.id === selectedSection);
    return section ? section.title : 'Unknown';
  }, [selectedSection]);

  // Compute group-level statistics for progress indicators
  const groupStats = useMemo(() => {
    const stats: Record<SectionGroup, { total: number; visited: number; sections: typeof SIDEBAR_SECTIONS }> = {
      MODEL: { total: 0, visited: 0, sections: [] },
      MECHANISMS: { total: 0, visited: 0, sections: [] },
      ANALYSIS: { total: 0, visited: 0, sections: [] },
      REFERENCE: { total: 0, visited: 0, sections: [] }
    };

    SIDEBAR_SECTIONS.forEach((section) => {
      const group = section.group;
      stats[group].total++;
      stats[group].sections.push(section);
      if (visitedSectionIds.has(section.id)) {
        stats[group].visited++;
      }
    });

    return stats;
  }, [visitedSectionIds]);

  // Global progress: total visited / total sections
  const globalProgress = useMemo(() => {
    return {
      visited: visitedSectionIds.size,
      total: SIDEBAR_SECTIONS.length
    };
  }, [visitedSectionIds]);

  // Preview state & timers
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number } | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('docSidebarPinned');
      setIsPinned(raw === 'true');
    } catch {
      // no-op (e.g., storage unavailable)
    }
  }, []);

  useEffect(() => {
    const scrollTarget: HTMLElement | Window = mainContentRef.current || window;

    const evaluateCondensed = () => {
      const scrollTop = mainContentRef.current
        ? mainContentRef.current.scrollTop
        : window.scrollY || window.pageYOffset || 0;

      setIsCondensed((prev) => {
        if (scrollTop > 40 && !prev) return true;
        if (scrollTop < 20 && prev) return false;
        return prev;
      });

      headerScrollRafRef.current = null;
    };

    const handleScroll = () => {
      if (headerScrollRafRef.current !== null) return;
      headerScrollRafRef.current = requestAnimationFrame(evaluateCondensed);
    };

    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    evaluateCondensed();

    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll);
      if (headerScrollRafRef.current !== null) {
        cancelAnimationFrame(headerScrollRafRef.current);
        headerScrollRafRef.current = null;
      }
    };
  }, []);

  const togglePinned = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('docSidebarPinned', String(next));
      } catch {
        // no-op
      }
      return next;
    });
  }, []);

  const activateSection = useCallback((sectionId: string) => {
    setSelectedSection(sectionId);
    markVisited(sectionId);
  }, [markVisited]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 3: HEADER DERIVED STATE LAYER — Robust Data Wiring
  // ═══════════════════════════════════════════════════════════════════════════════
  // This layer powers all header context, status, and navigation logic from:
  // - SIDEBAR_SECTIONS (canonical source of truth for sections)
  // - selectedSection (current active section ID, may be invalid)
  // - visitedSectionIds (Set of visited section IDs, localStorage-backed)
  // - isPinned (navigation mode)
  // 
  // Key guarantees:
  // - All derived values are deterministic and stable
  // - Safe fallbacks for invalid/missing data
  // - No layout shift on data changes
  // - Proper dependency tracking in useMemo/useCallback
  // ═══════════════════════════════════════════════════════════════════════════════

  // (1) Canonical sections list and length
  const sections = useMemo(() => SIDEBAR_SECTIONS, []);
  const sectionsCount = sections.length;

  // (2) Active index resolution with edge case handling
  const activeIndex = useMemo(() => {
    const idx = sections.findIndex(s => s.id === selectedSection);
    return idx >= 0 ? idx : 0; // default to first section if invalid
  }, [sections, selectedSection]);

  // (3) Active section object with null-safety guard
  const activeSection = useMemo(() => {
    if (sections.length === 0) return null;
    const section = sections[activeIndex];
    return section || sections[0] || null;
  }, [sections, activeIndex]);

  // (4) Section number normalization (SECTION N)
  const sectionNumber = useMemo(() => {
    if (!activeSection) return 1;
    
    // Try to extract number from subtitle (e.g., "Section 1" -> 1)
    if (activeSection.subtitle) {
      const match = activeSection.subtitle.match(/\d+/);
      if (match) return parseInt(match[0], 10);
    }
    
    // Fall back to index + 1
    return activeIndex + 1;
  }, [activeSection, activeIndex]);

  const sectionBadgeText = useMemo(() => {
    if (!activeSection || activeIndex < 0) return 'DOCUMENTATION';
    return `SECTION ${sectionNumber}`;
  }, [activeSection, activeIndex, sectionNumber]);

  // (5) Breadcrumb string construction
  const breadcrumbText = useMemo(() => {
    if (!activeSection) return 'Documentation';
    
    const group = activeSection.group ? activeSection.group.trim() : '';
    const title = activeSection.title ? activeSection.title.trim() : '';
    
    if (group && title) return `${group} → ${title}`;
    if (title) return title;
    if (group) return group;
    return 'Documentation';
  }, [activeSection]);

  // (6) Safe descriptor string - full text
  const descriptorText = useMemo(() => {
    if (!activeSection?.description) return '';
    return activeSection.description.trim();
  }, [activeSection]);

  // (7) Progress metrics with bounds clamping
  const progressMetrics = useMemo(() => {
    const visited = visitedSectionIds?.size ?? 0;
    const total = sectionsCount;
    
    if (total === 0 || !visitedSectionIds) {
      return { visited: 0, total: 0, percent: 0 };
    }
    
    const pct = Math.round((visited / total) * 100);
    const clampedPct = Math.max(0, Math.min(100, pct)); // clamp 0–100
    
    return { visited, total, percent: clampedPct };
  }, [visitedSectionIds, sectionsCount]);

  // (8) Previous/Next section ID resolution
  const prevSectionId = useMemo(() => {
    return activeIndex > 0 ? sections[activeIndex - 1]?.id ?? null : null;
  }, [sections, activeIndex]);

  const nextSectionId = useMemo(() => {
    return activeIndex >= 0 && activeIndex < sectionsCount - 1 ? sections[activeIndex + 1]?.id ?? null : null;
  }, [sections, activeIndex, sectionsCount]);

  // (9) Navigation button callbacks (stable)
  const handlePrevSection = useCallback(() => {
    if (prevSectionId) {
      activateSection(prevSectionId);
    }
  }, [prevSectionId, activateSection]);

  const handleNextSection = useCallback(() => {
    if (nextSectionId) {
      activateSection(nextSectionId);
    }
  }, [nextSectionId, activateSection]);

  // (10) Pin mode label
  const pinModeLabel = useMemo(() => isPinned ? 'Pinned' : 'Hover', [isPinned]);

  // (11) Search focus handler (stable)
  const handleFocusSearch = useCallback(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const findKatexStylesheetHref = useCallback((): string | null => {
    // Prefer linking the existing KaTeX stylesheet so @font-face URLs resolve correctly.
    for (const sheet of Array.from(document.styleSheets)) {
      const href = (sheet as CSSStyleSheet).href;
      if (href && href.toLowerCase().includes('katex')) {
        return href;
      }
    }
    return null;
  }, []);

  const extractKatexCssText = useCallback((): string => {
    // In Vite, KaTeX CSS is often injected as <style> (no href). Prefer copying those full blocks
    // so @font-face rules come along too.
    const chunks: string[] = [];

    const styleTags = Array.from(document.querySelectorAll('style'));
    for (const tag of styleTags) {
      const text = tag.textContent || '';
      if (!text) continue;
      if (text.includes('.katex') || text.includes('KaTeX') || text.includes('KaTeX_')) {
        chunks.push(text);
      }
    }

    // Best-effort: also pull KaTeX-related rules from CSSOM (may fail for cross-origin sheets).
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const cssSheet = sheet as CSSStyleSheet;
        const href = cssSheet.href || '';
        const looksKatex = href.toLowerCase().includes('katex');
        const rules = cssSheet.cssRules;
        for (const rule of Array.from(rules)) {
          const text = rule.cssText || '';
          if (!text) continue;
          if (looksKatex || text.includes('.katex') || text.includes('KaTeX') || text.includes('KaTeX_')) {
            chunks.push(text);
          }
        }
      } catch {
        // SecurityError for cross-origin stylesheets; ignore.
      }
    }

    return chunks.join('\n');
  }, []);

  const buildReportCss = useCallback((): string => {
    return `
      @page { size: A4; margin: 14mm 12mm; }
      html, body { background:#fff; color:#000; font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.45; }
      body { margin: 0; }
      .report { padding: 0; }
      .report, .report-header, #report-content { break-before: auto !important; page-break-before: auto !important; }
      .report-header { margin: 0 0 14pt; padding: 0 0 10pt; border-bottom: 1px solid #000; }
      .report-header h1 { font-size: 18pt; margin: 0 0 6pt; }
      .report-meta { font-size: 9.5pt; color: #333; }
      .report-meta div { margin: 2pt 0; }
      .report-chart-placeholder { font-size: 10pt; color: #333; border: 1px solid #999; padding: 6pt; }
      /* Compact figure grids (e.g., Core Variables charts) */
      .report-fig-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8pt; margin: 8pt 0 10pt; }
      .report-fig { break-inside: avoid; page-break-inside: avoid; }
      .report-fig img { width: 100%; height: auto; display: block; }
      @media print { .report-fig-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      h1, h2, h3, h4 { color:#000; }
      h2 { font-size: 14pt; margin: 14pt 0 8pt; }
      h3 { font-size: 12pt; margin: 12pt 0 6pt; }
      h4 { font-size: 11pt; margin: 10pt 0 6pt; }
      p { margin: 0 0 10pt; }
      ul, ol { margin: 0 0 10pt; padding-left: 18pt; }
      li { margin: 0 0 4pt; }
      blockquote { margin: 10pt 0; padding: 6pt 10pt; border-left: 3px solid #333; background: #f6f6f6; }
      .report-block, section { margin: 0 0 10pt; }
      /* Avoid forcing giant first blocks onto the next page (can create a blank page 1) */
      .report-block { break-inside: auto; page-break-inside: auto; }
      figure, table, pre, blockquote, .katex-display { break-inside: avoid; page-break-inside: avoid; }
      img, svg { max-width: 100%; height: auto; }
      figure { margin: 10pt 0; }
      figcaption { font-size: 9.5pt; color:#333; margin-top: 4pt; }
      table { width:100%; border-collapse: collapse; margin: 10pt 0; }
      th, td { border: 1px solid #999; padding: 4pt 6pt; vertical-align: top; }
      pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
      pre { background: #f5f5f5; padding: 8pt; overflow: auto; white-space: pre-wrap; word-break: break-word; }
      a { color: #000; text-decoration: underline; }
      .katex { color:#000 !important; }
      .katex-display { margin: 8pt 0; break-inside: avoid; }
      /* Prevent long equations from clipping */
      .katex-display > .katex { overflow-x: auto; overflow-y: hidden; }
      * { box-shadow:none !important; text-shadow:none !important; filter:none !important; -webkit-backdrop-filter:none !important; backdrop-filter:none !important; }
      /* Strip common UI shells */
      .section-template, .card, .panel, .glass, .viz-card, .validation-chart-card, .coefficients-visualization-card {
        background: transparent !important;
        border: none !important;
        border-radius: 0 !important;
        padding: 0 !important;
        margin: 0 0 10pt !important;
      }
      /* Ensure SVG text becomes readable (for inline SVG; images are preprocessed) */
      svg text { fill: #000 !important; }
    `;
  }, []);

  const serializeSvgToDataUrl = useCallback((svg: SVGElement): string => {
    // Clone + make print-friendly: white background and black text.
    const clone = svg.cloneNode(true) as SVGElement;

    // Ensure namespaces for serialization.
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

    // Add a white background rect behind everything (paper-like).
    const viewBox = clone.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map((p) => Number(p));
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const [minX, minY, w, h] = parts;
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', String(minX));
        bg.setAttribute('y', String(minY));
        bg.setAttribute('width', String(w));
        bg.setAttribute('height', String(h));
        bg.setAttribute('fill', '#ffffff');
        clone.insertBefore(bg, clone.firstChild);
      }
    } else {
      // Best-effort fallback if the SVG doesn't define a viewBox.
      const w = clone.getAttribute('width');
      const h = clone.getAttribute('height');
      if (w && h) {
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', '0');
        bg.setAttribute('y', '0');
        bg.setAttribute('width', w);
        bg.setAttribute('height', h);
        bg.setAttribute('fill', '#ffffff');
        clone.insertBefore(bg, clone.firstChild);
      }
    }

    // Inject style to force text to black for readability.
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = 'text{fill:#000 !important;}';
    clone.insertBefore(style, clone.firstChild);

    // Normalize common UI plot backgrounds/axes so exported SVGs are paper-friendly.
    // This is intentionally conservative: it only targets obvious full-size plot background rects
    // and a couple of known tokenized attribute patterns.
    const resolveToken = (raw: string | null | undefined): string | null => {
      const v = String(raw ?? '').trim();
      if (!v) return null;
      if (v.startsWith('var(')) {
        if (v.includes('--corevars-plot-bg')) return '#ffffff';
        if (v.includes('--corevars-plot-axis')) return 'rgba(0,0,0,0.18)';
        if (v.includes('--corevars-plot-label')) return '#000000';
      }
      return null;
    };

    // If the SVG declares a viewBox, treat any matching full-frame rect as the plot background.
    const vb = clone.getAttribute('viewBox');
    let vbX = 0;
    let vbY = 0;
    let vbW = NaN;
    let vbH = NaN;
    if (vb) {
      const parts = vb.split(/\s+/).map((p) => Number(p));
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        [vbX, vbY, vbW, vbH] = parts as [number, number, number, number];
      }
    }

    const rects = Array.from(clone.querySelectorAll('rect'));
    for (const r of rects) {
      const fill = r.getAttribute('fill');
      const resolvedFill = resolveToken(fill);
      if (resolvedFill) r.setAttribute('fill', resolvedFill);

      // Rewrite dark translucent plot backgrounds to white with a subtle border.
      const x = Number(r.getAttribute('x') ?? 'NaN');
      const y = Number(r.getAttribute('y') ?? 'NaN');
      const w = Number(r.getAttribute('width') ?? 'NaN');
      const h = Number(r.getAttribute('height') ?? 'NaN');
      const isFullFrame = Number.isFinite(vbW) && Number.isFinite(vbH) && x === vbX && y === vbY && w === vbW && h === vbH;
      if (!isFullFrame) continue;

      const f = String(fill ?? '').toLowerCase();
      if (f.includes('rgba(0,0,0') || f.includes('rgba(0, 0, 0') || f.includes('var(--corevars-plot-bg)')) {
        r.setAttribute('fill', '#ffffff');
        r.setAttribute('stroke', 'rgba(0,0,0,0.12)');
        r.setAttribute('stroke-width', '1');
      }
    }

    const lines = Array.from(clone.querySelectorAll('line, path, polyline, polygon'));
    for (const el of lines) {
      const stroke = el.getAttribute('stroke');
      const resolvedStroke = resolveToken(stroke);
      if (resolvedStroke) el.setAttribute('stroke', resolvedStroke);

      const s = String(stroke ?? '').toLowerCase();
      if (s.includes('rgba(244,208,63') || s.includes('rgba(244, 208, 63')) {
        // Light gold gridlines become neutral gray in print.
        el.setAttribute('stroke', 'rgba(0,0,0,0.18)');
      }
    }

    const xml = new XMLSerializer().serializeToString(clone);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  }, []);

  const buildReportContentClone = useCallback((root: HTMLElement): HTMLElement => {
    const clone = root.cloneNode(true) as HTMLElement;

    // If a section template shell exists, prefer its inner content for a clean report flow.
    // (Do this before we strip classes.)
    const sectionTemplate = clone.querySelector<HTMLElement>('.section-template');
    const sectionContent = sectionTemplate?.querySelector<HTMLElement>('.section-content') ?? null;
    if (sectionContent) {
      clone.innerHTML = sectionContent.innerHTML;
    }

    // Promote common UI heading elements into semantic headings.
    const promoteToHeading = (selector: string, tag: 'h2' | 'h3' | 'h4') => {
      Array.from(clone.querySelectorAll<HTMLElement>(selector)).forEach((el) => {
        const txt = (el.textContent || '').trim();
        if (!txt) return;
        const h = document.createElement(tag);
        h.textContent = txt;
        el.replaceWith(h);
      });
    };

    promoteToHeading('.section-title', 'h2');
    promoteToHeading('.abstract-title', 'h2');
    promoteToHeading('.viz-title', 'h3');
    promoteToHeading('.subsection-title', 'h3');
    promoteToHeading('.card-title', 'h3');

    // Convert subtitle-ish blocks into paragraphs.
    Array.from(clone.querySelectorAll<HTMLElement>('.viz-subtitle, .section-subtitle')).forEach((el) => {
      const txt = (el.textContent || '').trim();
      if (!txt) {
        el.remove();
        return;
      }
      const p = document.createElement('p');
      p.textContent = txt;
      el.replaceWith(p);
    });

    // Convert note blocks into blockquotes for report feel.
    Array.from(clone.querySelectorAll<HTMLElement>('.methodology-note, .note, .callout')).forEach((el) => {
      const txt = (el.textContent || '').trim();
      if (!txt) return;
      const bq = document.createElement('blockquote');
      bq.textContent = txt;
      el.replaceWith(bq);
    });

    // Remove obviously interactive / non-report elements.
    clone.querySelectorAll(
      'button, input, select, textarea, option, [role="button"], [role="switch"], [role="tab"], [data-interactive]'
    ).forEach((el) => el.remove());

    // Preserve a compact grid layout for common chart blocks before we strip UI classes.
    // (Core Variables uses .corevars-charts / .corevars-pairs-grid.)
    Array.from(clone.querySelectorAll<HTMLElement>('.corevars-charts, .corevars-pairs-grid')).forEach((grid) => {
      grid.classList.add('report-fig-grid');
      Array.from(grid.children).forEach((child) => {
        if (child instanceof HTMLElement) child.classList.add('report-fig');
      });
    });

    // Convert SVG charts into <img> to avoid depending on app CSS.
    const origSvgs = Array.from(root.querySelectorAll('svg'));
    const cloneSvgs = Array.from(clone.querySelectorAll('svg'));
    for (let i = 0; i < Math.min(origSvgs.length, cloneSvgs.length); i++) {
      const src = serializeSvgToDataUrl(origSvgs[i] as unknown as SVGElement);
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'Chart';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      cloneSvgs[i]?.replaceWith(img);
    }

    // Convert canvas charts into <img> (best effort).
    const origCanvases = Array.from(root.querySelectorAll('canvas'));
    const cloneCanvases = Array.from(clone.querySelectorAll('canvas'));
    for (let i = 0; i < Math.min(origCanvases.length, cloneCanvases.length); i++) {
      const c = origCanvases[i] as HTMLCanvasElement;
      const placeholder = document.createElement('div');
      placeholder.textContent = 'Chart could not be rendered for export.';
      placeholder.className = 'report-chart-placeholder';

      try {
        const url = c.toDataURL('image/png');
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Chart';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        cloneCanvases[i]?.replaceWith(img);
      } catch {
        cloneCanvases[i]?.replaceWith(placeholder);
      }
    }

    // Strip presentational classes/styles outside KaTeX to make layout design-independent.
    clone.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const isKatex = el.classList.contains('katex') || el.classList.contains('katex-display') || Boolean(el.closest('.katex')) || Boolean(el.closest('.katex-display'));
      if (isKatex) return;

      const keepReportClass = Array.from(el.classList).some((c) => c.startsWith('report-'));
      el.removeAttribute('style');
      // Keep semantic tags as-is; class names are UI-specific.
      if (!keepReportClass && el.className) el.className = '';
    });

    // Wrap direct children in report blocks for consistent spacing.
    const wrapper = document.createElement('div');
    const children = Array.from(clone.children);
    for (const child of children) {
      const block = document.createElement('section');
      block.className = 'report-block';
      block.appendChild(child);
      wrapper.appendChild(block);
    }

    return wrapper;
  }, [serializeSvgToDataUrl]);

  const capturePlotlyImages = useCallback(async (root: HTMLElement): Promise<string[]> => {
    const plotRoots = Array.from(root.querySelectorAll<HTMLElement>('.js-plotly-plot'));
    if (!plotRoots.length) return [];

    const plotly = (window as unknown as { Plotly?: { toImage?: (gd: unknown, opts?: unknown) => Promise<string> } }).Plotly;
    if (!plotly?.toImage) return [];

    const results: string[] = [];
    for (const gd of plotRoots) {
      try {
        // scale=2 yields much cleaner PDFs while keeping file size reasonable.
        const url = await plotly.toImage(gd, { format: 'png', scale: 2 });
        if (typeof url === 'string' && url.startsWith('data:image/')) {
          results.push(url);
        } else {
          results.push('');
        }
      } catch {
        results.push('');
      }
    }
    return results;
  }, []);

  // (12) PDF Export handler for selected section (design-independent report)
  const handleExportPDF = useCallback(() => {
    const root = selectedSectionRootRef.current;
    if (!root) return;

    void (async () => {
      try {
        setExportPhase('preparing');
        const nonce = (exportNonceRef.current += 1);

        const sectionMeta = SIDEBAR_SECTIONS.find((s) => s.id === selectedSection);
        const sectionTitle = sectionMeta?.title ?? 'Selected section';
        const sectionLabel = sectionBadgeText;
        const exportedAt = new Date();

        const buildMode = (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE ?? 'unknown';

        const katexHref = findKatexStylesheetHref();
        const katexCssText = extractKatexCssText();
        const reportCss = buildReportCss();

        // Best-effort: capture Plotly figures (including WebGL) to PNG before cloning.
        const plotlyImages = await capturePlotlyImages(root);

        const contentClone = buildReportContentClone(root);
        // Replace Plotly containers with captured images (keep it simple: match by order).
        if (plotlyImages.length) {
          const plotlyDivs = Array.from(contentClone.querySelectorAll<HTMLElement>('.js-plotly-plot'));
          for (let i = 0; i < Math.min(plotlyDivs.length, plotlyImages.length); i++) {
            const url = plotlyImages[i];
            if (!url) continue;
            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Plotly figure';
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            plotlyDivs[i]?.replaceWith(img);
          }
        }

        const contentHtml = contentClone.innerHTML;

        const katexCdnHref = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css';

        const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <base href="${escapeHtml(document.baseURI)}" />
          <title>${escapeHtml(`${sectionLabel} — ${sectionTitle}`)}</title>
          <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
          ${katexHref ? `<link id="katex-css" rel="stylesheet" href="${katexHref}" />` : `<link id="katex-css" rel="stylesheet" href="${katexCdnHref}" crossorigin />`}
          <style>${reportCss}\n${katexCssText}</style>
        </head>
        <body>
          <article class="report">
            <header class="report-header">
              <h1>Documentation Export</h1>
              <div class="report-meta">
                <div><strong>Section:</strong> ${escapeHtml(`${sectionLabel} — ${sectionTitle}`)}</div>
                <div><strong>Exported:</strong> ${escapeHtml(exportedAt.toLocaleString())}</div>
                <div><strong>Build:</strong> ${escapeHtml(buildMode)}</div>
                <div><em>Note:</em> Some interactive/WebGL figures may be rasterized for PDF export.</div>
              </div>
            </header>
            <div id="report-content">${contentHtml}</div>
          </article>
          <script>
            (function(){
              var nonce = ${nonce};
              function notify(phase){
                try {
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'DOC_EXPORT_STATUS', phase: phase, nonce: nonce }, '*');
                  }
                } catch(e) {}
              }
              function waitKatexCss(){
                var link = document.getElementById('katex-css');
                if (!link || link.tagName !== 'LINK') return Promise.resolve();
                // If already loaded, move on.
                try {
                  if (link.sheet) return Promise.resolve();
                } catch(e) {}
                return new Promise(function(res){
                  link.addEventListener('load', function(){res();}, { once: true });
                  link.addEventListener('error', function(){res();}, { once: true });
                  // Safety timeout
                  setTimeout(res, 1500);
                });
              }
              function waitImages(){
                var imgs = Array.prototype.slice.call(document.images || []);
                return Promise.all(imgs.map(function(img){
                  if (!img) return Promise.resolve();
                  if (img.complete) {
                    if (img.decode) { try { return img.decode().catch(function(){}) } catch(e) {} }
                    return Promise.resolve();
                  }
                  return new Promise(function(res){
                    img.addEventListener('load', function(){
                      if (img.decode) { try { img.decode().catch(function(){}) } catch(e) {} }
                      res();
                    }, { once: true });
                    img.addEventListener('error', function(){res();}, { once: true });
                  });
                }));
              }
              function waitFonts(){
                try { return document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(); }
                catch(e){ return Promise.resolve(); }
              }
              function nextFrames(n){
                return new Promise(function(res){
                  function step(){
                    if (n <= 0) return res();
                    n -= 1;
                    requestAnimationFrame(step);
                  }
                  requestAnimationFrame(step);
                });
              }
              function doPrint(){
                notify('ready');
                try { window.print(); } catch(e) {}
                notify('printed');
              }
              try {
                window.addEventListener('afterprint', function(){ notify('afterprint'); }, { once: true });
              } catch(e) {}
              Promise.all([waitKatexCss(), waitImages(), waitFonts()]).then(function(){
                return nextFrames(2);
              }).then(function(){
                // Small delay helps Chromium avoid blank first page in some cases.
                setTimeout(doPrint, 80);
              });
            })();
          </script>
        </body>
      </html>`;

      lastReportHtmlRef.current = html;

      // Hidden iframe printing (no visible popup/tab)
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win) {
        iframe.remove();
        return;
      }

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        try { iframe.remove(); } catch { /* no-op */ }
        if (exportNonceRef.current === nonce) setExportPhase('idle');
      };

      win.addEventListener('afterprint', cleanup, { once: true });
      window.setTimeout(cleanup, 12000);

      // If the print dialog never opens (common when iframe printing is blocked), surface a user-consented fallback.
      window.setTimeout(() => {
        if (exportNonceRef.current !== nonce) return;
        if (exportPhaseRef.current === 'preparing') setExportPhase('blocked');
      }, 7000);

      doc.open();
      doc.write(html);
      doc.close();
      // Printing is triggered by the in-document script once assets load.
      } catch (err) {
        setExportPhase('error');
        // If anything goes wrong, fail silently (avoid opening any popup).
        // (Errors can be inspected in the console.)
        console.error('PDF export failed:', err);
      }
    })();
  }, [buildReportContentClone, buildReportCss, capturePlotlyImages, escapeHtml, extractKatexCssText, findKatexStylesheetHref, sectionBadgeText, selectedSection]);

  // Search upgrade injection points
  // PART 1 — Normalization utilities (no dependencies)
  const normalizeText = useCallback((input: string): string => {
    try {
      // If diacritics stripping is supported, prefer it. Fallback if not.
      // return input.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
      return input.toLowerCase().trim().replace(/\s+/g, ' ');
    } catch {
      return input.toLowerCase().trim().replace(/\s+/g, ' ');
    }
  }, []);

  const tokenizeQuery = useCallback((q: string): string[] => {
    const nq = normalizeText(q);
    if (!nq) return [];
    return nq.split(' ').filter(Boolean);
  }, [normalizeText]);

  const queryTokens = useMemo(() => tokenizeQuery(searchQuery), [searchQuery, tokenizeQuery]);

  // PART 2 — Ranked matching (prefix > word-start > substring) with AND tokens
  const scoreTitle = useCallback((titleNorm: string, tokens: string[]): number | null => {
    if (tokens.length === 0) return 0;
    let total = 0;
    for (const t of tokens) {
      if (!t) continue;
      if (titleNorm.startsWith(t)) {
        total += 100;
        continue;
      }
      let wordStartHit = false;
      let earliestWordIdx = Infinity;
      const words = titleNorm.split(' ');
      let acc = 0;
      for (const w of words) {
        if (w.startsWith(t)) {
          wordStartHit = true;
          earliestWordIdx = Math.min(earliestWordIdx, acc);
          break;
        }
        acc += w.length + 1;
      }
      if (wordStartHit) {
        total += 70 - Math.min(earliestWordIdx, 50) * 0.05;
        continue;
      }
      const idx = titleNorm.indexOf(t);
      if (idx !== -1) {
        total += 40 - Math.min(idx, 50) * 0.05;
        continue;
      }
      return null; // token fails overall match
    }
    return total;
  }, []);

  const sectionScores = useMemo(() => {
    if (!ENABLE_SIDEBAR_SEARCH || queryTokens.length === 0) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const s of SIDEBAR_SECTIONS) {
      const score = scoreTitle(normalizeText(s.title), queryTokens);
      if (score !== null) m.set(s.id, score);
    }
    return m;
  }, [queryTokens, scoreTitle, normalizeText]);

  const visibleSections = useMemo(() => {
    if (!ENABLE_SIDEBAR_SEARCH || queryTokens.length === 0) return SIDEBAR_SECTIONS;
    return SIDEBAR_SECTIONS.filter((s) => sectionScores.has(s.id));
  }, [queryTokens, sectionScores]);

  const visibleGroupedSections = useMemo(() => {
    const grouped = new Map<SectionGroup, typeof visibleSections>();
    for (const section of visibleSections) {
      const arr = grouped.get(section.group);
      if (arr) {
        arr.push(section);
      } else {
        grouped.set(section.group, [section]);
      }
    }

    return SIDEBAR_GROUP_ORDER
      .map((group) => ({ group, items: grouped.get(group) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [visibleSections]);

  const flatItems = visibleSections;

  // Determine best-scoring first result (for Enter from search)
  const firstResultId = useMemo(() => {
    if (queryTokens.length === 0 || sectionScores.size === 0) return null;
    let bestId: string | null = null;
    let bestScore = -Infinity;
    for (const s of SIDEBAR_SECTIONS) {
      const sc = sectionScores.get(s.id);
      if (sc === undefined) continue;
      if (sc > bestScore) {
        bestScore = sc;
        bestId = s.id;
      }
    }
    return bestId;
  }, [queryTokens, sectionScores]);

  // PART 3 — Highlighting helpers
  type Range = { start: number; end: number };
  const getHighlightRanges = useCallback((title: string, tokens: string[]): Range[] => {
    if (!tokens || tokens.length === 0) return [];
    const lc = title.toLowerCase();
    const ranges: Range[] = [];
    for (const t of tokens) {
      if (!t) continue;
      let from = 0;
      while (true) {
        const idx = lc.indexOf(t, from);
        if (idx === -1) break;
        ranges.push({ start: idx, end: idx + t.length });
        from = idx + t.length;
      }
    }
    if (ranges.length === 0) return [];
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: Range[] = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (!last || r.start > last.end) {
        merged.push({ ...r });
      } else {
        last.end = Math.max(last.end, r.end);
      }
    }
    return merged;
  }, []);

  const renderHighlightedTitle = useCallback((title: string, tokens: string[]) => {
    if (!tokens || tokens.length === 0) return title;
    const ranges = getHighlightRanges(title, tokens);
    if (ranges.length === 0) return title;
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const r of ranges) {
      if (cursor < r.start) parts.push(title.slice(cursor, r.start));
      parts.push(<mark key={`${r.start}-${r.end}`} className="sb-hl">{title.slice(r.start, r.end)}</mark>);
      cursor = r.end;
    }
    if (cursor < title.length) parts.push(title.slice(cursor));
    return parts;
  }, [getHighlightRanges]);

  // PART 1 — Preview content model
  const SECTION_PREVIEWS: Record<string, { subtitle: string; blurb: string; tags?: string[] }> = useMemo(() => ({
    equation: {
      subtitle: 'Model Core',
      blurb: 'Foundational equation and terms; compact derivation overview.',
      tags: ['KaTeX', 'Formal']
    },
    variables: {
      subtitle: 'Model Core',
      blurb: 'Key variables with roles and constraints; quick reference.',
      tags: ['Reference']
    },
    amplifiers: {
      subtitle: 'Mechanisms',
      blurb: 'Model-implied amplification: variables associated with upward belief shifts under the fitted surface.',
      tags: ['Mechanism']
    },
    suppressors: {
      subtitle: 'Mechanisms',
      blurb: 'Factors that dampen or constrain growth patterns.',
      tags: ['Mechanism']
    },
    analysis: {
      subtitle: 'Evaluation',
      blurb: 'Model fit, descriptive metrics, and methods summary.',
      tags: ['Empirical']
    },
    dynamics: {
      subtitle: 'Analysis',
      blurb: 'System-level behaviors and feedback illustrations.',
      tags: ['Systems']
    }
  }), []);

  const getPreviewData = useCallback((id: string) => {
    const base = SIDEBAR_SECTIONS.find((s) => s.id === id);
    if (!base) return null;
    const idx = SIDEBAR_SECTIONS.findIndex((s) => s.id === id);
    const idxStr = `${idx + 1} / ${SIDEBAR_SECTIONS.length}`;
    const fromMap = SECTION_PREVIEWS[id];
    const fallback = {
      subtitle: base.group,
      blurb: 'Open to view details and figures.'
    };
    return {
      title: base.title,
      subtitle: (fromMap?.subtitle ?? fallback.subtitle),
      blurb: (fromMap?.blurb ?? fallback.blurb),
      tags: fromMap?.tags ?? [],
      indexLabel: idxStr,
      group: base.group,
      active: selectedSection === id
    };
  }, [SECTION_PREVIEWS, selectedSection]);

  // PART 3 — Positioning helpers
  const computePreviewPosition = useCallback((id: string) => {
    const anchor = itemRefs.current.get(id);
    const sidebarEl = sidebarRef.current;
    if (!anchor || !sidebarEl) return null;
    const itemRect = anchor.getBoundingClientRect();
    const sidebarRect = sidebarEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Try right side by default
    let left = sidebarRect.right + PREVIEW_OFFSET_PX;
    const top = Math.max(8, Math.min(itemRect.top - 8, vh - 160)); // approximate height clamp

    // Flip to left if not enough room on right
    const spaceRight = vw - sidebarRect.right;
    if (spaceRight < PREVIEW_WIDTH_PX + PREVIEW_OFFSET_PX + 8) {
      left = Math.max(8, sidebarRect.left - PREVIEW_WIDTH_PX - PREVIEW_OFFSET_PX);
    }

    return { top, left };
  }, []);

  const updatePreviewPosition = useCallback((id: string) => {
    const pos = computePreviewPosition(id);
    if (pos) setPreviewPos(pos);
  }, [computePreviewPosition]);

  // Recompute after render to accurately clamp by measured height
  useEffect(() => {
    if (!previewId || !previewRef.current) return;
    const el = previewRef.current;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const clampedTop = Math.max(8, Math.min((previewPos?.top ?? 0), vh - rect.height - 8));
    if (previewPos && Math.abs(clampedTop - previewPos.top) > 1) {
      setPreviewPos({ top: clampedTop, left: previewPos.left });
    }
  }, [previewId, previewPos]);

  useEffect(() => {
    const onResize = () => {
      if (previewId) updatePreviewPosition(previewId);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [previewId, updatePreviewPosition]);

  // Apply dynamic position to preview overlay via ref to avoid JSX inline styles
  useEffect(() => {
    if (!previewRef.current) return;
    if (!previewPos) return;
    try {
      previewRef.current.style.top = `${previewPos.top}px`;
      previewRef.current.style.left = `${previewPos.left}px`;
    } catch {
      // no-op
    }
  }, [previewPos, previewId]);

  // Disable preview in collapsed mode
  useEffect(() => {
    if (!sidebarExpanded && previewId) setPreviewId(null);
  }, [sidebarExpanded, previewId]);

  // Follow keyboard focus (priority over hover)
  useEffect(() => {
    if (!sidebarExpanded) return;
    if (!focusedId) return;
    if (previewId === focusedId) return;
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    openTimerRef.current = window.setTimeout(() => {
      setPreviewId(focusedId);
      updatePreviewPosition(focusedId);
    }, PREVIEW_OPEN_DELAY_MS);
  }, [focusedId, sidebarExpanded, previewId, updatePreviewPosition]);

  const clearTypeahead = useCallback(() => {
    setTypeahead('');
    if (typeaheadTimerRef.current !== null) {
      window.clearTimeout(typeaheadTimerRef.current);
      typeaheadTimerRef.current = null;
    }
  }, []);

  const scheduleTypeaheadClear = useCallback(() => {
    if (typeaheadTimerRef.current !== null) {
      window.clearTimeout(typeaheadTimerRef.current);
    }
    typeaheadTimerRef.current = window.setTimeout(() => {
      setTypeahead('');
      typeaheadTimerRef.current = null;
    }, TYPEAHEAD_TIMEOUT_MS);
  }, []);

  const setFocusedIdFromKeyboard = useCallback((nextId: string) => {
    lastMoveWasKeyboardRef.current = true;
    setFocusedId(nextId);
  }, []);

  const moveFocusByDelta = useCallback((delta: number) => {
    if (flatItems.length === 0) return;

    const currentIndex = Math.max(0, flatItems.findIndex((s) => s.id === focusedId));
    const nextIndex = Math.min(flatItems.length - 1, Math.max(0, currentIndex + delta));
    setFocusedIdFromKeyboard(flatItems[nextIndex].id);
  }, [flatItems, focusedId, setFocusedIdFromKeyboard]);

  const moveFocusToEdge = useCallback((edge: 'first' | 'last') => {
    if (flatItems.length === 0) return;
    setFocusedIdFromKeyboard(edge === 'first' ? flatItems[0].id : flatItems[flatItems.length - 1].id);
  }, [flatItems, setFocusedIdFromKeyboard]);

  const jumpByTypeahead = useCallback((nextBuffer: string) => {
    if (flatItems.length === 0) return;
    if (nextBuffer.trim().length === 0) return;

    const query = nextBuffer.toLowerCase();
    const startIndex = Math.max(0, flatItems.findIndex((s) => s.id === focusedId));
    const ordered = [...flatItems.slice(startIndex + 1), ...flatItems.slice(0, startIndex + 1)];
    const match = ordered.find((section) => section.title.toLowerCase().startsWith(query));
    if (match) {
      setFocusedIdFromKeyboard(match.id);
    }
  }, [flatItems, focusedId, setFocusedIdFromKeyboard]);

  const handleNavKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (!ENABLE_ROVING_TABINDEX) return;

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.defaultPrevented) return;

    if (flatItems.length === 0) {
      if (event.key === 'Escape') {
        clearTypeahead();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      clearTypeahead();
      moveFocusByDelta(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      clearTypeahead();
      moveFocusByDelta(-1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      clearTypeahead();
      moveFocusToEdge('first');
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      clearTypeahead();
      moveFocusToEdge('last');
      return;
    }

    if (event.key === 'PageDown') {
      event.preventDefault();
      clearTypeahead();
      moveFocusByDelta(PAGE_JUMP_COUNT);
      return;
    }

    if (event.key === 'PageUp') {
      event.preventDefault();
      clearTypeahead();
      moveFocusByDelta(-PAGE_JUMP_COUNT);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      clearTypeahead();
      const current = flatItems.find((s) => s.id === focusedId);
      if (current) {
        activateSection(current.id);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      clearTypeahead();
      return;
    }

    if (event.key === 'Backspace') {
      if (typeahead.length > 0) {
        event.preventDefault();
        const next = typeahead.slice(0, -1);
        setTypeahead(next);
        scheduleTypeaheadClear();
        jumpByTypeahead(next);
      }
      return;
    }

    const isPrintable = event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;
    if (!isPrintable) return;

    const ch = event.key.toLowerCase();
    if (!/^[a-z0-9]$/.test(ch)) return;

    event.preventDefault();
    const next = `${typeahead}${ch}`;
    setTypeahead(next);
    scheduleTypeaheadClear();
    jumpByTypeahead(next);
  }, [activateSection, clearTypeahead, jumpByTypeahead, moveFocusByDelta, moveFocusToEdge, scheduleTypeaheadClear, typeahead, flatItems, focusedId]);

  const handleNavFocusCapture = useCallback(() => {
    navHasFocusRef.current = true;
  }, []);

  const handleNavBlurCapture = useCallback((event: React.FocusEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      navHasFocusRef.current = false;
      lastMoveWasKeyboardRef.current = false;
      clearTypeahead();
    }
  }, [clearTypeahead]);

  useEffect(() => {
    return () => {
      if (typeaheadTimerRef.current !== null) {
        window.clearTimeout(typeaheadTimerRef.current);
        typeaheadTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!ENABLE_SIDEBAR_SEARCH) return;
    if (flatItems.length === 0) return;

    const stillVisible = flatItems.some((s) => s.id === focusedId);
    if (!stillVisible) {
      setFocusedId(flatItems[0].id);
    }
  }, [flatItems, focusedId]);

  // PART 4 — Keyboard shortcuts (sidebar-contextual + header navigation)
  const isFocusInsideSidebar = useCallback((): boolean => {
    const root = sidebarRef.current;
    const ae = document.activeElement;
    return !!root && !!ae && root.contains(ae);
  }, []);

  // Helper: Check if event target is a text input field
  const isTypingTarget = useCallback((target: EventTarget | null): boolean => {
    if (!target) return false;
    const elem = target as HTMLElement;
    const tagName = elem.tagName?.toUpperCase();
    const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
    const isContentEditable = elem.contentEditable === 'true';
    return isInput || isContentEditable;
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inside = isFocusInsideSidebar();
      const canHandle = inside || (sidebarExpanded && isHovered);
      const isUserTyping = isTypingTarget(e.target);

      // ═══════════════════════════════════════════════════════════════════
      // HEADER NAVIGATION SHORTCUTS (PHASE 6)
      // These work globally but skip if user is typing in an input
      // ═══════════════════════════════════════════════════════════════════

      // Alt + ArrowLeft: Previous section
      if (!isUserTyping && e.altKey && e.key === 'ArrowLeft') {
        if (prevSectionId !== null) {
          e.preventDefault();
          handlePrevSection();
          return;
        }
      }

      // Alt + ArrowRight: Next section
      if (!isUserTyping && e.altKey && e.key === 'ArrowRight') {
        if (nextSectionId !== null) {
          e.preventDefault();
          handleNextSection();
          return;
        }
      }

      // Ctrl+K (Windows/Linux) or Cmd+K (macOS): Focus search
      if (!isUserTyping && ENABLE_SIDEBAR_SEARCH && ((e.ctrlKey && e.key === 'k') || (e.metaKey && e.key === 'k'))) {
        e.preventDefault();
        handleFocusSearch();
        return;
      }

      // Ctrl+P (Windows/Linux) or Cmd+P (macOS): Export PDF
      if (!isUserTyping && ((e.ctrlKey && e.key === 'p') || (e.metaKey && e.key === 'p'))) {
        e.preventDefault();
        handleExportPDF();
        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // SIDEBAR-CONTEXTUAL SHORTCUTS
      // ═══════════════════════════════════════════════════════════════════

      // Ctrl/Cmd + F focuses search (when expanded); do not hijack globally
      const isFind = (e.ctrlKey && e.key === 'f') || (e.metaKey && e.key.toLowerCase() === 'f');
      if (isFind && canHandle) {
        if (sidebarExpanded && searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
        }
        return;
      }

      // Escape clears search if inside sidebar
      if (inside && e.key === 'Escape') {
        if (searchQuery.length > 0) {
          e.preventDefault();
          setSearchQuery('');
          if (searchInputRef.current) searchInputRef.current.focus();
          return;
        }
        if (searchInputRef.current && document.activeElement === searchInputRef.current) {
          e.preventDefault();
          const current = itemRefs.current.get(focusedId) || (flatItems[0] ? itemRefs.current.get(flatItems[0].id) : undefined);
          current?.focus();
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFocusInsideSidebar, sidebarExpanded, isHovered, searchQuery, focusedId, flatItems, isTypingTarget, prevSectionId, nextSectionId, handlePrevSection, handleNextSection, handleFocusSearch, handleExportPDF]);

  useEffect(() => {
    const activeElement = document.activeElement;
    const navHasFocus = navRef.current ? navRef.current.contains(activeElement) : false;
    const searchHasFocus = searchInputRef.current ? searchInputRef.current === activeElement : false;
    if (navHasFocus || searchHasFocus) return;

    if (focusedId !== selectedSection) {
      setFocusedId(selectedSection);
    }
  }, [focusedId, selectedSection]);

  useEffect(() => {
    if (!navHasFocusRef.current) return;
    if (!lastMoveWasKeyboardRef.current) return;
    if (!navRef.current) return;
    if (searchInputRef.current && document.activeElement === searchInputRef.current) return;

    const el = itemRefs.current.get(focusedId);
    if (!el) return;
    // Prevent page scroll; manually adjust sidebar-nav scroll to nearest visibility
    try {
      el.focus({ preventScroll: true } as FocusOptions);
    } catch {
      el.focus();
    }
    const container = navRef.current;
    if (container) {
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const topOverlap = eRect.top < cRect.top;
      const bottomOverlap = eRect.bottom > cRect.bottom;
      if (topOverlap) {
        const delta = cRect.top - eRect.top + 16; // 16px padding buffer
        container.scrollTop = Math.max(0, container.scrollTop - delta);
      } else if (bottomOverlap) {
        const delta = eRect.bottom - cRect.bottom + 16;
        container.scrollTop = container.scrollTop + delta;
      }
    }
    lastMoveWasKeyboardRef.current = false;
  }, [focusedId]);

  const values = useMemo(() => {
    const fullParams = {
      ...parameters,
      alpha,
      beta,
      k,
    };
    const result = calculateModel(fullParams);
    const baseTerm = Math.pow(parameters.X, alpha) * Math.pow(parameters.Y, beta);
    const phi = result.phi;
    const expTerm = Math.exp(phi);
    const numerator = baseTerm * expTerm;
    const Z = result.Z;
    return { baseTerm, phi, expTerm, numerator, Z };
  }, [parameters, alpha, beta, k]);

  // (12) Micro readout formatting for Z and Φ (Phase 5 instrument cluster)
  const zReadout = useMemo(() => {
    if (values?.Z !== undefined && Number.isFinite(values.Z)) {
      return values.Z.toFixed(3);
    }
    return null;
  }, [values?.Z]);

  const phiReadout = useMemo(() => {
    if (values?.phi !== undefined && Number.isFinite(values.phi)) {
      return values.phi.toFixed(3);
    }
    return null;
  }, [values?.phi]);

  const handleSectionPointerEnter = useCallback(() => {
    if (isPinned) return;
    setIsHovered(true);
  }, [isPinned]);

  const handleSectionPointerLeave = useCallback(() => {
    if (isPinned) return;
    setIsHovered(false);
  }, [isPinned]);

  const handleNavItemClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const id = (event.currentTarget as HTMLButtonElement).dataset.sectionId;
      if (id) activateSection(id);
    },
    [activateSection]
  );

  const handleNavItemFocus = useCallback((event: React.FocusEvent<HTMLButtonElement>) => {
    const id = (event.currentTarget as HTMLButtonElement).dataset.sectionId;
    if (id) setFocusedId(id);
  }, []);

  const handleNavItemMouseEnter = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const id = (event.currentTarget as HTMLButtonElement).dataset.sectionId;
    if (!id) return;
    if (!sidebarExpanded) return;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    openTimerRef.current = window.setTimeout(() => {
      setPreviewId(id);
      updatePreviewPosition(id);
    }, PREVIEW_OPEN_DELAY_MS);
  }, [sidebarExpanded, updatePreviewPosition]);

  const handleNavItemMouseLeave = useCallback(() => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setPreviewId(null);
    }, PREVIEW_CLOSE_DELAY_MS);
  }, []);

  const registerItemRef = useCallback((sectionId: string, el: HTMLButtonElement | null) => {
    if (el) {
      itemRefs.current.set(sectionId, el);
    } else {
      itemRefs.current.delete(sectionId);
    }
  }, []);

  const renderContent = () => {
    const getContent = () => {
      switch (selectedSection) {
        case 'equation':
          return <BeliefEquationSection />;
        case 'variables':
          return <CoreVariablesSection />;
        case 'amplifiers':
          return <AmplifiersSection />;
        case 'suppressors':
          return <SuppressorsSection />;
        case 'analysis':
          return <MathematicalAnalysisSection />;
        case 'dynamics':
          return <SystemDynamicsSection />;
        case 'notation':
          return <NotationGlossarySection />;
        default:
          return <MathematicalAnalysisSection />;
      }
    };

    if (prefersReducedMotion) {
      return (
        <div className="doc-content-frame">
          <div className="doc-selected-section-print-anchor" ref={selectedSectionRootRef}>
            {getContent()}
          </div>
        </div>
      );
    }

    return (
      <motion.div
        key={selectedSection}
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 1.02 }}
        transition={{
          duration: 0.4,
          ease: 'easeOut',
          opacity: { duration: 0.3 },
          y: { duration: 0.4 },
          scale: { duration: 0.4 }
        }}
        className="doc-content-frame"
      >
        <div className="doc-selected-section-print-anchor" ref={selectedSectionRootRef}>
          {getContent()}
        </div>
      </motion.div>
    );
  };

  // Extract ARIA values for progressbar (must be numbers, not expressions)
  const progressValueNow = progressMetrics.percent;
  const progressValueMin = 0;
  const progressValueMax = 100;

  return (
    <div className="interactive-documentation" role="region" aria-label="Interactive documentation">
      {/* ARIA live region for accessibility announcements */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
        {a11yAnnouncement}
      </div>
      {/* Academic Header */}
      <div className={["academic-header", isCondensed ? "is-condensed" : ""].filter(Boolean).join(" ")}>
        <div className="header-content">
          {/* Header Left Zone — Section Info (Badge + Breadcrumb + Descriptor) */}
          <div className="header-left" role="group" aria-label="Document identity">
            <div className="left-section-info">
              <span className="section-badge">{sectionBadgeText}</span>
              <span className="section-breadcrumb">{breadcrumbText}</span>
              {descriptorText && <span className="section-descriptor">{descriptorText}</span>}
            </div>
            <div className="meta-tags">
              <span className="meta-tag">Interactive Mathematical Documentation</span>
              <span className="meta-divider">•</span>
              <span className="meta-tag">DOCS • INTERACTIVE</span>
            </div>
          </div>
          
          {/* Header Center Zone — Main Title Only */}
          <div className="header-center">
            <h1 className="main-title">
              Bounded Nonlinear Response Surfaces for Macro-Urban Belief Emergence:
              <br />
              A Support-Aware Visual Analytics Framework
              <div className="title-underline" aria-hidden="true"></div>
            </h1>
          </div>
          
          {/* Header Right Zone — Status + Actions */}
          <div className="header-right" role="group" aria-label="Navigation status and controls">
            <div className="right-content-wrapper">
              {/* Status Section — Instrument Cluster */}
              <div className="status-container" role="group" aria-label="Navigation progress and mode">
                {/* Progress Row */}
                <div className="progress-info">
                  <span className="progress-label">Visited {progressMetrics.visited}/{progressMetrics.total}</span>
                  <span className="progress-percent">{progressMetrics.percent}%</span>
                </div>
                
                {/* Progress Bar — Semantic Progressbar */}
                <div 
                  className="progressbar" 
                  role="progressbar" 
                  aria-label="Documentation progress"
                  {...{
                    'aria-valuenow': progressValueNow,
                    'aria-valuemin': progressValueMin,
                    'aria-valuemax': progressValueMax
                  }}
                  aria-valuetext={`Visited ${progressMetrics.visited} of ${progressMetrics.total} sections (${progressMetrics.percent} percent)`}
                  data-percent={Math.round(progressMetrics.percent)}
                >
                  <div className="progressbar-fill"></div>
                </div>
                
                {/* Pin Mode Label */}
                <div className="pin-state-indicator">
                  {pinModeLabel.toUpperCase()}
                </div>
                
                {/* Micro Readouts (Optional Z/Φ Chips) — Phase 5 */}
                {(zReadout !== null || phiReadout !== null) && (
                  <div className="micro-readouts" role="group" aria-label="Computed model parameters">
                    {zReadout !== null && (
                      <span className="mini-chip" title={`Z parameter: ${zReadout}`}>Z: {zReadout}</span>
                    )}
                    {phiReadout !== null && (
                      <span className="mini-chip" title={`Φ parameter: ${phiReadout}`}>Φ: {phiReadout}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions Section */}
              <div className="nav-actions" role="group" aria-label="Section navigation controls">
                <button
                  type="button"
                  className="nav-button nav-button-prev"
                  onClick={handlePrevSection}
                  disabled={prevSectionId === null}
                  aria-label="Prev, previous section"
                  aria-keyshortcuts="Alt+ArrowLeft"
                  title={prevSectionId ? `Previous: ${sections.find(s => s.id === prevSectionId)?.title ?? 'Section'} (Alt+Left)` : 'No previous section'}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  className="nav-button nav-button-next"
                  onClick={handleNextSection}
                  disabled={nextSectionId === null}
                  aria-label="Next section"
                  aria-keyshortcuts="Alt+ArrowRight"
                  title={nextSectionId ? `Next: ${sections.find(s => s.id === nextSectionId)?.title ?? 'Section'} (Alt+Right)` : 'No next section'}
                >
                  Next →
                </button>
                {ENABLE_SIDEBAR_SEARCH && (
                  <button
                    type="button"
                    className="nav-button nav-button-search"
                    onClick={handleFocusSearch}
                    aria-label="Focus search input"
                    aria-keyshortcuts="Control+k Meta+k"
                    title="Focus search (Ctrl+K)"
                  >
                    SEARCH
                  </button>
                )}
                <button
                  type="button"
                  className="nav-button nav-button-export"
                  onClick={handleExportPDF}
                  aria-label="Export PDF, selected section"
                  aria-keyshortcuts="Control+p Meta+p"
                  title="Export this section as PDF (Ctrl+P)"
                >
                  Export PDF
                </button>
                {/* Close control aligned with navigation */}
                <button
                  type="button"
                  className="nav-button nav-button-close"
                  onClick={onClose}
                  aria-label="Close documentation"
                  title="Close"
                >
                  <span aria-hidden="true">X</span>
                </button>
              </div>

              {exportPhase !== 'idle' && (
                <div
                  className={`export-status export-status--${exportPhase}`}
                  role="status"
                  aria-live="polite"
                  aria-label="Export status"
                >
                  {exportPhase === 'preparing' && (
                    <span>Preparing export… print dialog should appear shortly.</span>
                  )}
                  {exportPhase === 'ready' && (
                    <span>Ready to print…</span>
                  )}
                  {exportPhase === 'blocked' && (
                    <>
                      <span>Print dialog didn’t open. Your browser may block iframe printing.</span>
                      <div className="export-status-actions">
                        <button
                          type="button"
                          className="export-fallback-button"
                          onClick={handleOpenPrintPreview}
                          aria-label="Open print preview in a new tab"
                          title="Open print preview (new tab)"
                        >
                          Open Print Preview
                        </button>
                        <button
                          type="button"
                          className="export-fallback-button secondary"
                          onClick={() => setExportPhase('idle')}
                          aria-label="Dismiss export message"
                          title="Dismiss"
                        >
                          Dismiss
                        </button>
                      </div>
                    </>
                  )}
                  {exportPhase === 'error' && (
                    <span>Export failed. Check the console for details.</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="header-divider" aria-hidden="true"></div>
      </div>

      <div className="documentation-container">
        {/* Left Sidebar Navigation */}
        <aside 
          className={`sidebar ${sidebarExpanded ? 'expanded' : ''}`}
          onMouseEnter={handleSectionPointerEnter}
          onMouseLeave={handleSectionPointerLeave}
          aria-label="Documentation navigation"
          ref={sidebarRef}
        >
          <div className="sidebar-layout">
            <header className="sidebar-header">
              <div className="sidebar-header-top">
                <div className="sidebar-title">
                  <span className="sidebar-title-icon" aria-hidden="true">🧭</span>
                  <span className="sidebar-title-text">DOCUMENTATION NAVIGATION</span>
                  {sidebarExpanded && (
                    <span className="global-progress" aria-label={`${globalProgress.visited} of ${globalProgress.total} sections visited`}>
                      {globalProgress.visited}/{globalProgress.total}
                    </span>
                  )}
                </div>
                {isPinned ? (
                  <button
                    type="button"
                    className="sidebar-pin is-pinned"
                    onClick={togglePinned}
                    aria-pressed="true"
                    aria-label="Unpin sidebar"
                    title="Unpin sidebar"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M12 17v5" />
                      <path d="M9 3h6l1 8 3 3v1H5v-1l3-3 1-8z" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="sidebar-pin"
                    onClick={togglePinned}
                    aria-pressed="false"
                    aria-label="Pin sidebar open"
                    title="Pin sidebar open"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M12 17v5" />
                      <path d="M9 3h6l1 8 3 3v1H5v-1l3-3 1-8z" />
                    </svg>
                  </button>
                )}
              </div>

              {ENABLE_SIDEBAR_SEARCH && sidebarExpanded ? (
                <div className="sidebar-search-row">
                  <label className="sr-only" htmlFor="doc-sidebar-search">Search documentation sections</label>
                  <input
                    ref={searchInputRef}
                    className="sidebar-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search sections"
                    aria-label="Search documentation sections"
                    id="doc-sidebar-search"
                    spellCheck={false}
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const first = flatItems[0]?.id;
                        if (first) {
                          setFocusedIdFromKeyboard(first);
                          itemRefs.current.get(first)?.focus();
                        }
                        return;
                      }
                      if (e.key === 'Enter') {
                        if (firstResultId) {
                          e.preventDefault();
                          activateSection(firstResultId);
                        }
                      }
                    }}
                  />
                </div>
              ) : null}
              <div className="symbolic-separator" aria-hidden="true"></div>
            </header>

            <nav
              ref={navRef}
              className="sidebar-nav"
              aria-label="Documentation sections"
              onKeyDown={handleNavKeyDown}
              onFocusCapture={handleNavFocusCapture}
              onBlurCapture={handleNavBlurCapture}
              onScroll={() => {
                if (!previewId) return;
                if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
                scrollRafRef.current = requestAnimationFrame(() => {
                  updatePreviewPosition(previewId);
                });
              }}
            >
              {flatItems.length === 0 ? (
                <div className="nav-empty" role="note">
                  <div>No matches</div>
                  <div className="nav-empty-hint">Try: Belief, Core, System</div>
                </div>
              ) : (
                <div className="nav-groups">
                  {visibleGroupedSections.map(({ group, items }) => {
                    const stats = groupStats[group];
                    return (
                      <div className="nav-group" key={group}>
                        <h3 className="nav-group-title">
                          <span className="group-name">{group}</span>
                          <span className="sr-only">{stats.visited} of {stats.total} visited</span>
                          {sidebarExpanded && (
                            <span className="group-progress" aria-hidden="true">
                              <span className="group-count">
                                {stats.visited}/{stats.total}
                              </span>
                              <span className="group-dots" aria-hidden="true">
                                {stats.sections.map((s) => {
                                  const isSecActive = selectedSection === s.id;
                                  const isSecVisited = visitedSectionIds.has(s.id);
                                  return (
                                    <i
                                      key={s.id}
                                      className={[
                                        'group-dot',
                                        isSecActive && 'is-active',
                                        isSecVisited && 'is-visited'
                                      ].filter(Boolean).join(' ')}
                                      title={s.title}
                                    />
                                  );
                                })}
                              </span>
                            </span>
                          )}
                        </h3>
                        <ul className="nav-group-items">
                          {items.map((section) => {
                            const isActive = selectedSection === section.id;
                            const isFocused = focusedId === section.id;
                            const isVisited = visitedSectionIds.has(section.id);
                            return (
                              <li key={section.id}>
                                <motion.button
                                  type="button"
                                  className={[
                                    'nav-item',
                                    isActive && 'is-active',
                                    isVisited && 'is-visited',
                                    section.isActive && 'is-highlighted'
                                  ].filter(Boolean).join(' ')}
                                  onClick={handleNavItemClick}
                                  aria-current={isActive ? 'page' : undefined}
                                  aria-label={`${section.title}${isActive ? ', current section' : isVisited ? ', visited' : ''}`}
                                  title={`${section.title} — ${section.subtitle}${isActive ? ' (current)' : isVisited ? ' (visited)' : ''}`}
                                  tabIndex={ENABLE_ROVING_TABINDEX ? (isFocused ? 0 : -1) : 0}
                                  onFocus={handleNavItemFocus}
                                  onMouseEnter={handleNavItemMouseEnter}
                                  onMouseLeave={handleNavItemMouseLeave}
                                  data-section-id={section.id}
                                  data-active={isActive ? '1' : '0'}
                                  data-visited={isVisited ? '1' : '0'}
                                  ref={(el) => registerItemRef(section.id, el)}
                                >
                                  <span className="nav-rail" aria-hidden="true" />
                                  <span className="nav-icon" aria-hidden="true">
                                    <Icon name={section.icon} size={22} />
                                  </span>
                                  <span className="nav-text">
                                    <span className="nav-title">{renderHighlightedTitle(section.title, queryTokens)}</span>
                                    <span className="nav-meta">{section.subtitle}</span>
                                  </span>
                                  <span className="nav-chev" aria-hidden="true">›</span>
                                </motion.button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </nav>

            <footer className="sidebar-footer">
              {/* Layer 1: Compact KPI Row (always visible) */}
              <div className="sb-footer-kpis">
                <div className="sb-kpi sb-kpi--z">
                  <div className="sb-kpi-label">Z</div>
                  <div className="sb-kpi-value">{formatZ(values.Z)}</div>
                </div>

                <div className="sb-kpi sb-kpi--section">
                  <div className="sb-kpi-label">Active</div>
                  <div className="sb-kpi-value sb-kpi-value--truncate">
                    {sidebarExpanded ? getActiveSectionLabel() : truncateActiveLabel(getActiveSectionLabel(), 8)}
                  </div>
                </div>

                {footerExpanded ? (
                  <button
                    type="button"
                    className="sb-footer-toggle"
                    onClick={toggleFooterDrawer}
                    aria-label="Collapse footer details"
                    aria-expanded="true"
                    aria-controls="doc-sidebar-footer-drawer"
                    disabled={!sidebarExpanded}
                    title="Toggle detailed metrics"
                  >
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="chev is-open"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="sb-footer-toggle"
                    onClick={toggleFooterDrawer}
                    aria-label="Expand footer details"
                    aria-expanded="false"
                    aria-controls="doc-sidebar-footer-drawer"
                    disabled={!sidebarExpanded}
                    title="Toggle detailed metrics"
                  >
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="chev"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                )}
              </div>

              {/* Layer 2: Expandable Detail Drawer */}
              <div
                className={`sb-footer-drawer ${footerExpanded && sidebarExpanded ? 'is-open' : ''}`}
                id="doc-sidebar-footer-drawer"
                role="region"
                aria-label="Belief details"
                tabIndex={-1}
              >
                <div className="sb-footer-row">
                  <span className="sb-footer-row-label">Z (raw)</span>
                  <span className="sb-footer-row-value">{formatZ(values.Z)}</span>
                </div>
                <div className="sb-footer-row">
                  <span className="sb-footer-row-label">φ (phi)</span>
                  <span className="sb-footer-row-value">{formatZ(values.phi)}</span>
                </div>
                <div className="sb-footer-row">
                  <span className="sb-footer-row-label">Group</span>
                  <span className="sb-footer-row-value">
                    {SIDEBAR_SECTIONS.find((s) => s.id === selectedSection)?.group || '—'}
                  </span>
                </div>
                
                {/* Integrated BeliefProgress meter (compact version) */}
                <div className="sb-footer-meter-container">
                  <BeliefProgress 
                    value={values.Z} 
                    showTooltip={true}
                    variant="sidebar"
                  />
                </div>
              </div>
            </footer>
          </div>
          {/* Preview overlay */}
          {sidebarExpanded && previewId && previewPos ? (
            <div
              ref={previewRef}
              className="sb-preview is-visible"
              aria-hidden="true"
            >
              {(() => {
                const d = getPreviewData(previewId);
                if (!d) return null;
                return (
                  <div className="sb-preview-inner">
                    <div className="sb-preview-title" title={d.title}>{d.title}</div>
                    <div className="sb-preview-subtitle">{d.subtitle}</div>
                    <div className="sb-preview-blurb">{d.blurb}</div>
                    <div className="sb-preview-meta">
                      <span className="sb-pill">{d.indexLabel}</span>
                      <span className="sb-pill">{d.group}</span>
                      {d.active ? <span className="sb-pill sb-pill-active">Active</span> : null}
                    </div>
                    {d.tags && d.tags.length > 0 ? (
                      <div className="sb-preview-tags">
                        {d.tags.slice(0, 2).map((t) => (
                          <span key={t} className="sb-tag">{t}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          ) : null}
        </aside>

        {/* Main Content Area */}
        <div
          ref={mainContentRef}
          className={`main-content ${sidebarExpanded ? 'sidebar-expanded' : ''}`}
          role="region"
          aria-label="Documentation content"
          tabIndex={0}
        >
          <AnimatePresence mode="wait">
            {renderContent()}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default InteractiveDocumentation;

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SIDEBAR QA MATRIX — Final Ship Checklist
 * ═══════════════════════════════════════════════════════════════════════════════
 * Layout states:
 * 1) Expanded + pinned OFF + hover on → header fixed, nav scroll only, footer fixed, no overflow, focus rings visible.
 * 2) Collapsed + pinned OFF + hover off → text hidden but title tooltips available, ARIA names intact.
 * 3) Expanded + pinned ON → stays expanded on mouse leave, aria-pressed="true".
 * 4) Expanded + pinned ON + short viewport (600px) → nav scrolls, header/footer fixed.
 * 5) Expanded + long titles → ellipsis, no horizontal overflow.
 * 6) Collapsed + keyboard focus nav item → focus ring visible, native title hints.
 * Search states:
 * 7) Search empty → all items visible; group titles visible when expanded.
 * 8) Search matches → filtered items/groups; keyboard nav respects visible list.
 * 9) Search no matches → "No matches" row with aria-live polite.
 * 10) Search focused + ArrowDown → focus jumps to first visible nav item.
 * Keyboard states:
 * 11) Nav focused + ArrowDown/Up → moves focus; nearest scroll containment.
 * 12) Home/End → jump to first/last visible item.
 * 13) PageUp/PageDown → jump by PAGE_JUMP_COUNT.
 * 14) Typeahead jump → active when nav focused, not when typing in search.
 * Preview states:
 * 15) Hover item → preview appears with delay, stable (pointer-events:none).
 * 16) Keyboard focus → preview appears with delay, clamped within viewport.
 * Footer states:
 * - Drawer open/closed reflects persisted preference; auto-closes on collapse; aria-controls/expanded correct.
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SIDEBAR SHIP NOTES — Keys, Behaviors, Limitations
 * ═══════════════════════════════════════════════════════════════════════════════
 * localStorage keys:
 * - 'docSidebarPinned' → boolean string 'true' | 'false'
 * - 'docSidebar.footerExpanded' → '1' | '0'
 * - 'docSidebar.visitedSectionIds' → JSON array of section IDs
 * Intended behaviors:
 * - Pin/hover: expanded = pinned || hovered; pin persists.
 * - Search: ranked filter, highlights; ArrowDown from input focuses first result; Esc clears or returns focus to nav.
 * - Nav: roving tabindex, arrow keys, Home/End, PageUp/PageDown, typeahead when nav focused.
 * - Preview: hover/focus overlay in expanded mode; pointer-events:none; disabled when collapsed; top/left set via ref.
 * - Footer: KPI row always visible; drawer toggled and persisted; auto-closes on collapse without overwriting preference.
 * - Visited/progress: mark on activation; group x/y counts reflect all group items; dots show group membership irrespective of filtering.
 * Known limitations:
 * - Preview absolute positioning may vary slightly with viewport changes; ref-based updates clamp within reasonable bounds.
 */
