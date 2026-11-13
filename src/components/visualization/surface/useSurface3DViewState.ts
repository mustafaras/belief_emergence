import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readSurface3DStateFromUrl, writeSurface3DStateToUrl } from '../../../utils/urlState'
import {
  DEFAULT_CAMERA,
  type Camera,
} from './camera'

export type ResolutionMode = 'AUTO' | 'LOW' | 'MED' | 'HIGH'
export type PlotView = '3D' | '2D'
export type ViewMode = 'FREE' | 'ISO' | 'TOP' | 'FRONT'
export type AxisMode = 'XY' | 'DOC'

export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return true
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

export function camerasAlmostEqual(a: Camera | null | undefined, b: Camera | null | undefined): boolean {
  if (!a || !b) return false
  const tol = 1e-3
  const ae = a.eye
  const be = b.eye
  const au = a.up
  const bu = b.up
  const ac = a.center
  const bc = b.center
  if (!ae || !be || !au || !bu || !ac || !bc) return false

  const close = (x: number, y: number) => Math.abs(x - y) <= tol
  return (
    close(ae.x, be.x) &&
    close(ae.y, be.y) &&
    close(ae.z, be.z) &&
    close(au.x, bu.x) &&
    close(au.y, bu.y) &&
    close(au.z, bu.z) &&
    close(ac.x, bc.x) &&
    close(ac.y, bc.y) &&
    close(ac.z, bc.z)
  )
}

type ViewStateOptions = {
  plotDivRef: { current: HTMLDivElement | null }
  relayoutCamera: (camera: Camera) => void
}

export function useSurface3DViewState({ plotDivRef, relayoutCamera }: ViewStateOptions) {
  const initialSurface3dState = useMemo(() => readSurface3DStateFromUrl(), [])
  const [resolutionMode, setResolutionMode] = useState<ResolutionMode>(
    () => (initialSurface3dState?.resolutionMode as ResolutionMode | undefined) ?? 'AUTO',
  )
  const [plotView, setPlotView] = useState<PlotView>(() => {
    const fromUrl = initialSurface3dState?.plotView as PlotView | undefined
    if (fromUrl === '3D') return '3D'

    // Prefer 3D at startup when available, even if a stale URL carries pv=2D.
    // This matches user expectation for the "3D Surface" entry point.
    if (isWebGLAvailable()) return '3D'

    return fromUrl === '2D' ? '2D' : '3D'
  })
  const [viewMode, setViewMode] = useState<ViewMode>(() => (initialSurface3dState?.viewMode as ViewMode | undefined) ?? 'FREE')
  const [contoursOn, setContoursOn] = useState<boolean>(() => Boolean(initialSurface3dState?.contoursOn))
  const [showCiBands, setShowCiBands] = useState(false)
  const [axisMode, setAxisMode] = useState<AxisMode>(() => (initialSurface3dState?.axisMode as AxisMode | undefined) ?? 'XY')
  const [camera, setCamera] = useState<Camera>(() => (initialSurface3dState?.camera as Camera | undefined) ?? DEFAULT_CAMERA)
  const [isInteracting, setIsInteracting] = useState(false)

  const viewModeRef = useRef<ViewMode>(viewMode)
  useEffect(() => {
    viewModeRef.current = viewMode
  }, [viewMode])

  const cameraAlmostEqual = useCallback(camerasAlmostEqual, [])
  const cameraPendingRef = useRef<Camera | null>(null)
  const cameraRafRef = useRef<number | null>(null)
  const enqueueCameraUpdate = useCallback((next: Camera) => {
    cameraPendingRef.current = next
    if (cameraRafRef.current != null) return
    cameraRafRef.current = window.requestAnimationFrame(() => {
      const pending = cameraPendingRef.current
      cameraPendingRef.current = null
      if (pending) setCamera((previous) => (cameraAlmostEqual(previous, pending) ? previous : pending))
      cameraRafRef.current = null
    })
  }, [cameraAlmostEqual])

  const applyCamera = useCallback((next: Camera, nextViewMode: ViewMode) => {
    cameraPendingRef.current = null
    if (cameraRafRef.current != null) {
      window.cancelAnimationFrame(cameraRafRef.current)
      cameraRafRef.current = null
    }
    setCamera(next)
    setViewMode(nextViewMode)
    const graph = plotDivRef.current
    if (!graph) return
    try {
      relayoutCamera(next)
    } catch {
      // Ignore relayout failures; layout prop update will still apply.
    }
  }, [plotDivRef, relayoutCamera])

  const resolutionModeRef = useRef<ResolutionMode>(resolutionMode)
  const isInteractingRef = useRef<boolean>(isInteracting)
  useEffect(() => {
    resolutionModeRef.current = resolutionMode
  }, [resolutionMode])
  useEffect(() => {
    isInteractingRef.current = isInteracting
  }, [isInteracting])
  useEffect(() => () => {
    if (cameraRafRef.current != null) {
      window.cancelAnimationFrame(cameraRafRef.current)
      cameraRafRef.current = null
    }
  }, [])

  return {
    initialSurface3dState,
    resolutionMode,
    setResolutionMode,
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
    setCamera,
    cameraAlmostEqual,
    enqueueCameraUpdate,
    applyCamera,
    isInteracting,
    setIsInteracting,
    isInteractingRef,
    resolutionModeRef,
  }
}

type UrlSyncOptions = {
  plotView: PlotView
  resolutionMode: ResolutionMode
  contoursOn: boolean
  axisMode: AxisMode
  viewMode: ViewMode
  camera: Camera
  cameraAlmostEqual: typeof camerasAlmostEqual
  colorScale: string
  reverseScale: boolean
  showColorbar: boolean
  surfaceOpacity: number
  zClampEnabled: boolean
  zClampUrlMin: string | undefined
  zClampUrlMax: string | undefined
  isInteracting: boolean
}

export function useSurface3DUrlSync({
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
}: UrlSyncOptions): void {
  const surfaceUrlWriteTimerRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isInteracting) return

    if (surfaceUrlWriteTimerRef.current != null) {
      window.clearTimeout(surfaceUrlWriteTimerRef.current)
    }

    surfaceUrlWriteTimerRef.current = window.setTimeout(() => {
      writeSurface3DStateToUrl(
        {
          plotView,
          resolutionMode,
          contoursOn,
          axisMode,
          viewMode,
          camera: cameraAlmostEqual(camera, DEFAULT_CAMERA) ? undefined : camera,
          colorScale,
          reverseScale,
          showColorbar,
          surfaceOpacity,
          zmin: zClampEnabled ? zClampUrlMin : undefined,
          zmax: zClampEnabled ? zClampUrlMax : undefined,
        },
        { replace: true },
      )
    }, 150)

    return () => {
      if (surfaceUrlWriteTimerRef.current != null) {
        window.clearTimeout(surfaceUrlWriteTimerRef.current)
        surfaceUrlWriteTimerRef.current = undefined
      }
    }
  }, [
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
  ])
}
