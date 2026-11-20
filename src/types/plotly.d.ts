/**
 * Minimal declarations for `plotly.js-dist-min`.
 *
 * The package ships no types and no `@types/plotly.js-dist-min` exists for this version. The
 * alternative used elsewhere in this repository is a `@ts-expect-error` at each import, which
 * silences the checker for the whole module — including the `react()` call this component
 * actually depends on. Declaring the surface we use keeps the call site typed.
 */
declare module 'plotly.js-dist-min' {
  export type PlotlyTrace = Record<string, unknown>
  export type PlotlyLayout = Record<string, unknown>
  export type PlotlyConfig = Record<string, unknown>

  /** Replace the plot's data and layout in place. */
  export function react(
    element: HTMLElement,
    data: PlotlyTrace[],
    layout?: PlotlyLayout,
    config?: PlotlyConfig,
  ): Promise<unknown>

  /** Render a static image; used by the export controls. */
  export function toImage(
    element: HTMLElement,
    options?: Record<string, unknown>,
  ): Promise<string>

  export function purge(element: HTMLElement): void

  const Plotly: {
    react: typeof react
    toImage: typeof toImage
    purge: typeof purge
  }
  export default Plotly
}
