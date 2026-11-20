import { describe, expect, it } from 'vitest'
import auditArtifact from '../src/data/analysis/wvs_construct_audit.json'
import { formatClaim } from '../src/claims/format'
import { getClaim } from '../src/claims/registry'

describe('audit and data claims', () => {
  it('uses the measured respondent and country-year counts', () => {
    expect(getClaim('audit.respondents').value).toBe(442026)
    expect(getClaim('audit.countryYears').value).toBe(305)
  })

  it('reports the measured construct alphas and emitted cells', () => {
    expect(getClaim('audit.Z.alpha').value).toBeCloseTo(0.819, 3)
    expect(getClaim('audit.Z.cells').value).toBe(287)
    expect(getClaim('audit.C.alpha').value).toBeCloseTo(0.348, 3)
    expect(getClaim('audit.C.cells').value).toBe(303)
    const dAlpha = getClaim('audit.D.alpha')
    expect(dAlpha.value).toBe(auditArtifact.constructs.D_social_atomization.cronbachAlpha)
    expect(formatClaim(dAlpha.value, dAlpha.format)).toBe('-1.228')
    expect(getClaim('audit.D.cells').value).toBe(296)
  })

  it('records S as uncomputable without making an alpha claim', () => {
    expect(getClaim('audit.S.cells').value).toBe(0)
    expect(auditArtifact.constructs.S_social_support.computable).toBe(false)
    expect(() => getClaim('audit.S.alpha')).toThrow()
  })

  it('derives the number of failed constructs excluding Z', () => {
    expect(getClaim('audit.failedCount').value).toBe(3)
    expect(getClaim('audit.constructCount').value).toBe(4)
  })

  it('reports canonical panel rows, countries, and frame share', () => {
    expect(getClaim('data.panelRows').value).toBe(207)
    expect(getClaim('data.countries').value).toBe(83)
    expect(getClaim('data.frameShare').value).toBeCloseTo(0.679, 3)
    expect(getClaim('data.frameShare').format).toBe('pct1')
  })

  it('reports complete cases at every specified Gini window', () => {
    const expectedRows = new Map([[0, 102], [1, 140], [2, 167], [3, 184], [5, 207]])
    for (const [window, rows] of expectedRows) {
      expect(getClaim(`data.gini.window.${window}.rows`).value).toBe(rows)
    }
  })

  it('exposes the zero-anchor sensitivity values from its artifact', () => {
    expect(getClaim('data.zeroAnchor.rows').value).toBe(42)
    expect(getClaim('data.zeroAnchor.fullPanel.cMinusB').value).toBe(-0.028747)
    expect(getClaim('data.zeroAnchor.withoutRows.cMinusB').value).toBe(-0.009268)
  })
})
