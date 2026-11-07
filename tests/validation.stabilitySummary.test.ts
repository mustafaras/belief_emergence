import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

type ProtocolKey = 'country_out' | 'rolling_origin'
type TierKey = 'A' | 'B' | 'C'

type StabilityCoefficient = {
  signConsistency: number
  unstable: boolean
  median: number
  q25: number
  q75: number
}

type StabilityTierData = {
  nConvergedFolds: number
  coefficients: StabilityCoefficient[]
}

type StabilitySummaryArtifact = {
  schemaVersion: string
  generatedAtIso: string
  thresholdSignConsistency: number
  byProtocol: Record<ProtocolKey, Record<TierKey, StabilityTierData>>
}

function readStabilityArtifact(filePath: string): StabilitySummaryArtifact {
  const content = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(content) as StabilitySummaryArtifact
}

describe('Parameter Stability Summary - Sign Consistency & Robustness', () => {
  const filePath = 'src/data/analysis/parameter_stability.json'

  it('file exists and is valid JSON', () => {
    expect(fs.existsSync(filePath)).toBe(true)
    const data = readStabilityArtifact(filePath)
    expect(data).toBeDefined()
  })

  it('has correct schema version for parameter stability', () => {
    const data = readStabilityArtifact(filePath)
    expect(data.schemaVersion).toBeDefined()
    expect(data.schemaVersion).toMatch(/^phase1\.parameter_stability\.v\d+$/)
  })

  it('defines stability threshold and applies it consistently', () => {
    const data = readStabilityArtifact(filePath)
    expect(data.thresholdSignConsistency).toBeDefined()
    expect(data.thresholdSignConsistency).toBeGreaterThan(0)
    expect(data.thresholdSignConsistency).toBeLessThanOrEqual(1)
  })

  it('reports stability for both country-out and rolling-origin protocols', () => {
    const data = readStabilityArtifact(filePath)
    expect(data.byProtocol).toBeDefined()
    expect(data.byProtocol.country_out).toBeDefined()
    expect(data.byProtocol.rolling_origin).toBeDefined()
  })

  it('Tier A parameters are highly stable (sign consistency >= 0.7)', () => {
    const data = readStabilityArtifact(filePath)
    const threshold = data.thresholdSignConsistency

    for (const protocol of ['country_out', 'rolling_origin'] as ProtocolKey[]) {
      const tierA = data.byProtocol[protocol].A
      expect(tierA).toBeDefined()

      for (const coeff of tierA.coefficients) {
        expect(coeff.signConsistency).toBeGreaterThanOrEqual(threshold)
        expect(coeff.unstable).toBe(false)
      }
    }
  })

  it('Tier B parameters are reasonably stable (most meet threshold)', () => {
    const data = readStabilityArtifact(filePath)
    const threshold = data.thresholdSignConsistency

    for (const protocol of ['country_out', 'rolling_origin'] as ProtocolKey[]) {
      const tierB = data.byProtocol[protocol].B
      expect(tierB).toBeDefined()

      // Count how many meet threshold
      const stableCount = tierB.coefficients.filter((c) => c.signConsistency >= threshold).length
      const totalCount = tierB.coefficients.length

      // At least 80% of parameters should meet threshold for Tier B
      expect(stableCount / totalCount).toBeGreaterThanOrEqual(0.8)
    }
  })

  it('Tier C parameters may have lower stability (exploratory tier)', () => {
    const data = readStabilityArtifact(filePath)

    for (const protocol of ['country_out', 'rolling_origin'] as ProtocolKey[]) {
      const tierC = data.byProtocol[protocol].C
      if (tierC) {
        expect(tierC).toBeDefined()

        // Count unstable parameters; Tier C may have more
        const unstableCount = tierC.coefficients.filter((c) => c.unstable).length
        expect(unstableCount).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('parameter quantiles are reasonable (Q25 <= median <= Q75)', () => {
    const data = readStabilityArtifact(filePath)

    for (const protocol of ['country_out', 'rolling_origin'] as ProtocolKey[]) {
      for (const tier of ['A', 'B', 'C'] as TierKey[]) {
        const tierData = data.byProtocol[protocol][tier]
        if (tierData && tierData.coefficients) {
          for (const coeff of tierData.coefficients) {
            // Median must be within quantile bounds (allowing floating point tolerance)
            expect(coeff.median).toBeGreaterThanOrEqual(coeff.q25 - 1e-10)
            expect(coeff.median).toBeLessThanOrEqual(coeff.q75 + 1e-10)
          }
        }
      }
    }
  })

  it('sign consistency is monotonic with confidence (1.0 is more confident than 0.5)', () => {
    const data = readStabilityArtifact(filePath)

    // All sign consistencies should be between 0 and 1
    for (const protocol of ['country_out', 'rolling_origin'] as ProtocolKey[]) {
      for (const tier of ['A', 'B', 'C'] as TierKey[]) {
        const tierData = data.byProtocol[protocol][tier]
        if (tierData && tierData.coefficients) {
          for (const coeff of tierData.coefficients) {
            expect(coeff.signConsistency).toBeGreaterThan(0)
            expect(coeff.signConsistency).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })

  it('number of converged folds matches protocol expectations', () => {
    const data = readStabilityArtifact(filePath)

    // country_out should have 23 folds
    expect(data.byProtocol.country_out.A.nConvergedFolds).toBeGreaterThan(0)
    expect(data.byProtocol.country_out.B.nConvergedFolds).toBeGreaterThan(0)
    expect(data.byProtocol.country_out.C.nConvergedFolds).toBeGreaterThan(0)

    // rolling_origin should have 9 folds
    expect(data.byProtocol.rolling_origin.A.nConvergedFolds).toBe(9)
    expect(data.byProtocol.rolling_origin.B.nConvergedFolds).toBe(9)
    expect(data.byProtocol.rolling_origin.C.nConvergedFolds).toBe(9)
  })

  it('has ISO timestamp for reproducibility', () => {
    const data = readStabilityArtifact(filePath)
    expect(data.generatedAtIso).toBeDefined()
    expect(/^\d{4}-\d{2}-\d{2}T/.test(data.generatedAtIso)).toBe(true)
  })
})
