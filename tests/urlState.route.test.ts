import { describe, expect, it } from 'vitest'
import { DEFAULT_ROUTE_ID, ROUTE_QUERY_KEY } from '../src/app/routes'
import { applyRouteToSearchParams } from '../src/utils/urlState'

/**
 * The route is encoded by the same serialiser that already carries parameters, so the
 * tests drive `URLSearchParams` directly rather than a browser. `urlState.surface3d`
 * established this pattern; these cases extend it to routes.
 */
describe('urlState route encoding', () => {
  it('writes a non-landing route and leaves unrelated keys intact', () => {
    const qs = new URLSearchParams('x=0.5&y=0.1&preset=Turkey')
    applyRouteToSearchParams(qs, 'evaluation')

    expect(qs.get(ROUTE_QUERY_KEY)).toBe('evaluation')
    expect(qs.get('x')).toBe('0.5')
    expect(qs.get('preset')).toBe('Turkey')
  })

  it('omits the key entirely for the landing route', () => {
    const qs = new URLSearchParams('x=0.5')
    applyRouteToSearchParams(qs, DEFAULT_ROUTE_ID)

    expect(qs.has(ROUTE_QUERY_KEY)).toBe(false)
    expect(qs.get('x')).toBe('0.5')
  })

  it('replaces a previous route rather than accumulating keys', () => {
    const qs = new URLSearchParams(`${ROUTE_QUERY_KEY}=presets`)
    applyRouteToSearchParams(qs, 'countries')

    expect(qs.getAll(ROUTE_QUERY_KEY)).toEqual(['countries'])
  })

  it('normalises the legacy doc=1 flag into the route and never rewrites it', () => {
    const qs = new URLSearchParams('doc=1&x=0.5')
    applyRouteToSearchParams(qs, 'glossary')

    expect(qs.get(ROUTE_QUERY_KEY)).toBe('glossary')
    // Two encoders for one piece of state is the defect; doc must not survive.
    expect(qs.has('doc')).toBe(false)
    expect(qs.get('x')).toBe('0.5')
  })

  it('drops a stale doc flag even when routing elsewhere', () => {
    const qs = new URLSearchParams('doc=1')
    applyRouteToSearchParams(qs, 'geometry')

    expect(qs.has('doc')).toBe(false)
    expect(qs.get(ROUTE_QUERY_KEY)).toBe('geometry')
  })

  it('preserves surface3d styling keys it does not own', () => {
    const qs = new URLSearchParams('pv=2D&cs=Viridis')
    applyRouteToSearchParams(qs, 'geometry')

    expect(qs.get('pv')).toBe('2D')
    expect(qs.get('cs')).toBe('Viridis')
    expect(qs.get(ROUTE_QUERY_KEY)).toBe('geometry')
  })
})
