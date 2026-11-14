import './Surface3DSurface.css'
import type { ResolutionMode, Surface3DSurfaceModel } from './Surface3DSurfaceModel'
import Surface3DSurfaceDock from './Surface3DSurfaceDock'
import { downloadCsvWithComment } from '../../utils/csv/exportCsv'
import { DEFAULT_CAMERA, FRONT_CAMERA, ISO_CAMERA, TOP_CAMERA } from './surface/camera'
import { isFiniteNumber, nearestIndex, toFiniteNumber } from './surface/geometry'
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-expect-error -- `plotly.js-dist-min` ships without TypeScript declarations in this repo.
import Plotly from 'plotly.js-dist-min'

const Plot = createPlotlyComponent(Plotly)

function sampleGridIndices(length: number, maxSamples = 11): number[] {
  if (length <= maxSamples) return Array.from({ length }, (_, index) => index)
  return Array.from({ length: maxSamples }, (_, index) =>
    Math.round((index * (length - 1)) / (maxSamples - 1)),
  )
}

export default function Surface3DSurfaceView({ model }: { model: Surface3DSurfaceModel }) {
  const { DiagRow, EPS_MARKER_ABS, addPinFromHover, announce, applyCamera, ariaAnnouncement, axisMode, clampIsValid, clampMaxNum, clampMinNum, className, colorScale, config, consistency, contoursOn, data, diagnosticsOpen, displayedQuality, dockOpen, dockTab, enqueueHoverUpdate, formatNumber, graphDivRef, handleClick, handleRelayout, hasCi95, hoverReadout, isComputing, isDevBuild, lastGraphDivRef, layout, markerZ, nearestGrid, onGraphReady, onPlotPointerCancel, onPlotPointerDown, onPlotPointerUp, params, paramsKey4, pins, plotDivRef, plotHostRef, plotView, presetBadge, presetName, qualityLabel, resolutionMode, reverseScale, setContoursOn, setDiagnosticsOpen, setPlotView, setResolutionMode, setShowCiBands, setSurfaceOpacity, showCiBands, showColorbar, snapshotActive, snapshotInFlight, snapshotUrl, surface, surfaceError, surfaceKey, surfaceOpacity, useStd, viewMode, xSliceIx, xSliceOn, xSliceX0, ySliceIy, ySliceOn, ySliceY0, zCanonical, zClampEnabled, zMaxEff, zMinEff, zRangeRaw } = model
  const xSampleIndices = surface ? sampleGridIndices(surface.xVals.length) : []
  const ySampleIndices = surface ? sampleGridIndices(surface.yVals.length) : []
  const chartDescription = axisMode === 'DOC'
    ? 'Response surface of predicted Z across Phi and log(B/k). A sampled data table is available from the Data table disclosure.'
    : 'Response surface of predicted Z across settlement X and inequality Y. A sampled data table is available from the Data table disclosure.'
  return (
    <div className={`surface3d-surface-root ${className ?? ''}`.trim()}>
      <div
        className="surface3d-instrument"
        role="region"
        aria-labelledby="surface3d-title"
        aria-describedby="surface3d-description surface3d-shortcuts"
        tabIndex={0}
        onKeyDown={(e) => {
          // Keyboard shortcuts apply only when this panel is focused.
          if (e.defaultPrevented) return
          if (e.altKey || e.ctrlKey || e.metaKey) return
          const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase?.()
          if (tag === 'input' || tag === 'textarea' || tag === 'select') return

          const key = e.key.toLowerCase()
          if (key === 'r') {
            applyCamera(DEFAULT_CAMERA, 'FREE')
            announce('Camera reset')
          } else if (key === 'i') {
            applyCamera(ISO_CAMERA, 'ISO')
            announce('Camera isometric')
          } else if (key === 't') {
            applyCamera(TOP_CAMERA, 'TOP')
            announce('Camera top')
          } else if (key === 'f') {
            applyCamera(FRONT_CAMERA, 'FRONT')
            announce('Camera front')
          } else if (key === 'c') {
            setContoursOn((v) => !v)
            announce('Contours toggled')
          } else if (key === '2') {
            setPlotView('2D')
            announce('2D view')
          } else if (key === '3') {
            setPlotView('3D')
            announce('3D view')
          } else if (key === 'q') {
            setResolutionMode((prev) => {
              const next: ResolutionMode =
                prev === 'AUTO' ? 'LOW' : prev === 'LOW' ? 'MED' : prev === 'MED' ? 'HIGH' : 'AUTO'
              announce(`Resolution ${next}`)
              return next
            })
          } else if (key === 'p') {
            e.preventDefault()
            e.stopPropagation()
            addPinFromHover()
          }
        }}
      >
        <div id="surface3d-shortcuts" className="surface3d-visually-hidden">
          Keyboard shortcuts: R reset camera, I isometric, T top, F front, C toggle contours, 2 for 2D view, 3 for 3D view, Q cycle resolution.
        </div>
        <div id="surface3d-description" className="surface3d-visually-hidden">
          {chartDescription} A sampled data table is available below the plot.
        </div>
        <div className="surface3d-visually-hidden" aria-live="polite">
          {ariaAnnouncement}
        </div>
        <div className="surface3d-visually-hidden" role="status" aria-live="polite">
          {snapshotInFlight ? 'Exporting snapshot' : isComputing ? 'Computing surface' : ''}
        </div>
        <div className="surface3d-instrument-header">
          <div className="surface3d-instrument-left">
      <div className="surface3d-instrument-title-row">
              <div id="surface3d-title" className="surface3d-instrument-title">{axisMode === 'DOC' ? '3D Response Surface: Z(φ, ln(B/k))' : '3D Response Surface: Z(X,Y)'} </div>

              <Surface3DSurfaceDock model={model} />
            </div>
            <div className="surface3d-instrument-preset" title={presetBadge}>
              {presetBadge}
            </div>
          </div>

          <div className="surface3d-instrument-right">
            <div className="surface3d-control-group" role="group" aria-label="Plot view">
              {plotView === '3D' ? (
                <button
                  type="button"
                  className="surface3d-chip is-active"
                  onClick={() => setPlotView('3D')}
                  aria-label="View: 3D"
                  aria-pressed="true"
                >
                  3D
                </button>
              ) : (
                <button
                  type="button"
                  className="surface3d-chip"
                  onClick={() => setPlotView('3D')}
                  aria-label="View: 3D"
                  aria-pressed="false"
                >
                  3D
                </button>
              )}

              {plotView === '2D' ? (
                <button
                  type="button"
                  className="surface3d-chip is-active"
                  onClick={() => setPlotView('2D')}
                  aria-label="View: 2D"
                  aria-pressed="true"
                >
                  2D
                </button>
              ) : (
                <button
                  type="button"
                  className="surface3d-chip"
                  onClick={() => setPlotView('2D')}
                  aria-label="View: 2D"
                  aria-pressed="false"
                >
                  2D
                </button>
              )}
            </div>

            <div className="surface3d-control-group" role="group" aria-label="Resolution">
              {(['AUTO', 'LOW', 'MED', 'HIGH'] as const).map((mode) => {
                const active = resolutionMode === mode
                if (active) {
                  return (
                    <button
                      key={mode}
                      type="button"
                      className="surface3d-chip is-active"
                      onClick={() => setResolutionMode(mode)}
                      aria-label={`Resolution: ${mode}`}
                      aria-pressed="true"
                    >
                      {mode}
                    </button>
                  )
                }

                return (
                  <button
                    key={mode}
                    type="button"
                    className="surface3d-chip"
                    onClick={() => setResolutionMode(mode)}
                    aria-label={`Resolution: ${mode}`}
                    aria-pressed="false"
                  >
                    {mode}
                  </button>
                )
              })}
            </div>

            <div className="surface3d-control-group" role="group" aria-label="Camera">
              <button
                type="button"
                className="surface3d-chip"
                onClick={() => applyCamera(DEFAULT_CAMERA, 'FREE')}
                aria-label="View: Reset"
              >
                Reset
              </button>
              {viewMode === 'ISO' ? (
                <button
                  type="button"
                  className="surface3d-chip is-active"
                  onClick={() => applyCamera(ISO_CAMERA, 'ISO')}
                  aria-label="ISO: Isometric view"
                  aria-pressed="true"
                >
                  ISO
                </button>
              ) : (
                <button
                  type="button"
                  className="surface3d-chip"
                  onClick={() => applyCamera(ISO_CAMERA, 'ISO')}
                  aria-label="ISO: Isometric view"
                  aria-pressed="false"
                >
                  ISO
                </button>
              )}

              {viewMode === 'TOP' ? (
                <button
                  type="button"
                  className="surface3d-chip is-active"
                  onClick={() => applyCamera(TOP_CAMERA, 'TOP')}
                  aria-label="View: Top"
                  aria-pressed="true"
                >
                  Top
                </button>
              ) : (
                <button
                  type="button"
                  className="surface3d-chip"
                  onClick={() => applyCamera(TOP_CAMERA, 'TOP')}
                  aria-label="View: Top"
                  aria-pressed="false"
                >
                  Top
                </button>
              )}

              {viewMode === 'FRONT' ? (
                <button
                  type="button"
                  className="surface3d-chip is-active"
                  onClick={() => applyCamera(FRONT_CAMERA, 'FRONT')}
                  aria-label="View: Front"
                  aria-pressed="true"
                >
                  Front
                </button>
              ) : (
                <button
                  type="button"
                  className="surface3d-chip"
                  onClick={() => applyCamera(FRONT_CAMERA, 'FRONT')}
                  aria-label="View: Front"
                  aria-pressed="false"
                >
                  Front
                </button>
              )}
            </div>

            <div className="surface3d-control-group" role="group" aria-label="Readability">
              {contoursOn ? (
                <button
                  type="button"
                  className="surface3d-chip is-active"
                  onClick={() => setContoursOn((v) => !v)}
                  aria-label="Readability: Contours"
                  aria-pressed="true"
                >
                  Contours
                </button>
              ) : (
                <button
                  type="button"
                  className="surface3d-chip"
                  onClick={() => setContoursOn((v) => !v)}
                  aria-label="Readability: Contours"
                  aria-pressed="false"
                >
                  Contours
                </button>
              )}
            </div>

            {/* B-02: 95 % CI band toggle */}
            <div className="surface3d-control-group" role="group" aria-label="Uncertainty bands">
              <button
                type="button"
                className={`surface3d-chip${showCiBands ? ' is-active' : ''}`}
                onClick={() => setShowCiBands((v) => !v)}
                disabled={!hasCi95}
                aria-label="95 % CI confidence interval bands"
                aria-pressed={showCiBands}
                title={hasCi95 ? '95 % confidence interval bands' : 'CI data not available – load estimated coefficients with ci95'}
              >
                95 % CI
              </button>
            </div>

            {/* B-04c: Surface grid CSV export */}
            <div className="surface3d-control-group" role="group" aria-label="Export surface grid">
              <button
                type="button"
                className="surface3d-chip"
                disabled={!surface}
                title="Download surface grid as CSV"
                onClick={() => {
                  if (!surface) return
                  const { xVals, yVals, zGrid, nx, ny } = surface
                  const comment = `Parameters: ${paramsKey4(params).replace(/\|/g, ', ')}`
                  const qualityLabel = displayedQuality
                  const headers = ['X_value', 'Y_value', 'Z_predicted']
                  const rows: (string | number)[][] = []
                  for (let j = 0; j < yVals.length; j++) {
                    for (let i = 0; i < xVals.length; i++) {
                      const z = zGrid[j]?.[i]
                      if (z != null && Number.isFinite(z)) {
                        rows.push([xVals[i], yVals[j], z])
                      }
                    }
                  }
                  downloadCsvWithComment(
                    `belief_emergence_surface_grid_${qualityLabel}_${nx}x${ny}.csv`,
                    comment,
                    headers,
                    rows,
                  )
                }}
              >
                ⬇ Grid CSV
              </button>
            </div>

            {plotView === '3D' && (
              <div className="surface3d-control-group surface3d-opacity-group" role="group" aria-label="Surface opacity">
                <div className="surface3d-opacity-k">Opacity</div>
                <input
                  className="surface3d-opacity-slider"
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={surfaceOpacity}
                  aria-label="Surface opacity"
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (!Number.isFinite(n)) return
                    setSurfaceOpacity(Math.min(1, Math.max(0.2, n)))
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                />
                <div className="surface3d-opacity-v" aria-hidden="true">
                  {Math.round(surfaceOpacity * 100)}%
                </div>
              </div>
            )}

            <div className="surface3d-status" role="group" aria-label="Surface status">
              <div
                className={`surface3d-consistency surface3d-consistency--${consistency.kind}`}
                title={`Marker tolerance=${EPS_MARKER_ABS}. Grid tolerance=${consistency.epsGridAbs} (${consistency.effectiveTier}).`}
              >
                {consistency.label}
              </div>
              <div className="surface3d-badge" aria-hidden="true">
                {qualityLabel}
              </div>
              {snapshotInFlight && (
                <div className="surface3d-computing" aria-hidden="true">
                  Exporting…
                </div>
              )}

              {!snapshotInFlight && isComputing && (
                <div className="surface3d-computing" aria-hidden="true">
                  Computing…
                </div>
              )}

              {isDevBuild && (
                diagnosticsOpen ? (
                  <button
                    type="button"
                    className="surface3d-chip surface3d-diagnostics-button is-active"
                    onClick={() => setDiagnosticsOpen((v) => !v)}
                    aria-label="Diagnostics"
                    aria-pressed="true"
                  >
                    Diagnostics
                  </button>
                ) : (
                  <button
                    type="button"
                    className="surface3d-chip surface3d-diagnostics-button"
                    onClick={() => setDiagnosticsOpen((v) => !v)}
                    aria-label="Diagnostics"
                    aria-pressed="false"
                  >
                    Diagnostics
                  </button>
                )
              )}
            </div>
            {surface && (
              <details className="surface3d-data-table-details">
                <summary aria-label="Show response surface data table">Data table</summary>
                <p className="surface3d-data-table-description">
                  Sampled rows and columns from the computed surface grid. Use the full plot for
                  interactive exploration.
                </p>
                <div className="surface3d-data-table-scroll" role="region" aria-label="Response surface data table" tabIndex={0}>
                  <table className="surface3d-data-table">
                    <caption>Predicted Z by {axisMode === 'DOC' ? 'Phi and log(B/k)' : 'settlement X and inequality Y'}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Y \ X</th>
                        {xSampleIndices.map((index) => (
                          <th scope="col" key={index}>{formatNumber(surface.xVals[index], 3)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ySampleIndices.map((yIndex) => (
                        <tr key={yIndex}>
                          <th scope="row">{formatNumber(surface.yVals[yIndex], 3)}</th>
                          {xSampleIndices.map((xIndex) => {
                            const value = surface.zGrid[yIndex]?.[xIndex]
                            return <td key={xIndex}>{isFiniteNumber(value) ? formatNumber(value, 4) : '—'}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </div>

        <div className="surface3d-instrument-body">
          {data ? (
            <div
              className="surface3d-plot-host"
              ref={plotHostRef}
              onPointerDown={onPlotPointerDown}
              onPointerUp={onPlotPointerUp}
              onPointerCancel={onPlotPointerCancel}
            >
              <div
                className={`surface3d-plot-layer ${snapshotActive ? 'is-hidden' : ''}`.trim()}
                role="img"
                aria-label={chartDescription}
                aria-describedby="surface3d-description"
              >
                <Plot
                  className="surface3d-plot"
                  data={data}
                  layout={layout}
                  config={config}
                  useResizeHandler
                  onClick={handleClick}
                  onHover={(e) => {
                    if (!surface) {
                      enqueueHoverUpdate(null)
                      return
                    }

                    const p = (e as unknown as { points?: Array<Record<string, unknown>> })?.points?.[0]
                    if (!p) {
                      enqueueHoverUpdate(null)
                      return
                    }

                    const xCoerced = toFiniteNumber(p.x)
                    const yCoerced = toFiniteNumber(p.y)
                    const zCoerced = toFiniteNumber(p.z)

                    if (!isFiniteNumber(xCoerced) || !isFiniteNumber(yCoerced)) {
                      enqueueHoverUpdate(null)
                      return
                    }

                    const ix = nearestIndex(surface.xVals, xCoerced)
                    const iy = nearestIndex(surface.yVals, yCoerced)
                    if (ix < 0 || iy < 0 || ix >= surface.xVals.length || iy >= surface.yVals.length) {
                      enqueueHoverUpdate(null)
                      return
                    }

                    const z0Raw = surface.zGrid?.[iy]?.[ix]
                    const z0 = isFiniteNumber(z0Raw) ? z0Raw : isFiniteNumber(zCoerced) ? zCoerced : NaN

                    const dzdx = (() => {
                      if (!isFiniteNumber(z0)) return null
                      const row = surface.zGrid?.[iy]
                      if (!row) return null

                      const ixm = ix - 1
                      const ixp = ix + 1

                      if (ixm >= 0 && ixp < surface.xVals.length) {
                        const zL = row[ixm]
                        const zR = row[ixp]
                        const dx = surface.xVals[ixp] - surface.xVals[ixm]
                        if (isFiniteNumber(zL) && isFiniteNumber(zR) && isFiniteNumber(dx) && dx > 0) {
                          return (zR - zL) / dx
                        }
                      }

                      if (ixp < surface.xVals.length) {
                        const zR = row[ixp]
                        const dx = surface.xVals[ixp] - surface.xVals[ix]
                        if (isFiniteNumber(zR) && isFiniteNumber(dx) && dx > 0) {
                          return (zR - z0) / dx
                        }
                      }

                      if (ixm >= 0) {
                        const zL = row[ixm]
                        const dx = surface.xVals[ix] - surface.xVals[ixm]
                        if (isFiniteNumber(zL) && isFiniteNumber(dx) && dx > 0) {
                          return (z0 - zL) / dx
                        }
                      }

                      return null
                    })()

                    const dzdy = (() => {
                      if (!isFiniteNumber(z0)) return null

                      const iym = iy - 1
                      const iyp = iy + 1

                      if (iym >= 0 && iyp < surface.yVals.length) {
                        const rowL = surface.zGrid?.[iym]
                        const rowR = surface.zGrid?.[iyp]
                        const zL = rowL?.[ix]
                        const zR = rowR?.[ix]
                        const dy = surface.yVals[iyp] - surface.yVals[iym]
                        if (isFiniteNumber(zL) && isFiniteNumber(zR) && isFiniteNumber(dy) && dy > 0) {
                          return (zR - zL) / dy
                        }
                      }

                      if (iyp < surface.yVals.length) {
                        const rowR = surface.zGrid?.[iyp]
                        const zR = rowR?.[ix]
                        const dy = surface.yVals[iyp] - surface.yVals[iy]
                        if (isFiniteNumber(zR) && isFiniteNumber(dy) && dy > 0) {
                          return (zR - z0) / dy
                        }
                      }

                      if (iym >= 0) {
                        const rowL = surface.zGrid?.[iym]
                        const zL = rowL?.[ix]
                        const dy = surface.yVals[iy] - surface.yVals[iym]
                        if (isFiniteNumber(zL) && isFiniteNumber(dy) && dy > 0) {
                          return (z0 - zL) / dy
                        }
                      }

                      return null
                    })()

                    enqueueHoverUpdate({
                      x: xCoerced,
                      y: yCoerced,
                      z: z0,
                      ix,
                      iy,
                      dzdx,
                      dzdy,
                      t: performance.now(),
                    })
                  }}
                  onUnhover={() => enqueueHoverUpdate(null)}
                  onRelayout={(update) => {
                    handleRelayout((update ?? {}) as Record<string, unknown>)
                  }}
                  onInitialized={(figure, gd) => {
                    void figure
                    const next = gd as unknown as HTMLDivElement
                    plotDivRef.current = next
                    graphDivRef.current = next as unknown as HTMLElement

                    if (lastGraphDivRef.current !== (next as unknown as HTMLElement)) {
                      lastGraphDivRef.current = next as unknown as HTMLElement
                      onGraphReady?.(next as unknown as HTMLElement)
                    }
                  }}
                  onUpdate={(figure, gd) => {
                    void figure
                    const next = gd as unknown as HTMLDivElement
                    plotDivRef.current = next
                    graphDivRef.current = next as unknown as HTMLElement

                    if (lastGraphDivRef.current !== (next as unknown as HTMLElement)) {
                      lastGraphDivRef.current = next as unknown as HTMLElement
                      onGraphReady?.(next as unknown as HTMLElement)
                    }
                  }}
                />
              </div>

              {snapshotActive && snapshotUrl && (
                <img className="surface3d-snapshot" src={snapshotUrl} alt="Surface snapshot" />
              )}
            </div>
          ) : (
            <div className="surface3d-surface-fallback">Computing surface…</div>
          )}

          {isDevBuild && diagnosticsOpen && (
            <div className="surface3d-diagnostics" role="region" aria-label="Surface diagnostics">
              <div className="surface3d-diagnostics-title">Diagnostics</div>

              <div className="surface3d-diagnostics-grid">
                <DiagRow k="dockOpen" v={dockOpen ? 'true' : 'false'} />
                <DiagRow k="dockTab" v={dockTab} />

                <DiagRow k="plotView" v={plotView} />
                <DiagRow k="viewMode" v={viewMode} />
                <DiagRow
                  k="resolution"
                  v={
                    <>
                      {resolutionMode} (shown {qualityLabel})
                    </>
                  }
                />

                <DiagRow k="palette" v={colorScale} />
                <DiagRow k="reverse" v={reverseScale ? '1' : '0'} />
                <DiagRow k="colorbar" v={showColorbar ? '1' : '0'} />
                <DiagRow k="clampEnabled" v={zClampEnabled ? '1' : '0'} />
                <DiagRow k="clampValid" v={clampIsValid ? '1' : '0'} />
                <DiagRow
                  k="clampRange"
                  v={
                    clampIsValid && clampMinNum != null && clampMaxNum != null
                      ? `${formatNumber(clampMinNum, 3)}…${formatNumber(clampMaxNum, 3)}`
                      : '—'
                  }
                />
                <DiagRow
                  k="effectiveRange"
                  v={
                    isFiniteNumber(zMinEff) && isFiniteNumber(zMaxEff)
                      ? `${formatNumber(zMinEff, 3)}…${formatNumber(zMaxEff, 3)}`
                      : '—'
                  }
                />

                <DiagRow
                  k="hover"
                  v={
                    hoverReadout
                      ? `(${hoverReadout.ix},${hoverReadout.iy}) x=${formatNumber(hoverReadout.x, 3)} y=${formatNumber(hoverReadout.y, 3)} z=${isFiniteNumber(hoverReadout.z) ? formatNumber(hoverReadout.z, 3) : '—'}`
                      : '—'
                  }
                />
                <DiagRow k="dZ/dX" v={hoverReadout?.dzdx != null ? formatNumber(hoverReadout.dzdx, 4) : '—'} />
                <DiagRow k="dZ/dY" v={hoverReadout?.dzdy != null ? formatNumber(hoverReadout.dzdy, 4) : '—'} />
                <DiagRow
                  k="pins"
                  v={
                    pins.length
                      ? `${pins.length} ${pins
                          .slice(0, 3)
                          .map((p, idx) => `P${idx + 1}(${p.ix},${p.iy})`)
                          .join(' ')}`
                      : '0'
                  }
                />

                <DiagRow
                  k="xSlice"
                  v={xSliceOn ? `on ix=${xSliceIx ?? '—'} x0=${xSliceX0 == null ? '—' : formatNumber(xSliceX0, 3)}` : 'off'}
                />
                <DiagRow
                  k="ySlice"
                  v={ySliceOn ? `on iy=${ySliceIy ?? '—'} y0=${ySliceY0 == null ? '—' : formatNumber(ySliceY0, 3)}` : 'off'}
                />

                <DiagRow
                  k="zMinRaw"
                  v={isFiniteNumber(zRangeRaw.min) ? formatNumber(zRangeRaw.min, 6) : '—'}
                />
                <DiagRow
                  k="zMaxRaw"
                  v={isFiniteNumber(zRangeRaw.max) ? formatNumber(zRangeRaw.max, 6) : '—'}
                />
                <DiagRow k="validCount" v={String(zRangeRaw.count)} />
                <DiagRow k="nullCount" v={String(zRangeRaw.nullCount)} />

                <DiagRow k="surfaceKey" v={surfaceKey} />
                <DiagRow k="surfaceDims" v={surface ? `${surface.nx}×${surface.ny}` : '—'} />

                <DiagRow k="presetName" v={presetName ?? 'none'} />
                <DiagRow k="useStd" v={useStd ? 'true' : 'false'} />
                <DiagRow k="Z_canonical" v={zCanonical ?? '—'} />
                <DiagRow k="Z_marker" v={markerZ} />
                <DiagRow k="Z_grid_nearest" v={nearestGrid?.z ?? '—'} />
                <DiagRow k="Δ_marker" v={consistency.deltaMarker ?? '—'} />
                <DiagRow k="Δ_grid" v={consistency.deltaGrid ?? '—'} />
                <DiagRow k="eps(marker)" v={EPS_MARKER_ABS} />
                <DiagRow k="eps(grid)" v={`${consistency.epsGridAbs} (${consistency.effectiveTier})`} />
                <DiagRow k="isComputing" v={isComputing ? 'true' : 'false'} />
              </div>
            </div>
          )}

          {surfaceError && (
            <div className="surface3d-surface-error" role="status" aria-live="polite">
              {surfaceError}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
