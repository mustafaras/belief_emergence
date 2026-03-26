import type { BeliefParameters } from '../types'

export type Surface3DUrlPlotView = '3D' | '2D'
export type Surface3DUrlResolutionMode = 'AUTO' | 'LOW' | 'MED' | 'HIGH'
export type Surface3DUrlViewMode = 'FREE' | 'ISO' | 'TOP' | 'FRONT'
export type Surface3DUrlAxisMode = 'XY' | 'DOC'

export type Surface3DUrlCamera = {
  eye?: { x: number; y: number; z: number }
  up?: { x: number; y: number; z: number }
  center?: { x: number; y: number; z: number }
}

export type Surface3DUrlState = {
  plotView?: Surface3DUrlPlotView
  resolutionMode?: Surface3DUrlResolutionMode
  contoursOn?: boolean
  viewMode?: Surface3DUrlViewMode
  axisMode?: Surface3DUrlAxisMode
  camera?: Surface3DUrlCamera
  // STYLE (rendering-only; must not affect surface recomputation)
  colorScale?: string
  reverseScale?: boolean
  showColorbar?: boolean
  // 3D-only rendering style
  surfaceOpacity?: number
  zmin?: string
  zmax?: string
}

// URL state contract
// - Keep it stable and human-editable.
// - Use short keys to keep shared links compact.
// - Always store numeric values as strings; parse with Number() and validate.
//
// Query params:
//   x,y,a,b,k,c,m,t,d,g,e,s,r: numbers (BeliefParameters)
//   preset: string (optional) - display label + signals modifiers are already z-scored (UI contract)
//   doc: '1' | '0' (optional)

export type AppUrlState = {
  params: Partial<BeliefParameters>
  presetName?: string
  showDocumentation?: boolean
  surface3d?: Surface3DUrlState
}

export type HydratedAppUrlState = {
  params: BeliefParameters
  presetName?: string
  showDocumentation: boolean
}

const NUM_KEYS: Array<[keyof BeliefParameters, string]> = [
  ['X', 'x'],
  ['Y', 'y'],
  ['alpha', 'a'],
  ['beta', 'b'],
  ['k', 'k'],
  ['C', 'c'],
  ['M', 'm'],
  ['T', 't'],
  ['D', 'd'],
  ['G', 'g'],
  ['E', 'e'],
  ['S', 's'],
  ['R', 'r'],
]

const SURFACE_KEYS = Object.freeze({
  plotView: 'pv',
  resolution: 'rm',
  contours: 'co',
  view: 'vm',
  axis: 'ax',
  camera: 'cam',
  colorScale: 'cs',
  reverseScale: 'rev',
  colorbar: 'cb',
  opacity: 'op',
  zmin: 'zmin',
  zmax: 'zmax',
})

const SURFACE_STYLE_DEFAULTS = Object.freeze({
  colorScale: 'Cividis',
  reverseScale: false,
  showColorbar: true,
})

const SURFACE_ALLOWED_COLORSCALES = ['Cividis', 'Viridis', 'Magma', 'YlGnBu', 'RdBu', 'Custom'] as const

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function safeParseNumber(raw: string | null): number | undefined {
  if (raw == null) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function round3(n: number): string {
  if (!Number.isFinite(n)) return 'NaN'
  const snapped = Math.round(n * 1000) / 1000
  return String(snapped)
}

function parseEnum<T extends string>(raw: string | null, allowed: readonly T[]): T | undefined {
  if (!isNonEmptyString(raw)) return undefined
  const normalized = raw.trim().toLowerCase()
  const hit = allowed.find((v) => v.toLowerCase() === normalized)
  return hit
}

function parseCameraFromString(raw: string | null): Surface3DUrlCamera | undefined {
  if (!isNonEmptyString(raw)) return undefined
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  if (parts.length !== 9) return undefined

  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isFinite(n))) return undefined

  return {
    eye: { x: nums[0], y: nums[1], z: nums[2] },
    up: { x: nums[3], y: nums[4], z: nums[5] },
    center: { x: nums[6], y: nums[7], z: nums[8] },
  }
}

function serializeCameraToString(camera: Surface3DUrlCamera | undefined): string | undefined {
  const eye = camera?.eye
  const up = camera?.up
  const center = camera?.center
  if (!eye || !up || !center) return undefined
  const parts = [eye.x, eye.y, eye.z, up.x, up.y, up.z, center.x, center.y, center.z]
  if (parts.some((n) => !Number.isFinite(n))) return undefined
  return parts.map((n) => round3(n)).join(',')
}

export function readSurface3DStateFromSearchParams(qs: URLSearchParams): Surface3DUrlState | undefined {
  const plotView = parseEnum(qs.get(SURFACE_KEYS.plotView), ['3D', '2D'] as const)
  const resolutionMode = parseEnum(qs.get(SURFACE_KEYS.resolution), ['AUTO', 'LOW', 'MED', 'HIGH'] as const)
  const viewMode = parseEnum(qs.get(SURFACE_KEYS.view), ['FREE', 'ISO', 'TOP', 'FRONT'] as const)
  const contoursOn = qs.get(SURFACE_KEYS.contours) === '1'
  const axisMode = parseEnum(qs.get(SURFACE_KEYS.axis), ['XY', 'DOC'] as const)
  const camera = parseCameraFromString(qs.get(SURFACE_KEYS.camera))

  const colorScale = parseEnum(qs.get(SURFACE_KEYS.colorScale), SURFACE_ALLOWED_COLORSCALES)
  const reverseScale = qs.get(SURFACE_KEYS.reverseScale) === '1' ? true : undefined

  const hasColorbarKey = qs.has(SURFACE_KEYS.colorbar)
  const showColorbar = (() => {
    const raw = qs.get(SURFACE_KEYS.colorbar)
    if (raw === '0') return false
    if (raw === '1') return true
    return undefined
  })()

  const opacityNumRaw = safeParseNumber(qs.get(SURFACE_KEYS.opacity))
  const surfaceOpacity =
    opacityNumRaw != null && Number.isFinite(opacityNumRaw) && opacityNumRaw >= 0.2 && opacityNumRaw <= 1 ? opacityNumRaw : undefined

  const zminNum = safeParseNumber(qs.get(SURFACE_KEYS.zmin))
  const zmaxNum = safeParseNumber(qs.get(SURFACE_KEYS.zmax))
  const zmin = zminNum == null ? undefined : String(zminNum)
  const zmax = zmaxNum == null ? undefined : String(zmaxNum)

  const any =
    Boolean(plotView || resolutionMode || viewMode || contoursOn || axisMode || camera || colorScale || reverseScale || surfaceOpacity != null) ||
    hasColorbarKey ||
    zmin != null ||
    zmax != null
  if (!any) return undefined

  return {
    plotView,
    resolutionMode,
    viewMode,
    contoursOn,
    axisMode,
    camera,
    colorScale,
    reverseScale,
    showColorbar,
    surfaceOpacity,
    zmin,
    zmax,
  }
}

export function applySurface3DStateToSearchParams(qs: URLSearchParams, state: Surface3DUrlState): void {
  qs.delete(SURFACE_KEYS.plotView)
  qs.delete(SURFACE_KEYS.resolution)
  qs.delete(SURFACE_KEYS.contours)
  qs.delete(SURFACE_KEYS.view)
  qs.delete(SURFACE_KEYS.axis)
  qs.delete(SURFACE_KEYS.camera)
  qs.delete(SURFACE_KEYS.colorScale)
  qs.delete(SURFACE_KEYS.reverseScale)
  qs.delete(SURFACE_KEYS.colorbar)
  qs.delete(SURFACE_KEYS.opacity)
  qs.delete(SURFACE_KEYS.zmin)
  qs.delete(SURFACE_KEYS.zmax)

  if (state.plotView) qs.set(SURFACE_KEYS.plotView, state.plotView)
  if (state.resolutionMode) qs.set(SURFACE_KEYS.resolution, state.resolutionMode)
  if (state.viewMode) qs.set(SURFACE_KEYS.view, state.viewMode)
  if (state.contoursOn) qs.set(SURFACE_KEYS.contours, '1')
  if (state.axisMode) qs.set(SURFACE_KEYS.axis, state.axisMode)

  const cs = isNonEmptyString(state.colorScale) ? state.colorScale.trim() : undefined
  if (cs && parseEnum(cs, SURFACE_ALLOWED_COLORSCALES) && cs !== SURFACE_STYLE_DEFAULTS.colorScale) {
    qs.set(SURFACE_KEYS.colorScale, cs)
  }

  if (state.reverseScale) {
    qs.set(SURFACE_KEYS.reverseScale, '1')
  }

  if (state.showColorbar === false) {
    qs.set(SURFACE_KEYS.colorbar, '0')
  }

  const opacity = state.surfaceOpacity
  if (opacity != null && Number.isFinite(opacity) && opacity >= 0.2 && opacity <= 1 && Math.abs(opacity - 1) > 1e-9) {
    qs.set(SURFACE_KEYS.opacity, round3(opacity))
  }

  const zminNum = state.zmin == null ? undefined : Number(state.zmin)
  const zmaxNum = state.zmax == null ? undefined : Number(state.zmax)
  if (
    zminNum !== undefined &&
    zmaxNum !== undefined &&
    Number.isFinite(zminNum) &&
    Number.isFinite(zmaxNum) &&
    zminNum < zmaxNum
  ) {
    qs.set(SURFACE_KEYS.zmin, String(zminNum))
    qs.set(SURFACE_KEYS.zmax, String(zmaxNum))
  }

  const cam = serializeCameraToString(state.camera)
  if (cam) qs.set(SURFACE_KEYS.camera, cam)
}

export function readSurface3DStateFromUrl(): Surface3DUrlState | undefined {
  if (typeof window === 'undefined') return undefined
  const url = new URL(window.location.href)
  return readSurface3DStateFromSearchParams(url.searchParams)
}

export function writeSurface3DStateToUrl(state: Surface3DUrlState, opts?: { replace?: boolean }): void {
  if (typeof window === 'undefined') return
  const { replace = true } = opts ?? {}
  const url = new URL(window.location.href)
  applySurface3DStateToSearchParams(url.searchParams, state)

  const nextUrl = `${url.pathname}?${url.searchParams.toString()}${url.hash}`
  if (replace) {
    window.history.replaceState(null, '', nextUrl)
  } else {
    window.history.pushState(null, '', nextUrl)
  }
}

function applyStateToSearchParams(qs: URLSearchParams, state: AppUrlState): void {
  // Keep unrelated query keys intact, but ensure our own keys are consistent.
  for (const [, short] of NUM_KEYS) {
    qs.delete(short)
  }
  qs.delete('preset')
  qs.delete('doc')

  const params = state.params ?? {}
  for (const [key, short] of NUM_KEYS) {
    const value = params[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      qs.set(short, String(value))
    }
  }

  if (isNonEmptyString(state.presetName)) {
    qs.set('preset', state.presetName.trim())
  }

  if (state.showDocumentation) {
    qs.set('doc', '1')
  }

  if (state.surface3d) {
    applySurface3DStateToSearchParams(qs, state.surface3d)
  }
}

export function readAppStateFromUrl(defaultParams: BeliefParameters): HydratedAppUrlState {
  if (typeof window === 'undefined') {
    return { params: defaultParams, showDocumentation: false }
  }

  const url = new URL(window.location.href)
  const qs = url.searchParams

  const next: BeliefParameters = { ...defaultParams }
  for (const [key, short] of NUM_KEYS) {
    const parsed = safeParseNumber(qs.get(short))
    if (parsed != null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(next as any)[key] = parsed
    }
  }

  const presetName = qs.get('preset')
  const showDocumentation = qs.get('doc') === '1'

  return {
    params: next,
    presetName: isNonEmptyString(presetName) ? presetName : undefined,
    showDocumentation,
  }
}

export function writeAppStateToUrl(state: AppUrlState, opts?: { replace?: boolean }): void {
  if (typeof window === 'undefined') return

  const { replace = true } = opts ?? {}

  const url = new URL(window.location.href)
  applyStateToSearchParams(url.searchParams, state)

  const nextUrl = `${url.pathname}?${url.searchParams.toString()}${url.hash}`

  if (replace) {
    window.history.replaceState(null, '', nextUrl)
  } else {
    window.history.pushState(null, '', nextUrl)
  }
}

export function buildAppUrl(state: AppUrlState, baseHref?: string): string {
  const href = baseHref ?? (typeof window !== 'undefined' ? window.location.href : 'http://localhost/')
  const url = new URL(href)
  applyStateToSearchParams(url.searchParams, state)
  return url.toString()
}
