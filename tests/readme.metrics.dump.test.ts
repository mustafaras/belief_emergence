// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dumpReadmeMetrics } from '../scripts/dump_readme_metrics'
import { listClaims } from '../src/claims/registry'

/**
 * Writes the fixture the README generator consumes.
 *
 * It lives in the test process because that is the only place sharing the application's
 * module graph: the registry reads the canonical panel through Vite's `?raw` import, which
 * plain Node cannot resolve. The write is skipped unless `README_METRICS=1`, so an ordinary
 * test run never touches a file.
 */
describe('README metrics', () => {
  it.skipIf(!process.env.README_METRICS)('writes tmp/readme-metrics.json', () => {
    dumpReadmeMetrics()
  })

  it('has every claim the README template names', () => {
    const ids = ['data.panelRows', 'data.countries', 'eval.headline.r2', 'audit.constructs.retained']
    const present = new Set(listClaims().map((claim) => claim.id))
    for (const id of ids) expect(present.has(id), `${id} is missing from the registry`).toBe(true)
  })

  it('keeps the r2 claim tied to the artifact field it names', () => {
    const artifact = JSON.parse(
      readFileSync('src/data/analysis/metrics_authoritative.json', 'utf8'),
    ) as { r2: number }
    const claim = listClaims().find((entry) => entry.id === 'eval.headline.r2')
    expect(claim?.value).toBe(artifact.r2)
    expect(claim?.path).toBe('r2')
  })
})
