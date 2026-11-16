import { describe, expect, it } from 'vitest'
import { APP_ROUTES, parseAppRoute } from '../src/app/routes'
import { LEGACY_REDIRECTS, resolveAppRoute } from '../src/app/redirects'

describe('app routes', () => {
  it('defines the eleven planned routes with section loaders', () => {
    expect(APP_ROUTES.map(route => route.id)).toEqual([
      'overview', 'data', 'audit', 'gates', 'model', 'evaluation', 'limits', 'countries', 'geometry', 'reproduce', 'glossary'
    ])
    expect(new Set(APP_ROUTES.map(route => route.id)).size).toBe(11)
    for (const route of APP_ROUTES) {
      expect(route.title).not.toBe('')
      expect(route.eyebrow).not.toBe('')
      expect(route.paperRef).not.toBe('')
      expect(typeof route.load).toBe('function')
    }
  })

  it('maps all legacy route names to the planned destinations', () => {
    expect(LEGACY_REDIRECTS).toMatchObject({
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
    })
    expect(resolveAppRoute('presets')).toBe('countries')
    expect(resolveAppRoute('documentation')).toBe('glossary')
  })

  it('falls back to overview for unknown routes', () => {
    expect(parseAppRoute('not-a-route')).toBe('overview')
    expect(resolveAppRoute(null)).toBe('overview')
  })
})
