export type HeatmapLegendOptions = {
  showscale: boolean
}

export type SurfaceLegendOptions = HeatmapLegendOptions & {
  colorbar: {
    title: { text: 'Z' }
    tickformat: '.2f'
  }
}

export function buildHeatmapLegendOptions(showColorbar: boolean): HeatmapLegendOptions {
  return { showscale: showColorbar }
}

export function buildSurfaceLegendOptions(showColorbar: boolean): SurfaceLegendOptions {
  return {
    showscale: showColorbar,
    colorbar: {
      title: { text: 'Z' },
      tickformat: '.2f',
    },
  }
}
