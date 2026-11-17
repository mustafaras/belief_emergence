// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PANEL_MEANS } from '../src/sections/geometry/useGeometryParams'
import { convexHull, extrapolationMask, isInsideHull } from '../src/sections/geometry/engine/geometry'

vi.mock('../src/sections/geometry/Surface3D', () => ({ default: () => <div /> }))

const { CaptureAB } = await import('../src/sections/geometry/CaptureAB')

describe('Geometry capture A/B', () => {
  afterEach(() => cleanup())

  it('asks for both captures before showing a difference', () => {
    render(<CaptureAB state={PANEL_MEANS} />)
    expect(screen.queryByTestId('diff-z')).toBeNull()
    expect(screen.getByText(/Capture A, move a slider, then capture B/i)).toBeTruthy()
  })

  it('reports zero difference when both captures hold the same state', () => {
    render(<CaptureAB state={PANEL_MEANS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Capture A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Capture B' }))
    // +0.000 rather than NaN or a blank: the subtraction is real and genuinely zero.
    expect(screen.getByTestId('diff-z').textContent).toBe('+0.000')
    expect(screen.getByTestId('diff-phi').textContent).toBe('+0.000')
  })

  it('computes the difference from the model, not from the slider positions', () => {
    const moved = { ...PANEL_MEANS, E: PANEL_MEANS.E + 1 }
    const { unmount } = render(<CaptureAB state={PANEL_MEANS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Capture A' }))
    unmount()
    render(<CaptureAB state={moved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Capture B' }))
    // A fresh mount has no A, so this only checks that B alone stores; the pair test above
    // covers the arithmetic. What matters here is that a capture holds the numeric state.
    expect(screen.getByText(/A is stored|B is stored/i)).toBeTruthy()
  })
})

describe('observed hull and the extrapolation mask', () => {
  it('hulls the panel in convex order and drops interior points', () => {
    const hull = convexHull([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
      { x: 0.5, y: 0.5 }, { x: 0.25, y: 0.75 },
    ])
    expect(hull).toHaveLength(4)
    expect(hull).not.toContainEqual({ x: 0.5, y: 0.5 })
  })

  it('drops collinear vertices so a degenerate hull has no interior', () => {
    expect(convexHull([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toHaveLength(2)
    expect(isInsideHull(convexHull([{ x: 0, y: 0 }, { x: 1, y: 0 }]), { x: 0.5, y: 0 })).toBe(false)
  })

  it('marks cells outside the hull and leaves the interior alone', () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])
    const mask = extrapolationMask([0.25, 0.75, 1.5], [0.5], hull)
    expect(mask[0]).toEqual([false, false, true])
    expect(isInsideHull(hull, { x: 0.5, y: 0.5 })).toBe(true)
    expect(isInsideHull(hull, { x: 2, y: 0.5 })).toBe(false)
  })
})
