// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '../src/app/AppShell'

describe('Command Palette', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
    delete document.documentElement.dataset.theme
  })

  it('opens with Ctrl+K, searches a claim, navigates to its section, and opens its inspector', async () => {
    window.history.replaceState(null, '', '/?artifact=preset_country_alignment.json')
    render(<AppShell />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    const input = within(dialog).getByRole('textbox', { name: 'Search routes, claims, and artifacts' })
    fireEvent.change(input, { target: { value: 'eval.bounded.kfold' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByRole('dialog', { name: 'Claim inspector' })).toBeTruthy()
    expect(new URL(window.location.href).searchParams.get('v')).toBe('evaluation')
    expect(new URL(window.location.href).searchParams.has('artifact')).toBe(false)
  })

  it('opens an artifact in the reproducibility route', async () => {
    render(<AppShell />)
    fireEvent.click(screen.getByRole('button', { name: 'Search ⌘K' }))
    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    const input = within(dialog).getByRole('textbox', { name: 'Search routes, claims, and artifacts' })
    fireEvent.change(input, { target: { value: 'preset_country_alignment' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /preset_country_alignment/ }))

    expect(new URL(window.location.href).searchParams.get('v')).toBe('reproduce')
    expect(new URL(window.location.href).searchParams.get('artifact')).toBe('preset_country_alignment.json')
  })
})
