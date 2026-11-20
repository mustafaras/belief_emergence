// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { MAX_NODES, flattenJson } from '../src/sections/reproduce/JsonTree'
import { findClaimReferences, outputArtifactsIn, selectorClaimFacts, isArtifactProducer } from '../src/evidence/reproductionManifest'
import { GATE_LOOP_CHECKS, GATE_STEPS } from '../src/sections/reproduce/gateSteps.generated'
import { REPRODUCTION_MANIFEST, MANIFEST_CLAIM_COUNT } from '../src/evidence/reproductionManifest.generated'

describe('the JSON tree', () => {
  it('lists a collapsed branch without reading it', () => {
    const payload = { a: { b: 1, c: 2 }, d: 3 }
    const { nodes } = flattenJson(payload, new Set(['']), 2000)
    // root + a + d, and `a`'s children are not visited until it is expanded.
    expect(nodes.map((n) => n.label)).toEqual([null, 'a', 'd'])
    expect(nodes[1].branch).toBe(true)
  })

  it('reads a branch once it is expanded, and says how much it withheld', () => {
    const payload = { big: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i])) }
    const collapsed = flattenJson(payload, new Set(['']), 2000)
    expect(collapsed.withheld).toBe(0)

    const expanded = flattenJson(payload, new Set(['', '/big']), 10)
    expect(expanded.nodes.length).toBe(10)
    expect(expanded.withheld).toBeGreaterThan(0)
    expect(expanded.withheldAt).toBe('/big')
  })

  it('never visits a subtree the reader has not opened, however large it is', () => {
    const payload = { folds: Array.from({ length: 5000 }, (_, i) => ({ i })) }
    const { nodes, withheld } = flattenJson(payload, new Set(['']), MAX_NODES)
    expect(nodes).toHaveLength(2)
    expect(withheld).toBe(0)
  })
})

describe('claim reference extraction', () => {
  it('finds literal ids and selector imports', () => {
    const source = `
      import { getClaim } from '../claims/registry'
      import { dataClaims, seedDeltas } from '../../claims/selectors/data'
      const a = getClaim('data.frameShare')
      const b = claim('gates.original.rows', 'x', 1)
    `
    const refs = findClaimReferences(source)
    expect(refs).toContainEqual({ kind: 'id', id: 'data.frameShare' })
    expect(refs).toContainEqual({ kind: 'id', id: 'gates.original.rows' })
    expect(refs).toContainEqual({ kind: 'selector', name: 'dataClaims' })
    expect(refs).toContainEqual({ kind: 'selector', name: 'seedDeltas' })
  })

  it('detects a selector whose claims are generated rather than listed', () => {
    const generated = `export const seedClaims: Claim[] = seedDeltas.map((entry, index) => ({ id: 'x' }))`
    expect(selectorClaimFacts(generated).unresolved).toBe(true)
    const listed = `export const gatesClaims: Claim[] = [claim('gates.a', 'x', 1)]`
    expect(selectorClaimFacts(listed).unresolved).toBe(false)
    expect(selectorClaimFacts(listed).declaredIds).toContain('gates.a')
  })
})

describe('artifact provenance extraction', () => {
  it('reads the four ways a generator names its output', () => {
    expect(outputArtifactsIn(`const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'a.json')`)).toContain('a')
    expect(outputArtifactsIn(`const OUT = path.join(ANALYSIS_DIR, 'b.json')`)).toContain('b')
    expect(outputArtifactsIn(`OUT = ROOT / "src" / "data" / "analysis" / "c.json"`)).toContain('c')
    expect(outputArtifactsIn(`function writeJson(n, v) {}\nwriteJson('d.json', payload)`)).toContain('d')
  })

  it('does not treat an audit that reads an artifact as its producer', () => {
    expect(isArtifactProducer('scripts/check_support_picture.ts')).toBe(false)
    expect(isArtifactProducer('scripts/ci_gate.ts')).toBe(false)
    expect(isArtifactProducer('scripts/generate_design_gates.ts')).toBe(true)
    expect(isArtifactProducer('scripts/fit_coefficients_v2.py')).toBe(true)
  })
})

describe('the generated manifest', () => {
  it('accounts for every route and never invents a generator', () => {
    expect(REPRODUCTION_MANIFEST.routes).toHaveLength(11)
    expect(MANIFEST_CLAIM_COUNT).toBeGreaterThan(100)
    for (const artifact of REPRODUCTION_MANIFEST.artifacts) {
      if (artifact.provenance === 'generated') expect(artifact.generator).toMatch(/^npm run /)
      else expect(artifact.generator).toBeNull()
    }
  })

  it('reports claims per route without counting the whole registry', () => {
    // The registry is imported by the shell on every route, so a naive transitive count is
    // identical for all 11 and carries no information. Direct-only is what a page shows.
    const directCounts = new Set(REPRODUCTION_MANIFEST.routes.map((route) => route.directClaimIds.length))
    expect(directCounts.size).toBeGreaterThan(1)
    for (const route of REPRODUCTION_MANIFEST.routes) {
      expect(route.directClaimIds.length).toBeLessThanOrEqual(route.claimIds.length)
      // Reachable is never larger than the corpus, and every direct id is reachable.
      expect(route.claimIds.length).toBeLessThanOrEqual(MANIFEST_CLAIM_COUNT)
      for (const id of route.directClaimIds) expect(route.claimIds).toContain(id)
    }
  })
})

describe('the gate step list', () => {
  it('agrees with the number of checks the gate runs', () => {
    expect(GATE_STEPS.length + (GATE_LOOP_CHECKS.total - GATE_STEPS.length)).toBe(GATE_LOOP_CHECKS.total)
    expect(GATE_LOOP_CHECKS.total).toBe(
      GATE_STEPS.length + GATE_LOOP_CHECKS.artifactPresence + GATE_LOOP_CHECKS.schemaVersions + GATE_LOOP_CHECKS.canonicalMetrics,
    )
    expect(GATE_LOOP_CHECKS.total).toBeGreaterThanOrEqual(91)
  })
})
