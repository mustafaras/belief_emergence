// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BeliefProgress from '../src/components/metrics/BeliefProgress'
import { CoefficientProvenancePanel } from '../src/components/sections/CoefficientProvenancePanel'
import ConstructAudit from '../src/components/audit/ConstructAudit'
import SupportPicture from '../src/components/support/SupportPicture'
import LimitsSection from '../src/components/limits/LimitsSection'
import EvidenceIndex from '../src/components/evidence/EvidenceIndex'
import CorrelationMatrixPanel from '../src/components/sections/CorrelationMatrixPanel'
import ContributionPanel from '../src/components/contributions/ContributionPanel'
import CountriesZValuesPanel from '../src/components/visualization/CountriesZValuesPanel'
import NotationGlossarySection from '../src/components/sections/NotationGlossarySection'
import { validPanelAuditFixture } from './fixtures/supportAuditFixture'

const mocks = vi.hoisted(() => ({
  useDataContext: vi.fn(),
}))

vi.mock('../src/contexts/DataContext', () => ({
  useDataContext: mocks.useDataContext,
}))

vi.mock('../src/data/analysis/wvs_construct_audit.json', () => ({
  default: {
    schemaVersion: 'test.construct-audit.v1',
    respondentsScanned: 442026,
    countryYears: 305,
    constructs: {
      Z_belief_outcome: {
        label: 'Belief outcome',
        itemsConfigured: 6,
        itemsUsed: ['A006', 'F028', 'F050', 'F051', 'F053', 'F063'],
        cellsEmitted: 287,
        cellsRejected: 18,
        computable: true,
        cronbachAlpha: 0.8187,
        unidimensional: true,
      },
      S_social_support: {
        label: 'Social support',
        itemsConfigured: 7,
        itemsUsed: [],
        cellsEmitted: 0,
        cellsRejected: 305,
        // Missing `computable` models a field lost from the audit artifact.
        cronbachAlpha: 0.753,
        unidimensional: true,
      },
    },
  },
}))

vi.mock('../src/data/analysis/construct_item_availability.json', () => ({
  default: { constructs: {} },
}))

// Generated facts are optional at runtime: absent fields must leave em dashes, not crash the index.
vi.mock('../src/data/generated/artifactFacts.json', () => ({ default: {} }))

// This fixture intentionally omits model_variables while retaining a numeric hyperparameter.
vi.mock('../src/data/analysis/notation_glossary.json', () => ({
  default: {
    greek_letters: [],
    hyperparameters: [{ symbol: 'k', name: 'Steepness', role: 'Curve steepness', values: [1, 4] }],
    regime_definitions: [],
  },
}))

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react')
  const motion = new Proxy({}, {
    get: (_target, tag: string) => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
      const motionProps = new Set(['initial', 'animate', 'transition', 'exit'])
      const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !motionProps.has(key)))
      return ReactModule.createElement(tag, { ...domProps, ref })
    }),
  })
  return { motion, useAnimation: () => ({ start: vi.fn() }) }
})

const createPanelRow = (overrides: Record<string, unknown> = {}) => ({
  iso3: 'FRA',
  country_name: 'France',
  year: 2020,
  Z: 0.6,
  X: 0.5,
  Y: 0.4,
  C: null,
  M: 0.2,
  T: -0.1,
  D: null,
  G: null,
  E: 0.3,
  S: null,
  R: 0.1,
  ...overrides,
})

function stubFetch(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  }))
}

describe('numeric component behavior', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    mocks.useDataContext.mockReturnValue({
      activeCoeffSource: 'builtin',
      estimatedCoeffMeta: null,
      estimatedCoeffSet: null,
      coeffError: null,
      loadEstimatedCoefficients: vi.fn(),
      setBuiltinCoefficients: vi.fn(),
      panelData: null,
      loading: false,
      error: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders a valid belief metric and labels its progress value', () => {
    render(<BeliefProgress value={0.63} />)
    expect(screen.getByRole('progressbar', { name: 'Belief emergence at 63 percent' })).toBeTruthy()
    expect(screen.getByText('0.630')).toBeTruthy()
  })

  it('shows an unavailable state when the belief metric is missing', () => {
    render(<BeliefProgress value={undefined} />)
    expect(screen.getByRole('status', { name: 'Belief emergence unavailable' })).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByText('LOW')).toBeNull()
    expect(document.body.textContent).not.toContain('NaN')
  })

  it('renders the active coefficient provenance from a valid context', () => {
    render(<CoefficientProvenancePanel />)
    expect(screen.getByText('Built-in (Fixed)')).toBeTruthy()
    expect(screen.getByText(/parameters/)).toBeTruthy()
  })

  it('keeps the coefficient panel usable when estimated metadata and values are missing', () => {
    mocks.useDataContext.mockReturnValue({
      activeCoeffSource: 'estimated',
      estimatedCoeffMeta: undefined,
      estimatedCoeffSet: undefined,
      coeffError: null,
      loadEstimatedCoefficients: vi.fn(),
      setBuiltinCoefficients: vi.fn(),
    })
    render(<CoefficientProvenancePanel />)
    expect(screen.getByText('Estimated')).toBeTruthy()
    expect(screen.queryByText('Estimation Details')).toBeNull()
    expect(document.body.textContent).not.toContain('NaN')
  })

  it('renders computed and uncomputable construct rows from the audit fixture', () => {
    render(<ConstructAudit />)
    expect(screen.getByText('0.819')).toBeTruthy()
    const socialSupport = document.querySelector('[data-construct="S_social_support"]')
    expect(socialSupport?.getAttribute('data-verdict')).toBe('uncomputable')
    expect(socialSupport?.textContent).toContain('not computable')
    expect(socialSupport?.textContent).not.toContain('0.753')
  })

  it('renders panel attrition values from a valid audit artifact', async () => {
    stubFetch(validPanelAuditFixture)
    render(<SupportPicture />)
    await waitFor(() => expect(screen.getAllByText('207').length).toBeGreaterThan(0))
    expect(screen.getByText(/442,026 respondents aggregate/)).toBeTruthy()
    expect(screen.getByText('Y')).toBeTruthy()
    expect(document.querySelector('[data-reconciles="true"]')).toBeTruthy()
  })

  it('withholds support figures when the audit is missing its required row count', async () => {
    const missingRows: Record<string, unknown> = { ...validPanelAuditFixture }
    delete missingRows.rows
    stubFetch(missingRows)
    render(<SupportPicture />)
    await waitFor(() => expect(screen.getByText(/audit is incomplete/)).toBeTruthy())
    expect(document.body.textContent).not.toContain('207')
  })

  it('renders sourced limits for a valid panel row count', async () => {
    stubFetch(validPanelAuditFixture)
    render(<LimitsSection />)
    await waitFor(() => expect(document.querySelector('[data-limit="lockbox"]')).toBeTruthy())
    expect(screen.getByText('What this model cannot show')).toBeTruthy()
  })

  it('reports unavailable limits when the audit is missing its row count', async () => {
    const missingRows: Record<string, unknown> = { ...validPanelAuditFixture }
    delete missingRows.rows
    stubFetch(missingRows)
    render(<LimitsSection />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('unavailable'))
    expect(screen.queryByText('Loading the panel audit…')).toBeNull()
    expect(document.querySelectorAll('[data-limit]')).toHaveLength(0)
  })

  it('renders evidence rows when generated artifact facts are missing', () => {
    render(<EvidenceIndex />)
    expect(screen.getByRole('heading', { name: 'Evidence index' })).toBeTruthy()
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders numeric correlations for complete panel rows', () => {
    const rowA = createPanelRow({ year: 2020 })
    const rowB = createPanelRow({ year: 2021, X: 0.7, Y: 0.8, Z: 0.7, M: 0.4, T: 0.1, E: 0.5, R: 0.3 })
    render(<CorrelationMatrixPanel panelData={[rowA, rowB] as never} />)
    fireEvent.click(screen.getByLabelText('Show values'))
    expect(screen.getByRole('img', { name: 'Correlation matrix heatmap' })).toBeTruthy()
    expect(screen.getAllByText('1.00').length).toBeGreaterThan(0)
    expect(screen.getByText('Panel rows: 2')).toBeTruthy()
  })

  it('excludes a correlation row with a missing numeric field and shows em dashes', () => {
    const incomplete = createPanelRow({ Z: undefined })
    render(<CorrelationMatrixPanel panelData={[incomplete] as never} />)
    fireEvent.click(screen.getByLabelText('Show values'))
    expect(screen.getByText('Panel rows: 1')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders contribution totals and terms for valid model output', () => {
    render(<ContributionPanel totalPhi={0.125} terms={[{ key: 'linear.C', label: 'Cultural intensity', value: 0.25 }]} />)
    expect(screen.getByText('0.1250')).toBeTruthy()
    expect(screen.getByText('0.2500')).toBeTruthy()
  })

  it('shows an unavailable total and empty state when contribution fields are missing', () => {
    render(<ContributionPanel totalPhi={undefined} terms={undefined} />)
    expect(screen.getByLabelText('Total Φ unavailable')).toBeTruthy()
    expect(screen.getByText('No contribution data available.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('NaN')
  })

  it('renders country measurements from a complete panel row', () => {
    mocks.useDataContext.mockReturnValue({ panelData: [createPanelRow()], loading: false, error: null })
    render(<CountriesZValuesPanel selectedCountryName="France" currentModelZ={0.55} />)
    expect(screen.getByText('France (FRA)')).toBeTruthy()
    expect(screen.getByText('2020–2020 • n=1')).toBeTruthy()
    expect(screen.getByText(/Measured Z/)).toBeTruthy()
  })

  it('withholds country metrics when a panel row is missing its outcome', () => {
    mocks.useDataContext.mockReturnValue({ panelData: [createPanelRow({ Z: undefined })], loading: false, error: null })
    render(<CountriesZValuesPanel selectedCountryName="France" />)
    expect(screen.getByText('No measured Z rows for France')).toBeTruthy()
    expect(screen.queryByLabelText('Panel measured vs model')).toBeNull()
  })

  it('renders numeric glossary values when optional artifact sections are absent', () => {
    render(<NotationGlossarySection />)
    expect(screen.getByRole('heading', { name: 'Notation Glossary' })).toBeTruthy()
    expect(screen.getByText('Steepness')).toBeTruthy()
    expect(screen.getByText('[1, 4]')).toBeTruthy()
  })
})
