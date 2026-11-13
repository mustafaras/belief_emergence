import Surface3DColorScaleControls from './Surface3DColorScaleControls'
import { isFiniteNumber, nearestIndex } from './surface/geometry'
import type { Surface3DSurfaceModel } from './Surface3DSurfaceModel'

export default function Surface3DSurfaceDock({ model }: { model: Surface3DSurfaceModel }) {
  const { adaptiveContours, addPinFromHover, axisMode, clampIsValid, clearPins, colorScale, contourDensity, contourLevels, currentZValue, customHigh, customLow, customMid, dockOpen, dockTab, formatNumber, hoverReadout, pinNotice, pins, plotView, resetClamp, reverseScale, ridgeHintsOn, ridgeMode, ridgeStrength, setAdaptiveContours, setAxisMode, setColorScale, setContourDensity, setCustomHigh, setCustomLow, setCustomMid, setDockOpen, setDockTab, setReverseScale, setRidgeHintsOn, setRidgeMode, setRidgeStrength, setShowColorbar, setSurfaceOpacity, setXSliceIx, setXSliceOn, setXSliceX0, setYSliceIy, setYSliceOn, setYSliceY0, setZClampEnabled, setZClampMax, setZClampMin, showColorbar, showSliceNotice, sliceNotice, surface, surfaceOpacity, warnClamp, xSliceOn, xSliceX0, ySliceOn, ySliceY0, zClampEnabled, zClampMax, zClampMin, zMaxEff, zMinEff } = model
  return (
<div className="surface3d-dock-anchor" data-open={dockOpen ? '1' : '0'}>
                {dockOpen ? (
                  <button
                    type="button"
                    className="surface3d-fab is-open"
                    aria-label="Open surface tools"
                    aria-expanded="true"
                    aria-controls="surface3d-dock"
                    onClick={() => setDockOpen((v) => !v)}
                    onKeyDown={(e) => {
                      // Prevent instrument shortcuts from firing while focused on the FAB.
                      e.stopPropagation()
                    }}
                  >
                    <span className="surface3d-fab-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M2.5 4.5L8 1.8L13.5 4.5L8 7.2L2.5 4.5Z"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M2.5 4.5V11.5L8 14.2V7.2"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M13.5 4.5V11.5L8 14.2"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="surface3d-fab-label">Surface</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="surface3d-fab"
                    aria-label="Open surface tools"
                    aria-expanded="false"
                    aria-controls="surface3d-dock"
                    onClick={() => setDockOpen((v) => !v)}
                    onKeyDown={(e) => {
                      // Prevent instrument shortcuts from firing while focused on the FAB.
                      e.stopPropagation()
                    }}
                  >
                    <span className="surface3d-fab-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M2.5 4.5L8 1.8L13.5 4.5L8 7.2L2.5 4.5Z"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M2.5 4.5V11.5L8 14.2V7.2"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M13.5 4.5V11.5L8 14.2"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="surface3d-fab-label">Surface</span>
                  </button>
                )}

                <div
                  id="surface3d-dock"
                  className={`surface3d-dock ${dockOpen ? 'is-open' : ''}`.trim()}
                  data-open={dockOpen ? '1' : '0'}
                  role="dialog"
                  aria-label="Surface Dock"
                  aria-modal="false"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && dockOpen) {
                      e.stopPropagation()
                      setDockOpen(false)
                      return
                    }
                    // Prevent instrument shortcuts from firing while focus is inside the dock.
                    e.stopPropagation()
                  }}
                >
                  <div className="surface3d-dock-header">
                    <div className="surface3d-dock-tabs" role="tablist" aria-label="Surface Dock tabs">
                      {(['TOOLS', 'STYLE', 'INSPECT'] as const).map((tab) => {
                        const selected = dockTab === tab
                        if (selected) {
                          return (
                            <button
                              key={tab}
                              type="button"
                              className="surface3d-chip surface3d-dock-tab is-active"
                              role="tab"
                              aria-selected="true"
                              onClick={() => setDockTab(tab)}
                              onKeyDown={(e) => {
                                e.stopPropagation()
                              }}
                            >
                              {tab}
                            </button>
                          )
                        }

                        return (
                          <button
                            key={tab}
                            type="button"
                            className="surface3d-chip surface3d-dock-tab"
                            role="tab"
                            aria-selected="false"
                            onClick={() => setDockTab(tab)}
                            onKeyDown={(e) => {
                              e.stopPropagation()
                            }}
                          >
                            {tab}
                          </button>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      className="surface3d-dock-close"
                      aria-label="Close Surface Dock"
                      onClick={() => setDockOpen(false)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <div className="surface3d-dock-body">
                    {dockTab === 'TOOLS' && (
                      <div className="surface3d-dock-panel" role="tabpanel" aria-label="Tools">
                        <details className="surface3d-expander" open>
                          <summary className="surface3d-expander-summary">Axes</summary>
                          <div className="surface3d-expander-body">
                            <div className="surface3d-dock-row surface3d-dock-row--chips">
                              {axisMode === 'XY' ? (
                                <button
                                  type="button"
                                  className="surface3d-chip is-active"
                                  aria-pressed="true"
                                  onClick={() => setAxisMode('XY')}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  Panel (X,Y)
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="surface3d-chip"
                                  aria-pressed="false"
                                  onClick={() => setAxisMode('XY')}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  Panel (X,Y)
                                </button>
                              )}

                              {axisMode === 'DOC' ? (
                                <button
                                  type="button"
                                  className="surface3d-chip is-active"
                                  aria-pressed="true"
                                  onClick={() => setAxisMode('DOC')}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  Doc (φ, ln(B/k))
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="surface3d-chip"
                                  aria-pressed="false"
                                  onClick={() => setAxisMode('DOC')}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  Doc (φ, ln(B/k))
                                </button>
                              )}
                            </div>
                            <div className="surface3d-slices-hint">In Doc mode, click-to-apply is disabled.</div>
                          </div>
                        </details>
                        <details className="surface3d-expander" open>
                          <summary className="surface3d-expander-summary">Slices</summary>
                          <div className="surface3d-expander-body">

                          <div className="surface3d-dock-row surface3d-dock-row--chips">
                            {xSliceOn ? (
                              <button
                                type="button"
                                className="surface3d-chip is-active"
                                aria-pressed="true"
                                onClick={() => setXSliceOn(false)}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                X Slice
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="surface3d-chip"
                                aria-pressed="false"
                                onClick={() => {
                                  setXSliceOn(true)
                                  if (surface && xSliceX0 == null) {
                                    const ix = Math.floor(surface.xVals.length / 2)
                                    const x0 = surface.xVals[ix]
                                    setXSliceIx(ix)
                                    setXSliceX0(isFiniteNumber(x0) ? x0 : null)
                                  } else if (surface && xSliceX0 != null) {
                                    const ix = nearestIndex(surface.xVals, xSliceX0)
                                    setXSliceIx(ix >= 0 ? ix : null)
                                  }
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                X Slice
                              </button>
                            )}

                            {ySliceOn ? (
                              <button
                                type="button"
                                className="surface3d-chip is-active"
                                aria-pressed="true"
                                onClick={() => setYSliceOn(false)}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                Y Slice
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="surface3d-chip"
                                aria-pressed="false"
                                onClick={() => {
                                  setYSliceOn(true)
                                  if (surface && ySliceY0 == null) {
                                    const iy = Math.floor(surface.yVals.length / 2)
                                    const y0 = surface.yVals[iy]
                                    setYSliceIy(iy)
                                    setYSliceY0(isFiniteNumber(y0) ? y0 : null)
                                  } else if (surface && ySliceY0 != null) {
                                    const iy = nearestIndex(surface.yVals, ySliceY0)
                                    setYSliceIy(iy >= 0 ? iy : null)
                                  }
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                Y Slice
                              </button>
                            )}

                            <button
                              type="button"
                              className="surface3d-chip"
                              disabled={!surface || !hoverReadout}
                              onClick={() => {
                                if (!surface) {
                                  showSliceNotice('Surface not ready; wait for compute.')
                                  return
                                }
                                if (!hoverReadout) {
                                  showSliceNotice('Hover the surface to snap.')
                                  return
                                }

                                const ix = hoverReadout.ix
                                const iy = hoverReadout.iy
                                if (ix < 0 || iy < 0 || ix >= surface.xVals.length || iy >= surface.yVals.length) {
                                  showSliceNotice('Hover a valid cell to snap.')
                                  return
                                }

                                setXSliceOn(true)
                                setYSliceOn(true)
                                setXSliceIx(ix)
                                setYSliceIy(iy)
                                setXSliceX0(surface.xVals[ix])
                                setYSliceY0(surface.yVals[iy])
                              }}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              Snap to hover
                            </button>
                          </div>

                          {sliceNotice ? <div className="surface3d-slices-hint">{sliceNotice}</div> : null}

                          {xSliceOn && (
                            <div className="surface3d-dock-row">
                              <div className="surface3d-dock-item-k">X0</div>
                              <input
                                className="surface3d-dock-input"
                                inputMode="decimal"
                                placeholder="auto"
                                value={xSliceX0 == null ? '' : String(xSliceX0)}
                                onChange={(e) => {
                                  const raw = e.target.value.trim()
                                  if (!raw) {
                                    setXSliceX0(null)
                                    setXSliceIx(null)
                                    return
                                  }
                                  const n = Number(raw)
                                  if (!Number.isFinite(n)) return
                                  setXSliceX0(n)
                                  if (surface) {
                                    const ix = nearestIndex(surface.xVals, n)
                                    setXSliceIx(ix >= 0 ? ix : null)
                                  }
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}

                          {ySliceOn && (
                            <div className="surface3d-dock-row">
                              <div className="surface3d-dock-item-k">Y0</div>
                              <input
                                className="surface3d-dock-input"
                                inputMode="decimal"
                                placeholder="auto"
                                value={ySliceY0 == null ? '' : String(ySliceY0)}
                                onChange={(e) => {
                                  const raw = e.target.value.trim()
                                  if (!raw) {
                                    setYSliceY0(null)
                                    setYSliceIy(null)
                                    return
                                  }
                                  const n = Number(raw)
                                  if (!Number.isFinite(n)) return
                                  setYSliceY0(n)
                                  if (surface) {
                                    const iy = nearestIndex(surface.yVals, n)
                                    setYSliceIy(iy >= 0 ? iy : null)
                                  }
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}

                          {!hoverReadout ? <div className="surface3d-slices-hint">Hover the surface to snap.</div> : null}
                          </div>
                        </details>
                      </div>
                    )}

                    {dockTab === 'STYLE' && (
                      <div className="surface3d-dock-panel" role="tabpanel" aria-label="Style">
                        <Surface3DColorScaleControls
                          colorScale={colorScale}
                          setColorScale={setColorScale}
                          customLow={customLow}
                          setCustomLow={setCustomLow}
                          customMid={customMid}
                          setCustomMid={setCustomMid}
                          customHigh={customHigh}
                          setCustomHigh={setCustomHigh}
                          reverseScale={reverseScale}
                          setReverseScale={setReverseScale}
                        />

                        <details className="surface3d-expander" open>
                          <summary className="surface3d-expander-summary">Readability</summary>
                          <div className="surface3d-expander-body">
                          <div className="surface3d-dock-row surface3d-dock-row--chips">
                            {showColorbar ? (
                              <button
                                type="button"
                                className="surface3d-chip is-active"
                                aria-pressed="true"
                                onClick={() => setShowColorbar((v) => !v)}
                              >
                                Colorbar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="surface3d-chip"
                                aria-pressed="false"
                                onClick={() => setShowColorbar((v) => !v)}
                              >
                                Colorbar
                              </button>
                            )}

                            {adaptiveContours ? (
                              <button
                                type="button"
                                className="surface3d-chip is-active"
                                aria-pressed="true"
                                onClick={() => setAdaptiveContours((v) => !v)}
                              >
                                Adaptive contours
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="surface3d-chip"
                                aria-pressed="false"
                                onClick={() => setAdaptiveContours((v) => !v)}
                              >
                                Adaptive contours
                              </button>
                            )}

                            {ridgeHintsOn ? (
                              <button
                                type="button"
                                className="surface3d-chip is-active"
                                aria-pressed="true"
                                onClick={() => setRidgeHintsOn((v) => !v)}
                                disabled={plotView === '3D'}
                              >
                                Ridge hints
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="surface3d-chip"
                                aria-pressed="false"
                                onClick={() => setRidgeHintsOn((v) => !v)}
                                disabled={plotView === '3D'}
                              >
                                Ridge hints
                              </button>
                            )}
                          </div>

                          <div className="surface3d-dock-row surface3d-dock-row--opacity">
                            <div className="surface3d-dock-item-k">Opacity</div>
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
                              disabled={plotView !== '3D'}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                            <div className="surface3d-opacity-v" aria-hidden="true">
                              {Math.round(surfaceOpacity * 100)}%
                            </div>
                          </div>

                          <div className="surface3d-dock-row">
                            <div className="surface3d-dock-item-k">Contour density</div>
                            <select
                              className="surface3d-dock-select"
                              aria-label="Contour density"
                              value={contourDensity}
                              onChange={(e) => {
                                setContourDensity(e.target.value as 'LOW' | 'MED' | 'HIGH')
                                // If the user explicitly picks a manual density, switch off adaptive.
                                if (adaptiveContours) setAdaptiveContours(false)
                              }}
                            >
                              {(['LOW', 'MED', 'HIGH'] as const).map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="surface3d-dock-row">
                            <div className="surface3d-dock-item-k">Hint mode</div>
                            <select
                              className="surface3d-dock-select"
                              aria-label="Hint mode"
                              value={ridgeMode}
                              onChange={(e) => setRidgeMode(e.target.value as 'GRADMAG' | 'CURV')}
                              disabled={!ridgeHintsOn || plotView === '3D'}
                            >
                              <option value="GRADMAG">Gradient</option>
                              <option value="CURV">Curvature</option>
                            </select>
                          </div>

                          <div className="surface3d-dock-row">
                            <div className="surface3d-dock-item-k">Hint strength</div>
                            <select
                              className="surface3d-dock-select"
                              aria-label="Hint strength"
                              value={ridgeStrength}
                              onChange={(e) => setRidgeStrength(e.target.value as 'SUBTLE' | 'NORMAL' | 'STRONG')}
                              disabled={!ridgeHintsOn || plotView === '3D'}
                            >
                              {(['SUBTLE', 'NORMAL', 'STRONG'] as const).map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="surface3d-readability-note">
                            Z range (effective): {formatNumber(zMinEff, 3)}…{formatNumber(zMaxEff, 3)}
                            {clampIsValid ? ' (clamped)' : ''}
                            {contourLevels ? ` • contours≈${contourLevels.levels}` : ''}
                            {plotView === '3D' ? ' • ridge hints: 2D only' : ''}
                          </div>
                          </div>
                        </details>

                        <details className="surface3d-expander" open>
                          <summary className="surface3d-expander-summary">Z Mapping</summary>
                          <div className="surface3d-expander-body">
                          <div className="surface3d-dock-row surface3d-dock-row--chips">
                            {zClampEnabled ? (
                              <button
                                type="button"
                                className="surface3d-chip is-active"
                                aria-pressed="true"
                                onClick={() => setZClampEnabled((v) => !v)}
                              >
                                Clamp
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="surface3d-chip"
                                aria-pressed="false"
                                onClick={() => setZClampEnabled((v) => !v)}
                              >
                                Clamp
                              </button>
                            )}
                          </div>

                          <div className="surface3d-dock-row surface3d-dock-row--clamp">
                            <div className="surface3d-dock-clamp">
                              <div className="surface3d-dock-microcopy">Z Min</div>
                              <input
                                className="surface3d-dock-input"
                                value={zClampMin}
                                onChange={(e) => setZClampMin(e.target.value)}
                                disabled={!zClampEnabled}
                                inputMode="decimal"
                                placeholder="auto"
                              />
                            </div>

                            <div className="surface3d-dock-clamp">
                              <div className="surface3d-dock-microcopy">Z Max</div>
                              <input
                                className="surface3d-dock-input"
                                value={zClampMax}
                                onChange={(e) => setZClampMax(e.target.value)}
                                disabled={!zClampEnabled}
                                inputMode="decimal"
                                placeholder="auto"
                              />
                            </div>

                            <button
                              type="button"
                              className="surface3d-dock-auto"
                              onClick={resetClamp}
                              disabled={!zClampEnabled && !zClampMin && !zClampMax}
                            >
                              Auto
                            </button>
                          </div>

                          {warnClamp && (
                            <div className="surface3d-dock-warning">Invalid clamp: Z Min must be &lt; Z Max.</div>
                          )}
                          </div>
                        </details>
                      </div>
                    )}

                    {dockTab === 'INSPECT' && (
                      <div className="surface3d-dock-panel" role="tabpanel" aria-label="Inspect">
                        <details className="surface3d-expander" open>
                          <summary className="surface3d-expander-summary">Hover</summary>
                          <div className="surface3d-expander-body">

                          <div className="surface3d-dock-row">
                            <div className="surface3d-dock-item-k">X</div>
                            <div
                              className={`surface3d-inspect-value ${hoverReadout ? '' : 'surface3d-inspect-muted'}`.trim()}
                            >
                              {hoverReadout ? formatNumber(hoverReadout.x, 3) : '—'}
                            </div>
                          </div>

                          <div className="surface3d-dock-row">
                            <div className="surface3d-dock-item-k">Y</div>
                            <div
                              className={`surface3d-inspect-value ${hoverReadout ? '' : 'surface3d-inspect-muted'}`.trim()}
                            >
                              {hoverReadout ? formatNumber(hoverReadout.y, 3) : '—'}
                            </div>
                          </div>

                          <div className="surface3d-dock-row">
                            <div className="surface3d-dock-item-k">Z</div>
                            <div
                              className={`surface3d-inspect-value ${hoverReadout && isFiniteNumber(hoverReadout.z) ? '' : 'surface3d-inspect-muted'}`.trim()}
                            >
                              {hoverReadout && isFiniteNumber(hoverReadout.z) ? formatNumber(hoverReadout.z, 3) : '—'}
                            </div>
                          </div>

                          <div className="surface3d-dock-row">
                            <div className="surface3d-dock-item-k">dZ/dX</div>
                            <div
                              className={`surface3d-inspect-value ${hoverReadout && hoverReadout.dzdx != null ? '' : 'surface3d-inspect-muted'}`.trim()}
                            >
                              {hoverReadout ? formatNumber(hoverReadout.dzdx, 4) : '—'}
                            </div>
                          </div>

                          <div className="surface3d-dock-row">
                            <div className="surface3d-dock-item-k">dZ/dY</div>
                            <div
                              className={`surface3d-inspect-value ${hoverReadout && hoverReadout.dzdy != null ? '' : 'surface3d-inspect-muted'}`.trim()}
                            >
                              {hoverReadout ? formatNumber(hoverReadout.dzdy, 4) : '—'}
                            </div>
                          </div>
                          </div>
                        </details>

                        <details className="surface3d-expander" open>
                          <summary className="surface3d-expander-summary">Pins</summary>
                          <div className="surface3d-expander-body">

                          <div className="surface3d-dock-row surface3d-dock-row--chips">
                            <button
                              type="button"
                              className="surface3d-chip"
                              onClick={() => addPinFromHover()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              Pin hover
                            </button>

                            <button
                              type="button"
                              className="surface3d-chip"
                              onClick={() => clearPins()}
                              disabled={!pins.length}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              Clear pins
                            </button>
                          </div>

                          {pinNotice ? <div className="surface3d-pins-hint">{pinNotice}</div> : null}

                          {!pins.length ? (
                            <div className="surface3d-pins-hint">Press P or click Pin hover. Shift+Click also pins.</div>
                          ) : (
                            <div className="surface3d-pins-list" aria-label="Pinned points">
                              {pins.map((p, idx) => {
                                const dz = currentZValue != null ? p.z - currentZValue : null
                                const denom = currentZValue != null ? Math.max(Math.abs(currentZValue), 1e-9) : null
                                const pct = dz != null && denom != null ? (dz / denom) * 100 : null
                                const deltaClass =
                                  dz == null ? 'surface3d-inspect-muted' : dz >= 0 ? 'surface3d-delta-pos' : 'surface3d-delta-neg'

                                return (
                                  <div key={p.id} className="surface3d-pins-row">
                                    <div className="surface3d-pins-tag">P{idx + 1}</div>
                                    <div className="surface3d-pins-cell surface3d-inspect-value">
                                      {formatNumber(p.x, 3)}, {formatNumber(p.y, 3)}, {formatNumber(p.z, 3)}
                                    </div>
                                    <div className={`surface3d-pins-cell surface3d-inspect-value ${deltaClass}`.trim()}>
                                      {dz == null ? '—' : `${formatNumber(dz, 3)} (${formatNumber(pct, 1)}%)`}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                </div>
              </div>
  )
}
