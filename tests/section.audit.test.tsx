// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AuditSection from '../src/sections/audit'
import { constructRows, PAPER_RELIABILITY_FLOOR } from '../src/claims/selectors/audit'

describe('Construct Audit section', () => {
  afterEach(() => cleanup())

  it('renders one row per construct, with attributes a verifier can address', () => {
    const { container } = render(<AuditSection />)
    const rows = container.querySelectorAll('.construct-audit-table tbody tr')
    expect(rows.length).toBe(constructRows.length)
    for (const row of constructRows) {
      expect(container.querySelector(`tr[data-construct="${row.id}"]`)).toBeTruthy()
    }
  })

  it('never prints the leftover alpha for the uncomputable construct', () => {
    // S_social_support carries cronbachAlpha 0.753 beside cellsEmitted 0. Printing it
    // would show a reliability figure above the 0.70 floor for a construct with no
    // observations — the opposite of what this section claims.
    const { container } = render(<AuditSection />)
    const s = container.querySelector('tr[data-construct="S_social_support"]')
    expect(s?.textContent).toContain('not computable')
    expect(s?.textContent).not.toContain('0.75')
    expect(container.textContent).not.toMatch(/0\.753/)
  })

  it('reconciles the eight proposed channels with the four audited constructs', () => {
    const { container } = render(<AuditSection />)
    const scope = container.querySelector('.construct-audit-scope')?.textContent ?? ''
    // A reader comparing 3/4 with the manuscript's three-of-eight needs both counts and
    // the reason the other four are absent.
    expect(scope).toMatch(/Eight/)
    expect(scope).toMatch(/four/)
    expect(scope).toMatch(/not estimated/)
  })

  it('recomputes the admitted count as the floor moves, and never admits a withheld alpha', () => {
    render(<AuditSection />)
    const slider = screen.getByRole('slider')
    const count = () => screen.getByTestId('admitted-count').textContent

    expect(count()).toBe('1')

    // Lowest floor: C's 0.35 now clears it, so two constructs are admitted.
    fireEvent.change(slider, { target: { value: '0.30' } })
    expect(count()).toBe('2')

    // Highest floor: nothing clears 0.90.
    fireEvent.change(slider, { target: { value: '0.90' } })
    expect(count()).toBe('0')

    // Back to the paper's floor.
    fireEvent.change(slider, { target: { value: String(PAPER_RELIABILITY_FLOOR) } })
    expect(count()).toBe('1')
  })

  it('states that Figure 2.2 was skipped rather than fabricated', () => {
    const { container } = render(<AuditSection />)
    expect(container.textContent).toMatch(/not shown/i)
  })
})
