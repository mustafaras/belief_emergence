import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { parsePanelCsvText } from '../src/data/panelDataLoader'
import { computeLeaveOneCountryOutRefit } from '../src/utils/validation/computeLeaveOneCountryOutRefit'
import { computeRollingOriginRefit } from '../src/utils/validation/computeRollingOriginRefit'
import { computeLockboxHoldoutSummary } from '../src/utils/validation/computeLockboxHoldoutSummary'
import { buildPaperExports } from '../src/utils/validation/paperExports'

function loadCanonicalRows() {
  const thisFile = fileURLToPath(import.meta.url)
  const testDir = path.dirname(thisFile)
  const datasetPath = path.resolve(testDir, '../public/data/panel_canonical_23_countries_v1.csv')
  const csvText = fs.readFileSync(datasetPath, 'utf8')
  return parsePanelCsvText(csvText, datasetPath)
}

describe('Paper Exports Schema Validation - Provenance & Traceability', () => {
  const artifactDir = 'src/data/analysis'
  const requiredArtifacts = [
    'model_ladder_metrics.json',
    'cv_country_out.json',
    'cv_rolling_origin.json',
    'parameter_stability.json',
    'prediction_interval_coverage.json',
    'model_complexity_support.json',
    'failure_log.json',
    'construct_validity_invariance.json',
    'lockbox_holdout.json',
    'metrics_authoritative.json',
  ]

  it('all required phase 1 artifacts exist', () => {
    for (const artifact of requiredArtifacts) {
      const path = `${artifactDir}/${artifact}`
      expect(fs.existsSync(path)).toBe(true)
    }
  })

  it('all artifacts are valid JSON with no parse errors', () => {
    for (const artifact of requiredArtifacts) {
      const path = `${artifactDir}/${artifact}`
      const content = fs.readFileSync(path, 'utf8')
      expect(() => JSON.parse(content)).not.toThrow()
    }
  })

  it('all validation artifacts have schemaVersion or timestamp field (provenance)', () => {
    for (const artifact of requiredArtifacts) {
      const path = `${artifactDir}/${artifact}`
      const content = fs.readFileSync(path, 'utf8')
      const data = JSON.parse(content)
      // Most should have schemaVersion; metrics_authoritative.json has timestamp instead
      expect(data.schemaVersion || data.timestamp).toBeDefined()
    }
  })

  it('all validation artifacts have ISO timestamp (generatedAtIso or timestamp)', () => {
    for (const artifact of requiredArtifacts) {
      const path = `${artifactDir}/${artifact}`
      const content = fs.readFileSync(path, 'utf8')
      const data = JSON.parse(content)
      const timestamp = data.generatedAtIso || data.timestamp
      expect(timestamp).toBeDefined()
      expect(/^\d{4}-\d{2}-\d{2}T/.test(String(timestamp))).toBe(true)
    }
  })

  it('schema versions follow consistent naming pattern (phase1.*.*) when present', () => {
    for (const artifact of requiredArtifacts) {
      const path = `${artifactDir}/${artifact}`
      const content = fs.readFileSync(path, 'utf8')
      const data = JSON.parse(content)
      if (data.schemaVersion) {
        expect(/^phase1\.[a-z_]+\.v\d+$/.test(data.schemaVersion)).toBe(true)
      }
    }
  })

  it('model_ladder_metrics has proper tier structure', () => {
    const path = `${artifactDir}/model_ladder_metrics.json`
    const content = fs.readFileSync(path, 'utf8')
    const data = JSON.parse(content)

    expect(Array.isArray(data.tiers)).toBe(true)
    expect(data.tiers.length).toBeGreaterThan(0)

    for (const tier of data.tiers) {
      expect(['A', 'B', 'C']).toContain(tier.tier)
      expect(tier.trainMetrics).toBeDefined()
      expect(tier.parameterCount).toBeGreaterThan(0)
    }
  })

  it('cv_country_out has fold structure with tierResults', () => {
    const path = `${artifactDir}/cv_country_out.json`
    const content = fs.readFileSync(path, 'utf8')
    const data = JSON.parse(content)

    expect(Array.isArray(data.folds)).toBe(true)
    expect(data.folds.length).toBeGreaterThan(0)

    for (const fold of data.folds) {
      expect(fold.foldId).toBeDefined()
      expect(fold.tierResults).toBeDefined()
      expect(fold.tierResults.A).toBeDefined()
    }
  })

  it('cv_rolling_origin has rolling window structure', () => {
    const path = `${artifactDir}/cv_rolling_origin.json`
    const content = fs.readFileSync(path, 'utf8')
    const data = JSON.parse(content)

    expect(data.protocol).toBe('rolling_origin_refit')
    expect(Array.isArray(data.folds)).toBe(true)
    expect(data.folds.length).toBe(9)

    for (const fold of data.folds) {
      expect(fold.trainYearMax).toBeLessThan(fold.testYear)
    }
  })

  it('generated CV summaries expose explicit metric-family schema fields', () => {
    const rows = loadCanonicalRows()
    const countryOut = computeLeaveOneCountryOutRefit(rows)
    const rollingOrigin = computeRollingOriginRefit(rows)

    expect(countryOut.aggregatesRefit).toBeDefined()
    expect(countryOut.aggregatesCanonical).toBeDefined()
    expect(countryOut.checks.metricFamilies.primary).toBe('refit')
    expect(countryOut.checks.metricFamilies.refit.intendedUse).toBe('primary_inferential')
    expect(countryOut.checks.metricFamilies.canonical.intendedUse).toBe('diagnostic_only')
    expect(countryOut.checks.metricFamilies.refit.foldTierRowField).toBe('testMetricsRefit')
    expect(countryOut.checks.metricFamilies.canonical.foldTierRowField).toBe('testMetricsCanonical')
    expect(countryOut.provenance.inferentialContract.primaryEvidenceFamily).toBe('aggregatesRefit')
    expect(countryOut.provenance.inferentialContract.diagnosticFamily).toBe('aggregatesCanonical')

    expect(rollingOrigin.aggregatesRefit).toBeDefined()
    expect(rollingOrigin.aggregatesCanonical).toBeDefined()
    expect(rollingOrigin.checks.metricFamilies.primary).toBe('refit')
    expect(rollingOrigin.checks.metricFamilies.refit.intendedUse).toBe('primary_inferential')
    expect(rollingOrigin.checks.metricFamilies.canonical.intendedUse).toBe('diagnostic_only')
    expect(rollingOrigin.checks.metricFamilies.refit.aggregateRowField).toBe('aggregatesRefit')
    expect(rollingOrigin.checks.metricFamilies.canonical.aggregateRowField).toBe('aggregatesCanonical')
    expect(rollingOrigin.provenance.inferentialContract.primaryEvidenceFamily).toBe('aggregatesRefit')
    expect(rollingOrigin.provenance.inferentialContract.diagnosticFamily).toBe('aggregatesCanonical')
  })

  it('paper exports provenance carries machine-checkable CV metric semantics', () => {
    const rows = loadCanonicalRows()
    const countryOut = computeLeaveOneCountryOutRefit(rows)
    const rollingOrigin = computeRollingOriginRefit(rows)
    const lockbox = computeLockboxHoldoutSummary(rows, countryOut, rollingOrigin, {
      releaseCycleId: 'test-cycle',
    })

    const exports = buildPaperExports([], {
      precomputed: {},
      phase1Refit: {
        cvCountryOut: countryOut,
        cvRollingOrigin: rollingOrigin,
        lockboxHoldout: lockbox,
      },
    })

    expect(exports.provenance.metricSemantics.cvMetricFamilies.primaryFamily).toBe('refit')
    expect(exports.provenance.metricSemantics.cvMetricFamilies.refit.foldRowMetricField).toBe('testMetricsRefit')
    expect(exports.provenance.metricSemantics.cvMetricFamilies.canonical.foldRowMetricField).toBe('testMetricsCanonical')
    expect(exports.provenance.metricSemantics.inferentialContract.primaryEvidence.family).toBe('refit_oos')
    expect(exports.provenance.metricSemantics.inferentialContract.primaryEvidence.tableKeys).toContain('lockboxHoldout')
    expect(exports.provenance.metricSemantics.inferentialContract.primaryEvidence.metricFields).toContain('lockboxEvaluation.byTier.*.testMetricsRefit')
    expect(exports.provenance.metricSemantics.inferentialContract.descriptiveDiagnostics.family).toBe('fixed_or_active_coefficient_set')
    expect(exports.provenance.notes.some((note) => note.includes('Phase 1 refit OOS evidence attached'))).toBe(true)
    expect(exports.provenance.notes.some((note) => note.includes('Lockbox holdout artifact attached'))).toBe(true)
    expect(exports.tables.lockboxHoldout).toBeDefined()
  })

  it('parameter_stability has byProtocol structure', () => {
    const path = `${artifactDir}/parameter_stability.json`
    const content = fs.readFileSync(path, 'utf8')
    const data = JSON.parse(content)

    expect(data.byProtocol).toBeDefined()
    expect(data.byProtocol.country_out).toBeDefined()
    expect(data.byProtocol.rolling_origin).toBeDefined()
    expect(data.thresholdSignConsistency).toBeGreaterThan(0)
  })

  it('prediction_interval_coverage exists and has proper structure', () => {
    const path = `${artifactDir}/prediction_interval_coverage.json`
    const content = fs.readFileSync(path, 'utf8')
    const data = JSON.parse(content)

    expect(data.schemaVersion).toBe('phase1.prediction_interval_coverage.v2')
    expect(data.generatedAtIso).toBeDefined()
    expect(data.nominalCoverage).toBe(0.95)
    expect(data.severeUnderCoverageThreshold).toBe(0.8)
    expect(data.intervalMethods.primary).toBe('empirical_quantile_shifted')
    expect(data.intervalMethods.comparator).toBe('gaussian_symmetric_train_residual_std')
    expect(data.byProtocol.country_out.A.meanCoverage95).toBeTypeOf('number')
    expect(data.byProtocolGaussian.rolling_origin.C.meanCoverage95).toBeTypeOf('number')
    expect(data.methodComparisonByTier.B.deltaMeanCoverage95).toBeTypeOf('number')
    expect(data.assumptionAudit.byProtocol.country_out.A.lowVarianceFoldRate).toBeTypeOf('number')
    expect(data.assumptionAudit.supportRegimeCoveragePrimary.rolling_origin.B.thin_support.nFolds).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(data.limitations)).toBe(true)
    expect(data.limitations.length).toBeGreaterThan(0)
  })

  it('model_complexity_support exists and documents support density', () => {
    const path = `${artifactDir}/model_complexity_support.json`
    const content = fs.readFileSync(path, 'utf8')
    const data = JSON.parse(content)

    expect(data.schemaVersion).toBeDefined()
    expect(data.generatedAtIso).toBeDefined()
    expect(data.supportMask?.nUniqueCountryYears).toBeGreaterThan(0)
    expect(data.supportConstrainedInference?.effectiveSupportUnits).toBeGreaterThan(0)
    expect(data.supportConstrainedInference?.tierDiscipline?.primary).toEqual(['A', 'B'])
    expect(data.supportConstrainedInference?.tierDiscipline?.exploratory).toEqual(['C'])
    expect(Array.isArray(data.interpretationBoundary?.guardrails)).toBe(true)
    expect(data.interpretationBoundary?.guardrails?.length).toBeGreaterThan(0)
    expect(data.interpretationBoundary?.guardrails?.some((g: string) => /causal/i.test(g))).toBe(true)
    expect(Array.isArray(data.complexityByTier)).toBe(true)
    expect(data.complexityByTier.find((row: { tier: string }) => row.tier === 'C')?.inferentialRole).toBe('exploratory')
  })

  it('failure_log exists and documents convergence status', () => {
    const path = `${artifactDir}/failure_log.json`
    const content = fs.readFileSync(path, 'utf8')
    const data = JSON.parse(content)

    expect(data.schemaVersion).toBeDefined()
    expect(data.generatedAtIso).toBeDefined()
    expect(Array.isArray(data.entries)).toBe(true)
  })

  it('construct_validity_invariance exists and has prompt-8 diagnostics structure', () => {
    const path = `${artifactDir}/construct_validity_invariance.json`
    const content = fs.readFileSync(path, 'utf8')
    const data = JSON.parse(content)

    expect(data.schemaVersion).toBe('phase1.construct_validity_invariance.v1')
    expect(data.generatedAtIso).toBeDefined()
    expect(data.source).toBeDefined()
    expect(data.source.nRows).toBeGreaterThan(0)
    expect(data.thresholds.configuredMinItemCoverage).toBeGreaterThan(0)
    expect(Array.isArray(data.constructs)).toBe(true)
    expect(data.constructs.length).toBeGreaterThan(0)
    const zConstruct = data.constructs.find((c: { construct: string }) => c.construct === 'Z')
    expect(zConstruct).toBeDefined()
    expect(zConstruct.alternativeAggregation.canonicalVsAltMean.n).toBeGreaterThan(0)
    expect(zConstruct.invariance.byCountry).toBeDefined()
    expect(Array.isArray(data.limitations)).toBe(true)
    expect(data.limitations.length).toBeGreaterThan(0)
  })

  it('lockbox_holdout exists and has prompt-9 protocol structure', () => {
    const path = `${artifactDir}/lockbox_holdout.json`
    const content = fs.readFileSync(path, 'utf8')
    const data = JSON.parse(content)

    expect(data.schemaVersion).toBe('phase1.lockbox_holdout.v1')
    expect(data.generatedAtIso).toBeDefined()
    expect(data.release.cycleId).toBeTypeOf('string')
    expect(data.release.rerunPolicy).toBe('single_compute_per_cycle')
    expect(data.splitPolicy.policyVersion).toBe('lockbox.country_year_hash.v1')
    expect(data.splitPolicy.nLockboxCells).toBeGreaterThan(0)
    expect(data.splitPolicy.nDevCells).toBeGreaterThan(0)
    expect(Array.isArray(data.splitPolicy.lockboxCells)).toBe(true)
    expect(data.checks.overlapPass).toBe(true)
    expect(data.checks.lockboxSizePass).toBe(true)
    expect(data.checks.releaseCycleGuardPass).toBe(true)
    expect(Array.isArray(data.checks.protocolViolationFlags)).toBe(true)
    expect(data.checks.protocolViolationFlags.length).toBe(0)
    expect(data.lockboxEvaluation.byTier.A.testMetricsRefit.rmse).toBeTypeOf('number')
    expect(data.lockboxEvaluation.comparisonVsDevelopmentByTier.B.rmseMinusCountryOutMedian).toBeTypeOf('number')
    expect(Array.isArray(data.limitations)).toBe(true)
    expect(data.limitations.length).toBeGreaterThan(0)
  })

  it('metrics_authoritative exists with headline metrics', () => {
    const path = `${artifactDir}/metrics_authoritative.json`
    const content = fs.readFileSync(path, 'utf8')
    const data = JSON.parse(content)

    // Should have basic metrics
    expect(data.n).toBeGreaterThan(0)
    expect(['r2', 'corr', 'mae', 'rmse', 'bias'].some((k) => k in data)).toBe(true)
  })

  it('all schemas are reproducibly datable (timestamps are valid)', () => {
    const paths = requiredArtifacts.map((a) => `${artifactDir}/${a}`)
    for (const p of paths) {
      const content = fs.readFileSync(p, 'utf8')
      const data = JSON.parse(content)
      const timestamp = data.generatedAtIso || data.timestamp
      if (timestamp) {
        const ts = new Date(String(timestamp)).getTime()
        // Timestamp should be valid and not NaN
        expect(Number.isFinite(ts)).toBe(true)
      }
    }
  })
})
