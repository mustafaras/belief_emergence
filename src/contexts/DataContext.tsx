/**
 * DataContext.tsx
 *
 * Provides a robust, type-safe, and production-grade data context for panel data.
 * Loads and caches the canonical panel CSV (`public/data/panel_canonical_23_countries_v1.csv`),
 * computes statistics, and exposes helper query functions.
 *
 * Usage:
 *   import { DataProvider, useDataContext } from './contexts/DataContext';
 *
 *   <DataProvider>
 *     <YourComponent />
 *   </DataProvider>
 *
 *   // Inside a component:
 *   const { panelData, loading, error, statistics, getCountryData, getYearData } = useDataContext();
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { formatNumeric } from '../utils/formatNumeric';
import { fetchPanelData } from '../data/panelDataLoader';
import type { PanelRowCanonical as PanelRow } from '../types/panel';
import { computeMeanAndSampleStd } from '../utils/stats';
import type {
  ParsedEstimatedCoefficients,
  CoefficientSet,
} from '../utils/validation/coefficientsSchema';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * PanelRow represents a single row from the canonical panel CSV.
 * All numeric fields are finite and validated.
 */
/**
 * PanelStatistics provides summary information about the loaded panel data.
 * Designed to be extensible for later phases (e.g., richer statistics from
 * panelDataStatistics.ts).
 */
export interface PanelStatistics {
  /**
   * Total number of valid rows in the panel.
   */
  totalRows: number;

  /**
   * Number of rows per country (iso3).
   * Exposed as a Map for ergonomics.
   */
  countryCounts: Map<string, number>;

  /**
   * Min and max year present in the panel.
   * Example: [1990, 2023]
   */
  yearRange: [number, number];

  /**
   * Basic distribution of Z across the entire panel.
   */
  zDistribution: {
    mean: number;
    std: number;
    min: number;
    max: number;
  };

  /**
   * Share of possible years observed per country (0–1 range).
   * E.g., a country with full coverage over the expected period has 1.0.
   */
  coverageByCountry: Map<string, number>;

  /**
   * Structural X/Y summary statistics derived from the canonical panel dataset (sample std).
   */
  structuralStats: {
    meanX: number;
    stdX: number;
    meanY: number;
    stdY: number;
    n: number;
    source: string;
    method: 'sample';
  };

  /**
   * Non-fatal issues detected while loading/validating data,
   * e.g. "Country XXX has gaps in years", "Found N rows with NaN Z".
   */
  warnings: string[];
}

type PanelStatisticsSerialized = Omit<PanelStatistics, 'countryCounts' | 'coverageByCountry'> & {
  countryCounts: Record<string, number>;
  coverageByCountry: Record<string, number>;
};

/**
 * DataContextType is the public interface exposed by the context.
 */
export interface DataContextType {
  /**
   * Parsed panel rows, or null if not yet loaded.
   */
  panelData: PanelRow[] | null;

  /**
   * True while data is loading.
   */
  loading: boolean;

  /**
   * Error message if loading failed, null otherwise.
   */
  error: string | null;

  /**
   * Computed statistics, or null if not yet loaded.
   */
  statistics: PanelStatistics | null;

  /**
   * Get all rows for a given country (iso3).
   * Returns empty array if country not found or data not loaded.
   */
  getCountryData: (iso3: string) => PanelRow[];

  /**
   * Get all rows for a given year.
   * Returns empty array if year not found or data not loaded.
   */
  getYearData: (year: number) => PanelRow[];

  // ========================================================================
  // COEFFICIENT STATE (P4.3)
  // ========================================================================

  /**
   * Active coefficient source: "builtin" | "estimated"
   */
  activeCoeffSource: "builtin" | "estimated";

  /**
   * Parsed estimated coefficient metadata (if loaded and active).
   * Null if using builtin coefficients or load failed.
   */
  estimatedCoeffMeta: Omit<ParsedEstimatedCoefficients['meta'], 'schemaVersion'> & { schemaVersion: string } | null;

  /**
   * Flattened estimated coefficient set (if loaded and active).
   * Null if using builtin coefficients.
   */
  estimatedCoeffSet: CoefficientSet | null;

  /**
   * Error message from coefficient loading, if any.
   */
  coeffError: string | null;

  /**
   * Active coefficient set to inject into predictions; null means use builtin constants.
   */
  activeCoefficientSet: CoefficientSet | null;

  /**
   * Per-coefficient 95% CI bounds from estimated coefficients. Empty record if unavailable.
   */
  estimatedCoeffCi95Map: Record<string, [number, number]>;

  /**
   * Load estimated coefficients from JSON.
   * Validates schema and activates if successful; shows error if invalid.
   */
  loadEstimatedCoefficients: (json: unknown) => void;

  /**
   * Revert to builtin coefficients (always succeeds).
   */
  setBuiltinCoefficients: () => void;

  /**
   * Clear estimated coefficients and error state (revert to builtin).
   */
  clearEstimatedCoefficients: () => void;
}

/**
 * Internal state for the reducer.
 */
interface DataState {
  panelData: PanelRow[] | null;
  loading: boolean;
  error: string | null;
  statistics: PanelStatistics | null;
  // Coefficient state (P4.3)
  activeCoeffSource: "builtin" | "estimated";
  estimatedCoeffMeta: Omit<ParsedEstimatedCoefficients['meta'], 'schemaVersion'> & { schemaVersion: string } | null;
  estimatedCoeffSet: CoefficientSet | null;
  estimatedCoeffCi95Map: Record<string, [number, number]>;
  coeffError: string | null;
}

/**
 * Actions for the reducer.
 */
type DataAction =
  | { type: 'LOAD_START' }
  | {
      type: 'LOAD_SUCCESS';
      payload: { panelData: PanelRow[]; statistics: PanelStatistics };
    }
  | { type: 'LOAD_ERROR'; payload: { error: string } }
  // Coefficient actions (P4.3)
  | {
      type: 'LOAD_ESTIMATED_COEFFS';
      payload: {
        meta: Omit<ParsedEstimatedCoefficients['meta'], 'schemaVersion'> & { schemaVersion: string };
        coeffs: CoefficientSet;
        ci95Map: Record<string, [number, number]>;
      };
    }
  | { type: 'LOAD_COEFFS_ERROR'; payload: { error: string } }
  | { type: 'SET_BUILTIN_COEFFS' }
  | { type: 'CLEAR_COEFFS_ERROR' };

// ============================================================================
// STORAGE KEYS & CONSTANTS
// ============================================================================

// Bump cache version when parsing/mapping logic changes.
const PANEL_DATA_STORAGE_KEY = 'belief-panel-data-v3';
const PANEL_STATS_STORAGE_KEY = 'belief-panel-stats-v3';

// ============================================================================
// CONTEXT CREATION
// ============================================================================

/**
 * DataContext is the React context for panel data.
 * Intended to be used via useDataContext() hook, not directly.
 */
const DataContext = createContext<DataContextType | undefined>(undefined);

// ============================================================================
// HOOK
// ============================================================================

/**
 * useDataContext returns the DataContextType.
 * Throws an error if used outside DataProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useDataContext(): DataContextType {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error(
      'useDataContext must be used within a DataProvider. ' +
        'Wrap your component tree with <DataProvider> in main.tsx or AppWithProvider.',
    );
  }
  return ctx;
}

// ============================================================================
// REDUCER
// ============================================================================

/**
 * dataReducer handles state transitions for panel data and coefficient loading.
 */
function dataReducer(state: DataState, action: DataAction): DataState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true, error: null };

    case 'LOAD_SUCCESS':
      return {
        ...state,
        panelData: action.payload.panelData,
        statistics: action.payload.statistics,
        loading: false,
        error: null,
      };

    case 'LOAD_ERROR':
      return {
        ...state,
        loading: false,
        error: action.payload.error,
      };

    // Coefficient state actions
    case 'LOAD_ESTIMATED_COEFFS':
      return {
        ...state,
        activeCoeffSource: 'estimated',
        estimatedCoeffMeta: action.payload.meta,
        estimatedCoeffSet: action.payload.coeffs,
        estimatedCoeffCi95Map: action.payload.ci95Map,
        coeffError: null,
      };

    case 'LOAD_COEFFS_ERROR':
      return {
        ...state,
        coeffError: action.payload.error,
        // Do NOT activate estimated; remain on builtin
      };

    case 'SET_BUILTIN_COEFFS':
      return {
        ...state,
        activeCoeffSource: 'builtin',
        estimatedCoeffMeta: null,
        estimatedCoeffSet: null,
        estimatedCoeffCi95Map: {},
        coeffError: null,
      };

    case 'CLEAR_COEFFS_ERROR':
      return {
        ...state,
        coeffError: null,
      };

    default:
      return state;
  }
}

/**
 * Initial state for the reducer.
 */
const initialState: DataState = {
  panelData: null,
  loading: true,
  error: null,
  statistics: null,
  // Coefficient defaults
  activeCoeffSource: 'builtin',
  estimatedCoeffMeta: null,
  estimatedCoeffSet: null,
  estimatedCoeffCi95Map: {},
  coeffError: null,
};

// ============================================================================
// DATA LOADING & PARSING
// ============================================================================

/**
 * Loads the panel CSV from the public data directory.
 * Parses it using PapaParse and returns validated PanelRow instances.
 */
async function loadPanelCsv(): Promise<PanelRow[]> {
  return fetchPanelData();
}
// ============================================================================
// STATISTICS COMPUTATION
// ============================================================================

/**
 * Computes comprehensive statistics from the panel data.
 * Returns a frozen object for immutability enforcement.
 */
function computePanelStatistics(data: PanelRow[]): PanelStatistics {
  // 1. totalRows
  const totalRows = data.length;

  // 2. yearRange (min, max)
  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = Number.NEGATIVE_INFINITY;

  // 3. countryCounts & coverage
  const countsByIso: Record<string, number> = {};

  // 4. Z distribution accumulators
  let sumZ = 0;
  let sumZ2 = 0;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  // 5. Structural X/Y collections for mean/std
  const xs: number[] = [];
  const ys: number[] = [];

  for (const row of data) {
    const { iso3, year, Z, X, Y } = row;

    if (year < minYear) minYear = year;
    if (year > maxYear) maxYear = year;

    countsByIso[iso3] = (countsByIso[iso3] ?? 0) + 1;

    sumZ += Z;
    sumZ2 += Z * Z;
    if (Z < minZ) minZ = Z;
    if (Z > maxZ) maxZ = Z;

    xs.push(X);
    ys.push(Y);
  }

  const meanZ = totalRows > 0 ? sumZ / totalRows : 0;
  const varianceZ =
    totalRows > 0 ? sumZ2 / totalRows - meanZ * meanZ : 0;
  const stdZ = varianceZ > 0 ? Math.sqrt(varianceZ) : 0;

  const expectedYears =
    Number.isFinite(minYear) && Number.isFinite(maxYear)
      ? maxYear - minYear + 1
      : 0;

  const coverageByCountry = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const warnings: string[] = [];

  for (const [iso3, count] of Object.entries(countsByIso)) {
    countryCounts.set(iso3, count);
    if (expectedYears > 0) {
      const coverage = count / expectedYears;
      coverageByCountry.set(iso3, coverage);
      if (coverage < 0.5) {
        warnings.push(
          `Country ${iso3} has sparse coverage (${formatNumeric(coverage * 100, 1)}%).`,
        );
      }
    }
  }

  if (stdZ === 0) {
    warnings.push('Z distribution has zero variance (all values identical).');
  }

  const xStats = computeMeanAndSampleStd(xs);
  const yStats = computeMeanAndSampleStd(ys);

  const stats: PanelStatistics = {
    totalRows,
    countryCounts,
    yearRange: [
      Number.isFinite(minYear) ? minYear : 0,
      Number.isFinite(maxYear) ? maxYear : 0,
    ],
    zDistribution: {
      mean: meanZ,
      std: stdZ,
      min: Number.isFinite(minZ) ? minZ : 0,
      max: Number.isFinite(maxZ) ? maxZ : 0,
    },
    structuralStats: {
      meanX: xStats.mean,
      stdX: xStats.std,
      meanY: yStats.mean,
      stdY: yStats.std,
      n: totalRows,
      source: 'canonical panel dataset (panel_canonical_23_countries_v1.csv)',
      method: 'sample',
    },
    coverageByCountry,
    warnings,
  };

  return Object.freeze(stats);
}

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface DataProviderProps {
  children: ReactNode;
}

/**
 * DataProvider is responsible for:
 * - Loading the canonical panel data CSV (with caching).
 * - Computing and exposing basic statistics.
 * - Providing memoized query helpers for country/year slices.
 */
export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(dataReducer, initialState);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      dispatch({ type: 'LOAD_START' });
      if (import.meta.env.DEV) {
        console.log('[DataContext] Starting panel data load…');
      }

      try {
        // 1. Try localStorage
        if (typeof window !== 'undefined') {
          const cachedData = window.localStorage.getItem(
            PANEL_DATA_STORAGE_KEY,
          );
          const cachedStats = window.localStorage.getItem(
            PANEL_STATS_STORAGE_KEY,
          );

          if (cachedData && cachedStats) {
            try {
              const parsedData = JSON.parse(cachedData) as PanelRow[];
              const parsedStatsRaw = JSON.parse(cachedStats) as PanelStatisticsSerialized;

              // Restore Maps from plain objects (JSON doesn't preserve Map types)
              const parsedStats: PanelStatistics = {
                ...parsedStatsRaw,
                countryCounts: new Map(Object.entries(parsedStatsRaw.countryCounts || {})),
                coverageByCountry: new Map(Object.entries(parsedStatsRaw.coverageByCountry || {})),
              };

              if (!cancelled && Array.isArray(parsedData)) {
                if (import.meta.env.DEV) {
                  console.log('[DataContext] Loaded panel data from localStorage.');
                }
                dispatch({
                  type: 'LOAD_SUCCESS',
                  payload: {
                    panelData: parsedData,
                    statistics: parsedStats,
                  },
                });
                return;
              }
            } catch (e) {
              console.warn(
                '[DataContext] Failed to parse cached panel data, ignoring cache.',
                e,
              );
            }
          }
        }

        // 2. Fetch from CSV
        const panelData = await loadPanelCsv();
        const statistics = computePanelStatistics(panelData);

        if (!cancelled) {
          // Persist cache
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(
              PANEL_DATA_STORAGE_KEY,
              JSON.stringify(panelData),
            );
            
            // Convert Maps to objects for JSON serialization
            const statsForStorage = {
              ...statistics,
              countryCounts: Object.fromEntries(statistics.countryCounts),
              coverageByCountry: Object.fromEntries(statistics.coverageByCountry),
            };
            
            window.localStorage.setItem(
              PANEL_STATS_STORAGE_KEY,
              JSON.stringify(statsForStorage),
            );
          }

          if (import.meta.env.DEV) {
            console.log('[DataContext] Panel data loaded successfully.');
          }
          dispatch({
            type: 'LOAD_SUCCESS',
            payload: { panelData, statistics },
          });
        }
      } catch (error) {
        console.error('[DataContext] Error loading panel data:', error);
        if (!cancelled) {
          dispatch({
            type: 'LOAD_ERROR',
            payload: {
              error: 'Failed to load panel data. Check console for details.',
            },
          });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  // =========================================================================
  // MEMOIZED QUERY HELPERS
  // =========================================================================

  const { panelData } = state;

  const indices = useMemo(() => {
    if (!panelData) {
      return {
        byCountry: new Map<string, PanelRow[]>(),
        byYear: new Map<number, PanelRow[]>(),
      };
    }

    const byCountry = new Map<string, PanelRow[]>();
    const byYear = new Map<number, PanelRow[]>();

    for (const row of panelData) {
      const { iso3, year } = row;

      if (!byCountry.has(iso3)) byCountry.set(iso3, []);
      byCountry.get(iso3)!.push(row);

      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(row);
    }

    // Sort each array by year (for countries) and by country name (for years)
    for (const arr of byCountry.values()) {
      arr.sort((a, b) => a.year - b.year);
    }
    for (const arr of byYear.values()) {
      arr.sort((a, b) => a.country_name.localeCompare(b.country_name));
    }

    return { byCountry, byYear };
  }, [panelData]);

  const getCountryData = (iso3: string): PanelRow[] => {
    if (!panelData) return [];
    const key = iso3.trim().toUpperCase();
    return indices.byCountry.get(key) ?? [];
  };

  const getYearData = (year: number): PanelRow[] => {
    if (!panelData) return [];
    return indices.byYear.get(year) ?? [];
  };

  // =========================================================================
  // COEFFICIENT MANAGEMENT (P4.3)
  // =========================================================================

  const loadEstimatedCoefficients = async (json: unknown) => {
    try {
      const { parseEstimatedCoefficientsJson, ALL_KNOWN_COEFFICIENT_KEYS } = await import(
        '../utils/validation/coefficientsSchema'
      );
      
      const parsed = parseEstimatedCoefficientsJson(json, [...ALL_KNOWN_COEFFICIENT_KEYS]);
      
      if (parsed.warnings.length > 0 && import.meta.env.DEV) {
        console.warn('[DataContext] Coefficient loading warnings:', parsed.warnings);
      }
      
      dispatch({
        type: 'LOAD_ESTIMATED_COEFFS',
        payload: {
          meta: parsed.meta,
          coeffs: parsed.coeffs,
          ci95Map: parsed.ci95Map,
        },
      });
      
      if (import.meta.env.DEV) {
        console.log('[DataContext] Estimated coefficients loaded successfully.');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      dispatch({
        type: 'LOAD_COEFFS_ERROR',
        payload: { error: msg },
      });
      if (import.meta.env.DEV) {
        console.error('[DataContext] Failed to load coefficients:', error);
      }
    }
  };

  const setBuiltinCoefficients = () => {
    dispatch({ type: 'SET_BUILTIN_COEFFS' });
    if (import.meta.env.DEV) {
      console.log('[DataContext] Reverted to builtin coefficients.');
    }
  };

  const clearEstimatedCoefficients = () => {
    dispatch({ type: 'SET_BUILTIN_COEFFS' });
  };

  const activeCoefficientSet = useMemo(() => {
    if (state.activeCoeffSource === 'estimated' && state.estimatedCoeffSet) {
      return state.estimatedCoeffSet;
    }
    return null;
  }, [state.activeCoeffSource, state.estimatedCoeffSet]);

  // =========================================================================
  // CONTEXT VALUE & RETURN
  // =========================================================================

  const contextValue: DataContextType = {
    panelData: state.panelData,
    loading: state.loading,
    error: state.error,
    statistics: state.statistics,
    getCountryData,
    getYearData,
    // Coefficient fields
    activeCoeffSource: state.activeCoeffSource,
    estimatedCoeffMeta: state.estimatedCoeffMeta,
    estimatedCoeffSet: state.estimatedCoeffSet,
    estimatedCoeffCi95Map: state.estimatedCoeffCi95Map,
    coeffError: state.coeffError,
    activeCoefficientSet,
    loadEstimatedCoefficients,
    setBuiltinCoefficients,
    clearEstimatedCoefficients,
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export { DataContext };
