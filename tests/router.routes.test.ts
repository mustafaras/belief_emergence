import { describe, expect, it } from 'vitest'
import {
  LANDING_ROUTE,
  SITEMAP,
  getSitemapEntry,
  isAnalysisRoute,
  parseAppRoute,
  shouldHidePanel,
  type AppRoute,
} from '../src/router/routes'

describe('route taxonomy', () => {
  it('keeps the sitemap at the contracted size and shape', () => {
    expect(SITEMAP).toHaveLength(11)
    expect(SITEMAP.filter((e) => e.kind === 'analysis')).toHaveLength(6)
    expect(SITEMAP.filter((e) => e.kind === 'menu')).toHaveLength(2)
    expect(SITEMAP.filter((e) => e.kind === 'modal')).toHaveLength(3)
  })

  it('lists every route exactly once', () => {
    const ids = SITEMAP.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain(LANDING_ROUTE)
  })

  it('parses known routes, tolerating case and whitespace', () => {
    expect(parseAppRoute('field-dynamics')).toBe('field-dynamics')
    expect(parseAppRoute('  Presets ')).toBe('presets')
    expect(parseAppRoute('DOCUMENTATION')).toBe('documentation')
  })

  it('falls back to landing for unknown, empty and missing input', () => {
    expect(parseAppRoute('no-such-route')).toBe(LANDING_ROUTE)
    expect(parseAppRoute('')).toBe(LANDING_ROUTE)
    expect(parseAppRoute(null)).toBe(LANDING_ROUTE)
    expect(parseAppRoute(undefined)).toBe(LANDING_ROUTE)
    // A path-like attempt must not be mistaken for a route.
    expect(parseAppRoute('/belief_emergence/statistical-analysis')).toBe(LANDING_ROUTE)
  })

  it('classifies analysis routes only', () => {
    expect(isAnalysisRoute('field-dynamics')).toBe(true)
    expect(isAnalysisRoute('presets')).toBe(false)
    expect(isAnalysisRoute(LANDING_ROUTE)).toBe(false)
  })

  it('isolates exactly one panel on an analysis route', () => {
    const panels = SITEMAP.filter((e) => e.kind === 'analysis').map((e) => e.id)
    for (const active of panels) {
      const visible = panels.filter((p) => !shouldHidePanel(active, p))
      expect(visible).toEqual([active])
    }
  })

  it('keeps every panel visible on landing, menu and modal routes', () => {
    const panels = SITEMAP.filter((e) => e.kind === 'analysis').map((e) => e.id)
    const nonIsolating: AppRoute[] = [
      LANDING_ROUTE,
      ...SITEMAP.filter((e) => e.kind !== 'analysis').map((e) => e.id),
    ]
    for (const route of nonIsolating) {
      expect(panels.filter((p) => !shouldHidePanel(route, p))).toEqual(panels)
    }
  })

  it('resolves a sitemap entry for every non-landing route', () => {
    for (const entry of SITEMAP) {
      expect(getSitemapEntry(entry.id)?.label).toBe(entry.label)
    }
    expect(getSitemapEntry(LANDING_ROUTE)).toBeUndefined()
  })
})
