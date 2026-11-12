import { describe, expect, it } from 'vitest'
import { CANONICAL_PANEL_CSV_PATH } from '../src/data/panelDataLoader'
import { resolvePublicPath } from '../src/utils/publicPath'

/**
 * The panel CSV lives in `public/`, which Vite serves under `base`
 * (`/belief_emergence/`). An absolute `/data/...` request misses that base and 404s,
 * which silently emptied every panel statistic in the interface. These cases pin the
 * resolution so the bug cannot come back by someone "simplifying" the path.
 *
 * `base` is passed explicitly because Vite statically replaces
 * `import.meta.env.BASE_URL`; it cannot be varied at runtime.
 */
describe('resolvePublicPath', () => {
  const csv = '/data/panel_canonical_v2.csv'

  it('prefixes a sub-path deployment base', () => {
    expect(resolvePublicPath(csv, '/belief_emergence/')).toBe(
      '/belief_emergence/data/panel_canonical_v2.csv',
    )
  })

  it('does not double the slash for a root deployment', () => {
    expect(resolvePublicPath(csv, '/')).toBe('/data/panel_canonical_v2.csv')
  })

  it('tolerates a base without a trailing slash', () => {
    expect(resolvePublicPath('/data/x.csv', '/belief_emergence')).toBe('/belief_emergence/data/x.csv')
  })

  it('tolerates a path given without a leading slash', () => {
    expect(resolvePublicPath('data/x.csv', '/belief_emergence/')).toBe(
      '/belief_emergence/data/x.csv',
    )
  })

  it('resolves the real canonical path under this deployment, not the bare absolute form', () => {
    // The regression was `/data/panel_canonical_v2.csv` — valid only at a root base.
    expect(CANONICAL_PANEL_CSV_PATH).toBe(resolvePublicPath(csv))
    if (import.meta.env.BASE_URL !== '/') {
      expect(CANONICAL_PANEL_CSV_PATH).not.toBe(csv)
      expect(CANONICAL_PANEL_CSV_PATH.startsWith(import.meta.env.BASE_URL)).toBe(true)
    }
  })
})
