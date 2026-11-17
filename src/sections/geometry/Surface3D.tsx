import { useEffect, useMemo, useRef } from 'react'
import { calculateModel } from '../../utils/calculateModel'
import { linspace } from './engine/geometry'
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

export default function Surface3D({ state }: { state: GeometryState }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const params = toBeliefParameters(state)

  const { xVals, yVals, zGrid } = useMemo(() => {
    const xs = linspace(CONTROL_RANGES.X.min, CONTROL_RANGES.X.max, NX)
    const ys = linspace(CONTROL_RANGES.Y.min, CONTROL_RANGES.Y.max, NY)
    const grid = ys.map((y) => xs.map((x) => {
      const result = calculateModel({ ...params, X: x, Y: y } as never)
      return Number.isFinite(result.Z) ? result.Z : null
    }))
    return { xVals: xs, yVals: ys, zGrid: grid }
  }, [params])

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
        {
          type: 'surface',
          x: xVals,
          y: yVals,
          z: zGrid,
          colorscale: 'Viridis',
          showscale: false,
          contours: {
            z: { show: true, usecolormap: true, highlightcolor: '#ffffff', project: { z: false } },
          },
          hovertemplate: 'X %{x:.3f}<br>Y %{y:.3f}<br>Z %{z:.3f}<extra></extra>',
        },
      ], {
        // Room for the axis titles: at zero margin Plotly clips them off the canvas, which is
        // why the first render showed a surface with no labelled axes at all.
        margin: { l: 8, r: 8, t: 8, b: 8 },
        scene: {
          // The reviewed baseline was captured from this camera; changing it changes the picture
          // without changing any value, which is exactly what the snapshot check is for.
          camera: { eye: { x: 1.7, y: -1.7, z: 1.15 }, center: { x: 0, y: 0, z: -0.08 } },
          // Y's realised range is 6.8 wide against X's 0.85. `cube` lets Plotly fill the box
          // while each axis keeps its own scale, which is what makes the ridge legible without
          // distorting the numbers printed on the axes.
          aspectmode: 'cube',
          // Plotly 3 takes the title font inside `title`, not as a sibling `titlefont`.
          // Mirrors the layout the reviewed baseline was captured from: plain titles plus
          // `tickformat`, with no font overrides. Plotly 3 ignores a sibling `titlefont` and
          // does not honour every `font` placement, which is why earlier attempts at larger
          // labels changed nothing on screen.
          xaxis: { title: { text: 'Settlement (X)' }, tickformat: '.2f' },
          yaxis: { title: { text: 'Inequality (Y)' }, tickformat: '.2f' },
          zaxis: { title: { text: 'Emergence (Z)' }, tickformat: '.3f' },
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
  }, [xVals, yVals, zGrid])

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
