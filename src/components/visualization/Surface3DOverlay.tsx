import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BeliefParameters } from '../../types'
import Surface3DSurface from './Surface3DSurface'
import './Surface3DOverlay.css'

type Rect = {
  left: number
  top: number
  width: number
  height: number
}

const MIN_RENDER_WIDTH = 200
const MIN_RENDER_HEIGHT = 44

// Must match `Surface3DOverlay.css` padding (top/bottom). This lets the *panel* bottom
// align to a target Y while the overlay root retains its padding.
const OVERLAY_PADDING_Y = 16

function getNodeEnv(): string | undefined {
  return (globalThis as unknown as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
}

function isNonProdBuild(): boolean {
  const nodeEnv = getNodeEnv()
  // Release safety: in many Vite builds `process.env.NODE_ENV` is undefined at runtime.
  // We treat that case as production unless Vite explicitly indicates DEV mode.
  const effective = typeof nodeEnv === 'string' ? nodeEnv : import.meta.env.DEV ? 'development' : 'production'
  return effective !== 'production'
}

function warnOnceFactory() {
  const seen = new Set<string>()
  return (key: string, message: string, details?: unknown) => {
    if (!isNonProdBuild()) return
    if (seen.has(key)) return
    seen.add(key)
    if (details === undefined) console.warn(message)
    else console.warn(message, details)
  }
}

const warnOnce = warnOnceFactory()

function snapToHalfPixel(value: number): number {
  // Stabilize layout/zoom noise while staying visually aligned.
  return Math.round(value * 2) / 2
}

function rectEqualsEpsilon(a: Rect | null, b: Rect | null, eps = 0.5): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    Math.abs(a.left - b.left) <= eps &&
    Math.abs(a.top - b.top) <= eps &&
    Math.abs(a.width - b.width) <= eps &&
    Math.abs(a.height - b.height) <= eps
  )
}

function findTopBarElement(): HTMLElement | null {
  const preferred = document.querySelector<HTMLElement>('.belief-emergence-top-bar')
  if (preferred) return preferred

  // Fallback: if class names change, anchor to known TopBar content root.
  const content = document.querySelector<HTMLElement>('.top-bar-content')
  if (content?.parentElement instanceof HTMLElement) return content.parentElement

  return null
}

function findFormulaSectionElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.detailed-formula-section')
}

type Props = {
  enabled: boolean
  params: BeliefParameters
  presetName?: string
  onApplyScenario?: (payload: { params: BeliefParameters; presetName?: string }) => void
  canonicalZ?: number
  onExited?: () => void
}

export default function Surface3DOverlay({ enabled, params, presetName, onApplyScenario, canonicalZ, onExited }: Props) {
  const [rect, setRect] = useState<Rect | null>(null)
  const [ready, setReady] = useState(false)

  const [isClosing, setIsClosing] = useState(false)

  const [exportSnapshotRequest, setExportSnapshotRequest] = useState<{
    active: boolean
    requestId: string | null
  }>({ active: false, requestId: null })

  const overlayRootRef = useRef<HTMLDivElement | null>(null)
  const closeTimeoutRef = useRef<number | null>(null)
  const topBarElRef = useRef<HTMLElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const formulaElRef = useRef<HTMLElement | null>(null)
  const formulaResizeObserverRef = useRef<ResizeObserver | null>(null)
  const pendingRafRef = useRef<number>(0)
  const lastRectRef = useRef<Rect | null>(null)
  const warnedMissingAnchorRef = useRef(false)

  const rectCommitCountRef = useRef(0)
  const rectCommitWindowStartRef = useRef(0)

  const exportInProgressRef = useRef(false)
  const restoreTimerRef = useRef<number | null>(null)

  const applyGeometry = (next: Rect | null) => {
    const overlay = overlayRootRef.current
    if (!overlay || !next) return
    overlay.style.left = `${next.left}px`
    overlay.style.top = `${next.top}px`
    overlay.style.width = `${next.width}px`
    overlay.style.height = `${next.height}px`
  }

  // Ensure geometry is applied even on the first render after `ready` flips true.
  useLayoutEffect(() => {
    if (!ready || !rect) return
    applyGeometry(rect)
    // Intentionally only depends on measured geometry.
  }, [ready, rect])

  useLayoutEffect(() => {
    let cancelled = false

    const measure = (): Rect | null => {
      const el = topBarElRef.current
      if (!el) return null

      const r = el.getBoundingClientRect()

      const formulaEl = formulaElRef.current ?? findFormulaSectionElement()
      if (formulaEl && formulaElRef.current !== formulaEl) {
        formulaElRef.current = formulaEl
      }
      const formulaTop = formulaEl?.getBoundingClientRect().top

      const next: Rect = {
        left: snapToHalfPixel(r.left),
        top: snapToHalfPixel(r.top),
        width: snapToHalfPixel(r.width),
        height: snapToHalfPixel(r.height),
      }

      if (Number.isFinite(formulaTop)) {
        const desiredRootBottom = snapToHalfPixel((formulaTop as number) + OVERLAY_PADDING_Y)
        const candidateHeight = desiredRootBottom - next.top
        if (candidateHeight >= MIN_RENDER_HEIGHT) {
          next.height = candidateHeight
        }
      }

      // Fail closed when geometry is not meaningful.
      if (!Number.isFinite(next.left) || !Number.isFinite(next.top)) return null
      if (next.width < MIN_RENDER_WIDTH || next.height < MIN_RENDER_HEIGHT) return null
      return next
    }

    const commitRectIfChanged = (next: Rect | null) => {
      if (!next) {
        setReady(false)
        setRect(null)
        return
      }

      if (rectEqualsEpsilon(lastRectRef.current, next, 0.5)) {
        if (!ready) setReady(true)
        return
      }

      lastRectRef.current = next
      setRect(next)
      setReady(true)

      if (isNonProdBuild()) {
        const now = performance.now()
        if (!rectCommitWindowStartRef.current) rectCommitWindowStartRef.current = now
        if (now - rectCommitWindowStartRef.current > 1000) {
          rectCommitWindowStartRef.current = now
          rectCommitCountRef.current = 0
        }
        rectCommitCountRef.current += 1
        if (rectCommitCountRef.current > 75) {
          warnOnce('overlay:rect-churn', '[Surface3DOverlay] High rect update rate detected; check anchor stability.')
        }
      }

      // Avoid React inline styles (linted against in this repo): apply geometry directly.
      applyGeometry(next)
    }

    const scheduleMeasure = () => {
      if (cancelled) return
      if (pendingRafRef.current) return

      pendingRafRef.current = window.requestAnimationFrame(() => {
        pendingRafRef.current = 0
        commitRectIfChanged(measure())
      })
    }

    const attachToElement = (el: HTMLElement) => {
      topBarElRef.current = el
      commitRectIfChanged(measure())

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserverRef.current?.disconnect()
        resizeObserverRef.current = new ResizeObserver(() => scheduleMeasure())
        resizeObserverRef.current.observe(el)

        const formula = findFormulaSectionElement()
        if (formula) {
          formulaElRef.current = formula
          formulaResizeObserverRef.current?.disconnect()
          formulaResizeObserverRef.current = new ResizeObserver(() => scheduleMeasure())
          formulaResizeObserverRef.current.observe(formula)
        }
      }

      window.addEventListener('resize', scheduleMeasure, { passive: true })
    }

    const tryFindAndAttach = (attemptsLeft: number) => {
      if (cancelled) return

      const el = findTopBarElement()
      if (el) {
        attachToElement(el)
        return
      }

      if (!warnedMissingAnchorRef.current && isNonProdBuild()) {
        warnedMissingAnchorRef.current = true
        warnOnce('overlay:missing-anchor', '[Surface3DOverlay] TopBar anchor not found; overlay disabled.')
      }

      if (attemptsLeft <= 0) return
      window.requestAnimationFrame(() => tryFindAndAttach(attemptsLeft - 1))
    }

    // TopBar is rendered by App as a sibling; a small rAF retry loop keeps this deterministic.
    tryFindAndAttach(60)

    return () => {
      cancelled = true

      if (pendingRafRef.current) {
        window.cancelAnimationFrame(pendingRafRef.current)
        pendingRafRef.current = 0
      }

      window.removeEventListener('resize', scheduleMeasure)

      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null

      formulaResizeObserverRef.current?.disconnect()
      formulaResizeObserverRef.current = null
      formulaElRef.current = null

      topBarElRef.current = null
    }
    // Intentionally run once: this is an overlay anchored to an external DOM node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -----------------------------
  // QA TEST MATRIX — Surface3DOverlay
  // -----------------------------
  // 1) Alignment: resize window; browser zoom in/out; verify overlay stays aligned.
  // 2) Interaction: rotate/zoom surface; drag sliders fast; ensure plot stays responsive.
  // 3) Preset: toggle preset on/off; verify standardized flag semantics remain Boolean(presetName).
  // 4) Numeric fidelity: consistency indicator stays "Consistent" under normal use.
  // 5) Validation view: toggle 3D/2D; ensure instant swap with no recompute.
  // 6) Export: click EXPORT PDF; snapshot flashes briefly; PDF includes surface; interactivity restores.
  // 7) Pointer-events: clicks outside overlay panel pass through to underlying UI.
  // 8) A11y: tab through controls; focus ring visible; aria labels correct; shortcuts only when focused.
  // 9) Drag-vs-click: rotate then release; must NOT move X/Y unexpectedly.

  // Dev-only invariants (no production noise)
  useEffect(() => {
    if (!isNonProdBuild()) return
    if (!ready || !rect) return

    if (rect.width < MIN_RENDER_WIDTH || rect.height < MIN_RENDER_HEIGHT) {
      warnOnce('overlay:rect-too-small', '[Surface3DOverlay] Overlay rect too small; rendering suppressed.', rect)
    }

    const root = overlayRootRef.current
    if (root) {
      try {
        const pe = window.getComputedStyle(root).pointerEvents
        if (pe !== 'none') {
          warnOnce('overlay:pointer-events-root', '[Surface3DOverlay] Expected overlay root pointer-events:none.')
        }

        const slot = root.querySelector<HTMLElement>('.surface3d-slot')
        const slotPe = slot ? window.getComputedStyle(slot).pointerEvents : null
        if (slot && slotPe !== 'auto') {
          warnOnce('overlay:pointer-events-slot', '[Surface3DOverlay] Expected plot slot pointer-events:auto.')
        }
      } catch {
        // Ignore.
      }
    }

    // z-index: app has TopBar controls at 1002 and overlay at 1001.
    // Modal layers are unknown; do not guess.
  }, [ready, rect])

  // Handle closing animation when enabled becomes false
  useEffect(() => {
    if (enabled) {
      // If re-enabling before close completes, cancel the close
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = null
      }
      setIsClosing(false)
    } else if (!isClosing) {
      // Start closing animation
      setIsClosing(true)
      // Duration must match CSS animation (240ms)
      closeTimeoutRef.current = window.setTimeout(() => {
        closeTimeoutRef.current = null
        onExited?.()
      }, 240)
    }
    return () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = null
      }
    }
  }, [enabled, onExited, isClosing])

  // -----------------------------
  // Stage 7: PDF export snapshot integration
  // -----------------------------
  // How to test:
  // 1) Click "EXPORT PDF" in the TopBar.
  // 2) Confirm the overlay briefly switches to a static snapshot (no interaction during capture).
  // 3) Confirm the exported PDF includes the surface plot image (not blank).
  // 4) Confirm the live interactive WebGL plot is restored after export.
  //
  // Notes:
  // - We do NOT touch TopBar. The export pipeline dispatches CustomEvents from
  //   src/utils/pdf/exportBehavioralDynamicsReport.ts.
  // - We also listen for print hooks as a fallback.
  // - A 10s failsafe ensures the overlay never gets stuck in snapshot mode.
  useEffect(() => {
    const clearRestoreTimer = () => {
      if (restoreTimerRef.current != null) {
        window.clearTimeout(restoreTimerRef.current)
        restoreTimerRef.current = null
      }
    }

    const restore = () => {
      clearRestoreTimer()
      exportInProgressRef.current = false
      setExportSnapshotRequest({ active: false, requestId: null })
    }

    const start = (requestId: string) => {
      if (exportInProgressRef.current) return
      exportInProgressRef.current = true

      clearRestoreTimer()
      restoreTimerRef.current = window.setTimeout(() => {
        if (import.meta.env.DEV) {
          console.warn('[Surface3DOverlay] Export snapshot failsafe restore fired.')
        }
        restore()
      }, 10_000)

      setExportSnapshotRequest({ active: true, requestId })
    }

    const onExportStart = (evt: Event) => {
      const e = evt as CustomEvent | null
      const detail = (e && typeof e === 'object' ? (e as CustomEvent).detail : null) as
        | { requestId?: unknown }
        | null
      const requestId = typeof detail?.requestId === 'string' ? detail.requestId : `pdf-${Date.now()}`
      start(requestId)
    }

    const onExportEnd = () => {
      restore()
    }

    const onBeforePrint = () => {
      start(`print-${Date.now()}`)
    }

    const onAfterPrint = () => {
      restore()
    }

    window.addEventListener('app:export-pdf:start', onExportStart)
    window.addEventListener('app:export-pdf:end', onExportEnd)
    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('afterprint', onAfterPrint)

    const mql = window.matchMedia?.('print')
    const onMql = (e: MediaQueryListEvent) => {
      if (e.matches) onBeforePrint()
      else onAfterPrint()
    }
    try {
      mql?.addEventListener?.('change', onMql)
    } catch {
      // Ignore.
    }

    return () => {
      // Unmount safety: always restore snapshot state.
      restore()
      window.removeEventListener('app:export-pdf:start', onExportStart)
      window.removeEventListener('app:export-pdf:end', onExportEnd)
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
      try {
        mql?.removeEventListener?.('change', onMql)
      } catch {
        // Ignore.
      }
    }
  }, [])

  if (!ready || !rect) return null

  const content = (
    <div className={`surface3d-overlay-root${isClosing ? ' is-closing' : ''}`} ref={overlayRootRef} aria-hidden="false">
      <div className="surface3d-panel surface3d-panel--frameless">
        <div className="surface3d-header">
          <div className="surface3d-titles">
            <div className="surface3d-title">3D Response Surface: Z(X,Y)</div>
            <div className="surface3d-subtitle">(interactive surface will render here)</div>
          </div>
          <div className="surface3d-controls">
            <button className="surface3d-chip" type="button" disabled>
              Domain: Panel
            </button>
            <button className="surface3d-chip" type="button" disabled>
              Resolution: Low
            </button>
            <button className="surface3d-chip" type="button" disabled>
              Reset Camera
            </button>
          </div>
        </div>

        <div id="surface3d-slot" data-testid="surface3d-slot" className="surface3d-slot">
          <div className="surface3d-canvas">
            <Surface3DSurface
              className="surface3d-embedded"
              params={params}
              presetName={presetName}
              onApplyScenario={onApplyScenario}
              canonicalZ={canonicalZ}
              exportSnapshotRequest={exportSnapshotRequest}
              onSnapshotReady={({ requestId, ok }) => {
                try {
                  window.dispatchEvent(
                    new CustomEvent('app:export-pdf:snapshot-ready', { detail: { requestId, ok } }),
                  )
                } catch {
                  // Ignore.
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )

  // Important: html2canvas captures only the selected element subtree.
  // TopBar exports with captureSelector='.belief-emergence-top-bar', so we portal the overlay
  // into that subtree to make it capture-visible without touching TopBar.
  const portalTarget = topBarElRef.current
  return portalTarget ? createPortal(content, portalTarget) : content
}
