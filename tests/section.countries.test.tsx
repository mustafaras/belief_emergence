// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import CountriesSection from '../src/sections/countries'
import { InspectorProvider } from '../src/claims/ClaimInspector'
import { selectCountries } from '../src/claims/selectors/countries'

const renderCountries = () => render(<InspectorProvider><CountriesSection /></InspectorProvider>)

describe('Countries section', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/belief_emergence/')
  })

  it('lists every country once, with no withdrawn-channel column', () => {
    const { container } = renderCountries()
    const rows = container.querySelectorAll('tr[data-country]')
    expect(rows.length).toBe(selectCountries().length)
    // C, D and S have no estimate, so they must not appear as columns either.
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent ?? '')
    for (const withdrawn of ['C', 'D', 'S']) {
      expect(headers.some((header) => header.trim() === withdrawn)).toBe(false)
    }
  })

  it('filters by search term and writes q to the URL', () => {
    renderCountries()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'est' } })
    // "est" matches Estonia and Palestine, by name substring on both.
    expect(Number(screen.getByTestId('country-count').textContent)).toBeLessThan(selectCountries().length)
    expect(window.location.search).toContain('q=est')
  })

  it('filters by verdict', () => {
    renderCountries()
    const poor = selectCountries().filter((country) => country.verdict === 'poor').length
    fireEvent.click(screen.getByRole('radio', { name: 'Poor' }))
    expect(Number(screen.getByTestId('country-count').textContent)).toBe(poor)
  })

  it('opens a country drawer and records the ISO code in the URL', async () => {
    renderCountries()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'EST' } })
    const trigger = await screen.findByRole('button', { name: /Estonia/ })
    fireEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(window.location.search).toContain('iso=EST')
  })

  it('shows per-year observed and predicted values in the drawer', async () => {
    renderCountries()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'EST' } })
    fireEvent.click(await screen.findByRole('button', { name: /Estonia/ }))
    const dialog = await screen.findByRole('dialog')
    // Two survey years for Estonia, and both lines must be present as data.
    expect(dialog.textContent).toContain('1996')
    expect(dialog.textContent).toContain('2011')
    expect(dialog.textContent).toContain('Observed')
    expect(dialog.textContent).toContain('Predicted')
  })

  it('says a wide residual is a fit difference, not a failed fold', async () => {
    renderCountries()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'EST' } })
    fireEvent.click(await screen.findByRole('button', { name: /Estonia/ }))
    const dialog = await screen.findByRole('dialog')
    // The prompt asked for a "failure log note" for EST/RUS/SVK; the failure log records zero
    // nonconverged folds, so the drawer must not imply otherwise.
    expect(dialog.textContent).toMatch(/zero\s+nonconverged folds/i)
    expect(dialog.textContent).toMatch(/fit difference rather than an estimation failure/i)
  })

  it('links to the Geometry Lab with the ISO code', async () => {
    renderCountries()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'EST' } })
    fireEvent.click(await screen.findByRole('button', { name: /Estonia/ }))
    const link = await screen.findByRole('link', { name: /Open in Geometry Lab/ })
    expect(link.getAttribute('href')).toContain('v=geometry')
    expect(link.getAttribute('href')).toContain('iso=EST')
  })
})
