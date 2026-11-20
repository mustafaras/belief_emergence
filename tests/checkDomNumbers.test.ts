import { describe, expect, it } from 'vitest'
import { auditText, buildSources, type RenderedConstructRow, type RenderedPresetRow } from '../scripts/check_dom_numbers'
import { resolveToken } from '../src/verification/numberResolution'

describe('rendered parameter number provenance', () => {
  const sources = buildSources()

  it('rejects a 0.001 drift even when an unrelated artifact value rounds to it', () => {
    // This collision is present in the real corpus: the generic artifact resolver accepts
    // 0.729 because other artifact values round there, while the UI's X default is 0.730.
    expect(resolveToken('0.729', sources.corpus, 'exact')).toEqual({ status: 'unresolved' })

    const correct = auditText('X → Settlement\n0.730', sources, 'mutation-test')
    expect(correct.unresolved).toEqual([])

    const mutated = auditText('X → Settlement\n0.729', sources, 'mutation-test')
    expect(mutated.unresolved).toContainEqual(
      expect.objectContaining({ token: '0.729' }),
    )
  })

  it('binds rounded headline and residual values to their labeled data sources', () => {
    const headline = auditText(
      'Production headline (canonical panel-fit): R² = 0.406 · r = 0.639 · MAE = 0.139 · RMSE = 0.180',
      sources,
      'documentation',
    )
    expect(headline.unresolved).toEqual([])

    const residuals = auditText('Residuals: mean 0.005 · SD 0.180', sources, 'documentation')
    expect(residuals.unresolved).toEqual([])

    const derivedCriticality = auditText('Criticality 62.4%', sources, 'documentation')
    expect(derivedCriticality.unresolved).toEqual([])

    const typesetNegative = auditText('−\n(\n0.085\n)\n−\n5.931\n−\n5.714', sources, 'documentation')
    expect(typesetNegative.unresolved).toEqual([])

    const runtime = auditText(
      'Production MAE = 0.139 · Runtime: R² 0.406 · r 0.639 · MAE 0.139 · RMSE 0.180 (N = 207)',
      sources,
      'documentation',
    )
    expect(runtime.unresolved).toEqual([])

    const shifted = auditText(
      'Production headline (canonical panel-fit): R² = 0.407 · r = 0.639 · MAE = 0.139 · RMSE = 0.180',
      sources,
      'documentation',
    )
    expect(shifted.unresolved).toContainEqual(expect.objectContaining({ token: '0.407' }))

    const shiftedRuntime = auditText(
      'Runtime: R² 0.406 · r 0.639 · MAE 0.139 · RMSE 0.179 (N = 207)',
      sources,
      'documentation',
    )
    expect(shiftedRuntime.unresolved).toContainEqual(expect.objectContaining({ token: '0.179' }))
  })

  it('resolves grouped respondent counts and calendar years derived for the support heatmap', () => {
    const report = auditText('442,026 respondents · support years 1992 and 2015', sources, 'data')
    expect(report.unresolved).toEqual([])
  })

  it('fails if a rounded construct alpha row or named preset row drifts', () => {
    const construct = sources.sourced.constructRows.find((row) => row.id === 'C_cultural_intensity')!
    const renderedConstruct: RenderedConstructRow = {
      id: construct.id,
      alpha: construct.alpha?.toFixed(3) ?? null,
      reason: construct.reason,
    }
    const goodConstruct = auditText(
      `${construct.label} ${renderedConstruct.alpha}`,
      sources,
      'overview',
      [],
      [renderedConstruct],
    )
    expect(goodConstruct.unresolved).toEqual([])

    const shiftedConstruct = auditText(
      `${construct.label} 0.349`,
      sources,
      'overview',
      [],
      [{ ...renderedConstruct, alpha: '0.349' }],
    )
    expect(shiftedConstruct.unresolved).toContainEqual(expect.objectContaining({ token: '<row>' }))

    const preset = sources.sourced.presetRows.find((row) => row.tokens.includes('-0.07'))!
    const renderedPreset: RenderedPresetRow = { name: preset.name, tokens: [...preset.tokens] }
    const goodPreset = auditText(`${preset.name} -0.07`, sources, 'countries', [renderedPreset])
    expect(goodPreset.unresolved).toEqual([])

    const shiftedPreset = auditText(`${preset.name} -0.08`, sources, 'countries', [
      { ...renderedPreset, tokens: renderedPreset.tokens.map((token) => token === '-0.07' ? '-0.08' : token) },
    ])
    expect(shiftedPreset.unresolved).toContainEqual(expect.objectContaining({ token: '<row>' }))
  })
})
