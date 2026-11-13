import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlotParams } from 'react-plotly.js'
// @ts-expect-error -- `plotly.js-dist-min` ships without TypeScript declarations in this repo.
import Plotly from 'plotly.js-dist-min'
import type { BeliefParameters } from '../../types'
import { calculateModel, computeStructuralBase } from '../../utils/calculateModel'
import { PANEL_X_MAX, PANEL_X_MIN, PANEL_Y_MAX, PANEL_Y_MIN, STRUCTURAL_MIN } from '../../utils/modelContract'
import { uiToModelParams } from '../../utils/uiToModelTransform'
import { OPTIMIZED_STRUCTURAL_PARAMS } from '../../data/feCoefficients'
import { useDataContext } from '../../contexts/DataContext'
import {
  DOC_L_MAX,
  DOC_L_MIN,
  DOC_PHI_MAX,
  DOC_PHI_MIN,
  logit,
  type Camera,
} from './surface/camera'
import {
  clamp,
  isFiniteNumber,
  linspace,
  makePolylineFromGridXSlice,
  makePolylineFromGridYSlice,
  nearestIndex,
  round4,
  toFiniteNumber,
  type Polyline3,
  type SurfacePayload,
} from './surface/geometry'
import { useSurfaceColorScale } from './surface/useSurfaceColorScale'
import { useSurface3DExport } from './surface/useSurface3DExport'
import { buildHeatmapLegendOptions, buildSurfaceLegendOptions } from './surface/plotLegend'
import {
  isWebGLAvailable,
  useSurface3DUrlSync,
  useSurface3DViewState,
} from './surface/useSurface3DViewState'

export type { ResolutionMode } from './surface/useSurface3DViewState'


/**
 * Surface3D Instrument Map
 *
 * 1) Render tree & layering
 * - DOM hierarchy (primary):
 *   - <div className="surface3d-surface-root"> (full-size container)
 *     - <div className="surface3d-instrument" role="region" tabIndex={0} onKeyDown={...}>
 *       - <div id="surface3d-shortcuts" className="surface3d-visually-hidden"> (shortcut help)
 *       - <div className="surface3d-visually-hidden" aria-live="polite"> (ariaAnnouncement)
 *       - <div className="surface3d-visually-hidden" role="status" aria-live="polite"> (Computing/Exporting)
 *       - <div className="surface3d-instrument-header"> (chips + status + dev diagnostics toggle)
 *       - <div className="surface3d-instrument-body"> (position: relative; overflow: hidden)
 *         - (when data)
 *           - <div className="surface3d-plot-host" ref={plotHostRef}
 *               onPointerDown={onPlotPointerDown} onPointerUp={onPlotPointerUp} onPointerCancel={onPlotPointerCancel}>
 *             - <div className="surface3d-plot-layer{snapshotActive ? ' is-hidden' : ''}"> (absolute inset: 0)
 *               - <Plot className="surface3d-plot" ... onClick={handleClick} onRelayout={...handleRelayout} />
 *             - (when snapshotActive)
 *               - <img className="surface3d-snapshot" ... /> (absolute inset: 0; pointer-events: none)
 *         - (fallback)
 *           - <div className="surface3d-surface-fallback">Computing surface…</div>
 *         - (dev-only, if diagnosticsOpen)
 *           - <div className="surface3d-diagnostics"> (absolute top-right; z-index: 4; pointer-events: auto)
 *         - (if surfaceError)
 *           - <div className="surface3d-surface-error"> (absolute inset: 0; z-index: 3; pointer-events: none)
 *
 * - Layering notes from CSS:
 *   - `.surface3d-plot-layer` is the Plotly render target (absolute inset: 0).
 *   - `.surface3d-plot-layer.is-hidden` uses `visibility: hidden` to hide WebGL/SVG during snapshot capture.
 *   - `.surface3d-snapshot` overlays the plot image; `pointer-events: none` keeps interaction disabled during capture.
 *   - `.surface3d-diagnostics` is a top-right overlay with `z-index: 4`.
 *   - `.surface3d-surface-error` is a full-panel overlay at `z-index: 3`.
 *
 * - Overlay pointer-events constraints (Surface3DOverlay.css):
 *   - `.surface3d-overlay-root { pointer-events: none; }` (overlay root is click-through)
 *   - `.surface3d-slot { pointer-events: auto; }` and `.surface3d-canvas { pointer-events: auto; }`
 *   - Practical implication: any interactive FAB/drawer must live inside this component’s DOM
 *     (i.e., inside `.surface3d-instrument-body`), not as a sibling of the overlay root.
 *
 * 2) State inventory & persistence
 * - Compute state:
 *   - `surface`, `isComputing`, `surfaceError`
 * - Resolution state:
 *   - `resolutionMode` ('AUTO'|'LOW'|'MED'|'HIGH'), `displayedQuality` ('LOW'|'HIGH')
 * - View state:
 *   - `plotView` ('3D'|'2D'), `viewMode` ('FREE'|'ISO'|'TOP'|'FRONT'), `camera`
 * - Readability state:
 *   - `contoursOn`
 * - UI state:
 *   - `diagnosticsOpen`, `ariaAnnouncement`, `isInteracting`
 * - Snapshot/export state:
 *   - `snapshotActive`, `snapshotUrl`, `snapshotInFlight`
 *
 * - URL persistence (Surface3DSurface owns read/write):
 *   - Initial read: `initialSurface3dState = useMemo(() => readSurface3DStateFromUrl(), [])`
 *     and state initializers for `resolutionMode`, `plotView`, `viewMode`, `contoursOn`, `camera`.
 *   - Write-back: debounced `writeSurface3DStateToUrl({ plotView, resolutionMode, contoursOn, viewMode, camera }, { replace: true })`
 *     in a `useEffect`, gated by `if (isInteracting) return` (don’t churn URL during gestures).
 *   - URL keys (src/utils/urlState.ts `SURFACE_KEYS`):
 *     - `pv` (plotView), `rm` (resolutionMode), `co` (contoursOn), `vm` (viewMode), `cam` (camera)
 *   - Backward-compatible extensions should:
 *     - add a new short key to `SURFACE_KEYS`,
 *     - parse it in `readSurface3DStateFromSearchParams`,
 *     - serialize/delete it in `applySurface3DStateToSearchParams`,
 *     - keep parsing tolerant (unknown/invalid keys ignored; existing links remain valid).
 *
 * 3) Plotly wiring (data/layout/config, relayout)
 * - Traces (`data` useMemo):
 *   - Threshold constants: `EMERGENCE_THRESHOLD_Z = 0.5` and `thresholdEps` depends on `effectiveTier`.
 *   - 2D branch (`plotView === '2D'`):
 *     - `gridTrace`: `heatmap` or `contour` depending on `contoursOn`
 *     - `threshold2d`: `scatter` marker band (optional)
 *     - `marker2d`: `scatter` "Current" marker
 *   - 3D branch:
 *     - `surfaceTrace`: `surface`
 *     - `threshold3d`: `scatter3d` marker band (optional)
 *     - `markerTrace`: `scatter3d` "Current" marker
 *   - Safe overlay-trace insertion hook (documentation-only):
 *     - Append new traces inside this existing `data` useMemo, AFTER the current marker trace
 *       (`marker2d`/`markerTrace`), so existing semantics/readability remain stable.
 *
 * - Layout (`layout` useMemo):
 *   - 2D: margins + axis titles + `uirevision: 'surface2d-uirev'`
 *   - 3D: `scene` + `scene.camera = camera` + `uirevision: 'surface3d-uirev'` (camera stability across surface commits)
 *
 * - Config (`config` useMemo):
 *   - `scrollZoom`, `responsive`, `modeBarButtonsToRemove`, `displaylogo: false`
 *
 * - Camera relayout capture:
 *   - Plotly `onRelayout={(update) => handleRelayout((update ?? {}) as Record<string, unknown>)}`
 *   - `handleRelayout(update)` reads `update['scene.camera']`, then `setViewMode('FREE')` + `setCamera(nextCamera)`.
 *   - Camera persistence depends on the combination of:
 *     - `uirevision: 'surface3d-uirev'` (keeps Plotly camera stable)
 *     - URL debounced writes (keeps share-links stable without gesture churn).
 *
 * 4) Snapshot/export flow (what hides, why)
 * - Inputs/outputs:
 *   - `exportSnapshotRequest?: { active: boolean; requestId: string | null }`
 *   - `onSnapshotReady?: ({ requestId, ok }) => void`
 * - Pipeline:
 *   - When requested, set `snapshotInFlight=true`, call `endInteractionNow()`, optionally promote to HIGH resolution
 *     (3D: prefers `highSurfaceRef` / computes `HIGH_NX`×`HIGH_NY` as needed), then `makeSnapshot()` via Plotly `toImage`.
 *   - Success: `snapshotUrl` set → `snapshotActive=true` and snapshot image overlays the plot.
 *   - Failure: `snapshotActive=false`, live plot remains.
 * - Why hide:
 *   - During snapshotActive, `.surface3d-plot-layer.is-hidden { visibility: hidden; }` ensures the captured image is
 *     the static snapshot, not a partially-rendered WebGL/SVG frame.
 * - Important for future tools:
 *   - Any FAB/drawer must either auto-close during `snapshotActive` or render in an export-safe minimal mode;
 *     otherwise it will be captured in the exported snapshot image.
 *
 * 5) Safe insertion points (FAB/dock + traces + URL keys)
 * - JSX insertion point for a bottom-left FAB + animated drawer (do not implement here):
 *   - Inside `<div className="surface3d-instrument-body">`, as a sibling to `.surface3d-plot-host`.
 *   - Place AFTER the `.surface3d-plot-host` so it visually overlays the plot.
 *   - Keep stacking below `.surface3d-diagnostics` (z=4) unless intentionally above.
 *
 * - CSS anchoring rules:
 *   - `.surface3d-instrument-body` is `position: relative` → correct anchor for absolute-positioned UI.
 *   - Existing selectors already present in Surface3DSurface.css:
 *     - `.surface3d-fab { position:absolute; left:12px; bottom:12px; z-index:2; pointer-events:auto; }`
 *     - `.surface3d-dock { position:absolute; left:12px; bottom:56px; z-index:2; pointer-events:none; }`
 *       and `.surface3d-dock.is-open { pointer-events:auto; }` (critical: closed dock must not block Plotly).
 *
 * - URL contract extension point:
 *   - Extend only `src/utils/urlState.ts` `SURFACE_KEYS` + parse/serialize helpers; keep keys short and tolerant.
 */

/*
 * Surface3D Upgrade Regression Checklist (Dev QA)
 *
 * 1) Layout & Layering
 * - [ ] FAB sits bottom-left; dock opens upward; no overlap with header.
 * - [ ] Dock closed: no dead zone; plot remains fully interactive.
 * - [ ] Diagnostics overlay remains top-right and readable; not occluded by dock.
 *
 * 2) Interaction (Plotly)
 * - [ ] 3D rotate/zoom/pan works with dock closed and open.
 * - [ ] 2D hover and zoom (if enabled) works; overlay traces don’t block hover.
 * - [ ] No console errors during continuous camera moves.
 *
 * 3) Keyboard & Focus
 * - [ ] Tab order: tabs → controls → close (consistent).
 * - [ ] Focus rings visible (:focus-visible).
 * - [ ] 'p' hotkey pins only when instrument focused.
 * - [ ] Escape closes dock (if implemented) without breaking instrument shortcuts.
 * - [ ] No key handler collisions with existing shortcuts.
 *
 * 4) Snapshot / Export Hygiene
 * - [ ] When snapshotActive: dock auto-closes (or minimal mode), plot layer hidden, no UI artifacts in snapshot.
 * - [ ] Snapshot reliably captures final plot state (including overlays if intended).
 * - [ ] After snapshot: plot returns and interactions resume.
 *
 * 5) prefers-reduced-motion
 * - [ ] Dock open/close transitions disabled under reduced motion.
 * - [ ] No animation-dependent state.
 *
 * 6) URL Persistence (Backward Compatible)
 * - [ ] Old URLs load defaults (no crash).
 * - [ ] New STYLE keys restore: colorscale, reverse, colorbar, clamp (only if valid).
 * - [ ] Clamp invalid values do not apply and do not crash.
 *
 * 7) Readability Overlays (If enabled)
 * - [ ] Adaptive contours adjust density without clutter.
 * - [ ] Ridge hints overlay is subtle; no performance regression.
 *
 * 8) Performance
 * - [ ] Hover inspector is stable (throttled) with no flicker.
 * - [ ] No URL thrash while typing clamp values.
 * - [ ] Derived overlays memoized (no heavy recompute on tab switches).
 */

export type Props = {
  params: BeliefParameters
  presetName?: string
  onApplyScenario?: (payload: { params: BeliefParameters; presetName?: string }) => void
  canonicalZ?: number
  onGraphReady?: (graphDiv: HTMLElement | null) => void
  exportSnapshotRequest?: { active: boolean; requestId: string | null }
  onSnapshotReady?: (payload: { requestId: string; ok: boolean }) => void
  className?: string
}

type Quality = 'LOW' | 'HIGH'

type DockTab = 'TOOLS' | 'STYLE' | 'INSPECT'

type SurfaceComputeResult = {
  payload: SurfacePayload
  hasValid: boolean
}

type PlotDataItem = NonNullable<PlotParams['data']>[number]

const LOW_NX = 22
const LOW_NY = 22
const AUTO_HIGH_NX = 45
const AUTO_HIGH_NY = 45
const MED_NX = 35
const MED_NY = 35
// Stage 5 spec allows 55 only if performance is acceptable; default to 45 to avoid regressions.
const HIGH_NX = 45
const HIGH_NY = 45
const IDLE_MS = 220
const MAX_CACHE = 8
const EPS_MARKER_ABS = 1e-6

const EPS_GRID_ABS: Record<'LOW' | 'MED' | 'HIGH', number> = {
  LOW: 5e-3,
  MED: 2e-3,
  HIGH: 1e-3,
}

const EMERGENCE_THRESHOLD_Z = 0.5

function isOverlayTracePoint(point: unknown): boolean {
  // Plotly click payload: points[0].data/meta is the most stable cross-trace hook.
  // We mark our overlays with meta.role = 'overlay'.
  const data = (point as unknown as { data?: { meta?: { role?: unknown } } })?.data
  return data?.meta?.role === 'overlay'
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

class SurfaceCancelledError extends Error {
  constructor() {
    super('Surface computation cancelled')
    this.name = 'SurfaceCancelledError'
  }
}

function safeZ(nextParams: BeliefParameters, modifiersAreStandardized: boolean): number | null {
  try {
    const result = calculateModel(uiToModelParams(nextParams), {
      modifiersAreStandardized,
      debug: false,
    })

    const z = result?.Z
    if (!Number.isFinite(z)) return null
    return z
  } catch {
    return null
  }
}

function paramsKey4(params: BeliefParameters): string {
  const keys: Array<keyof BeliefParameters> = [
    'X',
    'Y',
    'alpha',
    'beta',
    'k',
    'C',
    'M',
    'T',
    'D',
    'G',
    'E',
    'S',
    'R',
  ]

  return keys.map((k) => `${String(k)}=${round4(params[k])}`).join('|')
}


function buildCacheKey(args: {
  useStd: boolean
  axisMode: 'XY' | 'DOC'
  nx: number
  ny: number
  params: BeliefParameters
}): string {
  return [
    `useStd=${args.useStd ? '1' : '0'}`,
    `axisMode=${args.axisMode}`,
    `nx=${args.nx}`,
    `ny=${args.ny}`,
    `X=[${PANEL_X_MIN},${PANEL_X_MAX}]`,
    `Y=[${PANEL_Y_MIN},${PANEL_Y_MAX}]`,
    paramsKey4(args.params),
  ].join('::')
}

export function useSurface3DSurfaceModel({
  params,
  presetName,
  onApplyScenario,
  canonicalZ,
  onGraphReady,
  exportSnapshotRequest,
  onSnapshotReady,
  className,
}: Props) {
  const useStd = Boolean(presetName)
  const { estimatedCoeffCi95Map, activeCoefficientSet } = useDataContext()

  function DiagRow({ k, v }: { k: string; v: React.ReactNode }) {
    return (
      <>
        <div className="surface3d-diagnostics-k">{k}</div>
        <div className="surface3d-diagnostics-v">{v}</div>
      </>
    )
  }

  const nodeEnv = (globalThis as unknown as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
  const isDevBuild = Boolean(import.meta.env.DEV) || (typeof nodeEnv === 'string' && nodeEnv !== 'production')

  const plotDivRef = useRef<HTMLDivElement | null>(null)
  const relayoutCamera = useCallback((next: Camera) => {
    const graph = plotDivRef.current
    if (!graph) return
    ;(Plotly as unknown as { relayout: (el: HTMLDivElement, update: Record<string, unknown>) => unknown }).relayout(
      graph,
      { 'scene.camera': next },
    )
  }, [])
  const viewState = useSurface3DViewState({ plotDivRef, relayoutCamera })
  const {
    initialSurface3dState,
    resolutionMode,
    setResolutionMode,
    resolutionModeRef,
    plotView,
    setPlotView,
    viewMode,
    setViewMode,
    viewModeRef,
    contoursOn,
    setContoursOn,
    showCiBands,
    setShowCiBands,
    axisMode,
    setAxisMode,
    camera,
    cameraAlmostEqual,
    enqueueCameraUpdate,
    applyCamera,
    isInteracting,
    setIsInteracting,
    isInteractingRef,
  } = viewState

  const [surface, setSurface] = useState<SurfacePayload | null>(null)
  const [displayedQuality, setDisplayedQuality] = useState<Quality>('LOW')
  const [isComputing, setIsComputing] = useState(false)
  const [surfaceError, setSurfaceError] = useState<string | null>(null)

  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)

  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>('')

  const [dockOpen, setDockOpen] = useState(false)
  const [dockTab, setDockTab] = useState<DockTab>('TOOLS')

  const [xSliceOn, setXSliceOn] = useState(false)
  const [xSliceX0, setXSliceX0] = useState<number | null>(null)
  const [xSliceIx, setXSliceIx] = useState<number | null>(null)

  const [ySliceOn, setYSliceOn] = useState(false)
  const [ySliceY0, setYSliceY0] = useState<number | null>(null)
  const [ySliceIy, setYSliceIy] = useState<number | null>(null)

  const [sliceNotice, setSliceNotice] = useState<string>('')
  const sliceNoticeTimerRef = useRef<number | null>(null)

  const surfaceKey = useMemo(() => {
    if (!surface) return 'none'
    const stamp = (surface as unknown as { computedAt?: unknown; token?: unknown }).computedAt
    const token = stamp ?? (surface as unknown as { token?: unknown }).token ?? ''
    return `${surface.nx}x${surface.ny}-${String(token)}`
  }, [surface])

  const sliceCacheRef = useRef<Map<string, Polyline3>>(new Map())
  const thresholdBandCacheRef = useRef<Map<string, Array<{ x: number; y: number; z: number }>>>(new Map())
  const ridgeOverlayCacheRef = useRef<Map<string, { z: Array<Array<number | null>>; opacity: number } | null>>(new Map())

  const colorScaleState = useSurfaceColorScale(initialSurface3dState)
  const {
    colorScale,
    setColorScale,
    customLow,
    setCustomLow,
    customMid,
    setCustomMid,
    customHigh,
    setCustomHigh,
    effectiveColorscale,
    reverseScale,
    setReverseScale,
    showColorbar,
    setShowColorbar,
  } = colorScaleState

  const [surfaceOpacity, setSurfaceOpacity] = useState<number>(() => {
    const raw = (initialSurface3dState as unknown as { surfaceOpacity?: unknown })?.surfaceOpacity
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    // Opacity must stay in [0.2, 1] to avoid a "disappearing" surface in common views.
    const clamped = Number.isFinite(n) ? Math.min(1, Math.max(0.2, n)) : 1
    return clamped
  })

  const [adaptiveContours, setAdaptiveContours] = useState(true)
  const [contourDensity, setContourDensity] = useState<'LOW' | 'MED' | 'HIGH'>('MED')

  const [ridgeHintsOn, setRidgeHintsOn] = useState(false)
  const [ridgeStrength, setRidgeStrength] = useState<'SUBTLE' | 'NORMAL' | 'STRONG'>('NORMAL')
  const [ridgeMode, setRidgeMode] = useState<'GRADMAG' | 'CURV'>('GRADMAG')
  const [zClampEnabled, setZClampEnabled] = useState<boolean>(
    () => initialSurface3dState?.zmin != null && initialSurface3dState?.zmax != null,
  )
  const [zClampMin, setZClampMin] = useState<string>(() => initialSurface3dState?.zmin ?? '')
  const [zClampMax, setZClampMax] = useState<string>(() => initialSurface3dState?.zmax ?? '')
  const [zClampUrlMin, setZClampUrlMin] = useState<string | undefined>(() => initialSurface3dState?.zmin)
  const [zClampUrlMax, setZClampUrlMax] = useState<string | undefined>(() => initialSurface3dState?.zmax)


  type HoverReadout = {
    x: number
    y: number
    z: number
    ix: number
    iy: number
    dzdx: number | null
    dzdy: number | null
    t: number
  }

  const [hoverReadout, setHoverReadout] = useState<HoverReadout | null>(null)
  const hoverPendingRef = useRef<HoverReadout | null>(null)
  const hoverRafRef = useRef<number | null>(null)
  const hoverCommittedRef = useRef<HoverReadout | null>(null)
  const lastValidHoverRef = useRef<HoverReadout | null>(null)

  const enqueueHoverUpdate = useCallback((next: HoverReadout | null) => {
    hoverPendingRef.current = next
    if (hoverRafRef.current != null) return
    hoverRafRef.current = window.requestAnimationFrame(() => {
      const pending = hoverPendingRef.current
      const prev = hoverCommittedRef.current

      const almostEqual = (a: number | null, b: number | null) => {
        if (a == null && b == null) return true
        if (a == null || b == null) return false
        return Math.abs(a - b) <= 1e-9
      }

      const shouldSkip = (() => {
        if (pending == null && prev == null) return true
        if (pending == null || prev == null) return false
        if (pending.ix !== prev.ix || pending.iy !== prev.iy) return false
        if (!almostEqual(pending.z, prev.z)) return false
        if (!almostEqual(pending.dzdx, prev.dzdx)) return false
        if (!almostEqual(pending.dzdy, prev.dzdy)) return false
        return true
      })()

      if (!shouldSkip) {
        hoverCommittedRef.current = pending
        setHoverReadout(pending)
        // Track last valid hover with finite coordinates and Z.
        if (
          pending &&
          isFiniteNumber(pending.x) &&
          isFiniteNumber(pending.y) &&
          isFiniteNumber(pending.z)
        ) {
          lastValidHoverRef.current = pending
        }
      }
      hoverRafRef.current = null
    })
  }, [])

  useEffect(() => {
    return () => {
      if (hoverRafRef.current != null) {
        window.cancelAnimationFrame(hoverRafRef.current)
        hoverRafRef.current = null
      }

    }
  }, [])

  const formatNumber = useCallback((value: number | null | undefined, digits: number) => {
    if (!isFiniteNumber(value)) return '—'
    return value.toFixed(digits)
  }, [])

  type SurfacePin = {
    id: string
    x: number
    y: number
    z: number
    ix: number
    iy: number
    t: number
  }

  const [pins, setPins] = useState<SurfacePin[]>([])
  const [pinNotice, setPinNotice] = useState<string>('')
  const pinNoticeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pinNoticeTimerRef.current != null) {
        window.clearTimeout(pinNoticeTimerRef.current)
        pinNoticeTimerRef.current = null
      }

      if (sliceNoticeTimerRef.current != null) {
        window.clearTimeout(sliceNoticeTimerRef.current)
        sliceNoticeTimerRef.current = null
      }
    }
  }, [])

  const showPinNotice = useCallback((message: string) => {
    setPinNotice(message)
    if (pinNoticeTimerRef.current != null) {
      window.clearTimeout(pinNoticeTimerRef.current)
    }
    pinNoticeTimerRef.current = window.setTimeout(() => {
      setPinNotice('')
      pinNoticeTimerRef.current = null
    }, 1400)
  }, [])

  const showSliceNotice = useCallback((message: string) => {
    setSliceNotice(message)
    if (sliceNoticeTimerRef.current != null) {
      window.clearTimeout(sliceNoticeTimerRef.current)
    }
    sliceNoticeTimerRef.current = window.setTimeout(() => {
      setSliceNotice('')
      sliceNoticeTimerRef.current = null
    }, 1400)
  }, [])

  const addPin = useCallback(
    (pin: SurfacePin) => {
      setPins((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.ix === pin.ix && last.iy === pin.iy) return prev
        const next = [...prev, pin]
        if (next.length <= 3) return next
        return next.slice(-3)
      })
    },
    [setPins],
  )

  const addPinFromHover = useCallback(() => {
    const src = hoverReadout ?? lastValidHoverRef.current
    if (!src) {
      showPinNotice('Hover the surface to pin a point.')
      return
    }
    if (!isFiniteNumber(src.z)) {
      showPinNotice('Hover a valid (non-null) cell to pin.')
      return
    }

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    addPin({
      id,
      x: src.x,
      y: src.y,
      z: src.z,
      ix: src.ix,
      iy: src.iy,
      t: performance.now(),
    })
  }, [hoverReadout, addPin, showPinNotice])

  const clearPins = useCallback(() => {
    setPins([])
    setPinNotice('')
    if (pinNoticeTimerRef.current != null) {
      window.clearTimeout(pinNoticeTimerRef.current)
      pinNoticeTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!surface) return

    if (xSliceOn) {
      const ix = xSliceX0 != null ? nearestIndex(surface.xVals, xSliceX0) : xSliceIx
      if (ix != null && ix >= 0 && ix < surface.xVals.length && ix !== xSliceIx) {
        setXSliceIx(ix)
      }
    }

    if (ySliceOn) {
      const iy = ySliceY0 != null ? nearestIndex(surface.yVals, ySliceY0) : ySliceIy
      if (iy != null && iy >= 0 && iy < surface.yVals.length && iy !== ySliceIy) {
        setYSliceIy(iy)
      }
    }
  }, [surface, xSliceOn, xSliceX0, xSliceIx, ySliceOn, ySliceY0, ySliceIy])

  const xSlicePolyline = useMemo(() => {
    if (!surface) return null
    if (!xSliceOn) return null
    if (xSliceIx == null) return null
    if (xSliceIx < 0 || xSliceIx >= surface.xVals.length) return null
    const key = `${surfaceKey}::xSlice::${xSliceIx}`
    const cached = sliceCacheRef.current.get(key)
    if (cached) {
      sliceCacheRef.current.delete(key)
      sliceCacheRef.current.set(key, cached)
      return cached
    }

    const computed = makePolylineFromGridXSlice(surface, xSliceIx)
    sliceCacheRef.current.set(key, computed)
    if (sliceCacheRef.current.size > 12) {
      const oldest = sliceCacheRef.current.keys().next().value as string | undefined
      if (oldest) sliceCacheRef.current.delete(oldest)
    }
    return computed
  }, [surface, surfaceKey, xSliceOn, xSliceIx])

  const ySlicePolyline = useMemo(() => {
    if (!surface) return null
    if (!ySliceOn) return null
    if (ySliceIy == null) return null
    if (ySliceIy < 0 || ySliceIy >= surface.yVals.length) return null
    const key = `${surfaceKey}::ySlice::${ySliceIy}`
    const cached = sliceCacheRef.current.get(key)
    if (cached) {
      sliceCacheRef.current.delete(key)
      sliceCacheRef.current.set(key, cached)
      return cached
    }

    const computed = makePolylineFromGridYSlice(surface, ySliceIy)
    sliceCacheRef.current.set(key, computed)
    if (sliceCacheRef.current.size > 12) {
      const oldest = sliceCacheRef.current.keys().next().value as string | undefined
      if (oldest) sliceCacheRef.current.delete(oldest)
    }
    return computed
  }, [surface, surfaceKey, ySliceOn, ySliceIy])

  const tokenRef = useRef(0)
  const highTimerRef = useRef<number | null>(null)
  const highScheduledRef = useRef(false)
  const surfaceRef = useRef<SurfacePayload | null>(null)
  const lowSurfaceRef = useRef<SurfacePayload | null>(null)
  const highSurfaceRef = useRef<SurfacePayload | null>(null)
  const gridCacheRef = useRef<Map<string, SurfacePayload>>(new Map())
  const workerRef = useRef<Worker | null>(null)
  const workerPendingRef = useRef<
    Map<
      number,
      {
        resolve: (value: SurfaceComputeResult) => void
        reject: (err: unknown) => void
      }
    >
  >(new Map())

  const interactionTimerRef = useRef<number | null>(null)

  const plotHostRef = useRef<HTMLDivElement | null>(null)
  const graphDivRef = useRef<HTMLElement | null>(null)
  const lastGraphDivRef = useRef<HTMLElement | null>(null)

  const announceTimerRef = useRef<number | null>(null)
  const announce = useCallback((message: string) => {
    if (!message) return
    setAriaAnnouncement((prev) => (prev === message ? prev : message))
    if (announceTimerRef.current != null) {
      window.clearTimeout(announceTimerRef.current)
    }
    announceTimerRef.current = window.setTimeout(() => {
      setAriaAnnouncement('')
      announceTimerRef.current = null
    }, 1200)
  }, [])

  useEffect(() => {
    if (plotView !== '3D') return
    if (isWebGLAvailable()) return

    // Do not force-switch to 2D on preflight checks.
    // Some Chromium environments/extensions can make this probe flaky while Plotly
    // can still initialize WebGL (sometimes on a second attempt with preserveDrawingBuffer).
    announce('WebGL pre-check failed; keeping 3D mode and letting renderer retry.')
  }, [plotView, announce])

  const clampMinNum = useMemo(() => {
    const s = zClampMin.trim()
    if (!s) return undefined
    const n = Number(s)
    return Number.isFinite(n) ? n : undefined
  }, [zClampMin])

  const clampMaxNum = useMemo(() => {
    const s = zClampMax.trim()
    if (!s) return undefined
    const n = Number(s)
    return Number.isFinite(n) ? n : undefined
  }, [zClampMax])

  const clampIsValid = useMemo(() => {
    if (!zClampEnabled) return false
    if (clampMinNum == null || clampMaxNum == null) return false
    return clampMinNum < clampMaxNum
  }, [zClampEnabled, clampMinNum, clampMaxNum])

  const warnClamp = useMemo(() => {
    if (!zClampEnabled) return false
    const a = clampMinNum
    const b = clampMaxNum
    if (a == null && b == null) return false
    if (a == null || b == null) return true
    return a >= b
  }, [zClampEnabled, clampMinNum, clampMaxNum])

  const zRangeRaw = useMemo(() => {
    if (!surface) {
      return { min: null as number | null, max: null as number | null, count: 0, nullCount: 0 }
    }

    let finiteCount = 0
    let nullCount = 0
    let zMin = Number.POSITIVE_INFINITY
    let zMax = Number.NEGATIVE_INFINITY

    for (const row of surface.zGrid) {
      for (const cell of row) {
        if (!isFiniteNumber(cell)) {
          nullCount += 1
          continue
        }
        finiteCount += 1
        if (cell < zMin) zMin = cell
        if (cell > zMax) zMax = cell
      }
    }

    return {
      min: Number.isFinite(zMin) ? zMin : null,
      max: Number.isFinite(zMax) ? zMax : null,
      count: finiteCount,
      nullCount,
    }
  }, [surface])

  const zMinEff = useMemo(() => {
    if (clampIsValid && clampMinNum != null) return clampMinNum
    return zRangeRaw.min
  }, [clampIsValid, clampMinNum, zRangeRaw.min])

  const zMaxEff = useMemo(() => {
    if (clampIsValid && clampMaxNum != null) return clampMaxNum
    return zRangeRaw.max
  }, [clampIsValid, clampMaxNum, zRangeRaw.max])

  const contourLevels = useMemo(() => {
    const a = zMinEff
    const b = zMaxEff
    if (!isFiniteNumber(a) || !isFiniteNumber(b) || b <= a) return null

    const effectiveTier: 'LOW' | 'MED' | 'HIGH' = (() => {
      if (resolutionMode === 'AUTO') return displayedQuality === 'LOW' ? 'LOW' : 'HIGH'
      return resolutionMode
    })()

    const baseN = (() => {
      if (!adaptiveContours) {
        return contourDensity === 'LOW' ? 10 : contourDensity === 'HIGH' ? 24 : 16
      }
      // Conservative defaults to avoid clutter at HIGH.
      return effectiveTier === 'LOW' ? 10 : effectiveTier === 'MED' ? 14 : 18
    })()

    const range = b - a
    let n = baseN

    if (adaptiveContours) {
      if (range < 0.005) n = Math.min(n, 6)
      else if (range < 0.02) n = Math.min(n, 8)
      else if (range < 0.06) n = Math.min(n, 10)
      else if (range > 0.35) n = Math.min(24, n + 2)
    }

    // Keep a tighter cap overall to avoid dense contour chatter.
    n = Math.max(6, Math.min(24, Math.round(n)))
    if (n < 2) return null

    const step = range / (n - 1)
    if (!Number.isFinite(step) || step <= 0) return null

    return { start: a, end: b, size: step, levels: n }
  }, [zMinEff, zMaxEff, resolutionMode, displayedQuality, adaptiveContours, contourDensity])

  const ridgeOverlay = useMemo(() => {
    if (!surface) return null
    if (!ridgeHintsOn) return null
    if (plotView !== '2D') return null

    const cacheKey = `${surfaceKey}::ridge::${ridgeMode}::${ridgeStrength}`
    const cached = ridgeOverlayCacheRef.current.get(cacheKey)
    if (cached) {
      ridgeOverlayCacheRef.current.delete(cacheKey)
      ridgeOverlayCacheRef.current.set(cacheKey, cached)
      return cached
    }

    const nx = surface.xVals.length
    const ny = surface.yVals.length
    if (nx < 2 || ny < 2) return null

    const getZ = (j: number, i: number): number | null => {
      const v = surface.zGrid?.[j]?.[i]
      return isFiniteNumber(v) ? v : null
    }

    const raw: Array<Array<number | null>> = new Array(ny)
    let vMin = Number.POSITIVE_INFINITY
    let vMax = Number.NEGATIVE_INFINITY

    for (let j = 0; j < ny; j += 1) {
      const row: Array<number | null> = new Array(nx)
      for (let i = 0; i < nx; i += 1) {
        const z0 = getZ(j, i)
        if (z0 == null) {
          row[i] = null
          continue
        }

        if (ridgeMode === 'CURV') {
          if (i <= 0 || i >= nx - 1 || j <= 0 || j >= ny - 1) {
            row[i] = null
            continue
          }

          const zL = getZ(j, i - 1)
          const zR = getZ(j, i + 1)
          const zD = getZ(j - 1, i)
          const zU = getZ(j + 1, i)
          if (zL == null || zR == null || zD == null || zU == null) {
            row[i] = null
            continue
          }

          const dx = (surface.xVals[i + 1] - surface.xVals[i - 1]) / 2
          const dy = (surface.yVals[j + 1] - surface.yVals[j - 1]) / 2
          if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx <= 0 || dy <= 0) {
            row[i] = null
            continue
          }

          const d2x = (zR - 2 * z0 + zL) / (dx * dx)
          const d2y = (zU - 2 * z0 + zD) / (dy * dy)
          const v = Math.abs(d2x + d2y)
          if (!Number.isFinite(v)) {
            row[i] = null
            continue
          }

          row[i] = v
          if (v < vMin) vMin = v
          if (v > vMax) vMax = v
          continue
        }

        // GRADMAG mode
        const dzdx = (() => {
          if (i > 0 && i < nx - 1) {
            const zL = getZ(j, i - 1)
            const zR = getZ(j, i + 1)
            const dx = surface.xVals[i + 1] - surface.xVals[i - 1]
            if (zL != null && zR != null && Number.isFinite(dx) && dx > 0) return (zR - zL) / dx
          }
          if (i < nx - 1) {
            const zR = getZ(j, i + 1)
            const dx = surface.xVals[i + 1] - surface.xVals[i]
            if (zR != null && Number.isFinite(dx) && dx > 0) return (zR - z0) / dx
          }
          if (i > 0) {
            const zL = getZ(j, i - 1)
            const dx = surface.xVals[i] - surface.xVals[i - 1]
            if (zL != null && Number.isFinite(dx) && dx > 0) return (z0 - zL) / dx
          }
          return null
        })()

        const dzdy = (() => {
          if (j > 0 && j < ny - 1) {
            const zD = getZ(j - 1, i)
            const zU = getZ(j + 1, i)
            const dy = surface.yVals[j + 1] - surface.yVals[j - 1]
            if (zD != null && zU != null && Number.isFinite(dy) && dy > 0) return (zU - zD) / dy
          }
          if (j < ny - 1) {
            const zU = getZ(j + 1, i)
            const dy = surface.yVals[j + 1] - surface.yVals[j]
            if (zU != null && Number.isFinite(dy) && dy > 0) return (zU - z0) / dy
          }
          if (j > 0) {
            const zD = getZ(j - 1, i)
            const dy = surface.yVals[j] - surface.yVals[j - 1]
            if (zD != null && Number.isFinite(dy) && dy > 0) return (z0 - zD) / dy
          }
          return null
        })()

        if (!isFiniteNumber(dzdx) || !isFiniteNumber(dzdy)) {
          row[i] = null
          continue
        }

        const v = Math.hypot(dzdx, dzdy)
        if (!Number.isFinite(v)) {
          row[i] = null
          continue
        }

        row[i] = v
        if (v < vMin) vMin = v
        if (v > vMax) vMax = v
      }
      raw[j] = row
    }

    if (!Number.isFinite(vMin) || !Number.isFinite(vMax) || vMax <= vMin) return null

    const gamma = ridgeStrength === 'SUBTLE' ? 1.6 : ridgeStrength === 'STRONG' ? 0.9 : 1.2
    const norm: Array<Array<number | null>> = new Array(ny)
    const denom = vMax - vMin

    for (let j = 0; j < ny; j += 1) {
      const row = raw[j]
      const outRow: Array<number | null> = new Array(nx)
      for (let i = 0; i < nx; i += 1) {
        const v = row[i]
        if (!isFiniteNumber(v)) {
          outRow[i] = null
          continue
        }
        const t = Math.min(1, Math.max(0, (v - vMin) / denom))
        const g = Number.isFinite(gamma) ? Math.pow(t, gamma) : t
        outRow[i] = Number.isFinite(g) ? g : null
      }
      norm[j] = outRow
    }

    const opacity = ridgeStrength === 'SUBTLE' ? 0.22 : ridgeStrength === 'STRONG' ? 0.34 : 0.28

    const computed = {
      z: norm,
      opacity,
    }

    ridgeOverlayCacheRef.current.set(cacheKey, computed)
    if (ridgeOverlayCacheRef.current.size > 8) {
      const oldest = ridgeOverlayCacheRef.current.keys().next().value as string | undefined
      if (oldest) ridgeOverlayCacheRef.current.delete(oldest)
    }

    return computed
  }, [surface, surfaceKey, ridgeHintsOn, ridgeStrength, ridgeMode, plotView])

  // Ensure ridge hints are 2D-only: auto-disable when switching to 3D and announce.
  useEffect(() => {
    if (plotView === '3D' && ridgeHintsOn) {
      setRidgeHintsOn(false)
      announce('Ridge hints are 2D-only; disabled in 3D.')
    }
  }, [plotView, ridgeHintsOn, announce])

  useEffect(() => {
    if (!zClampEnabled) {
      setZClampUrlMin(undefined)
      setZClampUrlMax(undefined)
      return
    }
    if (!clampIsValid || clampMinNum == null || clampMaxNum == null) return
    setZClampUrlMin(String(clampMinNum))
    setZClampUrlMax(String(clampMaxNum))
  }, [zClampEnabled, clampIsValid, clampMinNum, clampMaxNum])

  const resetClamp = useCallback(() => {
    setZClampEnabled(false)
    setZClampMin('')
    setZClampMax('')
    setZClampUrlMin(undefined)
    setZClampUrlMax(undefined)
  }, [])

  useSurface3DUrlSync({
    plotView,
    resolutionMode,
    contoursOn,
    axisMode,
    viewMode,
    camera,
    cameraAlmostEqual,
    colorScale,
    reverseScale,
    showColorbar,
    surfaceOpacity,
    zClampEnabled,
    zClampUrlMin,
    zClampUrlMax,
    isInteracting,
  })

  useEffect(() => {
    if (typeof Worker === 'undefined') return
    if (workerRef.current) return

    const pendingMap = workerPendingRef.current

    try {
      const worker = new Worker(new URL('./surface3dWorker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker

      const teardownWorker = (reason: string) => {
        // Reject all pending requests to avoid a stuck "Computing surface" state.
        for (const [token, pending] of pendingMap.entries()) {
          pending.reject(new Error(reason))
          pendingMap.delete(token)
        }

        workerRef.current = null
        try {
          worker.terminate()
        } catch {
          // ignore
        }
      }

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as
          | { type: 'result'; token: number; payload: SurfacePayload; hasValid: boolean }
          | { type: 'error'; token: number; message: string }

        const pending = pendingMap.get(data.token)
        if (!pending) return
        pendingMap.delete(data.token)

        if (data.type === 'result') {
          pending.resolve({ payload: data.payload, hasValid: data.hasValid })
        } else {
          pending.reject(new Error(data.message))
        }
      }

      worker.onerror = () => {
        teardownWorker('Surface worker failed to load')
      }

      worker.onmessageerror = () => {
        teardownWorker('Surface worker message error')
      }
    } catch {
      workerRef.current = null
    }

    return () => {
      const worker = workerRef.current
      workerRef.current = null
      for (const [token, pending] of pendingMap.entries()) {
        pending.reject(new Error('Surface worker terminated'))
        pendingMap.delete(token)
      }
      if (worker) {
        try {
          worker.terminate()
        } catch {
          // ignore
        }
      }
    }
  }, [])

  const dragGestureRef = useRef<{ x: number; y: number; t: number; active: boolean }>({
    x: 0,
    y: 0,
    t: 0,
    active: false,
  })
  const ignoreNextClickRef = useRef(false)

  const beginInteraction = useCallback(() => {
    if (!isInteractingRef.current) {
      isInteractingRef.current = true
      setIsInteracting(true)
    }

    if (interactionTimerRef.current != null) {
      window.clearTimeout(interactionTimerRef.current)
    }

    interactionTimerRef.current = window.setTimeout(() => {
      interactionTimerRef.current = null
      isInteractingRef.current = false
      setIsInteracting(false)
    }, 200)
  }, [])

  const endInteractionNow = useCallback(() => {
    if (interactionTimerRef.current != null) {
      window.clearTimeout(interactionTimerRef.current)
      interactionTimerRef.current = null
    }
    isInteractingRef.current = false
    setIsInteracting(false)
    dragGestureRef.current.active = false
  }, [])

  const paramSignature = useMemo(
    () => `${useStd ? '1' : '0'}::${paramsKey4(params)}::${resolutionMode}::${axisMode}`,
    [params, useStd, resolutionMode, axisMode],
  )

  const computeSurface = useCallback(
    async (nx: number, ny: number, token: number, yieldEveryRows: number): Promise<SurfaceComputeResult> => {
      const xVals = linspace(PANEL_X_MIN, PANEL_X_MAX, nx)
      const yVals = linspace(PANEL_Y_MIN, PANEL_Y_MAX, ny)

      const zGrid: Array<Array<number | null>> = []
      let anyValid = false

      for (let j = 0; j < yVals.length; j += 1) {
        if (token !== tokenRef.current) throw new SurfaceCancelledError()

        const y = yVals[j]
        const row: Array<number | null> = new Array(xVals.length)

        for (let i = 0; i < xVals.length; i += 1) {
          if ((i & 7) === 0 && token !== tokenRef.current) throw new SurfaceCancelledError()
          const x = xVals[i]
          const z = safeZ({ ...params, X: x, Y: y }, useStd)
          row[i] = z
          if (z != null) anyValid = true
        }

        zGrid.push(row)

        if (yieldEveryRows > 0 && (j + 1) % yieldEveryRows === 0) {
          await nextFrame()
        }
      }

      const computedCurrent = safeZ(params, useStd)
      const currentZ = Number.isFinite(canonicalZ) ? (canonicalZ as number) : computedCurrent

      return {
        payload: {
          xVals,
          yVals,
          zGrid,
          currentZ: Number.isFinite(currentZ) ? (currentZ as number) : null,
          computedAt: Date.now(),
          nx,
          ny,
        },
        hasValid: anyValid,
      }
    },
    [params, useStd, canonicalZ],
  )

  const computeSurfaceAsync = useCallback(
    async (nx: number, ny: number, token: number): Promise<SurfaceComputeResult> => {
      const yieldEvery = nx <= 22 ? 4 : 1
      const worker = workerRef.current
      if (!worker) {
        return computeSurface(nx, ny, token, yieldEvery)
      }

      let timeoutId: number | undefined

      try {
        const viaWorker = new Promise<SurfaceComputeResult>((resolve, reject) => {
          workerPendingRef.current.set(token, { resolve, reject })
          worker.postMessage({
            type: 'compute',
            token,
            nx,
            ny,
            params,
            useStd,
            canonicalZ: Number.isFinite(canonicalZ) ? (canonicalZ as number) : null,
          })
        })

        const withTimeout = new Promise<SurfaceComputeResult>((resolve, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error('Surface worker timed out')), 12_000)
          void viaWorker.then(resolve, reject)
        })

        return await withTimeout
      } catch {
        // Worker failed or stalled; tear it down and fall back to main-thread compute.
        workerPendingRef.current.delete(token)
        try {
          worker.terminate()
        } catch {
          // ignore
        }
        if (workerRef.current === worker) workerRef.current = null
        return computeSurface(nx, ny, token, yieldEvery)
      } finally {
        if (timeoutId != null) window.clearTimeout(timeoutId)
      }
    },
    [computeSurface, params, useStd, canonicalZ],
  )

  const commitSurface = useCallback((result: SurfaceComputeResult, quality: Quality) => {
    if (!result.hasValid) {
      setSurfaceError('Surface unavailable (invalid model output)')
      // Keep last successful surface visible if it exists.
      if (!surfaceRef.current) {
        setSurface(null)
      }
      return
    }

    setSurfaceError(null)
    if (quality === 'LOW') lowSurfaceRef.current = result.payload
    if (quality === 'HIGH') highSurfaceRef.current = result.payload

    const isAuto = resolutionModeRef.current === 'AUTO'
    const interacting = isInteractingRef.current

    if (isAuto && interacting && quality === 'HIGH') {
      // Save HIGH for later; do not swap visible surface mid-gesture.
      return
    }

    setDisplayedQuality(quality)
    setSurface(result.payload)
    surfaceRef.current = result.payload
  }, [])

  const logistic = useCallback((s: number): number => {
    const zRaw = 1 / (1 + Math.exp(-s))
    const zMin = STRUCTURAL_MIN
    const zMax = 1 - zMin
    return zRaw < zMin ? zMin : zRaw > zMax ? zMax : zRaw
  }, [])

  const computeDocSurface = useCallback(
    async (nx: number, ny: number, token: number, yieldEveryRows: number): Promise<SurfaceComputeResult> => {
      const xVals = linspace(DOC_PHI_MIN, DOC_PHI_MAX, nx)
      const yVals = linspace(DOC_L_MIN, DOC_L_MAX, ny)

      const zGrid: Array<Array<number | null>> = []
      for (let j = 0; j < yVals.length; j += 1) {
        if (token !== tokenRef.current) throw new SurfaceCancelledError()
        const l = yVals[j]
        const row: Array<number | null> = new Array(xVals.length)
        for (let i = 0; i < xVals.length; i += 1) {
          if ((i & 7) === 0 && token !== tokenRef.current) throw new SurfaceCancelledError()
          const phi = xVals[i]
          row[i] = logistic(phi + l)
        }
        zGrid.push(row)
        if (yieldEveryRows > 0 && (j + 1) % yieldEveryRows === 0) {
          await nextFrame()
        }
      }

      // Current doc-space Z
      let currentZ: number | null = null
      try {
        const r = calculateModel(uiToModelParams(params), { modifiersAreStandardized: useStd })
        const alpha = params.alpha ?? OPTIMIZED_STRUCTURAL_PARAMS.alpha
        const beta = params.beta ?? OPTIMIZED_STRUCTURAL_PARAMS.beta
        const k = params.k ?? OPTIMIZED_STRUCTURAL_PARAMS.k
        const B = computeStructuralBase(params.X, params.Y, alpha, beta)
        const l = Math.log(B / k)
        currentZ = logistic(r.phi + l)
      } catch {
        currentZ = null
      }

      return {
        payload: {
          xVals,
          yVals,
          zGrid,
          currentZ,
          computedAt: Date.now(),
          nx,
          ny,
        },
        hasValid: true,
      }
    },
    [params, useStd, logistic],
  )

  useEffect(() => {
    if (resolutionMode !== 'AUTO') return
    if (isInteracting) return
    if (!highSurfaceRef.current) return
    if (surfaceRef.current === highSurfaceRef.current && displayedQuality === 'HIGH') return

    setSurface(highSurfaceRef.current)
    surfaceRef.current = highSurfaceRef.current
    setDisplayedQuality('HIGH')
  }, [displayedQuality, isInteracting, resolutionMode])

  const handleClick = useCallback(
    (event: unknown) => {
      const shiftKey = Boolean((event as unknown as { event?: { shiftKey?: unknown } })?.event?.shiftKey)
      const e = event as { points?: Array<{ x?: unknown; y?: unknown; z?: unknown; data?: unknown }> }
      const p0 = e?.points?.[0]

      // Overlay traces should never steal click targets.
      if (p0 && isOverlayTracePoint(p0)) {
        if (shiftKey) {
          showPinNotice('Shift+Click the surface (not an overlay line) to pin.')
        }
        return
      }

      if (shiftKey) {
        if (!surface) {
          showPinNotice('Surface not ready; wait for compute.')
          return
        }

        const xCoerced = toFiniteNumber(p0?.x)
        const yCoerced = toFiniteNumber(p0?.y)
        if (!isFiniteNumber(xCoerced) || !isFiniteNumber(yCoerced)) {
          showPinNotice('Shift+Click a valid cell to pin.')
          return
        }

        const ix = nearestIndex(surface.xVals, xCoerced)
        const iy = nearestIndex(surface.yVals, yCoerced)
        if (ix < 0 || iy < 0 || ix >= surface.xVals.length || iy >= surface.yVals.length) {
          showPinNotice('Shift+Click a valid cell to pin.')
          return
        }

        const z0Raw = surface.zGrid?.[iy]?.[ix]
        const zEvent = toFiniteNumber(p0?.z)
        const z0 = isFiniteNumber(z0Raw) ? z0Raw : isFiniteNumber(zEvent) ? zEvent : NaN
        if (!isFiniteNumber(z0)) {
          showPinNotice('Shift+Click a valid (non-null) cell to pin.')
          return
        }

        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        addPin({ id, x: xCoerced, y: yCoerced, z: z0, ix, iy, t: performance.now() })
        return
      }

      // Only ignore non-shift clicks after checking shiftKey.
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false
        return
      }

      // In documentation axes mode, disable scenario application since plot X/Y are not panel coordinates.
      if (axisMode === 'DOC') {
        announce('Apply scenario is disabled in DOC axes')
        return
      }

      if (!onApplyScenario) return

      const xCoerced = toFiniteNumber(p0?.x)
      const yCoerced = toFiniteNumber(p0?.y)

      if (!isFiniteNumber(xCoerced) || !isFiniteNumber(yCoerced)) return

      const x = clamp(xCoerced, PANEL_X_MIN, PANEL_X_MAX)
      const y = clamp(yCoerced, PANEL_Y_MIN, PANEL_Y_MAX)

      onApplyScenario({
        params: {
          ...params,
          X: x,
          Y: y,
        },
        presetName,
      })
    },
    [onApplyScenario, params, presetName, surface, addPin, showPinNotice, axisMode, announce],
  )

  const onPlotPointerDown = useCallback(
    (e: React.PointerEvent) => {
      beginInteraction()
      if (resolutionModeRef.current === 'AUTO' && lowSurfaceRef.current && displayedQuality === 'HIGH') {
        setSurface(lowSurfaceRef.current)
        surfaceRef.current = lowSurfaceRef.current
        setDisplayedQuality('LOW')
      }

    dragGestureRef.current = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      active: true,
    }
    },
    [beginInteraction, displayedQuality],
  )

  const onPlotPointerUp = useCallback((e: React.PointerEvent) => {
    beginInteraction()
    if (!dragGestureRef.current.active) return
    const dx = e.clientX - dragGestureRef.current.x
    const dy = e.clientY - dragGestureRef.current.y
    const dist = Math.hypot(dx, dy)
    const elapsed = performance.now() - dragGestureRef.current.t
    dragGestureRef.current.active = false

    // Heuristic: if the user dragged to rotate/zoom, ignore the next Plotly click.
    if (dist > 6 || elapsed > 400) {
      ignoreNextClickRef.current = true
    }
  }, [beginInteraction])

  const onPlotPointerCancel = useCallback(() => {
    beginInteraction()
    dragGestureRef.current.active = false
  }, [beginInteraction])

  const handleRelayout = useCallback(
    (update: Record<string, unknown>) => {
      const nextCamera = update?.['scene.camera'] as unknown
      if (!nextCamera || typeof nextCamera !== 'object') return
      beginInteraction()
      if (viewModeRef.current !== 'FREE') {
        setViewMode('FREE')
      }
      enqueueCameraUpdate(nextCamera as Camera)
    },
    [beginInteraction, enqueueCameraUpdate],
  )

  const plotlyToImage = useCallback((graph: HTMLElement, options: { format: 'png'; width: number; height: number; scale: number }) => (
    Plotly as unknown as { toImage: (el: HTMLElement, opts: typeof options) => Promise<string> }
  ).toImage(graph, options), [])
  const plotlyRedraw = useCallback((graph: HTMLElement) => {
    ;(Plotly as unknown as { redraw?: (el: HTMLElement) => unknown }).redraw?.(graph)
  }, [])

  const { snapshotUrl, snapshotActive, snapshotInFlight } = useSurface3DExport({
    exportSnapshotRequest,
    onGraphReady,
    onSnapshotReady,
    graphDivRef,
    plotHostRef,
    lastGraphDivRef,
    announce,
    endInteractionNow,
    setDockOpen,
    plotView,
    resolutionModeRef,
    highSurfaceRef,
    surfaceRef,
    setSurface,
    setDisplayedQuality,
    setIsComputing,
    tokenRef,
    axisMode,
    computeDocSurface,
    computeSurfaceAsync,
    commitSurface,
    toImage: plotlyToImage,
    redraw: plotlyRedraw,
  })

  useEffect(() => {
    if (!snapshotActive) return
    if (!dockOpen) return
    // Policy: auto-close during snapshot so exports stay free of UI chrome.
    setDockOpen(false)
  }, [snapshotActive, dockOpen])
  useEffect(() => {
    if (highTimerRef.current != null) {
      window.clearTimeout(highTimerRef.current)
      highTimerRef.current = null
    }

    highScheduledRef.current = true
    setIsComputing(true)
    setSurfaceError(null)

    const getCached = (nx: number, ny: number): SurfacePayload | null => {
        const cacheKey = buildCacheKey({ useStd, axisMode, nx, ny, params })
      const cached = gridCacheRef.current.get(cacheKey)
      if (!cached) return null

      // LRU refresh
      gridCacheRef.current.delete(cacheKey)
      gridCacheRef.current.set(cacheKey, cached)
      return cached
    }

    const cachePut = (nx: number, ny: number, payload: SurfacePayload) => {
      const cacheKey = buildCacheKey({ useStd, axisMode, nx, ny, params })
      gridCacheRef.current.set(cacheKey, payload)
      if (gridCacheRef.current.size > MAX_CACHE) {
        const oldestKey = gridCacheRef.current.keys().next().value as string | undefined
        if (oldestKey) gridCacheRef.current.delete(oldestKey)
      }
    }

    const runFixed = (nx: number, ny: number, qualityLabel: Quality | 'MED' | 'HIGH' | 'LOW') => {
      announce(`Computing ${qualityLabel.toLowerCase()} resolution`)
      const cached = getCached(nx, ny)
      if (cached) {
        setSurfaceError(null)
        setSurface(cached)
        surfaceRef.current = cached
        if (qualityLabel === 'LOW' || qualityLabel === 'HIGH') setDisplayedQuality(qualityLabel)
        setIsComputing(false)
        return
      }

      const token = ++tokenRef.current
      const runner = axisMode === 'DOC'
        ? computeDocSurface(nx, ny, token, qualityLabel === 'LOW' ? 4 : qualityLabel === 'MED' ? 2 : 1)
        : computeSurfaceAsync(nx, ny, token)
      runner
        .then((result) => {
          if (token !== tokenRef.current) return
          if (result.hasValid) cachePut(nx, ny, result.payload)
          if (qualityLabel === 'LOW' || qualityLabel === 'HIGH') commitSurface(result, qualityLabel)
          else {
            // MED does not participate in displayedQuality (AUTO), but we still display it.
            if (!result.hasValid) {
              setSurfaceError('Surface unavailable (invalid model output)')
              if (!surfaceRef.current) setSurface(null)
            } else {
              setSurfaceError(null)
              setSurface(result.payload)
              surfaceRef.current = result.payload
            }
          }
          setIsComputing(false)
        })
        .catch((err: unknown) => {
          if (err instanceof SurfaceCancelledError) return
          setSurfaceError('Surface unavailable (invalid model output)')
          if (token === tokenRef.current) setIsComputing(false)
        })
    }

    if (resolutionMode !== 'AUTO') {
      highScheduledRef.current = false
      if (resolutionMode === 'LOW') {
        runFixed(LOW_NX, LOW_NY, 'LOW')
      } else if (resolutionMode === 'MED') {
        runFixed(MED_NX, MED_NY, 'MED')
      } else {
        runFixed(HIGH_NX, HIGH_NY, 'HIGH')
      }

      return () => {
        if (highTimerRef.current != null) {
          window.clearTimeout(highTimerRef.current)
          highTimerRef.current = null
        }
        highScheduledRef.current = false
      }
    }

    const tokenLow = ++tokenRef.current

    announce('Computing low resolution')

    const lowRunner = axisMode === 'DOC'
      ? computeDocSurface(LOW_NX, LOW_NY, tokenLow, 4)
      : computeSurfaceAsync(LOW_NX, LOW_NY, tokenLow)
    lowRunner
      .then((result) => {
        if (tokenLow !== tokenRef.current) return
        commitSurface(result, 'LOW')
        if (!highScheduledRef.current && tokenLow === tokenRef.current) {
          setIsComputing(false)
        }
      })
      .catch((err: unknown) => {
        if (err instanceof SurfaceCancelledError) return
        setSurfaceError('Surface unavailable (invalid model output)')
      })

    highTimerRef.current = window.setTimeout(() => {
      highScheduledRef.current = false

      const cached = getCached(AUTO_HIGH_NX, AUTO_HIGH_NY)
      if (cached) {
        setSurfaceError(null)
        setDisplayedQuality('HIGH')
        setSurface(cached)
        surfaceRef.current = cached
        setIsComputing(false)
        return
      }

      const tokenHigh = ++tokenRef.current
      setIsComputing(true)

      announce('Computing high resolution')

      const highRunner = axisMode === 'DOC'
        ? computeDocSurface(AUTO_HIGH_NX, AUTO_HIGH_NY, tokenHigh, 1)
        : computeSurfaceAsync(AUTO_HIGH_NX, AUTO_HIGH_NY, tokenHigh)
      highRunner
        .then((result) => {
          if (tokenHigh !== tokenRef.current) return

          if (result.hasValid) {
            cachePut(AUTO_HIGH_NX, AUTO_HIGH_NY, result.payload)
          }

          commitSurface(result, 'HIGH')
          setIsComputing(false)
        })
        .catch((err: unknown) => {
          if (err instanceof SurfaceCancelledError) return
          setSurfaceError('Surface unavailable (invalid model output)')
          if (tokenHigh === tokenRef.current) setIsComputing(false)
        })
    }, IDLE_MS)

    return () => {
      if (highTimerRef.current != null) {
        window.clearTimeout(highTimerRef.current)
        highTimerRef.current = null
      }
      highScheduledRef.current = false
    }
  }, [paramSignature, computeSurfaceAsync, commitSurface, params, useStd, resolutionMode, announce, axisMode, computeDocSurface])

  useEffect(() => {
    return () => {
      if (announceTimerRef.current != null) {
        window.clearTimeout(announceTimerRef.current)
        announceTimerRef.current = null
      }
    }
  }, [announce])

  const zCanonical = useMemo(() => {
    if (Number.isFinite(canonicalZ)) return canonicalZ as number
    if (Number.isFinite(surface?.currentZ)) return surface?.currentZ as number
    return null
  }, [canonicalZ, surface])

  const currentZValue = zCanonical

  // Marker must match canonical Z by design.
  const markerZ = useMemo(() => zCanonical ?? 0, [zCanonical])

  // Current documentation-space coordinates for marker: (phi, ln(B/k))
  const currentDocCoords = useMemo(() => {
    try {
      const r = calculateModel(uiToModelParams(params), { modifiersAreStandardized: useStd })
      const alpha = params.alpha ?? OPTIMIZED_STRUCTURAL_PARAMS.alpha
      const beta = params.beta ?? OPTIMIZED_STRUCTURAL_PARAMS.beta
      const k = params.k ?? OPTIMIZED_STRUCTURAL_PARAMS.k
      const B = computeStructuralBase(params.X, params.Y, alpha, beta)
      const l = Math.log(B / k)
      const phi = r.phi
      if (!Number.isFinite(phi) || !Number.isFinite(l)) return null
      return { phi, l }
    } catch {
      return null
    }
  }, [params, useStd])

  const nearestGrid = useMemo(() => {
    if (!surface) return null

    const xTarget = axisMode === 'DOC' ? currentDocCoords?.phi : params.X
    const yTarget = axisMode === 'DOC' ? currentDocCoords?.l : params.Y
    if (!Number.isFinite(xTarget) || !Number.isFinite(yTarget)) return null

    const i = nearestIndex(surface.xVals, xTarget as number)
    const j = nearestIndex(surface.yVals, yTarget as number)
    if (i < 0 || j < 0) return null
    const row = surface.zGrid[j]
    const z = row ? row[i] : null

    return {
      i,
      j,
      x: surface.xVals[i],
      y: surface.yVals[j],
      z: typeof z === 'number' && Number.isFinite(z) ? z : null,
    }
  }, [surface, axisMode, currentDocCoords, params.X, params.Y])

  const consistency = useMemo(() => {
    const hasCanonical = zCanonical != null && Number.isFinite(zCanonical)
    const zGridNearest = nearestGrid?.z ?? null

    const effectiveTier: 'LOW' | 'MED' | 'HIGH' = (() => {
      if (resolutionMode === 'AUTO') return displayedQuality
      return resolutionMode
    })()

    const epsGridAbs = EPS_GRID_ABS[effectiveTier]

    if (!hasCanonical) {
      return {
        kind: 'unknown' as const,
        label: 'Canonical missing',
        deltaMarker: null as number | null,
        deltaGrid: null as number | null,
        epsGridAbs,
        effectiveTier,
      }
    }

    const deltaMarker = markerZ - (zCanonical as number)
    if (Math.abs(deltaMarker) > EPS_MARKER_ABS) {
      return {
        kind: 'error' as const,
        label: `Mismatch (marker Δ=${deltaMarker.toExponential(2)})`,
        deltaMarker,
        deltaGrid: zGridNearest != null ? zGridNearest - (zCanonical as number) : null,
        epsGridAbs,
        effectiveTier,
      }
    }

    if (zGridNearest == null) {
      return {
        kind: 'warn' as const,
        label: 'No grid sample',
        deltaMarker,
        deltaGrid: null as number | null,
        epsGridAbs,
        effectiveTier,
      }
    }

    const deltaGrid = zGridNearest - (zCanonical as number)
    if (Math.abs(deltaGrid) > epsGridAbs) {
      return {
        kind: 'warn' as const,
        label: `Δgrid=${deltaGrid.toExponential(2)}`,
        deltaMarker,
        deltaGrid,
        epsGridAbs,
        effectiveTier,
      }
    }

    return {
      kind: 'ok' as const,
      label: 'Consistent',
      deltaMarker,
      deltaGrid,
      epsGridAbs,
      effectiveTier,
    }
  }, [zCanonical, markerZ, nearestGrid, resolutionMode, displayedQuality])

  const thresholdBand = useMemo(() => {
    if (!surface) return [] as Array<{ x: number; y: number; z: number }>

    const effectiveTier: 'LOW' | 'MED' | 'HIGH' = (() => {
      if (resolutionMode === 'AUTO') return displayedQuality
      return resolutionMode
    })()

    const thresholdEps = effectiveTier === 'HIGH' ? 0.004 : effectiveTier === 'MED' ? 0.006 : 0.01
    const cacheKey = `${surfaceKey}::thresholdBand::${effectiveTier}::${thresholdEps}`
    const cached = thresholdBandCacheRef.current.get(cacheKey)
    if (cached) {
      thresholdBandCacheRef.current.delete(cacheKey)
      thresholdBandCacheRef.current.set(cacheKey, cached)
      return cached
    }

    const thresholdPoints: Array<{ x: number; y: number; z: number }> = []

    for (let j = 0; j < surface.yVals.length; j += 1) {
      const y = surface.yVals[j]
      const row = surface.zGrid[j]
      if (!row) continue
      for (let i = 0; i < surface.xVals.length; i += 1) {
        const z = row[i]
        if (typeof z !== 'number' || !Number.isFinite(z)) continue
        if (Math.abs(z - EMERGENCE_THRESHOLD_Z) <= thresholdEps) {
          thresholdPoints.push({ x: surface.xVals[i], y, z })
        }
      }
    }

    const maxPoints = 1400
    const band =
      thresholdPoints.length > maxPoints
        ? thresholdPoints.filter((_, idx) => idx % Math.ceil(thresholdPoints.length / maxPoints) === 0)
        : thresholdPoints

    thresholdBandCacheRef.current.set(cacheKey, band)
    if (thresholdBandCacheRef.current.size > 10) {
      const oldest = thresholdBandCacheRef.current.keys().next().value as string | undefined
      if (oldest) thresholdBandCacheRef.current.delete(oldest)
    }

    return band
  }, [surface, surfaceKey, resolutionMode, displayedQuality])

  // =========================================================================
  // CI (95%) UPPER / LOWER SURFACES (B-02 uncertainty bands)
  // =========================================================================
  const hasCi95 = useMemo(() => {
    if (!estimatedCoeffCi95Map) return false
    return Object.keys(estimatedCoeffCi95Map).length > 0
  }, [estimatedCoeffCi95Map])

  const ciBandsCacheRef = useRef<Map<string, { zLower: Array<Array<number | null>>; zUpper: Array<Array<number | null>> }>>(new Map())

  const ciSurfaces = useMemo<{ zLower: Array<Array<number | null>>; zUpper: Array<Array<number | null>> } | null>(() => {
    if (!showCiBands || !hasCi95 || !surface) return null

    // Cap CI resolution at MED to protect frame rate
    const ciNx = Math.min(surface.xVals.length, MED_NX)
    const ciNy = Math.min(surface.yVals.length, MED_NY)
    const xStep = Math.max(1, Math.round(surface.xVals.length / ciNx))
    const yStep = Math.max(1, Math.round(surface.yVals.length / ciNy))

    const cacheKey = `${surfaceKey}::ci::${ciNx}x${ciNy}`
    const cached = ciBandsCacheRef.current.get(cacheKey)
    if (cached) {
      ciBandsCacheRef.current.delete(cacheKey)
      ciBandsCacheRef.current.set(cacheKey, cached)
      return cached
    }

    // Build lower/upper coefficient overrides from ci95Map
    const lowerCoeffs: Record<string, number> = {}
    const upperCoeffs: Record<string, number> = {}
    for (const [key, [lo, hi]] of Object.entries(estimatedCoeffCi95Map)) {
      lowerCoeffs[key] = lo
      upperCoeffs[key] = hi
    }
    // Fill in point estimates for keys without CI
    if (activeCoefficientSet) {
      for (const [key, val] of Object.entries(activeCoefficientSet)) {
        if (!(key in lowerCoeffs)) lowerCoeffs[key] = val
        if (!(key in upperCoeffs)) upperCoeffs[key] = val
      }
    }

    // Use the same grid as the main surface but possibly sub-sampled
    const xVals = surface.xVals.filter((_, i) => i % xStep === 0)
    const yVals = surface.yVals.filter((_, i) => i % yStep === 0)

    const zLower: Array<Array<number | null>> = []
    const zUpper: Array<Array<number | null>> = []

    for (let j = 0; j < yVals.length; j += 1) {
      const rowLo: Array<number | null> = new Array(xVals.length)
      const rowHi: Array<number | null> = new Array(xVals.length)
      const y = yVals[j]

      for (let i = 0; i < xVals.length; i += 1) {
        const x = xVals[i]
        const baseParams = { ...params, X: x, Y: y }
        try {
          const rLo = calculateModel(uiToModelParams(baseParams), { modifiersAreStandardized: useStd, coefficients: lowerCoeffs })
          rowLo[i] = Number.isFinite(rLo?.Z) ? rLo.Z : null
        } catch { rowLo[i] = null }
        try {
          const rHi = calculateModel(uiToModelParams(baseParams), { modifiersAreStandardized: useStd, coefficients: upperCoeffs })
          rowHi[i] = Number.isFinite(rHi?.Z) ? rHi.Z : null
        } catch { rowHi[i] = null }
      }

      zLower.push(rowLo)
      zUpper.push(rowHi)
    }

    const result = { zLower, zUpper }

    // LRU cache (max 6 entries)
    ciBandsCacheRef.current.set(cacheKey, result)
    if (ciBandsCacheRef.current.size > 6) {
      const oldest = ciBandsCacheRef.current.keys().next().value as string | undefined
      if (oldest) ciBandsCacheRef.current.delete(oldest)
    }

    return result
  }, [showCiBands, hasCi95, surface, surfaceKey, params, useStd, estimatedCoeffCi95Map, activeCoefficientSet])

  // Sub-sampled x/y values for CI grids (may differ from main surface if resolution capped)
  const ciGridAxes = useMemo(() => {
    if (!surface || !ciSurfaces) return null
    const xStep = Math.max(1, Math.round(surface.xVals.length / MED_NX))
    const yStep = Math.max(1, Math.round(surface.yVals.length / MED_NY))
    return {
      x: surface.xVals.filter((_, i) => i % xStep === 0),
      y: surface.yVals.filter((_, i) => i % yStep === 0),
    }
  }, [surface, ciSurfaces])

  const data = useMemo<PlotParams['data'] | null>(() => {
    if (!surface) return null

    if (plotView === '2D') {
      const zMin = isFiniteNumber(zMinEff) ? zMinEff : 0
      const zMax = isFiniteNumber(zMaxEff) ? zMaxEff : 1
      const axisLabels = axisMode === 'DOC' ? { x: 'Field (φ)', y: 'ln(B/k)' } : { x: 'Settlement (X)', y: 'Inequality (Y)' }

      const gridTrace =
        (contoursOn
          ? {
              type: 'contour',
              x: surface.xVals,
              y: surface.yVals,
              z: surface.zGrid,
              ...buildHeatmapLegendOptions(showColorbar),
              colorscale: effectiveColorscale,
              reversescale: reverseScale,
              zmin: zMin,
              zmax: zMax,
              contours:
                contourLevels && isFiniteNumber(contourLevels.start) && isFiniteNumber(contourLevels.end) && isFiniteNumber(contourLevels.size)
                  ? { coloring: 'heatmap', start: contourLevels.start, end: contourLevels.end, size: contourLevels.size }
                  : { coloring: 'heatmap' },
              hovertemplate:
                `${axisLabels.x}=%{x:.2f}<br>${axisLabels.y}=%{y:.2f}<br>Emergence (Z)=%{z:.3f}<extra></extra>`,
            }
          : {
              type: 'heatmap',
              x: surface.xVals,
              y: surface.yVals,
              z: surface.zGrid,
              ...buildHeatmapLegendOptions(showColorbar),
              colorscale: effectiveColorscale,
              reversescale: reverseScale,
              zmin: zMin,
              zmax: zMax,
              hovertemplate:
                `${axisLabels.x}=%{x:.2f}<br>${axisLabels.y}=%{y:.2f}<br>Emergence (Z)=%{z:.3f}<extra></extra>`,
            }) as unknown as PlotDataItem

      const threshold2d =
        (thresholdBand.length
          ? {
              type: 'scatter',
              mode: 'markers',
              x: thresholdBand.map((p) => p.x),
              y: thresholdBand.map((p) => p.y),
              marker: { size: 3, color: '#f59e0b', opacity: 0.8 },
              hovertemplate:
                `Z≈${EMERGENCE_THRESHOLD_Z.toFixed(2)}<br>${axisLabels.x}=%{x:.2f}<br>${axisLabels.y}=%{y:.2f}<extra></extra>`,
              name: `Z≈${EMERGENCE_THRESHOLD_Z.toFixed(2)}`,
              showlegend: false,
            }
          : null) as unknown as PlotDataItem | null

      const marker2d =
        ({
          type: 'scatter',
          mode: 'markers+text',
          x: axisMode === 'DOC' ? [currentDocCoords?.phi ?? 0] : [params.X],
          y: axisMode === 'DOC' ? [currentDocCoords?.l ?? 0] : [params.Y],
          marker: {
            size: 8,
            color: '#f59e0b',
            line: { width: 0 },
          },
          text: ['Current'],
          textposition: 'top center',
          hovertemplate: `${axisLabels.x}=%{x:.2f}<br>${axisLabels.y}=%{y:.2f}<extra></extra>`,
        }) as unknown as PlotDataItem

      const out: PlotDataItem[] = [gridTrace]

      if (ridgeOverlay) {
        out.push({
          type: 'heatmap',
          x: surface.xVals,
          y: surface.yVals,
          z: ridgeOverlay.z,
          opacity: ridgeOverlay.opacity,
          colorscale: 'Greys',
          zmin: 0,
          zmax: 1,
          showscale: false,
          hoverinfo: 'skip',
          hovertemplate: '<extra></extra>',
        } as unknown as PlotDataItem)
      }

      if (threshold2d) out.push(threshold2d)

      // 95 % CI bound contours (B-02) – dashed lines in 2D view
      if (ciSurfaces && ciGridAxes) {
        for (const [label, zGrid, dash] of [
          ['CI-lower', ciSurfaces.zLower, 'dot'],
          ['CI-upper', ciSurfaces.zUpper, 'dot'],
        ] as const) {
          out.push({
            type: 'contour',
            x: ciGridAxes.x,
            y: ciGridAxes.y,
            z: zGrid,
            showscale: false,
            contours: { coloring: 'none', showlabels: false },
            line: { dash, width: 1.2, color: 'rgba(100,100,255,0.55)' },
            hoverinfo: 'skip',
            hovertemplate: '<extra></extra>',
            name: label,
            showlegend: false,
          } as unknown as PlotDataItem)
        }
      }

      out.push(marker2d)

      if (pins.length) {
        out.push({
          type: 'scatter',
          mode: 'markers+text',
          x: pins.map((p) => p.x),
          y: pins.map((p) => p.y),
          customdata: pins.map((p) => p.z),
          marker: {
            size: 7,
            symbol: 'diamond',
            color: '#f59e0b',
            opacity: 0.85,
            line: { width: 0 },
          },
          text: pins.map((_, idx) => `P${idx + 1}`),
          textposition: 'top center',
          hovertemplate:
            'Pinned<br>Settlement (X)=%{x:.2f}<br>Inequality (Y)=%{y:.2f}<br>Emergence (Z)=%{customdata:.3f}<extra></extra>',
          showlegend: false,
        } as unknown as PlotDataItem)
      }

      if (xSlicePolyline) {
        out.push({
          type: 'scatter',
          mode: 'lines',
          x: xSlicePolyline.xs,
          y: xSlicePolyline.ys,
          line: { width: 3, color: '#f59e0b' },
          hoverinfo: 'skip',
          showlegend: false,
        } as unknown as PlotDataItem)
      }

      if (ySlicePolyline) {
        out.push({
          type: 'scatter',
          mode: 'lines',
          x: ySlicePolyline.xs,
          y: ySlicePolyline.ys,
          line: { width: 3, color: '#f59e0b' },
          hoverinfo: 'skip',
          showlegend: false,
        } as unknown as PlotDataItem)
      }

      return out
    }

    const surfaceTrace =
      ({
        type: 'surface',
        x: surface.xVals,
        y: surface.yVals,
        z: surface.zGrid,
        opacity: surfaceOpacity,
        ...buildSurfaceLegendOptions(showColorbar),
        colorscale: effectiveColorscale,
        reversescale: reverseScale,
        cmin: isFiniteNumber(zMinEff) ? zMinEff : 0,
        cmax: isFiniteNumber(zMaxEff) ? zMaxEff : 1,
        contours: {
          z: {
            show: contoursOn,
            project: { z: true },
            usecolormap: true,
            highlight: false,
            start: contoursOn && contourLevels ? contourLevels.start : undefined,
            end: contoursOn && contourLevels ? contourLevels.end : undefined,
            size: contoursOn && contourLevels ? contourLevels.size : undefined,
          },
        },
        lighting: {
          ambient: 0.5,
          diffuse: 0.65,
          specular: 0.12,
          roughness: 0.85,
          fresnel: 0.04,
        },
        lightposition: { x: 120, y: 140, z: 240 },
        hovertemplate:
          `${axisMode === 'DOC' ? 'Field (φ)' : 'Settlement (X)'}=%{x:.2f}<br>${axisMode === 'DOC' ? 'ln(B/k)' : 'Inequality (Y)'}=%{y:.2f}<br>Emergence (Z)=%{z:.3f}<extra></extra>`,
      }) as unknown as PlotDataItem

    const threshold3d =
      (thresholdBand.length
        ? {
            type: 'scatter3d',
            mode: 'markers',
            x: thresholdBand.map((p) => p.x),
            y: thresholdBand.map((p) => p.y),
            z: thresholdBand.map((p) => p.z),
            marker: {
              size: 2,
              color: '#f59e0b',
              opacity: 0.85,
            },
            hovertemplate:
              `Z≈${EMERGENCE_THRESHOLD_Z.toFixed(2)}<br>${axisMode === 'DOC' ? 'Field (φ)' : 'Settlement (X)'}=%{x:.2f}<br>${axisMode === 'DOC' ? 'ln(B/k)' : 'Inequality (Y)'}=%{y:.2f}<extra></extra>`,
            name: `Z≈${EMERGENCE_THRESHOLD_Z.toFixed(2)}`,
            showlegend: false,
          }
        : null) as unknown as PlotDataItem | null

    const markerTrace =
      ({
        type: 'scatter3d',
        mode: 'markers+text',
        x: axisMode === 'DOC' ? [currentDocCoords?.phi ?? 0] : [params.X],
        y: axisMode === 'DOC' ? [currentDocCoords?.l ?? 0] : [params.Y],
        z: [markerZ],
        marker: {
          size: 4,
          color: '#f59e0b',
          line: { width: 0 },
        },
        text: ['Current'],
        textposition: 'top center',
        hovertemplate:
          `${axisMode === 'DOC' ? 'Field (φ)' : 'Settlement (X)'}=%{x:.2f}<br>${axisMode === 'DOC' ? 'ln(B/k)' : 'Inequality (Y)'}=%{y:.2f}<br>Emergence (Z)=%{z:.3f}<extra></extra>`,
      }) as unknown as PlotDataItem

    const out: PlotDataItem[] = threshold3d ? [surfaceTrace, threshold3d, markerTrace] : [surfaceTrace, markerTrace]

    // 95 % CI upper/lower band surfaces (B-02)
    if (ciSurfaces && ciGridAxes) {
      const ciColorscale: Array<[number, string]> = [[0, 'rgba(100,100,255,0.15)'], [1, 'rgba(100,100,255,0.15)']]
      for (const [label, zGrid] of [['CI-lower', ciSurfaces.zLower], ['CI-upper', ciSurfaces.zUpper]] as const) {
        out.push({
          type: 'surface',
          x: ciGridAxes.x,
          y: ciGridAxes.y,
          z: zGrid,
          opacity: 0.15,
          showscale: false,
          colorscale: ciColorscale,
          hoverinfo: 'skip',
          hovertemplate: '<extra></extra>',
          name: label,
          showlegend: false,
        } as unknown as PlotDataItem)
      }
    }

    // DOC-mode iso-response geometry overlays (paper-consistent): Z depends on u = φ + ln(B/k).
    // These lines are intentionally lightweight and non-hovering to preserve interactivity.
    if (axisMode === 'DOC') {
      const zLevels = [0.1, 0.25, 0.5, 0.75, 0.9]
      const phiLine = linspace(DOC_PHI_MIN, DOC_PHI_MAX, 500)

      // Baseline: s = s0 (where s := ln(B/k)).
      // Default to s0 = 0 (i.e., B = k), which is a natural reference in the canonical formulation.
      const s0 = 0
      {
        const xs = phiLine
        const ys = phiLine.map(() => s0)
        const zs = phiLine.map((phi) => logistic(phi + s0))

        // Halo underlay
        out.push({
          type: 'scatter3d',
          mode: 'lines',
          x: xs,
          y: ys,
          z: zs,
          meta: { role: 'overlay', kind: 'baseline-halo', level: s0 },
          line: {
            width: 8,
            color: 'rgba(0,0,0,0.55)',
          },
          hoverinfo: 'skip',
          hovertemplate: '<extra></extra>',
          showlegend: false,
        } as unknown as PlotDataItem)

        out.push({
          type: 'scatter3d',
          mode: 'lines',
          x: xs,
          y: ys,
          z: zs,
          meta: { role: 'overlay', kind: 'baseline', level: s0 },
          line: {
            width: 6,
            color: 'rgba(56,189,248,0.95)',
          },
          hoverinfo: 'skip',
          hovertemplate: '<extra></extra>',
          showlegend: false,
        } as unknown as PlotDataItem)
      }

      for (const zLevel of zLevels) {
        const u = logit(zLevel)
        const xs: Array<number | null> = []
        const ys: Array<number | null> = []
        const zs: Array<number | null> = []

        for (let i = 0; i < phiLine.length; i += 1) {
          const phi = phiLine[i]
          const l = u - phi
          const ok = l >= DOC_L_MIN && l <= DOC_L_MAX
          if (ok) {
            xs.push(phi)
            ys.push(l)
            zs.push(zLevel)
          } else {
            // Break the segment when leaving the visible domain.
            xs.push(null)
            ys.push(null)
            zs.push(null)
          }
        }

        const isRidge = Math.abs(zLevel - 0.5) < 1e-12
        const baseWidth = isRidge ? 7 : 4

        // Add a subtle halo underlay to keep lines readable over both bright and dark parts of the surface.
        out.push({
          type: 'scatter3d',
          mode: 'lines',
          x: xs,
          y: ys,
          z: zs,
          meta: { role: 'overlay', kind: isRidge ? 'ridge-halo' : 'iso-halo', level: zLevel },
          line: {
            width: baseWidth + 2,
            color: 'rgba(0,0,0,0.55)',
          },
          hoverinfo: 'skip',
          hovertemplate: '<extra></extra>',
          showlegend: false,
        } as unknown as PlotDataItem)

        out.push({
          type: 'scatter3d',
          mode: 'lines',
          x: xs,
          y: ys,
          z: zs,
          meta: { role: 'overlay', kind: isRidge ? 'ridge' : 'iso', level: zLevel },
          line: {
            width: baseWidth,
            // UI uses a dark theme; prefer high-contrast overlay lines.
            color: isRidge ? 'rgba(245,158,11,1.0)' : 'rgba(255,255,255,0.75)',
          },
          hoverinfo: 'skip',
          hovertemplate: '<extra></extra>',
          showlegend: false,
        } as unknown as PlotDataItem)
      }
    }

    if (pins.length) {
      out.push({
        type: 'scatter3d',
        mode: 'markers+text',
        x: pins.map((p) => p.x),
        y: pins.map((p) => p.y),
        z: pins.map((p) => p.z),
        marker: {
          size: 5,
          symbol: 'diamond',
          color: '#f59e0b',
          opacity: 0.85,
          line: { width: 0 },
        },
        text: pins.map((_, idx) => `P${idx + 1}`),
        textposition: 'top center',
        hovertemplate:
          'Pinned<br>Settlement (X)=%{x:.2f}<br>Inequality (Y)=%{y:.2f}<br>Emergence (Z)=%{z:.3f}<extra></extra>',
        showlegend: false,
      } as unknown as PlotDataItem)
    }

    if (xSlicePolyline) {
      out.push({
        type: 'scatter3d',
        mode: 'lines',
        x: xSlicePolyline.xs,
        y: xSlicePolyline.ys,
        z: xSlicePolyline.zs,
        line: { width: 3, color: '#f59e0b' },
        hoverinfo: 'skip',
        showlegend: false,
      } as unknown as PlotDataItem)
    }

    if (ySlicePolyline) {
      out.push({
        type: 'scatter3d',
        mode: 'lines',
        x: ySlicePolyline.xs,
        y: ySlicePolyline.ys,
        z: ySlicePolyline.zs,
        line: { width: 3, color: '#f59e0b' },
        hoverinfo: 'skip',
        showlegend: false,
      } as unknown as PlotDataItem)
    }

    return out
  }, [
    surface,
    params.X,
    params.Y,
    markerZ,
    contoursOn,
    plotView,
    thresholdBand,
    effectiveColorscale,
    reverseScale,
    showColorbar,
    surfaceOpacity,
    zMinEff,
    zMaxEff,
    contourLevels,
    ridgeOverlay,
    pins,
    xSlicePolyline,
    ySlicePolyline,
    axisMode,
    currentDocCoords,
    logistic,
    ciSurfaces,
    ciGridAxes,
  ])

  const layout = useMemo<PlotParams['layout']>(() => {
    if (plotView === '2D') {
      return {
        margin: { l: 36, r: 10, t: 10, b: 34 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#e0e0e0' },
        xaxis: { title: { text: axisMode === 'DOC' ? 'Field (φ)' : 'Settlement (X)' }, tickformat: '.2f' },
        yaxis: { title: { text: axisMode === 'DOC' ? 'ln(B/k)' : 'Inequality (Y)' }, tickformat: '.2f' },
        hovermode: 'closest',
        uirevision: 'surface2d-uirev',
      }
    }

    return {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#e0e0e0' },
      scene: {
        bgcolor: 'rgba(0,0,0,0)',
        xaxis: { title: { text: axisMode === 'DOC' ? 'Field (φ)' : 'Settlement (X)' }, tickformat: '.2f' },
        yaxis: { title: { text: axisMode === 'DOC' ? 'ln(B/k)' : 'Inequality (Y)' }, tickformat: '.2f' },
        zaxis: { title: { text: 'Emergence (Z)' }, tickformat: '.3f' },
        camera,
      },
      // Keep camera stable across surface commits.
      uirevision: 'surface3d-uirev',
    }
  }, [camera, plotView, axisMode])

  const config = useMemo<PlotParams['config']>(
    () => ({
      displaylogo: false,
      responsive: true,
      scrollZoom: true,
      modeBarButtonsToRemove: [
        'hoverClosest3d',
        'hoverCompareCartesian',
        'toggleSpikelines',
        'resetScale2d',
        'autoScale2d',
        'zoom2d',
        'pan2d',
        'select2d',
        'lasso2d',
      ],
    }),
    [],
  )

  const qualityLabel = useMemo(() => {
    if (resolutionMode === 'AUTO') return displayedQuality
    return resolutionMode
  }, [displayedQuality, resolutionMode])

  const presetBadge = useMemo(() => {
    if (presetName) return `Preset: ${presetName} (standardized)`
    return 'Preset: none (raw modifiers)'
  }, [presetName])


  return {
    DiagRow,
    adaptiveContours,
    addPinFromHover,
    announce,
    applyCamera,
    ariaAnnouncement,
    axisMode,
    clampIsValid,
    clampMaxNum,
    clampMinNum,
    className,
    clearPins,
    colorScale,
    config,
    consistency,
    contourDensity,
    contourLevels,
    contoursOn,
    currentZValue,
    customHigh,
    customLow,
    customMid,
    data,
    diagnosticsOpen,
    displayedQuality,
    dockOpen,
    dockTab,
    enqueueHoverUpdate,
    formatNumber,
    graphDivRef,
    handleClick,
    handleRelayout,
    hasCi95,
    hoverReadout,
    isComputing,
    isDevBuild,
    lastGraphDivRef,
    layout,
    markerZ,
    nearestGrid,
    onGraphReady,
    onPlotPointerCancel,
    onPlotPointerDown,
    onPlotPointerUp,
    paramsKey4,
    params,
    pinNotice,
    pins,
    plotDivRef,
    plotHostRef,
    plotView,
    presetBadge,
    presetName,
    qualityLabel,
    resetClamp,
    resolutionMode,
    reverseScale,
    ridgeHintsOn,
    ridgeMode,
    ridgeStrength,
    setAdaptiveContours,
    setAxisMode,
    setColorScale,
    setContourDensity,
    setContoursOn,
    setCustomHigh,
    setCustomLow,
    setCustomMid,
    setDiagnosticsOpen,
    setDockOpen,
    setDockTab,
    setPlotView,
    setResolutionMode,
    setReverseScale,
    setRidgeHintsOn,
    setRidgeMode,
    setRidgeStrength,
    setShowCiBands,
    setShowColorbar,
    setSurfaceOpacity,
    setXSliceIx,
    setXSliceOn,
    setXSliceX0,
    setYSliceIy,
    setYSliceOn,
    setYSliceY0,
    setZClampEnabled,
    setZClampMax,
    setZClampMin,
    showCiBands,
    showColorbar,
    showSliceNotice,
    sliceNotice,
    snapshotActive,
    snapshotInFlight,
    snapshotUrl,
    surface,
    surfaceError,
    surfaceKey,
    surfaceOpacity,
    useStd,
    viewMode,
    warnClamp,
    xSliceIx,
    xSliceOn,
    xSliceX0,
    ySliceIy,
    ySliceOn,
    ySliceY0,
    zCanonical,
    zClampEnabled,
    zClampMax,
    zClampMin,
    zMaxEff,
    zMinEff,
    zRangeRaw,
    EPS_MARKER_ABS,
  }
}

export type Surface3DSurfaceModel = ReturnType<typeof useSurface3DSurfaceModel>
