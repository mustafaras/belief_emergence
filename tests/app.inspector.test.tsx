// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InspectorProvider } from '../src/claims/ClaimInspector'
import { Num } from '../src/ui/Num'

describe('Claim Inspector', () => {
  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('opens from a number and shows its artifact provenance', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<InspectorProvider><Num id="eval.headline.mae" /></InspectorProvider>)

    const value = screen.getByRole('button', { name: /Headline mean absolute error/ })
    fireEvent.click(value)
    const dialog = await screen.findByRole('dialog', { name: 'Claim inspector' })
    expect(within(dialog).getByText('Headline mean absolute error')).toBeTruthy()
    expect(dialog.textContent).toContain('metrics_authoritative.json')
    expect(dialog.textContent).toContain('mae')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy artifact filename' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('metrics_authoritative.json'))
    expect(within(dialog).getByRole('button', { name: 'Copy artifact filename' }).textContent).toBe('Copied')

    const artifactLink = within(dialog).getByRole('link', { name: 'Open artifact' })
    const target = new URL(artifactLink.getAttribute('href') ?? '', window.location.href)
    expect(target.searchParams.get('v')).toBe('reproduce')
    expect(target.searchParams.get('artifact')).toBe('metrics_authoritative.json')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close popover' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Claim inspector' })).toBeNull())
    expect(document.activeElement).toBe(value)
  })
})
