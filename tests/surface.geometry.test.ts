import { describe, expect, it } from 'vitest'
import {
  clamp,
  isFiniteNumber,
  isMonotonicAscending,
  linspace,
  makePolylineFromGridXSlice,
  makePolylineFromGridYSlice,
  nearestIndex,
  round4,
  toFiniteNumber,
  type SurfacePayload,
} from '../src/components/visualization/surface/geometry'
import {
  DEFAULT_CAMERA,
  DOC_L_MAX,
  DOC_L_MIN,
  DOC_PHI_MAX,
  DOC_PHI_MIN,
  FRONT_CAMERA,
  ISO_CAMERA,
  TOP_CAMERA,
  logit,
} from '../src/components/visualization/surface/camera'

/**
 * The geometry extracted from `Surface3DSurface.tsx` under Prompt 9.
 *
 * Prompt 9's instruction was "move code; do not rewrite it. If a function is untestable
 * after the move, that is a finding — report it rather than working around it." These
 * functions turned out to be testable, which is why they were extracted first: they are
 * pure, they take a surface payload and return arrays, and every one of them can be
 * pinned without a browser.
 */
const surface = (zGrid: Array<Array<number | null>>, xVals = [1, 2, 3], yVals = [10, 20]): SurfacePayload => ({
  xVals,
  yVals,
  zGrid,
  currentZ: null,
  computedAt: 0,
  nx: xVals.length,
  ny: yVals.length,
})

describe('linspace', () => {
  it('spans the interval inclusively', () => {
    expect(linspace(0, 1, 3)).toEqual([0, 0.5, 1])
  })

  it('returns the endpoints when n is too small to interpolate', () => {
    // Degenerate input must not produce an empty array: the grid would vanish.
    expect(linspace(0, 1, 1)).toEqual([0, 1])
    expect(linspace(5, 5, 1)).toEqual([5, 5])
  })

  it('rejects non-finite input rather than emitting NaN cells', () => {
    expect(linspace(Number.NaN, 1, 3)).toEqual([Number.NaN, 1])
    expect(linspace(0, Number.POSITIVE_INFINITY, 3)).toEqual([0, Number.POSITIVE_INFINITY])
  })
})

describe('nearestIndex', () => {
  it('finds the closest entry in an ascending array', () => {
    expect(nearestIndex([1, 2, 3, 4], 2.6)).toBe(2)
    expect(nearestIndex([1, 2, 3, 4], 1.2)).toBe(0)
  })

  it('breaks an exact tie toward the lower index', () => {
    // 3.5 is equidistant from 3 and 4; the implementation compares with <= and therefore
    // keeps `lo`. Pinned because a change here moves which grid cell a click snaps to.
    expect(nearestIndex([1, 2, 3, 4], 3.5)).toBe(2)
    expect(nearestIndex([1, 2, 3, 4], 2.5)).toBe(1)
  })

  it('clamps outside the range', () => {
    expect(nearestIndex([1, 2, 3], -5)).toBe(0)
    expect(nearestIndex([1, 2, 3], 99)).toBe(3 - 1)
  })

  it('handles a descending array, which the binary search would otherwise mis-read', () => {
    expect(nearestIndex([4, 3, 2, 1], 2.6)).toBe(1)
  })

  it('returns -1 for an empty array', () => {
    expect(nearestIndex([], 1)).toBe(-1)
  })

  it('caches monotonicity without changing the answer', () => {
    // isMonotonicAscending memoises on the array identity; a cached true must not leak
    // across arrays.
    const ascending = [1, 2, 3]
    const descending = [3, 2, 1]
    expect(isMonotonicAscending(ascending)).toBe(true)
    expect(isMonotonicAscending(descending)).toBe(false)
    expect(isMonotonicAscending(ascending)).toBe(true)
  })
})

describe('makePolylineFromGridXSlice', () => {
  it('walks the y axis at a fixed x', () => {
    const s = surface([[1, 2, 3], [4, 5, 6]])
    const line = makePolylineFromGridXSlice(s, 1)
    expect(line.xs).toEqual([2, 2])
    expect(line.ys).toEqual([10, 20])
    expect(line.zs).toEqual([2, 5])
  })

  it('inserts a null triplet to break the line at a missing cell', () => {
    // A gap must break the segment; interpolating across it would draw a line through
    // values the model never produced.
    const s = surface([[1, null, 3], [4, null, 6]])
    const line = makePolylineFromGridXSlice(s, 1)
    expect(line.xs).toEqual([null, null])
    expect(line.ys).toEqual([null, null])
    expect(line.zs).toEqual([null, null])
  })

  it('returns empty for an out-of-range index', () => {
    const s = surface([[1, 2, 3]])
    expect(makePolylineFromGridXSlice(s, -1)).toEqual({ xs: [], ys: [], zs: [] })
    expect(makePolylineFromGridXSlice(s, 99)).toEqual({ xs: [], ys: [], zs: [] })
  })
})

describe('makePolylineFromGridYSlice', () => {
  it('walks the x axis at a fixed y', () => {
    const s = surface([[1, 2, 3], [4, 5, 6]])
    const line = makePolylineFromGridYSlice(s, 0)
    expect(line.xs).toEqual([1, 2, 3])
    expect(line.ys).toEqual([10, 10, 10])
    expect(line.zs).toEqual([1, 2, 3])
  })

  it('breaks at a missing cell', () => {
    const s = surface([[1, null, 3]])
    const line = makePolylineFromGridYSlice(s, 0)
    expect(line.zs).toEqual([1, null, 3])
  })
})

describe('numeric helpers', () => {
  it('clamps to the interval', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('formats to four places, and says NaN rather than throwing', () => {
    expect(round4(0.123456)).toBe('0.1235')
    expect(round4(Number.NaN)).toBe('NaN')
    // A cache key built from this must not collide across NaN and 0.
    expect(round4(Number.POSITIVE_INFINITY)).toBe('NaN')
  })

  it('narrows finite numbers', () => {
    expect(isFiniteNumber(1)).toBe(true)
    expect(isFiniteNumber(Number.NaN)).toBe(false)
    expect(isFiniteNumber('1')).toBe(false)
    expect(isFiniteNumber(null)).toBe(false)
  })

  it('coerces numeric strings and rejects everything else', () => {
    expect(toFiniteNumber('1.5')).toBe(1.5)
    expect(toFiniteNumber(2)).toBe(2)
    expect(toFiniteNumber('abc')).toBeNull()
    expect(toFiniteNumber(null)).toBeNull()
    expect(toFiniteNumber(Number.NaN)).toBeNull()
  })
})

describe('camera presets', () => {
  it('are distinct viewpoints', () => {
    const eyes = [DEFAULT_CAMERA, ISO_CAMERA, TOP_CAMERA, FRONT_CAMERA].map(
      (c) => `${c.eye?.x},${c.eye?.y},${c.eye?.z}`,
    )
    expect(new Set(eyes).size).toBe(4)
  })

  it('all look at the origin', () => {
    for (const camera of [DEFAULT_CAMERA, ISO_CAMERA, TOP_CAMERA, FRONT_CAMERA]) {
      expect(camera.center).toEqual({ x: 0, y: 0, z: 0 })
    }
  })

  it('keeps the top view orthogonal, which is what makes it a top view', () => {
    // A top-down camera with the default up vector is degenerate; this pins the choice.
    expect(TOP_CAMERA.up).toEqual({ x: 0, y: 1, z: 0 })
    expect(TOP_CAMERA.eye?.z).toBeGreaterThan(TOP_CAMERA.eye?.x ?? 0)
  })

  it('pins the exact preset values, because a change moves the rendered surface', () => {
    expect(DEFAULT_CAMERA).toEqual({
      eye: { x: 1.6, y: 1.6, z: 1.15 },
      up: { x: 0, y: 0, z: 1 },
      center: { x: 0, y: 0, z: 0 },
    })
    expect(ISO_CAMERA.eye).toEqual({ x: 1.9, y: 1.35, z: 1.2 })
    expect(FRONT_CAMERA.eye).toEqual({ x: 0, y: 2.6, z: 0.45 })
  })
})

describe('documentation bounds and logit', () => {
  it('spans a symmetric phi range', () => {
    expect(DOC_PHI_MIN).toBe(-6)
    expect(DOC_PHI_MAX).toBe(6)
    expect(DOC_PHI_MIN).toBe(-DOC_PHI_MAX)
  })

  it('spans a symmetric log-ratio range', () => {
    expect(DOC_L_MIN).toBe(-3)
    expect(DOC_L_MAX).toBe(3)
  })

  it('inverts the logistic at known points', () => {
    expect(logit(0.5)).toBeCloseTo(0, 12)
    expect(logit(0.75)).toBeCloseTo(Math.log(3), 12)
  })
})
