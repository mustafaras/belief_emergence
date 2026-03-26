/**
 * Canonical panel dataset loader (single source of truth).
 *
 * Canonical runtime CSV path (served from public/):
 *   /data/panel_canonical_23_countries_v1.csv
 *
 * The loader enforces:
 * - required columns are present (long or short aliases)
 * - numeric fields are finite
 * - SHA-256 checksum matches the expected canonical file
 */

import Papa from 'papaparse';

import type { PanelRowCanonical } from '../types/panel';
export type { PanelRowCanonical } from '../types/panel';

/**
 * Represents a single row in the panel dataset.
 * Each row is a country-year observation.
 */
export const CANONICAL_PANEL_CSV_PATH = '/data/panel_canonical_23_countries_v1.csv';
export const CANONICAL_PANEL_SHA256 = '2E5B4B0A56601A6EB4C4AAC38D9762DC2A390EF2F9135CE14E8FDB3FA6473AFF';

export const PANEL_COLUMN_ALIASES: Record<keyof PanelRowCanonical, string[]> = {
  iso3: ['iso3'],
  country_name: ['country_name'],
  year: ['year'],
  Z: ['Z', 'Z_belief_outcome'],
  X: ['X', 'X_urbanization'],
  Y: ['Y', 'Y_gini'],
  C: ['C', 'C_cultural_intensity'],
  M: ['M', 'M_media_environment'],
  T: ['T', 'T_trauma_shock'],
  D: ['D', 'D_social_atomization'],
  G: ['G', 'G_redistribution_capacity'],
  E: ['E', 'E_education_capacity'],
  S: ['S', 'S_social_support'],
  R: ['R', 'R_welfare_capacity'],
};

/**
 * Fetches and validates the canonical panel dataset.
 */
export async function fetchPanelData(): Promise<PanelRowCanonical[]> {
  const response = await fetch(CANONICAL_PANEL_CSV_PATH);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch canonical panel dataset ${CANONICAL_PANEL_CSV_PATH}: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  await assertCanonicalChecksum(text);
  return parsePanelCsvText(text, CANONICAL_PANEL_CSV_PATH);
}

/**
 * Legacy alias for backward compatibility.
 * @deprecated Use fetchPanelData() instead
 */
export const loadPanelData = fetchPanelData;

/**
 * Parses CSV text into typed PanelRow objects.
 * Handles:
 * - Header row extraction
 * - Type conversion (strings → numbers where appropriate)
 * - Missing value handling (empty strings → null)
 *
 * @param csvText Raw CSV text content
 * @returns Array of parsed panel rows
 */
export function parsePanelCsvText(csvText: string, sourceLabel: string = CANONICAL_PANEL_CSV_PATH): PanelRowCanonical[] {
  const filteredCsvText = csvText
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('#');
    })
    .join('\n');

  const parsed = Papa.parse<Record<string, string>>(filteredCsvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const headers = parsed.meta.fields ?? [];

  const missing = Object.entries(PANEL_COLUMN_ALIASES)
    .filter(([, aliases]) => !aliases.some((a) => headers.includes(a)))
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(
      `Canonical panel dataset is missing required columns (${missing.join(', ')}); source: ${sourceLabel}.`,
    );
  }

  const getNumber = (row: Record<string, string>, key: keyof PanelRowCanonical, line: number): number => {
    const aliases = PANEL_COLUMN_ALIASES[key];
    for (const alias of aliases) {
      const raw = row[alias];
      if (raw === undefined || raw === null || raw === '') continue;
      const v = Number.parseFloat(String(raw));
      if (Number.isFinite(v)) return v;
    }
    throw new Error(`Non-numeric or missing value for ${String(key)} on row ${line} in ${sourceLabel}`);
  };

  const rows: PanelRowCanonical[] = [];

  parsed.data.forEach((raw, idx) => {
    const iso3 = String(raw.iso3 || '').trim();
    const country = String(raw.country_name || '').trim();
    const year = Number.parseInt(String(raw.year ?? ''), 10);

    if (!iso3 || iso3.length !== 3 || !country || !Number.isFinite(year)) {
      throw new Error(`Invalid identifiers on row ${idx + 2} in ${sourceLabel}`);
    }

    const row: PanelRowCanonical = {
      iso3,
      country_name: country,
      year,
      Z: getNumber(raw, 'Z', idx + 2),
      X: getNumber(raw, 'X', idx + 2),
      Y: getNumber(raw, 'Y', idx + 2),
      C: getNumber(raw, 'C', idx + 2),
      M: getNumber(raw, 'M', idx + 2),
      T: getNumber(raw, 'T', idx + 2),
      D: getNumber(raw, 'D', idx + 2),
      G: getNumber(raw, 'G', idx + 2),
      E: getNumber(raw, 'E', idx + 2),
      S: getNumber(raw, 'S', idx + 2),
      R: getNumber(raw, 'R', idx + 2),
    };

    rows.push(row);
  });

  const isDev = (typeof import.meta !== 'undefined') && (((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) === true);
  if (isDev) {
    console.log(`✅ Loaded ${rows.length} canonical panel observations from ${sourceLabel}`);
  }
  return rows;
}

export async function assertCanonicalChecksum(text: string, sourceLabel: string = CANONICAL_PANEL_CSV_PATH): Promise<void> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return; // Environment without WebCrypto (e.g., SSR)

  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

  if (hashHex !== CANONICAL_PANEL_SHA256) {
    throw new Error(
      `Canonical panel dataset checksum mismatch. Expected ${CANONICAL_PANEL_SHA256}, got ${hashHex} at ${sourceLabel}`,
    );
  }
}

/**
 * Utility function to filter panel data by criteria.
 * Example: Get all observations for a specific country.
 *
 * @param data Full panel dataset
 * @param filters Object with filter criteria
 * @returns Filtered array of panel rows
 */
export function filterPanelData(
  data: PanelRowCanonical[],
  filters: {
    iso3?: string;
    year?: number;
  }
): PanelRowCanonical[] {
  return data.filter((row) => {
    if (filters.iso3 && row.iso3 !== filters.iso3) return false;
    if (filters.year && row.year !== filters.year) return false;
    return true;
  });
}

/**
 * Utility function to get unique values for a categorical column.
 * Useful for building dropdowns or filters in UI.
 *
 * @param data Panel dataset
 * @param column Column name to extract unique values from
 * @returns Sorted array of unique values (excluding nulls)
 */
export function getUniqueValues(
  data: PanelRowCanonical[],
  column: keyof PanelRowCanonical
): string[] {
  const values = new Set<string>();
  data.forEach((row) => {
    const value = row[column];
    if (value !== null && value !== undefined) {
      values.add(String(value));
    }
  });
  return Array.from(values).sort();
}
