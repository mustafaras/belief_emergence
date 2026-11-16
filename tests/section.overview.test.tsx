// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AppShell from '../src/app/AppShell'

describe('Overview section', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/?v=overview')
    delete document.documentElement.dataset.theme
  })

  it('shows the sourced findings, keeps the P22 gate claim pending, and links to the relevant route', async () => {
    window.history.replaceState(null, '', '/?v=overview')
    const { container } = render(<AppShell />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Measurement Validity Before Model Geometry' })).toBeTruthy()
    expect(screen.getByText('A Reproducible Audit of Bounded Response Models')).toBeTruthy()
    expect(screen.getByText(/A retrospective audit of a published bounded country-panel framework/)).toBeTruthy()
    expect(container.querySelector('[data-claim-id="audit.failedCount"]')).toBeTruthy()
    expect(container.querySelector('[data-claim-id="audit.constructCount"]')).toBeTruthy()
    expect(container.querySelector('[data-claim-id="eval.bounded.kfold"]')).toBeTruthy()
    expect(container.querySelector('[data-claim-id="eval.linear.kfold"]')).toBeTruthy()
    expect(container.querySelector('[data-claim-id="limits.profile.bonferroniUpper"]')).toBeTruthy()
    expect(screen.getByRole('status', { name: /P22/ })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByRole('status', { name: 'Withdrawn' })).toHaveLength(2)
    expect(screen.getByRole('status', { name: 'Neutral' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Unidentified' })).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: /Construct audit/ }))
    await screen.findByRole('heading', { level: 1, name: 'Construct Audit' })
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('v')).toBe('audit'))
  })
})
