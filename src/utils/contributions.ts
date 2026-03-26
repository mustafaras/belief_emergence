import type { BeliefParameters } from '../types';
import { calculateModel } from './calculateModel';

export type TermContribution = {
  key: string;
  label: string;
  value: number;
};

function formatInteractionLabel(name: string): string {
  // e.g. Y_x_R -> Y × R
  return name.replace(/_x_/g, ' × ').replace(/_/g, ' ');
}

function formatQuadraticLabel(name: string): string {
  // e.g. C_squared -> C²
  if (name.endsWith('_squared')) {
    const base = name.split('_')[0];
    return `${base}²`;
  }
  return name;
}

export function computePhiContributions(params: BeliefParameters) {
  // Delegate to the canonical calculator to avoid schema drift.
  const result = calculateModel(params);

  const terms: TermContribution[] = [];

  terms.push({
    key: 'phi0',
    label: 'Baseline (φ₀)',
    value: result.phiComponents.baseline,
  });

  for (const term of result.mainEffectTerms ?? []) {
    terms.push({
      key: term.name,
      label: term.label,
      value: term.contribution,
    });
  }

  for (const term of result.interactionTerms ?? []) {
    terms.push({
      key: term.name,
      label: formatInteractionLabel(term.name),
      value: term.value,
    });
  }

  for (const term of result.quadraticTerms ?? []) {
    terms.push({
      key: term.name,
      label: formatQuadraticLabel(term.name),
      value: term.value,
    });
  }

  return { terms, totalPhi: result.phi };
}
