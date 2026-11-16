import { describe, expect, it } from 'vitest'
import { getClaim } from '../src/claims/registry'
import { isCoefficientDistinguishableFromZero, withdrawnConstructs } from '../src/claims/selectors/model'

describe('model claims', () => {
  it('registers current production coefficient estimates and parameter count', () => {
    expect(getClaim('model.c.E').value).toBe(0.3865223257852435)
    expect(getClaim('model.c.R').value).toBe(0.28816078871308326)
    expect(getClaim('model.c.M').value).toBe(-0.13747675787632863)
    expect(getClaim('model.c.T').value).toBe(-0.08491746648481568)
    expect(getClaim('model.c.tr').value).toBe(-0.1580038890960328)
    expect(getClaim('model.c.yr').value).toBe(0.746817674589666)
    expect(getClaim('model.params').value).toBe(10)
  })

  it('uses the current bootstrap bounds and limits zero-exclusion labels to E and yr', () => {
    expect(getClaim('model.bootstrap.c_E.lo').value).toBe(0.12089975858494162)
    expect(getClaim('model.bootstrap.c_E.hi').value).toBe(0.7361195378162045)
    expect(getClaim('model.bootstrap.c_yr.lo').value).toBe(0.13168202834413473)
    expect(getClaim('model.bootstrap.c_yr.hi').value).toBe(1.4352400319777254)
    expect(getClaim('model.identified.phi0MinusLnK').value).toBe(0.6587683517467147)
    expect(getClaim('model.identified.phi0MinusLnK.lo').value).toBe(0.49437865336589737)
    expect(getClaim('model.identified.phi0MinusLnK.hi').value).toBe(0.8503247234907031)
    expect(['E', 'R', 'M', 'T', 'tr', 'yr'].filter(isCoefficientDistinguishableFromZero)).toEqual(['E', 'yr'])
  })

  it('records withdrawn channels, fold convergence, and pooled stability', () => {
    expect(withdrawnConstructs).toEqual(['C', 'D', 'G', 'S'])
    expect(getClaim('model.folds.total').value).toBe(324)
    expect(getClaim('model.folds.failed').value).toBe(0)
    expect(getClaim('model.stability.A.medianSignConsistency').value).toBe(1)
    expect(getClaim('model.stability.B.unstableCount').value).toBe(1)
    expect(getClaim('model.stability.C.medianSignConsistency').value).toBe(0.99)
  })
})
