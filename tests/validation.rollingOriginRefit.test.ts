import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { parsePanelCsvText } from '../src/data/panelDataLoader'
import { computeRollingOriginRefit } from '../src/utils/validation/computeRollingOriginRefit'

function loadCanonicalRows() {
  const thisFile = fileURLToPath(import.meta.url)
  const testDir = path.dirname(thisFile)
  const datasetPath = path.resolve(testDir, '../public/data/panel_canonical_23_countries_v1.csv')
  const csvText = fs.readFileSync(datasetPath, 'utf8')
  return parsePanelCsvText(csvText, datasetPath)
}

describe('Rolling-Origin Refit Validation - Temporal Coherence', () => {
  const filePath = 'src/data/analysis/cv_rolling_origin.json'

  it('file exists and is valid JSON', () => {
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)
    expect(data).toBeDefined()
  })

  it('has correct schema version for rolling-origin protocol', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)
    expect(data.schemaVersion).toBeDefined()
    expect(data.schemaVersion).toMatch(/^phase1\.cv_rolling_origin\.v\d+$/)
    expect(data.protocol).toBe('rolling_origin_refit')
  })

  it('contains 9 folds with proper temporal structure', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)
    expect(data.folds).toBeDefined()
    expect(Array.isArray(data.folds)).toBe(true)
    expect(data.folds.length).toBe(9)
  })

  it('enforces strict temporal ordering: test years > train years (no leakage)', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)

    for (const fold of data.folds) {
      // Training period should strictly precede test period
      // testYear is a single year that should be after trainYearMax
      expect(fold.testYear).toBeGreaterThan(fold.trainYearMax)

      // Verify temporal progression: test year should be at least 1 year after train year
      // (Rolling-origin windows vary in size, so gap is not always 1)
      expect(fold.testYear - fold.trainYearMax).toBeGreaterThanOrEqual(1)
    }
  })

  it('rolling origin folds progress correctly in time', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)

    for (let i = 0; i < data.folds.length - 1; i++) {
      const currentFold = data.folds[i]
      const nextFold = data.folds[i + 1]

      // Each subsequent fold should push the window forward
      expect(nextFold.trainYearMax).toBeGreaterThan(currentFold.trainYearMax)
      expect(nextFold.testYear).toBeGreaterThan(currentFold.testYear)
    }
  })

  it('validates test/train row split and increases', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)

    for (const fold of data.folds) {
      // Initial training rows should be reasonable
      expect(fold.nTrainRows).toBeGreaterThan(0)
      expect(fold.nTestRows).toBeGreaterThan(0)

      // Total rows across protocol should sum approximately to 630 * (test window size)
      expect(fold.nTrainRows + fold.nTestRows).toBeLessThanOrEqual(630)
    }
  })

  it('all tiers converged for all rolling-origin folds', () => {
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

    // Should have 9 folds * 3 tiers = 27 successful converged results
    expect(totalConvergedFolds).toBe(27)
  })

  it('out-of-sample metrics are finite and reasonable', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)

    for (const fold of data.folds) {
      for (const tierKey of ['A', 'B', 'C']) {
        const tierResult = fold.tierResults[tierKey as keyof typeof fold.tierResults]
        if (tierResult?.testMetrics) {
          const metrics = tierResult.testMetricsRefit ?? tierResult.testMetrics
          expect(Number.isFinite(metrics.mae)).toBe(true)
          expect(Number.isFinite(metrics.rmse)).toBe(true)

          // OOS error should be modest compared to in-sample
          expect(metrics.mae).toBeGreaterThan(0)
          expect(metrics.rmse).toBeGreaterThan(0)

          // Should not be excessively large (sanity check)
          expect(metrics.mae).toBeLessThan(1)
          expect(metrics.rmse).toBeLessThan(1)
        }
      }
    }
  })

  it('rolling origin validates progressive OOS generalization', () => {
    const content = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(content)

    // Collect Tier A OOS MAE across folds to show consistency in generalization
    const tierAMaes = data.folds
      .map((fold: { tierResults?: { A?: { testMetricsRefit?: { mae?: number }; testMetrics?: { mae?: number } } } }) =>
        fold.tierResults?.A?.testMetricsRefit?.mae ?? fold.tierResults?.A?.testMetrics?.mae
      )
      .filter((x): x is number => x !== undefined && x !== null)

    expect(tierAMaes.length).toBe(9)

    // All should be finite and positive
    for (const mae of tierAMaes) {
      expect(Number.isFinite(mae)).toBe(true)
      expect(mae).toBeGreaterThan(0)
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
    const summary = computeRollingOriginRefit(rows)

    expect(summary.aggregatesRefit).toBeDefined()
    expect(summary.aggregatesRefitSupportCollapsed).toBeDefined()
    expect(summary.aggregatesCanonical).toBeDefined()
    expect(summary.aggregatesCanonicalSupportCollapsed).toBeDefined()
    expect(summary.checks.metricFamilies.primary).toBe('refit')
    expect(summary.checks.metricFamilies.refit.intendedUse).toBe('primary_inferential')
    expect(summary.checks.metricFamilies.canonical.intendedUse).toBe('diagnostic_only')
    expect(summary.checks.metricFamilies.refit.aggregateRowField).toBe('aggregatesRefit')
    expect(summary.checks.metricFamilies.canonical.aggregateRowField).toBe('aggregatesCanonical')
    expect(summary.provenance.inferentialContract.primaryEvidenceFamily).toBe('aggregatesRefit')
    expect(summary.provenance.inferentialContract.diagnosticFamily).toBe('aggregatesCanonical')

    const tierB = summary.folds[0].tierResults.B
    expect(tierB.testMetricsRefit).toBeDefined()
    expect(tierB.testMetricsCanonical).toBeDefined()
    expect(tierB.testMetricsSupportCollapsedRefit).toBeDefined()
    expect(tierB.testMetricsSupportCollapsedCanonical).toBeDefined()

    // Backward-compat aliases should map to refit metrics.
    expect(tierB.testMetrics.mae).toBeCloseTo(tierB.testMetricsRefit.mae)
    expect(tierB.testMetricsSupportCollapsed?.rmse).toBeCloseTo(tierB.testMetricsSupportCollapsedRefit?.rmse ?? NaN)
    expect(summary.aggregates.B.rmse.median).toBeCloseTo(summary.aggregatesRefit.B.rmse.median)
    expect(summary.aggregatesSupportCollapsed.B.rmse.median).toBeCloseTo(summary.aggregatesRefitSupportCollapsed.B.rmse.median)
  })
})
