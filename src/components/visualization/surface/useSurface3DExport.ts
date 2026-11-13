import { useCallback, useEffect, useRef, useState } from 'react'
import type { SurfacePayload } from './geometry'

type Quality = 'LOW' | 'HIGH'
type ResolutionMode = 'AUTO' | 'LOW' | 'MED' | 'HIGH'
type PlotView = '3D' | '2D'
type AxisMode = 'XY' | 'DOC'

type SurfaceComputeResult = {
  payload: SurfacePayload
  hasValid: boolean
}

type MutableRef<T> = { current: T }
type Setter<T> = (value: T | ((previous: T) => T)) => void

type Options = {
  exportSnapshotRequest?: { active: boolean; requestId: string | null }
  onGraphReady?: (graphDiv: HTMLElement | null) => void
  onSnapshotReady?: (payload: { requestId: string; ok: boolean }) => void
  graphDivRef: MutableRef<HTMLElement | null>
  plotHostRef: MutableRef<HTMLDivElement | null>
  lastGraphDivRef: MutableRef<HTMLElement | null>
  announce: (message: string) => void
  endInteractionNow: () => void
  setDockOpen: Setter<boolean>
  plotView: PlotView
  resolutionModeRef: MutableRef<ResolutionMode>
  highSurfaceRef: MutableRef<SurfacePayload | null>
  surfaceRef: MutableRef<SurfacePayload | null>
  setSurface: Setter<SurfacePayload | null>
  setDisplayedQuality: Setter<Quality>
  setIsComputing: Setter<boolean>
  tokenRef: MutableRef<number>
  axisMode: AxisMode
  computeDocSurface: (nx: number, ny: number, token: number, stride: number) => Promise<SurfaceComputeResult>
  computeSurfaceAsync: (nx: number, ny: number, token: number) => Promise<SurfaceComputeResult>
  commitSurface: (result: SurfaceComputeResult, quality: Quality) => void
  toImage: (el: HTMLElement, opts: { format: 'png'; width: number; height: number; scale: number }) => Promise<string>
  redraw: (el: HTMLElement) => void
}

const HIGH_NX = 45
const HIGH_NY = 45

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

export function isSnapshotImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/')
}

export function useSurface3DExport({
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
  toImage,
  redraw,
}: Options) {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null)
  const [snapshotActive, setSnapshotActive] = useState(false)
  const [snapshotInFlight, setSnapshotInFlight] = useState(false)
  const snapshotTokenRef = useRef(0)

  const makeSnapshot = useCallback(async (opts?: { scale?: number; retries?: number }): Promise<string | null> => {
    const gd = graphDivRef.current
    if (!gd) return null

    const hostRect = plotHostRef.current?.getBoundingClientRect()
    const rect = hostRect && hostRect.width > 0 && hostRect.height > 0 ? hostRect : gd.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))

    const scale = typeof opts?.scale === 'number' && opts.scale > 0 ? opts.scale : 2
    const retries = typeof opts?.retries === 'number' && opts.retries > 0 ? Math.floor(opts.retries) : 1

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const url = await toImage(gd, { format: 'png', width, height, scale })

        if (isSnapshotImageDataUrl(url)) return url
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn('[Surface3D] Plotly.toImage snapshot attempt failed; retrying if allowed.', e)
        }
      }

      try {
        redraw(gd)
      } catch {
        // ignore
      }

      await nextFrame()
    }

    return null
  }, [graphDivRef, plotHostRef, toImage, redraw])

  useEffect(() => {
    return () => {
      if (lastGraphDivRef.current != null) {
        lastGraphDivRef.current = null
        graphDivRef.current = null
        onGraphReady?.(null)
      }
    }
  }, [graphDivRef, lastGraphDivRef, onGraphReady])

  useEffect(() => {
    const requestId = exportSnapshotRequest?.requestId ?? null
    const requested = Boolean(exportSnapshotRequest?.active && requestId)

    if (!requested) {
      setSnapshotActive(false)
      setSnapshotUrl(null)
      setSnapshotInFlight(false)
      return
    }

    const token = (snapshotTokenRef.current += 1)
    let didReply = false

    void (async () => {
      setSnapshotInFlight(true)
      announce('Preparing snapshot')
      endInteractionNow()
      setDockOpen(false)

      if (plotView === '3D') {
        if (resolutionModeRef.current === 'AUTO' && highSurfaceRef.current) {
          setSurface(highSurfaceRef.current)
          surfaceRef.current = highSurfaceRef.current
          setDisplayedQuality('HIGH')
        } else if (!highSurfaceRef.current && resolutionModeRef.current !== 'HIGH') {
          try {
            setIsComputing(true)
            announce('Computing high resolution for export')
            const computeToken = ++tokenRef.current
            const result = await (
              axisMode === 'DOC'
                ? computeDocSurface(HIGH_NX, HIGH_NY, computeToken, 1)
                : computeSurfaceAsync(HIGH_NX, HIGH_NY, computeToken)
            )
            if (computeToken === tokenRef.current) {
              commitSurface(result, 'HIGH')
            }
          } catch {
            // ignore and attempt snapshot anyway
          } finally {
            setIsComputing(false)
          }
        }
      }

      await nextFrame()
      await nextFrame()

      const url = await makeSnapshot({ scale: 3, retries: 2 })
      if (token !== snapshotTokenRef.current) return

      if (url) {
        setSnapshotUrl(url)
        setSnapshotActive(true)
        setSnapshotInFlight(false)
        didReply = true
        onSnapshotReady?.({ requestId: requestId as string, ok: true })
        return
      }

      // Snapshot failed; keep live plot.
      setSnapshotActive(false)
      setSnapshotUrl(null)
      setSnapshotInFlight(false)
      didReply = true
      onSnapshotReady?.({ requestId: requestId as string, ok: false })
    })()

    return () => {
      if (!didReply) {
        // If the request is superseded/cancelled, ignore.
      }
    }
  }, [
    exportSnapshotRequest?.active,
    exportSnapshotRequest?.requestId,
    makeSnapshot,
    onSnapshotReady,
    announce,
    endInteractionNow,
    plotView,
    computeSurfaceAsync,
    commitSurface,
    axisMode,
    computeDocSurface,
    resolutionModeRef,
    highSurfaceRef,
    setDockOpen,
    setSurface,
    surfaceRef,
    setDisplayedQuality,
    setIsComputing,
    tokenRef,
  ])

  return { snapshotUrl, snapshotActive, snapshotInFlight }
}
