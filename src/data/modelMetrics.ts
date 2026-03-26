import { PRODUCTION_MODEL_METADATA } from './feCoefficients';
import headlineMetrics from './metrics/headline_metrics_authoritative.json';

export type ModelMetrics = {
  r2: number;
  correlation: number;
  mae: number;
  rmse: number;
  bias: number;
};

export type HeadlineMetricsFile = typeof headlineMetrics;

export type TrainingMetadata = {
  date: string;
  metrics: ModelMetrics;
};

export type DatasetMetadata = {
  observations: number;
  countries: number;
  yearStart: number;
  yearEnd: number;
};

/**
 * Single-source access layer for all reported metrics.
 *
 * IMPORTANT:
 * - "Headline" metrics are the canonical panel-fit computed on the 630-row panel
 *   and stored in src/data/metrics/headline_metrics_authoritative.json (generated).
 * - "Training metadata" metrics come from the optimizer summary embedded in the
 *   coefficients JSON and must NOT be used as the repo-wide headline.
 */

export function getProductionHeadlineMetrics(): ModelMetrics {
  return {
    r2: headlineMetrics.values.r2,
    correlation: headlineMetrics.values.corr,
    mae: headlineMetrics.values.mae,
    rmse: headlineMetrics.values.rmse,
    bias: headlineMetrics.values.bias,
  };
}

export function getHeadlineProvenance(): HeadlineMetricsFile {
  return headlineMetrics;
}

export function getProductionTrainingMetadata(): TrainingMetadata {
  return {
    date: PRODUCTION_MODEL_METADATA.training.date,
    metrics: { ...PRODUCTION_MODEL_METADATA.training.metrics },
  };
}

export function getProductionDatasetMetadata(): DatasetMetadata {
  return { ...PRODUCTION_MODEL_METADATA.dataset };
}
