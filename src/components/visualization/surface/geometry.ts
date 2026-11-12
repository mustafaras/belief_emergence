/**
 * Surface geometry: pure functions that turn a parameter set into a grid and a grid into
 * plot traces.
 *
 * Extracted from `Surface3DSurface.tsx` under Prompt 9, which asked for geometry first
 * because it contains no React and is therefore the part that can actually be tested.
 * The bodies are moved verbatim — same names, same constants, same arithmetic — and the
 * component imports them back, so its props and rendered output are unchanged. Verified by
 * a pixel-identical screenshot before and after, not by reading the diff.
 */

export type SurfacePayload = {
  xVals: number[]
  yVals: number[]
  zGrid: Array<Array<number | null>>
  currentZ: number | null
  computedAt: number
  nx: number
  ny: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function linspace(min: number, max: number, n: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(n) || n <= 1) {
    return [min, max]
  }
  const step = (max - min) / (n - 1)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i += 1) out[i] = min + step * i
  return out
}

const monotonicAscendingCache = new WeakMap<number[], boolean>()

export function isMonotonicAscending(values: number[]): boolean {
  const cached = monotonicAscendingCache.get(values)
  if (cached != null) return cached

  let ok = true
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < values[i - 1]) {
      ok = false
      break
    }
  }
  monotonicAscendingCache.set(values, ok)
  return ok
}

export function nearestIndex(values: number[], target: number): number {
  if (!values.length) return -1

  if (!isMonotonicAscending(values)) {
    let bestIdx = 0
    let bestDist = Math.abs(target - values[0])
    for (let i = 1; i < values.length; i += 1) {
      const d = Math.abs(target - values[i])
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    return bestIdx
  }

  let lo = 0
  let hi = values.length - 1

  if (target <= values[lo]) return lo
  if (target >= values[hi]) return hi

  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    const mv = values[mid]
    if (target === mv) return mid
    if (target < mv) hi = mid
    else lo = mid
  }

  const a = values[lo]
  const b = values[hi]
  return Math.abs(target - a) <= Math.abs(target - b) ? lo : hi
}

export function round4(value: number): string {
  if (!Number.isFinite(value)) return 'NaN'
  const snapped = Math.round(value * 10_000) / 10_000
  return snapped.toFixed(4)
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

// Coerce a value to a finite number. Accepts numbers or numeric strings.
// Returns null for non-finite or non-numeric inputs.
export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export type Polyline3 = {
  xs: Array<number | null>
  ys: Array<number | null>
  zs: Array<number | null>
}

export function makePolylineFromGridXSlice(surface: SurfacePayload, ix: number): Polyline3 {
  if (!surface.xVals.length || !surface.yVals.length) return { xs: [], ys: [], zs: [] }
  if (ix < 0 || ix >= surface.xVals.length) return { xs: [], ys: [], zs: [] }

  const x0 = surface.xVals[ix]
  const xs: Array<number | null> = []
  const ys: Array<number | null> = []
  const zs: Array<number | null> = []

  for (let j = 0; j < surface.yVals.length; j += 1) {
    const y = surface.yVals[j]
    const z0 = surface.zGrid?.[j]?.[ix]

    if (isFiniteNumber(z0)) {
      xs.push(x0)
      ys.push(y)
      zs.push(z0)
    } else {
      // Important: insert null triplets to break the line segment.
      xs.push(null)
      ys.push(null)
      zs.push(null)
    }
  }

  return { xs, ys, zs }
}

export function makePolylineFromGridYSlice(surface: SurfacePayload, iy: number): Polyline3 {
  if (!surface.xVals.length || !surface.yVals.length) return { xs: [], ys: [], zs: [] }
  if (iy < 0 || iy >= surface.yVals.length) return { xs: [], ys: [], zs: [] }

  const y0 = surface.yVals[iy]
  const xs: Array<number | null> = []
  const ys: Array<number | null> = []
  const zs: Array<number | null> = []

  for (let i = 0; i < surface.xVals.length; i += 1) {
    const x = surface.xVals[i]
    const z0 = surface.zGrid?.[iy]?.[i]

    if (isFiniteNumber(z0)) {
      xs.push(x)
      ys.push(y0)
      zs.push(z0)
    } else {
      xs.push(null)
      ys.push(null)
      zs.push(null)
    }
  }

  return { xs, ys, zs }
}
