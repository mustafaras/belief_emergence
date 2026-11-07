import fs from 'node:fs'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'

import {
  AUTHORITATIVE_CSV_PATH,
  AUTHORITATIVE_JSON_PATH,
  generateAuthoritativeAnalysis,
} from '../scripts/generate_authoritative_analysis'
import { BIAS_DEFINITION_PHRASE } from '../src/utils/metrics'
import { STRUCTURAL_MAX, STRUCTURAL_MIN } from '../src/utils/modelContract'

describe('authoritative observed-vs-predicted generator', () => {
  it('produces canonical outputs and reasonable metrics', async () => {
    const metrics = await generateAuthoritativeAnalysis()

    expect(fs.existsSync(AUTHORITATIVE_CSV_PATH)).toBe(true)
    expect(fs.existsSync(AUTHORITATIVE_JSON_PATH)).toBe(true)
    expect(metrics.n).toBeGreaterThan(0)
    expect(metrics.bias_definition).toContain(BIAS_DEFINITION_PHRASE)

    // Headline ranges (wide tolerances to avoid brittleness while catching regressions)
    expect(metrics.r2).toBeGreaterThan(0.5)
    expect(metrics.r2).toBeLessThan(0.99)
    expect(metrics.corr).toBeGreaterThan(0.5)
    expect(metrics.mae).toBeGreaterThan(0.05)
    expect(metrics.mae).toBeLessThan(0.25)
    expect(metrics.rmse).toBeGreaterThan(0.05)
    expect(metrics.rmse).toBeLessThan(0.3)
    expect(metrics.bias).toBeGreaterThan(-0.1)
    expect(metrics.bias).toBeLessThan(0.1)

    const csv = fs.readFileSync(AUTHORITATIVE_CSV_PATH, 'utf8')
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
    const rows = parsed.data
    expect(rows.length).toBe(metrics.n)

    for (const row of rows.slice(0, Math.min(10, rows.length))) {
      const obs = Number(row.observed_Z)
      const pred = Number(row.predicted_Z)
      expect(Number.isFinite(obs)).toBe(true)
      expect(Number.isFinite(pred)).toBe(true)
      expect(obs).toBeGreaterThanOrEqual(STRUCTURAL_MIN)
      expect(obs).toBeLessThanOrEqual(STRUCTURAL_MAX)
      expect(pred).toBeGreaterThanOrEqual(STRUCTURAL_MIN)
      expect(pred).toBeLessThanOrEqual(STRUCTURAL_MAX)
    }
  })
})
