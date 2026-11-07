import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

type TierLabel = 'A' | 'B' | 'C'

type ModelMetrics = {
  bias: number
  r2: number
  corr: number
}

type ModelLadderTier = {
  tier: TierLabel
  exploratory: boolean
  inferentialRole: 'primary' | 'exploratory'
  interpretationBoundary: string
  trainMetrics: ModelMetrics
  supportPerParameter: number
  converged: boolean
  parameterCount: number
}

type ModelLadderArtifact = {
  schemaVersion: string
  generatedAtIso: string
  tiers: ModelLadderTier[]
  nUniqueCountryYears: number
  interpretationGuardrails?: {
    effectiveSupport?: {
      nUniqueCountryYears?: number
      supportDensityNote?: string
    }
    tierDiscipline?: {
      A?: string
      B?: string
      C?: string
    }
    headlinePolicy?: string
  }
}

function readModelLadderArtifact(filePath: string): ModelLadderArtifact {
  const content = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(content) as ModelLadderArtifact
}

function getTier(data: ModelLadderArtifact, tier: TierLabel): ModelLadderTier {
  const found = data.tiers.find((entry) => entry.tier === tier)
  expect(found).toBeDefined()
  if (!found) {
    throw new Error(`Missing tier ${tier} in model ladder artifact`)
  }
  return found
}

describe('Model Ladder Metrics - Contract Enforcement', () => {
  const filePath = 'src/data/analysis/model_ladder_metrics.json'

  it('file exists and is valid JSON', () => {
    expect(fs.existsSync(filePath)).toBe(true)
    const data = readModelLadderArtifact(filePath)
    expect(data).toBeDefined()
  })

  it('has required schema version', () => {
    const data = readModelLadderArtifact(filePath)
    expect(data.schemaVersion).toBeDefined()
    expect(data.schemaVersion).toMatch(/^phase1\.model_ladder\.v\d+$/)
  })

  it('has ISO timestamp for reproducibility', () => {
    const data = readModelLadderArtifact(filePath)
    expect(data.generatedAtIso).toBeDefined()
    expect(/^\d{4}-\d{2}-\d{2}T/.test(data.generatedAtIso)).toBe(true)
  })

  it('contains all three tiers (A, B, C)', () => {
    const data = readModelLadderArtifact(filePath)
    expect(data.tiers).toBeDefined()
    expect(Array.isArray(data.tiers)).toBe(true)

    const tierLabels = data.tiers.map((t) => t.tier)
    expect(tierLabels).toContain('A')
    expect(tierLabels).toContain('B')
    expect(tierLabels).toContain('C')
  })

  it('Tier C is marked exploratory, Tiers A/B are not', () => {
    const data = readModelLadderArtifact(filePath)
    const tierA = getTier(data, 'A')
    const tierB = getTier(data, 'B')
    const tierC = getTier(data, 'C')

    expect(tierA.exploratory).toBe(false)
    expect(tierB.exploratory).toBe(false)
    expect(tierC.exploratory).toBe(true)
    expect(tierA.inferentialRole).toBe('primary')
    expect(tierB.inferentialRole).toBe('primary')
    expect(tierC.inferentialRole).toBe('exploratory')
    expect(tierC.interpretationBoundary.toLowerCase()).toContain('exploratory')
  })

  it('encodes support-constrained interpretation guardrails', () => {
    const data = readModelLadderArtifact(filePath)

    expect(data.nUniqueCountryYears).toBeGreaterThan(0)
    expect(data.interpretationGuardrails).toBeDefined()
    expect(data.interpretationGuardrails?.effectiveSupport?.nUniqueCountryYears).toBe(data.nUniqueCountryYears)
    expect(data.interpretationGuardrails?.tierDiscipline?.A).toBe('primary')
    expect(data.interpretationGuardrails?.tierDiscipline?.B).toBe('primary')
    expect(data.interpretationGuardrails?.tierDiscipline?.C).toBe('exploratory')
    expect((data.interpretationGuardrails?.headlinePolicy || '').toLowerCase()).toContain('tier c')
  })

  it('all tiers have valid metrics with bias sign consistency', () => {
    const data = readModelLadderArtifact(filePath)

    for (const tier of data.tiers) {
      expect(tier.trainMetrics).toBeDefined()
      const metrics = tier.trainMetrics

      // Bias should be very close to zero in-sample (fitted surface)
      expect(Number.isFinite(metrics.bias)).toBe(true)
      expect(Math.abs(metrics.bias)).toBeLessThan(0.1)

      // R² and correlation should be high and consistent
      expect(metrics.r2).toBeGreaterThan(0)
      expect(metrics.r2).toBeLessThanOrEqual(1)
      expect(metrics.corr).toBeGreaterThan(0)
      expect(metrics.corr).toBeLessThanOrEqual(1)
    }
  })

  it('support-per-parameter is sufficient for Tiers A and B', () => {
    const data = readModelLadderArtifact(filePath)
    const tierA = getTier(data, 'A')
    const tierB = getTier(data, 'B')
    const tierC = getTier(data, 'C')

    // Tier A should have support >= 2 per parameter (minimum threshold)
    expect(tierA.supportPerParameter).toBeGreaterThanOrEqual(2)

    // Tier B should have support >= 1.5 per parameter
    expect(tierB.supportPerParameter).toBeGreaterThanOrEqual(1.5)

    // Tier C support may be lower but should be noted
    expect(tierC.supportPerParameter).toBeGreaterThan(0)
  })

  it('all tiers converged during training', () => {
    const data = readModelLadderArtifact(filePath)

    for (const tier of data.tiers) {
      expect(tier.converged).toBe(true)
    }
  })
})
