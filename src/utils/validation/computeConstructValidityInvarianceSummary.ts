import Papa from 'papaparse';

import { computeBias, computeMAE, computePearsonCorr, computeRMSE } from '../metrics';

type ConstructDiagnosticsRow = {
  iso3: string;
  country_name: string;
  year: number;
  Z_belief_outcome: number;
  Z_religion_importance: number;
  Z_violence_justifiable: number;
  C_cultural_intensity: number;
  C_religiosity_index: number;
  D_social_atomization: number;
  D_social_trust: number;
  S_social_support: number;
  S_support_index: number;
  M_media_environment: number;
  M_internet_daily: number;
};

type NumericConstructColumn = Exclude<keyof ConstructDiagnosticsRow, 'iso3' | 'country_name' | 'year'>;

type ConstructSpec = {
  construct: 'Z' | 'C' | 'D' | 'S' | 'M';
  targetColumn: NumericConstructColumn;
  componentColumns: NumericConstructColumn[];
};

type SliceDiagnostic = {
  sliceId: string;
  n: number;
  corr: number;
  maeZ: number;
};

type SliceSummary = {
  nSlicesTotal: number;
  nSlicesEligible: number;
  nLowVarianceExcluded: number;
  minRowsPerSlice: number;
  medianCorr: number | null;
  q25Corr: number | null;
  q75Corr: number | null;
  lowCorrRate: number | null;
  severeLowCorrRate: number | null;
  signFlipRate: number | null;
  medianMaeZ: number | null;
  worstSlices: SliceDiagnostic[];
};

type ComparisonStats = {
  n: number;
  corr: number | null;
  maeZ: number | null;
  rmseZ: number | null;
  biasZ: number | null;
};

type CoverageSensitivitySummary = {
  full: ComparisonStats;
  partial: ComparisonStats;
  none: ComparisonStats;
  partialVsFullCorrDelta: number | null;
  partialVsFullMaeDelta: number | null;
};

type PairwiseCorrelation = {
  left: string;
  right: string;
  corr: number | null;
};

type ConstructDiagnostic = {
  construct: 'Z' | 'C' | 'D' | 'S' | 'M';
  targetColumn: string;
  components: string[];
  sample: {
    nRows: number;
    nCanonicalFinite: number;
  };
  coverage: {
    fullCoverageRate: number;
    partialCoverageRate: number;
    zeroCoverageRate: number;
    componentAvailability: Record<string, number>;
    minCoverageConfigured: number;
    belowConfiguredCoverageRate: number;
  };
  internalConsistencyProxy: {
    nComponents: number;
    nCompleteRows: number;
    cronbachAlpha: number | null;
    meanInterItemCorrelation: number | null;
    pairwiseCorrelations: PairwiseCorrelation[];
  };
  alternativeAggregation: {
    orientationRule: 'sign_aligned_to_canonical_correlation';
    orientedComponents: Array<{ column: string; sign: -1 | 1 }>;
    canonicalVsAltMean: ComparisonStats;
    canonicalVsAltMedian: ComparisonStats;
    meanVsMedianCorrDelta: number | null;
    meanVsMedianMaeDelta: number | null;
  };
  coverageSensitivity: CoverageSensitivitySummary;
  invariance: {
    byCountry: SliceSummary;
    byYear: SliceSummary;
  };
  fragility: {
    severity: 'low' | 'moderate' | 'high';
    flags: string[];
  };
};

export type ParsedConstructDiagnosticsRows = {
  rows: ConstructDiagnosticsRow[];
  missingColumns: string[];
  sourceLabel: string;
};

export type ConstructValidityInvarianceSummary = {
  schemaVersion: 'phase1.construct_validity_invariance.v1';
  generatedAtIso: string;
  source: {
    datasetPath?: string;
    datasetSha256?: string;
    nRows: number;
    nCountries: number;
    yearMin: number | null;
    yearMax: number | null;
    missingColumns: string[];
  };
  thresholds: {
    minRowsPerSlice: number;
    lowCorrThreshold: number;
    severeLowCorrThreshold: number;
    configuredMinItemCoverage: number;
  };
  constructs: ConstructDiagnostic[];
  instabilityRegions: {
    flaggedConstructs: string[];
    flaggedCountrySlices: Array<{ construct: string; sliceId: string; corr: number; n: number }>;
    flaggedYearSlices: Array<{ construct: string; sliceId: string; corr: number; n: number }>;
  };
  limitations: string[];
};

const CONSTRUCT_SPECS: ConstructSpec[] = [
  {
    construct: 'Z',
    targetColumn: 'Z_belief_outcome',
    componentColumns: ['Z_religion_importance', 'Z_violence_justifiable'],
  },
  {
    construct: 'C',
    targetColumn: 'C_cultural_intensity',
    componentColumns: ['C_religiosity_index'],
  },
  {
    construct: 'D',
    targetColumn: 'D_social_atomization',
    componentColumns: ['D_social_trust'],
  },
  {
    construct: 'S',
    targetColumn: 'S_social_support',
    componentColumns: ['S_support_index'],
  },
  {
    construct: 'M',
    targetColumn: 'M_media_environment',
    componentColumns: ['M_internet_daily'],
  },
];

function finite(values: number[]): number[] {
  return values.filter(Number.isFinite);
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  const variance = values.reduce((sum, value) => {
    const d = value - m;
    return sum + d * d;
  }, 0) / (values.length - 1);
  return variance >= 0 ? Math.sqrt(variance) : NaN;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const t = Math.min(Math.max(q, 0), 1);
  const pos = (sorted.length - 1) * t;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const w = pos - lo;
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function compareByCorrThenMae(a: SliceDiagnostic, b: SliceDiagnostic): number {
  if (a.corr !== b.corr) return a.corr - b.corr;
  if (a.maeZ !== b.maeZ) return b.maeZ - a.maeZ;
  if (a.n !== b.n) return b.n - a.n;
  return a.sliceId.localeCompare(b.sliceId);
}

function parseNumber(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return NaN;
  const value = Number.parseFloat(String(raw));
  return Number.isFinite(value) ? value : NaN;
}

function parseRequiredInt(raw: unknown, name: string, rowIndex: number, sourceLabel: string): number {
  const value = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${name} on row ${rowIndex + 2} in ${sourceLabel}`);
  }
  return value;
}

function zScoreColumn(values: number[]): Array<number | null> {
  const xs = finite(values);
  const m = mean(xs);
  const s = std(xs);
  return values.map((value) => {
    if (!Number.isFinite(value) || !Number.isFinite(m) || !Number.isFinite(s) || Math.abs(s) < 1e-12) return null;
    return (value - m) / s;
  });
}

function comparisonStats(observed: Array<number | null>, predicted: Array<number | null>, rowMask?: boolean[]): ComparisonStats {
  const obs: number[] = [];
  const pred: number[] = [];

  for (let i = 0; i < observed.length; i += 1) {
    if (rowMask && !rowMask[i]) continue;
    const o = observed[i];
    const p = predicted[i];
    if (o === null || p === null || !Number.isFinite(o) || !Number.isFinite(p)) continue;
    obs.push(o);
    pred.push(p);
  }

  if (obs.length === 0) {
    return {
      n: 0,
      corr: null,
      maeZ: null,
      rmseZ: null,
      biasZ: null,
    };
  }

  return {
    n: obs.length,
    corr: Number.isFinite(computePearsonCorr(obs, pred)) ? computePearsonCorr(obs, pred) : null,
    maeZ: Number.isFinite(computeMAE(obs, pred)) ? computeMAE(obs, pred) : null,
    rmseZ: Number.isFinite(computeRMSE(obs, pred)) ? computeRMSE(obs, pred) : null,
    biasZ: Number.isFinite(computeBias(obs, pred)) ? computeBias(obs, pred) : null,
  };
}

function buildSliceSummary(
  diagnostics: SliceDiagnostic[],
  nSlicesTotal: number,
  nLowVarianceExcluded: number,
  minRowsPerSlice: number,
  lowCorrThreshold: number,
  severeLowCorrThreshold: number,
): SliceSummary {
  const corrs = diagnostics.map((value) => value.corr).filter(Number.isFinite).sort((a, b) => a - b);
  const maes = diagnostics.map((value) => value.maeZ).filter(Number.isFinite).sort((a, b) => a - b);

  const lowRate = diagnostics.length > 0
    ? diagnostics.filter((value) => value.corr < lowCorrThreshold).length / diagnostics.length
    : null;
  const severeRate = diagnostics.length > 0
    ? diagnostics.filter((value) => value.corr < severeLowCorrThreshold).length / diagnostics.length
    : null;
  const signFlipRate = diagnostics.length > 0
    ? diagnostics.filter((value) => value.corr < 0).length / diagnostics.length
    : null;

  const worstSlices = diagnostics
    .slice()
    .sort(compareByCorrThenMae)
    .slice(0, 5);

  return {
    nSlicesTotal,
    nSlicesEligible: diagnostics.length,
    nLowVarianceExcluded,
    minRowsPerSlice,
    medianCorr: corrs.length > 0 ? quantile(corrs, 0.5) : null,
    q25Corr: corrs.length > 0 ? quantile(corrs, 0.25) : null,
    q75Corr: corrs.length > 0 ? quantile(corrs, 0.75) : null,
    lowCorrRate: lowRate,
    severeLowCorrRate: severeRate,
    signFlipRate,
    medianMaeZ: maes.length > 0 ? quantile(maes, 0.5) : null,
    worstSlices,
  };
}

function computeCronbachAlpha(componentMatrix: number[][]): number | null {
  if (componentMatrix.length < 3) return null;
  const k = componentMatrix[0]?.length ?? 0;
  if (k < 2) return null;

  const variances: number[] = [];
  for (let j = 0; j < k; j += 1) {
    const col = componentMatrix.map((row) => row[j]);
    variances.push(std(col) ** 2);
  }

  const totalScores = componentMatrix.map((row) => row.reduce((sum, value) => sum + value, 0));
  const totalVar = std(totalScores) ** 2;
  if (!Number.isFinite(totalVar) || totalVar <= 1e-12) return null;

  const sumVar = variances.reduce((sum, value) => sum + value, 0);
  const alpha = (k / (k - 1)) * (1 - (sumVar / totalVar));
  return Number.isFinite(alpha) ? alpha : null;
}

function pairwiseCorrelations(componentNames: string[], matrix: number[][]): PairwiseCorrelation[] {
  const output: PairwiseCorrelation[] = [];
  if (componentNames.length < 2) return output;

  for (let i = 0; i < componentNames.length; i += 1) {
    for (let j = i + 1; j < componentNames.length; j += 1) {
      const left = matrix.map((row) => row[i]);
      const right = matrix.map((row) => row[j]);
      const corr = computePearsonCorr(left, right);
      output.push({
        left: componentNames[i],
        right: componentNames[j],
        corr: Number.isFinite(corr) ? corr : null,
      });
    }
  }

  return output;
}

function computeInvarianceBySlices(
  sliceKeys: string[],
  canonicalZ: Array<number | null>,
  altMean: Array<number | null>,
  minRowsPerSlice: number,
  lowCorrThreshold: number,
  severeLowCorrThreshold: number,
): SliceSummary {
  const grouped = new Map<string, number[]>();
  for (let i = 0; i < sliceKeys.length; i += 1) {
    const key = sliceKeys[i];
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(i);
  }

  const diagnostics: SliceDiagnostic[] = [];
  let nSlicesTotal = 0;
  let nLowVarianceExcluded = 0;
  for (const [key, indices] of grouped.entries()) {
    const obs: number[] = [];
    const pred: number[] = [];

    for (const index of indices) {
      const o = canonicalZ[index];
      const p = altMean[index];
      if (o === null || p === null || !Number.isFinite(o) || !Number.isFinite(p)) continue;
      obs.push(o);
      pred.push(p);
    }

    if (obs.length < minRowsPerSlice) continue;

    nSlicesTotal += 1;

    const obsStd = std(obs);
    const predStd = std(pred);
    if (!Number.isFinite(obsStd) || !Number.isFinite(predStd) || obsStd < 1e-8 || predStd < 1e-8) {
      nLowVarianceExcluded += 1;
      continue;
    }

    const corr = computePearsonCorr(obs, pred);
    const mae = computeMAE(obs, pred);
    if (!Number.isFinite(corr) || !Number.isFinite(mae)) continue;

    diagnostics.push({
      sliceId: key,
      n: obs.length,
      corr,
      maeZ: mae,
    });
  }

  return buildSliceSummary(
    diagnostics,
    nSlicesTotal,
    nLowVarianceExcluded,
    minRowsPerSlice,
    lowCorrThreshold,
    severeLowCorrThreshold,
  );
}

function severityFromFlags(flags: string[]): 'low' | 'moderate' | 'high' {
  if (flags.length === 0) return 'low';
  if (flags.length >= 3) return 'high';
  return 'moderate';
}

function maybeDelta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a - b;
}

function extractRowsForSpec(
  rows: ConstructDiagnosticsRow[],
  spec: ConstructSpec,
  minRowsPerSlice: number,
  lowCorrThreshold: number,
  severeLowCorrThreshold: number,
  configuredMinItemCoverage: number,
): ConstructDiagnostic {
  const nRows = rows.length;
  const targetValues = rows.map((row) => row[spec.targetColumn]);
  const canonicalZ = zScoreColumn(targetValues);

  const componentZByName: Record<string, Array<number | null>> = {};
  for (const component of spec.componentColumns) {
    const values = rows.map((row) => row[component]);
    componentZByName[component] = zScoreColumn(values);
  }

  const orientedComponents: Array<{ column: string; sign: -1 | 1 }> = [];
  for (const component of spec.componentColumns) {
    const componentZ = componentZByName[component];
    const pairedObs: number[] = [];
    const pairedComp: number[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      const o = canonicalZ[i];
      const c = componentZ[i];
      if (o === null || c === null || !Number.isFinite(o) || !Number.isFinite(c)) continue;
      pairedObs.push(o);
      pairedComp.push(c);
    }

    const corr = computePearsonCorr(pairedObs, pairedComp);
    const sign: -1 | 1 = Number.isFinite(corr) && corr < 0 ? -1 : 1;
    orientedComponents.push({ column: component, sign });
  }

  const altMean: Array<number | null> = [];
  const altMedian: Array<number | null> = [];
  const coverageRatio: number[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const available: number[] = [];
    for (const oriented of orientedComponents) {
      const componentZ = componentZByName[oriented.column][i];
      if (componentZ === null || !Number.isFinite(componentZ)) continue;
      available.push(componentZ * oriented.sign);
    }

    coverageRatio.push(spec.componentColumns.length > 0 ? available.length / spec.componentColumns.length : NaN);

    if (available.length === 0) {
      altMean.push(null);
      altMedian.push(null);
      continue;
    }

    const sorted = available.slice().sort((a, b) => a - b);
    altMean.push(mean(available));
    altMedian.push(quantile(sorted, 0.5));
  }

  const fullMask = coverageRatio.map((ratio) => Number.isFinite(ratio) && ratio >= 1);
  const partialMask = coverageRatio.map((ratio) => Number.isFinite(ratio) && ratio > 0 && ratio < 1);
  const noneMask = coverageRatio.map((ratio) => Number.isFinite(ratio) && ratio <= 0);

  const byCoverageFull = comparisonStats(canonicalZ, altMean, fullMask);
  const byCoveragePartial = comparisonStats(canonicalZ, altMean, partialMask);
  const byCoverageNone = comparisonStats(canonicalZ, altMean, noneMask);

  const completeComponentMatrix: number[][] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const values: number[] = [];
    let ok = true;
    for (const oriented of orientedComponents) {
      const z = componentZByName[oriented.column][i];
      if (!Number.isFinite(z)) {
        ok = false;
        break;
      }
      values.push((z as number) * oriented.sign);
    }
    if (ok && values.length === orientedComponents.length && values.length > 0) {
      completeComponentMatrix.push(values);
    }
  }

  const pairwise = pairwiseCorrelations(orientedComponents.map((value) => value.column), completeComponentMatrix);
  const meanInterItem = pairwise.length > 0
    ? mean(finite(pairwise.map((value) => (value.corr ?? NaN))))
    : null;

  const invarianceByCountry = computeInvarianceBySlices(
    rows.map((row) => row.iso3),
    canonicalZ,
    altMean,
    minRowsPerSlice,
    lowCorrThreshold,
    severeLowCorrThreshold,
  );

  const invarianceByYear = computeInvarianceBySlices(
    rows.map((row) => String(row.year)),
    canonicalZ,
    altMean,
    minRowsPerSlice,
    lowCorrThreshold,
    severeLowCorrThreshold,
  );

  const canonicalFinite = canonicalZ.filter((value) => Number.isFinite(value)).length;
  const componentAvailability = spec.componentColumns.reduce<Record<string, number>>((acc, column) => {
    const availability = rows
      .map((row) => row[column])
      .filter(Number.isFinite).length;
    acc[column] = nRows > 0 ? availability / nRows : NaN;
    return acc;
  }, {});

  const fullCoverageRate = nRows > 0 ? fullMask.filter(Boolean).length / nRows : NaN;
  const partialCoverageRate = nRows > 0 ? partialMask.filter(Boolean).length / nRows : NaN;
  const zeroCoverageRate = nRows > 0 ? noneMask.filter(Boolean).length / nRows : NaN;

  const belowConfiguredRate = nRows > 0
    ? coverageRatio.filter((ratio) => Number.isFinite(ratio) && ratio < configuredMinItemCoverage).length / nRows
    : NaN;

  const canonicalVsAltMean = comparisonStats(canonicalZ, altMean);
  const canonicalVsAltMedian = comparisonStats(canonicalZ, altMedian);

  const flags: string[] = [];
  if (belowConfiguredRate > 0.5) {
    flags.push('majority_rows_below_configured_item_coverage');
  }
  if (canonicalVsAltMean.n === 0) {
    flags.push('no_overlap_between_canonical_and_alternative_aggregate');
  }

  if (spec.componentColumns.length >= 2) {
    if ((fullCoverageRate ?? 0) < configuredMinItemCoverage) {
      flags.push('full_component_coverage_below_configured_threshold');
    }
    if (canonicalVsAltMean.corr !== null && canonicalVsAltMean.corr < 0.7) {
      flags.push('low_global_alignment_between_canonical_and_alternative_aggregate');
    }
    if (invarianceByCountry.lowCorrRate !== null && invarianceByCountry.lowCorrRate > 0.3) {
      flags.push('country_slice_invariance_fragility');
    }
    if (invarianceByYear.lowCorrRate !== null && invarianceByYear.lowCorrRate > 0.3) {
      flags.push('year_slice_invariance_fragility');
    }
  } else {
    if (invarianceByCountry.lowCorrRate !== null && invarianceByCountry.lowCorrRate > 0.3) {
      flags.push('single_indicator_country_slice_instability');
    }
    if (invarianceByYear.lowCorrRate !== null && invarianceByYear.lowCorrRate > 0.3) {
      flags.push('single_indicator_year_slice_instability');
    }
  }

  return {
    construct: spec.construct,
    targetColumn: String(spec.targetColumn),
    components: spec.componentColumns.map(String),
    sample: {
      nRows,
      nCanonicalFinite: canonicalFinite,
    },
    coverage: {
      fullCoverageRate,
      partialCoverageRate,
      zeroCoverageRate,
      componentAvailability,
      minCoverageConfigured: configuredMinItemCoverage,
      belowConfiguredCoverageRate: belowConfiguredRate,
    },
    internalConsistencyProxy: {
      nComponents: spec.componentColumns.length,
      nCompleteRows: completeComponentMatrix.length,
      cronbachAlpha: computeCronbachAlpha(completeComponentMatrix),
      meanInterItemCorrelation: Number.isFinite(meanInterItem) ? meanInterItem : null,
      pairwiseCorrelations: pairwise,
    },
    alternativeAggregation: {
      orientationRule: 'sign_aligned_to_canonical_correlation',
      orientedComponents,
      canonicalVsAltMean,
      canonicalVsAltMedian,
      meanVsMedianCorrDelta: maybeDelta(canonicalVsAltMean.corr, canonicalVsAltMedian.corr),
      meanVsMedianMaeDelta: maybeDelta(canonicalVsAltMean.maeZ, canonicalVsAltMedian.maeZ),
    },
    coverageSensitivity: {
      full: byCoverageFull,
      partial: byCoveragePartial,
      none: byCoverageNone,
      partialVsFullCorrDelta: maybeDelta(byCoveragePartial.corr, byCoverageFull.corr),
      partialVsFullMaeDelta: maybeDelta(byCoveragePartial.maeZ, byCoverageFull.maeZ),
    },
    invariance: {
      byCountry: invarianceByCountry,
      byYear: invarianceByYear,
    },
    fragility: {
      severity: severityFromFlags(flags),
      flags,
    },
  };
}

export function parseConstructDiagnosticsRowsFromCsv(
  csvText: string,
  sourceLabel: string,
): ParsedConstructDiagnosticsRows {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const headers = parsed.meta.fields ?? [];
  const requiredIdentifierColumns = ['iso3', 'country_name', 'year'];
  const requiredColumns = [
    ...requiredIdentifierColumns,
    ...CONSTRUCT_SPECS.flatMap((spec) => [String(spec.targetColumn), ...spec.componentColumns.map(String)]),
  ];

  const missingColumns = requiredColumns
    .filter((column, index, all) => all.indexOf(column) === index)
    .filter((column) => !headers.includes(column));

  const rows: ConstructDiagnosticsRow[] = [];
  parsed.data.forEach((row, index) => {
    const iso3 = String(row.iso3 ?? '').trim();
    const country = String(row.country_name ?? '').trim();
    if (!iso3 || iso3.length !== 3 || !country) {
      throw new Error(`Invalid identifiers on row ${index + 2} in ${sourceLabel}`);
    }

    rows.push({
      iso3,
      country_name: country,
      year: parseRequiredInt(row.year, 'year', index, sourceLabel),
      Z_belief_outcome: parseNumber(row.Z_belief_outcome),
      Z_religion_importance: parseNumber(row.Z_religion_importance),
      Z_violence_justifiable: parseNumber(row.Z_violence_justifiable),
      C_cultural_intensity: parseNumber(row.C_cultural_intensity),
      C_religiosity_index: parseNumber(row.C_religiosity_index),
      D_social_atomization: parseNumber(row.D_social_atomization),
      D_social_trust: parseNumber(row.D_social_trust),
      S_social_support: parseNumber(row.S_social_support),
      S_support_index: parseNumber(row.S_support_index),
      M_media_environment: parseNumber(row.M_media_environment),
      M_internet_daily: parseNumber(row.M_internet_daily),
    });
  });

  return {
    rows,
    missingColumns,
    sourceLabel,
  };
}

export function computeConstructValidityInvarianceSummary(
  rows: ConstructDiagnosticsRow[],
  options?: {
    datasetPath?: string;
    datasetSha256?: string;
    missingColumns?: string[];
    minRowsPerSlice?: number;
    lowCorrThreshold?: number;
    severeLowCorrThreshold?: number;
    configuredMinItemCoverage?: number;
  },
): ConstructValidityInvarianceSummary {
  const minRowsPerSlice = options?.minRowsPerSlice ?? 8;
  const lowCorrThreshold = options?.lowCorrThreshold ?? 0.6;
  const severeLowCorrThreshold = options?.severeLowCorrThreshold ?? 0.3;
  const configuredMinItemCoverage = options?.configuredMinItemCoverage ?? 0.5;

  const constructs = CONSTRUCT_SPECS.map((spec) =>
    extractRowsForSpec(
      rows,
      spec,
      minRowsPerSlice,
      lowCorrThreshold,
      severeLowCorrThreshold,
      configuredMinItemCoverage,
    )
  );

  const flaggedConstructs = constructs
    .filter((construct) => construct.fragility.flags.length > 0)
    .map((construct) => construct.construct);

  const flaggedCountrySlices = constructs.flatMap((construct) =>
    construct.invariance.byCountry.worstSlices
      .filter((slice) => slice.corr < lowCorrThreshold)
      .map((slice) => ({
        construct: construct.construct,
        sliceId: slice.sliceId,
        corr: slice.corr,
        n: slice.n,
      }))
  );

  const flaggedYearSlices = constructs.flatMap((construct) =>
    construct.invariance.byYear.worstSlices
      .filter((slice) => slice.corr < lowCorrThreshold)
      .map((slice) => ({
        construct: construct.construct,
        sliceId: slice.sliceId,
        corr: slice.corr,
        n: slice.n,
      }))
  );

  const years = finite(rows.map((row) => row.year));
  const countries = new Set(rows.map((row) => row.iso3));

  return {
    schemaVersion: 'phase1.construct_validity_invariance.v1',
    generatedAtIso: new Date().toISOString(),
    source: {
      datasetPath: options?.datasetPath,
      datasetSha256: options?.datasetSha256,
      nRows: rows.length,
      nCountries: countries.size,
      yearMin: years.length > 0 ? Math.min(...years) : null,
      yearMax: years.length > 0 ? Math.max(...years) : null,
      missingColumns: options?.missingColumns ?? [],
    },
    thresholds: {
      minRowsPerSlice,
      lowCorrThreshold,
      severeLowCorrThreshold,
      configuredMinItemCoverage,
    },
    constructs,
    instabilityRegions: {
      flaggedConstructs,
      flaggedCountrySlices,
      flaggedYearSlices,
    },
    limitations: [
      'Diagnostics are based on country-year aggregates rather than respondent-level covariance matrices, so internal consistency is a proxy rather than a full psychometric estimate.',
      'Single-indicator constructs (C, D, S, M in this panel) cannot support multi-item reliability estimation; invariance is assessed through slice stability against aligned alternatives.',
      'Country/year slice invariance is support-conditioned: sparse slices can produce unstable correlations and should be interpreted with the reported n thresholds.',
    ],
  };
}
