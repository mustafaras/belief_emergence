// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DataTable, Drawer, Num, Popover, Slider } from '../src/ui'

describe('UI kit part two', () => {
  it('supports slider arrow, page, and boundary keys', () => {
    const onChange = vi.fn()
    function ControlledSlider() {
      const [value, setValue] = useState(0.3)
      return <Slider label="Reliability" min={0} max={1} step={0.1} value={value} onChange={next => { onChange(next); setValue(next) }} />
    }
    render(<ControlledSlider />)
    const slider = screen.getByRole('slider', { name: 'Reliability' })

    expect(slider.getAttribute('aria-valuetext')).toBe('0.3')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(0.4)
    fireEvent.keyDown(slider, { key: 'PageUp' })
    expect(onChange).toHaveBeenLastCalledWith(0.5)
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('sorts DataTable rows and reports the active sort state', () => {
    const { container } = render(
      <DataTable
        caption="Country support"
        columns={[{ key: 'country', header: 'Country', sortable: true }, { key: 'rows', header: 'Rows', align: 'right', sortable: true }]}
        rows={[{ country: 'Türkiye', rows: 8 }, { country: 'Canada', rows: 12 }]}
      />
    )
    const table = screen.getByRole('table', { name: 'Country support' })
    const countryHeader = within(table).getByRole('columnheader', { name: 'Country' })
    fireEvent.click(within(countryHeader).getByRole('button'))
    expect(countryHeader.getAttribute('aria-sort')).toBe('ascending')
    expect([...container.querySelectorAll('tbody tr')].map(row => row.textContent)).toEqual([
      'Canada12',
      'Türkiye8'
    ])
    fireEvent.click(within(countryHeader).getByRole('button'))
    expect(countryHeader.getAttribute('aria-sort')).toBe('descending')
  })

  it('renders a formatted registry value from Num', () => {
    render(<Num id="audit.respondents" />)
    const value = screen.getByText('442,026')
    expect(value.getAttribute('data-claim-id')).toBe('audit.respondents')
    expect(value.getAttribute('title')).toContain('wvs_construct_audit.json')
  })

  it('closes Drawer on Escape and restores focus to its trigger', () => {
    render(<Drawer trigger="Open filters" title="Filters"><button type="button">Apply</button></Drawer>)
    const trigger = screen.getByRole('button', { name: 'Open filters' })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(document.activeElement?.textContent).toContain('Close')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('traps focus and restores it when Popover closes', () => {
    render(
      <Popover trigger="Open details" label="Details">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Popover>
    )
    const trigger = screen.getByRole('button', { name: 'Open details' })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Details' })
    const buttons = within(dialog).getAllByRole('button')
    expect(document.activeElement).toBe(buttons[0])
    buttons[buttons.length - 1].focus()
    fireEvent.keyDown(buttons[buttons.length - 1], { key: 'Tab' })
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
  })
})
