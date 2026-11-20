// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '../src/app/AppShell'
import { DataProvider } from '../src/contexts/DataContext'

const emptyPanelStats = JSON.stringify({
  totalRows: 0,
  countryCounts: {},
  yearRange: [0, 0],
  zDistribution: { mean: 0, std: 0, min: 0, max: 0 },
  coverageByCountry: {},
  structuralStats: { meanX: 0, stdX: 0, meanY: 0, stdY: 0, n: 0, source: 'test fixture', method: 'sample' },
  warnings: [],
})

function renderAppShell() {
  return render(<DataProvider><AppShell /></DataProvider>)
}

describe('AppShell', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'belief-panel-data-v3' ? '[]' : key === 'belief-panel-stats-v3' ? emptyPanelStats : null,
      setItem: () => {},
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
    delete document.documentElement.dataset.theme
  })

  it('renders eleven contents links and marks the current route', async () => {
    window.history.replaceState(null, '', '/?v=audit')
    renderAppShell()

    const contents = screen.getByRole('navigation', { name: 'Contents' })
    expect(within(contents).getAllByRole('link')).toHaveLength(11)
    expect(within(contents).getByRole('link', { name: /Construct Audit/ }).getAttribute('aria-current')).toBe('page')
    expect(await screen.findByRole('heading', { level: 1, name: 'Construct Audit' })).toBeTruthy()

    fireEvent.click(within(contents).getByRole('link', { name: /Data & Support/ }))
    await screen.findByRole('heading', { level: 1, name: 'Data & Support' })
    await waitFor(() => expect(within(contents).getByRole('link', { name: /Data & Support/ }).getAttribute('aria-current')).toBe('page'))
    expect(new URL(window.location.href).searchParams.get('v')).toBe('data')
  })

  it('canonicalizes legacy URLs to their current route', async () => {
    window.history.replaceState(null, '', '/?v=presets')
    renderAppShell()
    expect(await screen.findByRole('heading', { level: 1, name: 'Countries' })).toBeTruthy()
    expect(new URL(window.location.href).searchParams.get('v')).toBe('countries')
  })
})
