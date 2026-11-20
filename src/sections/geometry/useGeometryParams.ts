import { useCallback, useEffect, useState } from 'react'
import type { BeliefParameters } from '../../types'

/**
 * The lab's control state, mirrored into the query string.
 *
 * The geometry is the one view where a reader's exact position is the whole point: a surface
 * screenshot is worthless without the inputs that produced it, so every slider value travels
 * in the URL and a shared link reproduces the picture.
 */
export type GeometryState = {
  X: number
  Y: number
  M: number
  T: number
  E: number
  R: number
}

/** Slider bounds come from the canonical panel's realised range, not from a round number. */
export const CONTROL_RANGES: Record<keyof GeometryState, { min: number; max: number; step: number }> = {
  X: { min: 0.10345301530914319, max: 0.9544108940201302, step: 0.01 },
  Y: { min: -1.5584640000000003, max: 5.2158924, step: 0.05 },
  M: { min: -1.94, max: 1.94, step: 0.02 },
  T: { min: -1.49, max: 3.5, step: 0.02 },
  E: { min: -2.4, max: 2.4, step: 0.02 },
  R: { min: -2.6, max: 2.6, step: 0.02 },
}

/** Panel means, so "reset" returns to a row the data actually supports. */
export const PANEL_MEANS: GeometryState = {
  X: 0.62,
  Y: 1.35,
  M: 0.02,
  T: 0.01,
  E: 0.03,
  R: 0.02,
}

const KEYS = Object.keys(CONTROL_RANGES) as Array<keyof GeometryState>

const clampToRange = (key: keyof GeometryState, value: number): number => {
  const range = CONTROL_RANGES[key]
  return Math.min(range.max, Math.max(range.min, value))
}

function read(search: string): GeometryState {
  const params = new URLSearchParams(search)
  const next = { ...PANEL_MEANS }
  for (const key of KEYS) {
    const raw = params.get(key.toLowerCase())
    if (raw === null) continue
    const value = Number.parseFloat(raw)
    if (Number.isFinite(value)) next[key] = clampToRange(key, value)
  }
  return next
}

export function useGeometryParams(): [GeometryState, (next: GeometryState) => void, (key: keyof GeometryState, value: number) => void] {
  const [state, setState] = useState<GeometryState>(() => (
    typeof window === 'undefined' ? { ...PANEL_MEANS } : read(window.location.search)
  ))

  useEffect(() => {
    const onPop = () => setState(read(window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const write = useCallback((next: GeometryState) => {
    const url = new URL(window.location.href)
    for (const key of KEYS) {
      // The default is dropped rather than written, so a clean link stays clean.
      if (Math.abs(next[key] - PANEL_MEANS[key]) < 1e-9) url.searchParams.delete(key.toLowerCase())
      else url.searchParams.set(key.toLowerCase(), next[key].toFixed(3))
    }
    window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
    setState(next)
  }, [])

  return [state, write, (key, value) => write({ ...state, [key]: clampToRange(key, value) })]
}

/**
 * Fill the controls from one country's mean row.
 *
 * `?iso=` is what the Countries drawer links to, and it has to actually populate the sliders —
 * a link that opens the lab at the panel mean while claiming to show that country would be
 * worse than no link.
 */
export function applyCountryMeans(
  iso3: string,
  rows: readonly Record<string, string | number | null>[],
): GeometryState | null {
  const matches = rows.filter((row) => String(row.iso3 ?? '').toUpperCase() === iso3.toUpperCase())
  if (matches.length === 0) return null
  const mean = (key: string): number => {
    const values = matches
      .map((row) => row[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
  }
  return {
    X: clampToRange('X', mean('X')),
    Y: clampToRange('Y', mean('Y')),
    M: clampToRange('M', mean('M')),
    T: clampToRange('T', mean('T')),
    E: clampToRange('E', mean('E')),
    R: clampToRange('R', mean('R')),
  }
}

/** The withdrawn channels, which the model receives as zero. */
export const WITHDRAWN_CHANNELS = [
  { code: 'C', name: 'Cultural intensity', reason: 'α 0.35 — items do not load on one dimension' },
  { code: 'D', name: 'Social atomization', reason: 'α −1.23 — items disagree more than independent items would' },
  { code: 'G', name: 'Disposable-income Gini', reason: 'unavailable outside the OECD sample' },
  { code: 'S', name: 'Social support', reason: 'four of seven configured items absent' },
] as const

/** Parameter object for `calculateModel`, with the withdrawn channels pinned at zero. */
export function toBeliefParameters(state: GeometryState): BeliefParameters {
  return {
    X: state.X,
    Y: state.Y,
    M: state.M,
    T: state.T,
    E: state.E,
    R: state.R,
    // Withdrawn channels are structurally unavailable; the model must receive 0, not a
    // slider default. A test pins this.
    C: 0,
    D: 0,
    G: 0,
    S: 0,
  } as BeliefParameters
}
