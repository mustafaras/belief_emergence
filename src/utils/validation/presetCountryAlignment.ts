import type { PanelRowCanonical } from "../../types/panel";
import { predictFromPanelRow } from "./panelPredict";

export type PresetVerdictClass = "good" | "acceptable" | "poor";

export const PRESET_VERDICT_THRESHOLDS = {
  goodMaeMax: 0.1,
  acceptableMaeMax: 0.2,
} as const;

export type PresetCountryAlignmentRow = {
  iso3: string;
  countryName: string;
  nYears: number;
  meanObservedZ: number;
  meanPredictedZ: number;
  mae: number;
  bias: number;
  successPct: number;
  verdictClass: PresetVerdictClass;
};

export function verdictClassFromMae(mae: number): PresetVerdictClass {
  if (mae <= PRESET_VERDICT_THRESHOLDS.goodMaeMax) return "good";
  if (mae <= PRESET_VERDICT_THRESHOLDS.acceptableMaeMax) return "acceptable";
  return "poor";
}

export function computePresetCountryAlignment(
  panelData: PanelRowCanonical[],
): PresetCountryAlignmentRow[] {
  // Collapse scenario replication by averaging within (iso3, year), then compute
  // per-country summary metrics on those year-averaged pairs.

  type YearKey = string; // `${iso3}__${year}`

  const byCountryYear = new Map<YearKey, {
    iso3: string;
    countryName: string;
    year: number;
    sumObserved: number;
    sumPredicted: number;
    n: number;
  }>();

  for (const row of panelData) {
    const iso3 = row.iso3;
    const year = row.year;
    const key = `${iso3}__${year}`;

    const pred = predictFromPanelRow(row);
    const observedZ = pred.zObs;
    const predictedZ = pred.zPred;

    // Defensive: if a row has invalid Z (or other preprocessing issues), skip.
    if (!Number.isFinite(observedZ) || !Number.isFinite(predictedZ)) continue;

    const cur = byCountryYear.get(key);
    if (cur) {
      cur.sumObserved += observedZ;
      cur.sumPredicted += predictedZ;
      cur.n += 1;
    } else {
      byCountryYear.set(key, {
        iso3,
        countryName: row.country_name,
        year,
        sumObserved: observedZ,
        sumPredicted: predictedZ,
        n: 1,
      });
    }
  }

  const byCountry = new Map<string, {
    iso3: string;
    countryName: string;
    nYears: number;
    sumObservedMean: number;
    sumPredictedMean: number;
    sumAbsError: number;
    sumResidual: number;
  }>();

  for (const cy of byCountryYear.values()) {
    const observedMean = cy.sumObserved / cy.n;
    const predictedMean = cy.sumPredicted / cy.n;
    // Keep global metric semantics aligned: residual = observed - predicted.
    const residual = observedMean - predictedMean;

    const cur = byCountry.get(cy.iso3);
    if (cur) {
      cur.nYears += 1;
      cur.sumObservedMean += observedMean;
      cur.sumPredictedMean += predictedMean;
      cur.sumAbsError += Math.abs(residual);
      cur.sumResidual += residual;
    } else {
      byCountry.set(cy.iso3, {
        iso3: cy.iso3,
        countryName: cy.countryName,
        nYears: 1,
        sumObservedMean: observedMean,
        sumPredictedMean: predictedMean,
        sumAbsError: Math.abs(residual),
        sumResidual: residual,
      });
    }
  }

  const rows: PresetCountryAlignmentRow[] = [];

  for (const c of byCountry.values()) {
    const meanObservedZ = c.sumObservedMean / c.nYears;
    const meanPredictedZ = c.sumPredictedMean / c.nYears;
    const mae = c.sumAbsError / c.nYears;
    const bias = c.sumResidual / c.nYears;

    // Match the paper table convention: Success(%) = 100 * (1 - MAE)
    const successPct = 100 * (1 - mae);

    rows.push({
      iso3: c.iso3,
      countryName: c.countryName,
      nYears: c.nYears,
      meanObservedZ,
      meanPredictedZ,
      mae,
      bias,
      successPct,
      verdictClass: verdictClassFromMae(mae),
    });
  }

  // Stable order for UI/table.
  rows.sort((a, b) => a.countryName.localeCompare(b.countryName));

  return rows;
}
