import type { ComponentType } from 'react'

type RouteModule = { default: ComponentType }

export const ROUTE_QUERY_KEY = 'v' as const
export const DEFAULT_ROUTE_ID = 'overview' as const

export type AppRoute = {
  id: string
  number: string
  title: string
  eyebrow: string
  paperRef: string
  load: () => Promise<RouteModule>
}

export const APP_ROUTES = [
  { id: 'overview', number: '—', title: 'Measurement Validity Before Model Geometry', eyebrow: 'INTRODUCTION · ABSTRACT + §1', paperRef: 'Abstract, §1', load: () => import('../sections/overview') },
  { id: 'data', number: '01', title: 'Data & Support', eyebrow: '01 · DATA AND SUPPORT', paperRef: '§3, §4 Step 2b–2d', load: () => import('../sections/data') },
  { id: 'audit', number: '02', title: 'Construct Audit', eyebrow: '02 · MEASUREMENT', paperRef: '§4 Step 1–2, Table 1', load: () => import('../sections/audit') },
  { id: 'gates', number: '03', title: 'Design Gates', eyebrow: '03 · DESIGN GATES', paperRef: '§4 Step 3–4, Ordering', load: () => import('../sections/gates') },
  { id: 'model', number: '04', title: 'The Model', eyebrow: '04 · SPECIFICATION', paperRef: '§5', load: () => import('../sections/model') },
  { id: 'evaluation', number: '05', title: 'Evaluation', eyebrow: '05 · OUT-OF-SAMPLE EVIDENCE', paperRef: '§6, §8 KF-0, KF-III', load: () => import('../sections/evaluation') },
  { id: 'limits', number: '06', title: 'What This Model Cannot Show', eyebrow: '06 · LIMITS AND SENSITIVITY', paperRef: '§6 Collinearity, §8 KF-I, Multiplicity, Lockbox', load: () => import('../sections/limits') },
  { id: 'countries', number: '07', title: 'Countries', eyebrow: '07 · COUNTRY ALIGNMENT', paperRef: 'Table preset-country-z', load: () => import('../sections/countries') },
  { id: 'geometry', number: '08', title: 'Geometry Lab', eyebrow: '08 · MODEL GEOMETRY', paperRef: '§5 Figures 1–2, §7', load: () => import('../sections/geometry') },
  { id: 'reproduce', number: '09', title: 'Evidence & Reproducibility', eyebrow: '09 · REPRODUCIBILITY', paperRef: '§1 items 4–6', load: () => import('../sections/reproduce') },
  { id: 'glossary', number: '—', title: 'Notation', eyebrow: 'NOTATION', paperRef: 'Table S15', load: () => import('../sections/glossary') }
] satisfies readonly AppRoute[]

export type AppRouteId = typeof APP_ROUTES[number]['id']

export function getAppRoute(id: AppRouteId): AppRoute {
  const route = APP_ROUTES.find(item => item.id === id)
  if (!route) throw new Error(`Unknown application route: ${id}`)
  return route
}

export function parseAppRoute(raw: unknown): AppRouteId {
  if (typeof raw !== 'string') return DEFAULT_ROUTE_ID
  const normalized = raw.trim().toLowerCase()
  return APP_ROUTES.find(route => route.id === normalized)?.id ?? DEFAULT_ROUTE_ID
}
