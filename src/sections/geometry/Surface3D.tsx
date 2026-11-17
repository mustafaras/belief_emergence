import { useEffect, useMemo, useRef } from 'react'
import { calculateModel } from '../../utils/calculateModel'
import { convexHull, extrapolationMask, linspace } from './engine/geometry'
import { CONTROL_RANGES, toBeliefParameters, type GeometryState } from './useGeometryParams'
import styles from './Geometry.module.css'

/**
 * The fitted response surface over (X, Y), with the other four channels held where the reader
 * put them.
 *
 * Plotly is imported dynamically and only by this component, so the landing route never pays
 * for it — the bundle budget measures that rather than trusting the import graph.
 *
 * The surface is computed here rather than in a worker because the grid is 48×48 and each
 * point is a closed-form evaluation: 2,304 calls of a few multiplications, which is faster than
 * serialising the inputs to a worker would be.
 */
const NX = 48
const NY = 48

export type SupportPoint = { x: number; y: number; z: number }

/**
 * A PNG of the current surface, for pasting into notes or a slide.
 *
 * Plotly's `toImage` has to be reached from the module that already holds the dynamic import —
 * otherwise `CaptureAB` would pull Plotly back into the landing route graph that this component
 * exists to keep it out of. The callback is registered on mount and cleared on unmount, so a
 * capture taken while the surface is not rendered does nothing rather than throwing.
 */
export type SurfaceImageFn = () => Promise<string | null>

/**
 * The surface plus the observed support.
 *
 * `?iso=` and the support overlay answer the same question from two directions: where in
 * (X, Y) space does the data actually live, and what does the fitted map say there. Drawing
 * the 207 observed rows over the surface is what stops a reader from reading the whole grid as
 * equally evidenced — the corners of the box are extrapolation, and the points show it.
 */
export default function Surface3D({
  state,
  support = [],
  showSupport = true,
  registerImageFn,
}: {
  state: GeometryState
  support?: SupportPoint[]
  showSupport?: boolean
  registerImageFn?: (fn: SurfaceImageFn | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const params = toBeliefParameters(state)

  const { xVals, yVals, zGrid, extrapolated } = useMemo(() => {
    const xs = linspace(CONTROL_RANGES.X.min, CONTROL_RANGES.X.max, NX)
    const ys = linspace(CONTROL_RANGES.Y.min, CONTROL_RANGES.Y.max, NY)
    const grid = ys.map((y) => xs.map((x) => {
      const result = calculateModel({ ...params, X: x, Y: y } as never)
      return Number.isFinite(result.Z) ? result.Z : null
    }))
    // A hull only means something once there are points to hull: with support off there is
    // nothing to call extrapolation, so no cell is marked.
    const hull = showSupport ? convexHull(support.map(({ x, y }) => ({ x, y }))) : []
    return { xVals: xs, yVals: ys, zGrid: grid, extrapolated: extrapolationMask(xs, ys, hull) }
  }, [params, support, showSupport])

  useEffect(() => {
    let disposed = false

    const draw = async () => {
      const Plotly = await import('plotly.js-dist-min')
      if (disposed || !containerRef.current) return
      // The container has a CSS height, but Plotly reads its own element's size at first
      // render and the wrapper's `> div` had no height until after layout. Passing explicit
      // dimensions removes the race; `responsive` then keeps them in step on resize.
      const width = containerRef.current.clientWidth || 720
      const height = containerRef.current.clientHeight || 544
      await Plotly.react(containerRef.current, [
        ...(showSupport && support.length > 0
          ? [{
              type: 'scatter3d',
              mode: 'markers',
              x: support.map((point) => point.x),
              y: support.map((point) => point.y),
              z: support.map((point) => point.z),
              marker: { size: 2.5, color: 'rgba(20,23,28,0.55)', line: { width: 0 } },
              name: 'Observed support',
              hovertemplate: 'observed X %{x:.3f}<br>Y %{y:.3f}<br>Z %{z:.3f}<extra></extra>',
            }]
          : []),
        // Cells outside the observed hull are drained of colour rather than hidden. Hiding them
        // would suggest the model says nothing there; it does say something, and the point is
        // that the something is unsupported.
        ...(showSupport && support.length > 0
          ? [{
              type: 'surface',
              x: xVals,
              y: yVals,
              z: zGrid.map((row, j) => row.map((value, i) => (extrapolated[j][i] ? value : null))),
              // Uniform light grey at a single opacity: the intent is "the model still draws
              // here, the data does not", and a second colour scale would be read as a second
              // measurement.
              colorscale: [[0, 'rgb(198,203,213)'], [1, 'rgb(198,203,213)']],
              opacity: 0.55,
              showscale: false,
              hoverinfo: 'skip',
              name: 'Outside observed support',
            }]
          : []),
        {
          type: 'surface',
          x: xVals,
          y: yVals,
          z: zGrid.map((row, j) => row.map((value, i) => (showSupport ? (extrapolated[j][i] ? null : value) : value))),
          colorscale: 'Viridis',
          showscale: false,
          contours: {
            z: { show: true, usecolormap: true, highlightcolor: '#ffffff', project: { z: false } },
          },
          hovertemplate: 'X %{x:.3f}<br>Y %{y:.3f}<br>Z %{z:.3f}<extra></extra>',
        },
      ], {
        // Room for the axis titles. At zero margin Plotly clips them off the canvas entirely;
        // at 8 the Z title ("Emergence (Z)") was still cut at the left edge, because a 3D
        // scene's titles sit outside the plot box rather than inside it.
        margin: { l: 76, r: 28, t: 28, b: 52 },
        scene: {
          // The reviewed baseline was captured from this camera; changing it changes the picture
          // without changing any value, which is exactly what the snapshot check is for.
          camera: { eye: { x: 2.15, y: -2.15, z: 1.45 }, center: { x: 0, y: 0, z: -0.1 } },
          // Y's realised range is 6.8 wide against X's 0.85. `cube` lets Plotly fill the box
          // while each axis keeps its own scale, which is what makes the ridge legible without
          // distorting the numbers printed on the axes.
          aspectmode: 'cube',
          // Plotly 3 takes the title font inside `title`, not as a sibling `titlefont`.
          // Mirrors the layout the reviewed baseline was captured from: plain titles plus
          // `tickformat`, with no font overrides. Plotly 3 ignores a sibling `titlefont` and
          // does not honour every `font` placement, which is why earlier attempts at larger
          // labels changed nothing on screen.
          // Single letters, because a 574-pixel canvas cannot hold "Emergence (Z)" rotated
          // along the z axis: it was clipped even at a 76-pixel left margin. The words live in
          // the caption under the chart, where they are readable at full size.
          xaxis: { title: { text: 'X' }, tickformat: '.2f' },
          yaxis: { title: { text: 'Y' }, tickformat: '.2f' },
          zaxis: { title: { text: 'Z' }, tickformat: '.3f' },
        },
        autosize: false,
        width,
        height,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { size: 12 },
      }, { responsive: true, displayModeBar: false, staticPlot: false })
    }

    void draw()
    return () => { disposed = true }
  }, [xVals, yVals, zGrid, extrapolated, support, showSupport])

  useEffect(() => {
    if (!registerImageFn) return
    registerImageFn(async () => {
      const node = containerRef.current
      if (!node) return null
      const Plotly = await import('plotly.js-dist-min')
      return Plotly.toImage(node, { format: 'png', width: 1280, height: 960, scale: 2 })
    })
    return () => { registerImageFn(null) }
  }, [registerImageFn])

  return (
    <div className={styles.surfaceWrap}>
      {/*
        Plotly draws an SVG with no accessible name, which the a11y check reports as an
        unclassified chart. The label belongs on the container: `role="img"` with an
        `aria-label` describing what the surface shows gives a screen-reader user the same
        statement the caption gives a sighted one.
      */}
      <div
        aria-label="Fitted response surface: Z across settlement (X) and inequality (Y), with the four retained contextual channels held at the values in the control panel"
        className="js-plotly-plot"
        ref={containerRef}
        role="img"
      />
    </div>
  )
}
