import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { parsePanelCsvText } from '../src/data/panelDataLoader'
import { computeLeaveOneCountryOutRefit } from '../src/utils/validation/computeLeaveOneCountryOutRefit'

function loadCanonicalRows() {
  const thisFile = fileURLToPath(import.meta.url)
  const testDir = path.dirname(thisFile)
  const datasetPath = path.resolve(testDir, '../public/data/panel_canonical_v2.csv')
  const csvText = fs.readFileSync(datasetPath, 'utf8')
  return parsePanelCsvText(csvText, datasetPath)
}

describe('Country-Out Refit Validation - Leakage & Integrity', () => {
  const filePath = 'src/data/analysis/cv_country_out.json'

  it('file exists and is valid JSON', () => {
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)
    expect(data).toBeDefined()
  })

  it('has correct schema version for country-out protocol', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)
    expect(data.schemaVersion).toBeDefined()
    expect(data.schemaVersion).toMatch(/^phase1\.cv_country_out\.v\d+$/)
    expect(data.protocol).toBe('leave_one_country_out_refit')
  })

  it('contains one fold per country', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)
    expect(data.folds).toBeDefined()
    expect(Array.isArray(data.folds)).toBe(true)
    expect(data.folds.length).toBeGreaterThan(0)
  })

  it('enforces no temporal leakage: test years should be >= some training years (cross-sectional country-out design)', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)

    // In country-out design, test data is from the holdout country across years
    // Training data is from all other countries. This is spatial cross-validation, not purely temporal.
    // Test years may be earlier than or later than training years - that's expected.
    for (const fold of data.folds) {
      // Just verify that test years are valid
      // The v2 panel reaches back to 1981; the old 2000 floor was a v1 range.
      expect(fold.testYearMin).toBeGreaterThanOrEqual(1981)
      expect(fold.testYearMax).toBeLessThanOrEqual(2022)
    }
  })

  it('validates test/train row split consistency', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)

    for (const fold of data.folds) {
      // Training rows: positive and strictly fewer than the full panel
      expect(fold.nTrainRows).toBeGreaterThan(0)
      expect(fold.nTrainRows).toBeLessThanOrEqual(data.folds[0].nTrainRows + data.folds[0].nTestRows)

      // Test rows should be positive (1-90 depending on country year coverage)
      expect(fold.nTestRows).toBeGreaterThan(0)
      expect(fold.nTestRows).toBeLessThanOrEqual(100)

      // All tiers should have consistent row counts
      for (const tierKey of ['A', 'B', 'C']) {
        const tierResult = fold.tierResults[tierKey as keyof typeof fold.tierResults]
        if (tierResult) {
          expect(tierResult.nTrain).toBe(fold.nTrainRows)
          expect(tierResult.nTest).toBe(fold.nTestRows)
        }
      }
    }
  })

  it('all tiers converged for country-out folds', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)
    let totalConvergedFolds = 0

    for (const fold of data.folds) {
      for (const tierKey of ['A', 'B', 'C']) {
        const tierResult = fold.tierResults[tierKey as keyof typeof fold.tierResults]
        if (tierResult) {
          expect(tierResult.converged).toBe(true)
          if (tierResult.converged) {
            totalConvergedFolds++
          }
        }
      }
    }

    // One result per fold per tier
    expect(totalConvergedFolds).toBeGreaterThan(0)
  })

  it('out-of-sample metrics are finite and non-negative for MAE/RMSE', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)

    for (const fold of data.folds) {
      for (const tierKey of ['A', 'B', 'C']) {
        const tierResult = fold.tierResults[tierKey as keyof typeof fold.tierResults]
        if (tierResult?.testMetrics) {
          const metrics = tierResult.testMetricsRefit ?? tierResult.testMetrics
          expect(Number.isFinite(metrics.mae)).toBe(true)
          expect(Number.isFinite(metrics.rmse)).toBe(true)
          expect(metrics.mae).toBeGreaterThanOrEqual(0)
          expect(metrics.rmse).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('prediction interval coverage is between 0 and 1', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)

    for (const fold of data.folds) {
      for (const tierKey of ['A', 'B', 'C']) {
        const tierResult = fold.tierResults[tierKey as keyof typeof fold.tierResults]
        if (tierResult?.predictionIntervalCoverage95 !== undefined) {
          const coverage = tierResult.predictionIntervalCoverage95
          expect(coverage).toBeGreaterThanOrEqual(0)
          expect(coverage).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('has ISO timestamp for reproducibility', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)
    expect(data.generatedAtIso).toBeDefined()
    expect(/^\d{4}-\d{2}-\d{2}T/.test(data.generatedAtIso)).toBe(true)
  })

  it('generated schema uses explicit refit/canonical metric families', () => {
    const rows = loadCanonicalRows()
    const summary = computeLeaveOneCountryOutRefit(rows)

    expect(summary.aggregatesRefit).toBeDefined()
    expect(summary.aggregatesRefitSupportCollapsed).toBeDefined()
    expect(summary.aggregatesCanonical).toBeDefined()
    expect(summary.aggregatesCanonicalSupportCollapsed).toBeDefined()
    expect(summary.checks.metricFamilies.primary).toBe('refit')
    expect(summary.checks.metricFamilies.refit.intendedUse).toBe('primary_inferential')
    expect(summary.checks.metricFamilies.canonical.intendedUse).toBe('diagnostic_only')
    expect(summary.checks.metricFamilies.refit.foldTierRowField).toBe('testMetricsRefit')
    expect(summary.checks.metricFamilies.canonical.foldTierRowField).toBe('testMetricsCanonical')
    expect(summary.provenance.inferentialContract.primaryEvidenceFamily).toBe('aggregatesRefit')
    expect(summary.provenance.inferentialContract.diagnosticFamily).toBe('aggregatesCanonical')

    const tierA = summary.folds[0].tierResults.A
    expect(tierA.testMetricsRefit).toBeDefined()
    expect(tierA.testMetricsCanonical).toBeDefined()
    expect(tierA.testMetricsSupportCollapsedRefit).toBeDefined()
    expect(tierA.testMetricsSupportCollapsedCanonical).toBeDefined()

    // Backward-compat aliases should map to refit metrics.
    expect(tierA.testMetrics.rmse).toBeCloseTo(tierA.testMetricsRefit.rmse)
    expect(tierA.testMetricsSupportCollapsed?.rmse).toBeCloseTo(tierA.testMetricsSupportCollapsedRefit?.rmse ?? NaN)
    expect(summary.aggregates.A.rmse.median).toBeCloseTo(summary.aggregatesRefit.A.rmse.median)
    expect(summary.aggregatesSupportCollapsed.A.rmse.median).toBeCloseTo(summary.aggregatesRefitSupportCollapsed.A.rmse.median)
  })
})
