import type { PanelRowCanonical } from '../../types/panel';
import { PANEL_X_MAX, PANEL_X_MIN, PANEL_Y_MAX, PANEL_Y_MIN, STRUCTURAL_MAX, STRUCTURAL_MIN } from '../modelContract';

export type SupportMaskSummary = {
  schemaVersion: 'phase1.support_mask.v1';
  generatedAtIso: string;
  nUniqueCountryYears: number;
  grid: {
    xBins: number;
    yBins: number;
    occupiedCells: number;
    occupancyRatio: number;
    lowSupportCells: number;
  };
  supportThresholds: {
    lowCellCountThreshold: number;
  };
};

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function xSafe(xRaw: number): number {
  const t = clamp01((xRaw - PANEL_X_MIN) / (PANEL_X_MAX - PANEL_X_MIN));
  return STRUCTURAL_MIN + t * (STRUCTURAL_MAX - STRUCTURAL_MIN);
}

function ySafe(yRaw: number): number {
  const t = clamp01((yRaw - PANEL_Y_MIN) / (PANEL_Y_MAX - PANEL_Y_MIN));
  return STRUCTURAL_MIN + t * (STRUCTURAL_MAX - STRUCTURAL_MIN);
}

export function computeSupportMaskSummary(
  rows: PanelRowCanonical[],
  options?: { xBins?: number; yBins?: number; lowCellCountThreshold?: number }
): SupportMaskSummary {
  const xBins = options?.xBins ?? 8;
  const yBins = options?.yBins ?? 8;
  const lowThreshold = options?.lowCellCountThreshold ?? 2;

  const unique = new Map<string, PanelRowCanonical>();
  for (const row of rows) {
    if (!row.iso3 || !Number.isFinite(row.year)) continue;
    const key = `${row.iso3}::${row.year}`;
    if (!unique.has(key)) unique.set(key, row);
  }

  const grid = Array.from({ length: xBins }, () => Array.from({ length: yBins }, () => 0));
  for (const row of unique.values()) {
    const xs = xSafe(row.X);
    const ys = ySafe(row.Y);
    const xIndex = Math.min(Math.floor(((xs - STRUCTURAL_MIN) / (STRUCTURAL_MAX - STRUCTURAL_MIN)) * xBins), xBins - 1);
    const yIndex = Math.min(Math.floor(((ys - STRUCTURAL_MIN) / (STRUCTURAL_MAX - STRUCTURAL_MIN)) * yBins), yBins - 1);
    if (xIndex >= 0 && yIndex >= 0) {
      grid[xIndex][yIndex] += 1;
    }
  }

  let occupied = 0;
  let lowSupport = 0;
  for (let x = 0; x < xBins; x += 1) {
    for (let y = 0; y < yBins; y += 1) {
      const count = grid[x][y];
      if (count > 0) occupied += 1;
      if (count > 0 && count < lowThreshold) lowSupport += 1;
    }
  }

  return {
    schemaVersion: 'phase1.support_mask.v1',
    generatedAtIso: new Date().toISOString(),
    nUniqueCountryYears: unique.size,
    grid: {
      xBins,
      yBins,
      occupiedCells: occupied,
      occupancyRatio: (xBins * yBins) > 0 ? occupied / (xBins * yBins) : NaN,
      lowSupportCells: lowSupport,
    },
    supportThresholds: {
      lowCellCountThreshold: lowThreshold,
    },
  };
}
