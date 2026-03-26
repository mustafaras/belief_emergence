import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PanelRowCanonical } from '../src/types/panel'
import type { ModelTier, RefitMetrics, TierEvaluationResult } from '../src/utils/validation/fitModelTier'

type PanelPredictOptions = { ablation?: 'main' | 'main+int' | 'full' }

function metrics(value: number, n: number): RefitMetrics {
  return {
    n,
    r2: value,
    corr: value,
    mae: value,
    rmse: value,
    bias: value,
  }
}

function refitMetricsForTier(tier: ModelTier, n: number): RefitMetrics {
  if (tier === 'A') return metrics(0.11, n)
  if (tier === 'B') return metrics(0.22, n)
  return metrics(0.33, n)
}

function makeRows(): PanelRowCanonical[] {
  const countries = ['AAA', 'BBB']
  const years = [2000, 2001, 2002]
  const rows: PanelRowCanonical[] = []

  for (const country of countries) {
    for (const year of years) {
      rows.push({
        iso3: country,
        country_name: `Country ${country}`,
        year,
        Z: 0.2 + (year - 2000) * 0.05,
        X: 25,
        Y: 40,
        C: 2.5,
        M: 0.1,
        T: 0.2,
        D: 0.3,
        G: 0.4,
        E: 0.5,
        S: 0.6,
        R: 0.7,
      })
    }
  }

  return rows
}

function installMocks(): void {
  vi.doMock('../src/utils/validation/fitModelTier', () => ({
    fitAndEvaluateTier: (
      _trainRows: PanelRowCanonical[],
      testRows: PanelRowCanonical[],
      tier: ModelTier,
    ): TierEvaluationResult => ({
      tier,
      converged: true,
      nTrain: 999,
      nTest: testRows.length,
      nTestUniqueCountryYears: testRows.length,
      featureNames: [],
      intercept: 0,
      coefficients: [],
      trainMetrics: metrics(0.01, 999),
      testMetricsRefit: refitMetricsForTier(tier, testRows.length),
      testMetrics: refitMetricsForTier(tier, testRows.length),
      testMetricsSupportCollapsedRefit: refitMetricsForTier(tier, testRows.length),
      testMetricsSupportCollapsed: refitMetricsForTier(tier, testRows.length),
      lowVarianceObservedTest: false,
      predictionIntervalCoverage95: 0.95,
      residualStdTrain: 0.05,
    }),
  }))

  vi.doMock('../src/utils/validation/panelPredict', () => ({
    predictFromPanelRow: (row: PanelRowCanonical, options?: PanelPredictOptions) => {
      const offset = options?.ablation === 'main'
        ? 0.40
        : options?.ablation === 'main+int'
          ? 0.50
          : 0.60
      return {
        zObs: row.Z,
        zPred: row.Z + offset,
        inputs: {
          X: row.X,
          Y: row.Y,
          C: row.C,
          M: row.M,
          T: row.T,
          D: row.D,
          G: row.G,
          E: row.E,
          S: row.S,
          R: row.R,
          alpha: 0,
          beta: 0,
          k: 0,
        },
      }
    },
  }))
}

describe('CV refit metric integrity', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('leave-one-country-out keeps refit metrics primary and records canonical separately', async () => {
    installMocks()
    const rows = makeRows()

    const { computeLeaveOneCountryOutRefit } = await import('../src/utils/validation/computeLeaveOneCountryOutRefit')
    const summary = computeLeaveOneCountryOutRefit(rows, { minRows: 1 })

    const tierA = summary.folds[0]?.tierResults.A
    expect(tierA).toBeDefined()
    expect(tierA.testMetricsRefit.rmse).toBeCloseTo(0.11)
    expect(tierA.testMetrics.rmse).toBeCloseTo(0.11)
    expect(tierA.testMetricsCanonical?.rmse).toBeGreaterThan(0.35)
    expect(tierA.testMetricsCanonical?.rmse).not.toBeCloseTo(tierA.testMetrics.rmse)
    expect(summary.aggregatesRefit.A.rmse.median).toBeCloseTo(0.11)
    expect(summary.aggregates.A.rmse.median).toBeCloseTo(0.11)
  })

  it('rolling-origin keeps refit metrics primary and records canonical separately', async () => {
    installMocks()
    const rows = makeRows()

    const { computeRollingOriginRefit } = await import('../src/utils/validation/computeRollingOriginRefit')
    const summary = computeRollingOriginRefit(rows, { minTrainYears: 1, minRows: 1 })

    const tierB = summary.folds[0]?.tierResults.B
    expect(tierB).toBeDefined()
    expect(tierB.testMetricsRefit.rmse).toBeCloseTo(0.22)
    expect(tierB.testMetrics.rmse).toBeCloseTo(0.22)
    expect(tierB.testMetricsCanonical?.rmse).toBeGreaterThan(0.45)
    expect(tierB.testMetricsCanonical?.rmse).not.toBeCloseTo(tierB.testMetrics.rmse)
    expect(summary.aggregatesRefit.B.rmse.median).toBeCloseTo(0.22)
    expect(summary.aggregates.B.rmse.median).toBeCloseTo(0.22)
  })
})
