// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * The score must be computed, additive, and unable to reach 100 while externals are open.
 *
 * The figure it replaces — 95/100 — had no rubric and could not fall, so it measured nothing.
 * These tests pin the three properties that make the replacement a measure.
 */
type Score = {
  score: number
  outOf: number
  dimensions: Array<{ id: string; weight: number; earned: number; evidence: string[] }>
}

let cached: Score | null = null

/**
 * Run the scorer once per file.
 *
 * Each invocation starts `tsx`, which takes a couple of seconds on its own. Four tests each
 * spawning their own process timed out at five seconds under full-suite load while passing in
 * isolation — a flake with a clear cause, fixed by computing the value once.
 */
function score(): Score {
  if (cached) return cached
  const output = execFileSync('npx', ['tsx', 'scripts/compute_paper_score.ts', '--json'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  cached = JSON.parse(output) as Score
  return cached
}

describe('paper score', () => {
  // `tsx` startup under full-suite load takes a few seconds; the default 5s timeout measures
  // the machine, not the code. Everything after the first call is cached.
  const TIMEOUT = 30_000

  it('adds up: the earned points equal the total', () => {
    const result = score()
    const sum = result.dimensions.reduce((total, dimension) => total + dimension.earned, 0)
    expect(sum).toBe(result.score)
    const weights = result.dimensions.reduce((total, dimension) => total + dimension.weight, 0)
    expect(weights).toBe(result.outOf)
    expect(result.outOf).toBe(100)
  }, TIMEOUT)

  it('never reaches 100 while an external dependency is open', () => {
    const provenance = JSON.parse(
      readFileSync('src/data/analysis/data_code_provenance.json', 'utf8'),
    ) as { compliance_summary: { action_items: Array<{ priority: string; resolution?: string }> } }
    const open = provenance.compliance_summary.action_items.filter(
      (entry) => entry.priority.toLowerCase() !== 'resolved' && !(entry.resolution ?? '').trim(),
    )
    const result = score()
    if (open.length > 0) {
      expect(result.score).toBeLessThan(100)
      const external = result.dimensions.find((dimension) => dimension.id === 'external')
      expect(external?.earned).toBeLessThan(external?.weight ?? 0)
    }
  }, TIMEOUT)

  it('states the basis of every dimension', () => {
    for (const dimension of score().dimensions) {
      // A dimension with no evidence line is an assertion, which is what the old score was.
      if (dimension.weight === 0) continue
      expect(dimension.evidence.length, `${dimension.id} has no evidence`).toBeGreaterThan(0)
      expect(dimension.evidence.join(' ').length).toBeGreaterThan(20)
    }
  })

  it('reports the submission bundle without awarding points for it', () => {
    const bundle = score().dimensions.find((dimension) => dimension.id === 'bundle')
    expect(bundle?.weight).toBe(0)
    expect(bundle?.evidence.join(' ')).toMatch(/\d\/5 PDFs present/)
  })
})
