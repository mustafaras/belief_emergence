import { parseAppRoute, type AppRouteId } from './routes'

export const LEGACY_REDIRECTS = {
  landing: 'overview',
  'component-analysis': 'geometry',
  'field-dynamics': 'geometry',
  'statistical-analysis': 'geometry',
  'sensitivity-analysis': 'geometry',
  'emergence-analysis': 'geometry',
  'model-diagnostics': 'geometry',
  'advanced-parameters': 'geometry',
  'phi-contributions': 'geometry',
  presets: 'countries',
  documentation: 'glossary',
  'ai-interpreter': 'overview'
} as const satisfies Record<string, AppRouteId>

export function resolveAppRoute(raw: unknown): AppRouteId {
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    const redirect = LEGACY_REDIRECTS[normalized as keyof typeof LEGACY_REDIRECTS]
    if (redirect) return redirect
  }
  return parseAppRoute(raw)
}
