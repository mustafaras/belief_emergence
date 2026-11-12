/**
 * The application's route taxonomy.
 *
 * This module is deliberately dependency-free and free of browser APIs: it is the
 * single source of truth for *which* views exist, while `src/utils/urlState.ts` owns
 * the encoding of them. Keeping the split means the sitemap can be unit-tested
 * without a DOM, and the serialiser stays the only place state is written.
 *
 * Routes are carried in the query string (`?v=<route>`) rather than the path. The app
 * is served from a fixed sub-path (`base: '/belief_emergence/'` in `vite.config.ts`),
 * so a path-based router would 404 on a cold deep link from static hosting. A query
 * parameter survives that, keeps every existing link working, and lets the export
 * serialiser remain the only encoder.
 */

export type AppRoute =
  | 'landing'
  | 'component-analysis'
  | 'field-dynamics'
  | 'statistical-analysis'
  | 'sensitivity-analysis'
  | 'emergence-analysis'
  | 'model-diagnostics'
  | 'advanced-parameters'
  | 'phi-contributions'
  | 'documentation'
  | 'ai-interpreter'
  | 'presets'

export type RouteKind = 'analysis' | 'menu' | 'modal'

export type SitemapEntry = {
  id: AppRoute
  /** Human label. Matches the on-screen heading or the sidebar item verbatim. */
  label: string
  kind: RouteKind
  /** Short description used by the route navigation strip. */
  description: string
}

/**
 * The sitemap. Every route the router can produce appears here exactly once, and the
 * navigation strip renders from this array, so "reachable" and "in the sitemap" cannot
 * drift apart.
 *
 * `landing` is intentionally absent: it is the fallback for unknown routes rather than
 * a destination a reader needs to be told about. It is still a valid route.
 */
export const SITEMAP: readonly SitemapEntry[] = Object.freeze([
  {
    id: 'component-analysis',
    label: 'Component Analysis',
    kind: 'analysis',
    description: 'Term-by-term parameter breakdown and its contribution to Z.',
  },
  {
    id: 'field-dynamics',
    label: 'Φ Field Dynamics',
    kind: 'analysis',
    description: 'Baseline, main effects, interactions and quadratic components of Φ.',
  },
  {
    id: 'statistical-analysis',
    label: 'Statistical Analysis',
    kind: 'analysis',
    description: 'Fit statistics for the current parameters.',
  },
  {
    id: 'sensitivity-analysis',
    label: 'Sensitivity Analysis',
    kind: 'analysis',
    description: 'Local derivatives: how Z responds to each parameter.',
  },
  {
    id: 'emergence-analysis',
    label: 'Emergence Analysis',
    kind: 'analysis',
    description: 'Emergence regime implied by the current Z.',
  },
  {
    id: 'model-diagnostics',
    label: 'Model Diagnostics',
    kind: 'analysis',
    description: 'Support, extrapolation and identification warnings.',
  },
  {
    id: 'advanced-parameters',
    label: 'Advanced Parameters',
    kind: 'menu',
    description: 'Structural exponents α, β and the saturation constant k.',
  },
  {
    id: 'phi-contributions',
    label: 'Φ Contributions',
    kind: 'menu',
    description: 'Per-term contributions to Φ, ordered by magnitude.',
  },
  {
    id: 'documentation',
    label: 'Documentation',
    kind: 'modal',
    description: 'The interactive reference for every symbol in the model.',
  },
  {
    id: 'ai-interpreter',
    label: 'AI Interpreter',
    kind: 'modal',
    description: 'An explanation of the current panel state.',
  },
  {
    id: 'presets',
    label: 'Presets',
    kind: 'modal',
    description: 'Country presets for the parameter set.',
  },
] as const satisfies readonly SitemapEntry[])

export const LANDING_ROUTE: AppRoute = 'landing'

/** Query key the serialiser uses. Short, like the rest of the URL contract. */
export const ROUTE_QUERY_KEY = 'v'

const ROUTE_IDS: ReadonlySet<string> = new Set<AppRoute>([
  LANDING_ROUTE,
  ...SITEMAP.map((entry) => entry.id),
])

/**
 * Resolve an arbitrary string to a route. Anything unrecognised — including absent,
 * empty and malformed input — becomes the landing route, which is the required
 * fallback behaviour. Case and surrounding whitespace are tolerated so a hand-edited
 * link is not rejected over formatting.
 */
export function parseAppRoute(raw: string | null | undefined): AppRoute {
  if (typeof raw !== 'string') return LANDING_ROUTE
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return LANDING_ROUTE
  return ROUTE_IDS.has(normalized) ? (normalized as AppRoute) : LANDING_ROUTE
}

/** True when the route is one of the six stacked analysis panels in the TopBar. */
export function isAnalysisRoute(route: AppRoute): boolean {
  return SITEMAP.some((entry) => entry.id === route && entry.kind === 'analysis')
}

/**
 * Whether `panelRoute` must be hidden while `route` is active.
 *
 * Only an analysis route isolates a single panel. Menu and modal routes act on the
 * sidebar or open a dialog, so they keep every panel visible — blanking the analysis
 * band there would leave the page with nothing but controls.
 */
export function shouldHidePanel(route: AppRoute, panelRoute: AppRoute): boolean {
  return isAnalysisRoute(route) && route !== panelRoute
}

/** Lookup for labels and descriptions; undefined for `landing`. */
export function getSitemapEntry(route: AppRoute): SitemapEntry | undefined {
  return SITEMAP.find((entry) => entry.id === route)
}
