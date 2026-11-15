/**
 * generate_marginal_effects.ts — emit marginal_effects.json.
 *
 * The manuscript's marginal-effects table (+1 SD shock in each retained modifier at
 * three structural baselines) had no generator and still described a model in which
 * the withdrawn channels were active. This script evaluates the production-pinned
 * map directly, so every entry can be regenerated and checked.
 *
 * Usage: npm run generate:marginal-effects
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculateModel, computeStructuralBase } from '../src/utils/calculateModel.ts';
import { OPTIMIZED_STRUCTURAL_PARAMS } from '../src/data/feCoefficients.ts';
import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { predictFromPanelRow } from '../src/utils/validation/panelPredict.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'marginal_effects.json');
const PANEL = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv');
/** Offsets applied to phi0 to sweep the baseline prediction across the bounded range. */
const OFFSET_MIN = -4;
const OFFSET_MAX = 4;
const OFFSET_STEP = 0.1;
/** Standardised E grid and R levels for the phase-policy slices (Figure 1B). */
const SLICE_E = Array.from({ length: 21 }, (_, i) => -0.5 + i * 0.1);
const SLICE_R = [-0.5, 0.5, 1.5] as const;

const BASELINES = [
  { label: 'low', x: 0.2, y: 0.2 },
  { label: 'mid', x: 0.5, y: 0.5 },
  { label: 'high', x: 0.8, y: 0.8 },
] as const;
/** Retained channels only: C, D, G and S are withdrawn and neutralised to zero. */
const RETAINED = ['M', 'T', 'E', 'R'] as const;
/** Fixed contextual state; every standardised modifier not listed is held at 0. */
const STATE = { M: 0.8, T: 1.2, C: 0, D: 0, G: 0, E: 0, S: 0, R: 0 } as const;
const OPTIONS = { modifiersAreStandardized: true, inputsAreStandardized: true } as never;

function predict(x: number, y: number, modifiers: Record<string, number>): number {
  return calculateModel({ X: x, Y: y, ...modifiers } as never, OPTIONS).Z;
}

function predictWithOffset(x: number, y: number, modifiers: Record<string, number>, offset: number): number {
  const phi0 = OPTIMIZED_STRUCTURAL_PARAMS.phi0 + offset;
  return calculateModel({ X: x, Y: y, ...modifiers } as never, { ...(OPTIONS as object), coefficients: { phi0 } } as never).Z;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (pos - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)] ?? sorted[lo]) - sorted[lo]);
}

function main(): void {
  const panelRows = parsePanelCsvText(fs.readFileSync(PANEL, 'utf8'), PANEL);
  const zPred = panelRows.map((r) => predictFromPanelRow(r).zPred).sort((a, b) => a - b);
  const offsets = Array.from({ length: Math.round((OFFSET_MAX - OFFSET_MIN) / OFFSET_STEP) + 1 }, (_, i) => OFFSET_MIN + i * OFFSET_STEP);
  const curves = BASELINES.map((b) => ({
    label: b.label,
    points: offsets.map((offset) => {
      const z0 = predictWithOffset(b.x, b.y, { ...STATE }, offset);
      const deltaZ = Object.fromEntries(
        RETAINED.map((ch) => [ch, predictWithOffset(b.x, b.y, { ...STATE, [ch]: STATE[ch] + 1 }, offset) - z0]),
      );
      return { offset, baselineZ: z0, deltaZ };
    }),
  }));
  const mid = BASELINES[1];
  const structuralBase = computeStructuralBase(mid.x, mid.y, OPTIMIZED_STRUCTURAL_PARAMS.alpha, OPTIMIZED_STRUCTURAL_PARAMS.beta);
  const slices = SLICE_R.map((rLevel) => ({
    rStd: rLevel,
    points: SLICE_E.map((e) => ({ eStd: e, z: predictWithOffset(mid.x, mid.y, { ...STATE, E: e, R: rLevel }, 0) })),
  }));
  const baselines = BASELINES.map((b) => {
    const z0 = predict(b.x, b.y, { ...STATE });
    const deltas = Object.fromEntries(
      RETAINED.map((ch) => [ch, predict(b.x, b.y, { ...STATE, [ch]: STATE[ch] + 1 }) - z0]),
    );
    return { label: b.label, x: b.x, y: b.y, baselineZ: z0, deltaZ: deltas };
  });
  const result = {
    schemaVersion: 'phase1.marginal_effects.v1',
    generatedAtIso: new Date().toISOString(),
    purpose: 'Finite-difference change in Z for a +1 SD shock in each retained standardised modifier, production-pinned map.',
    fixedState: STATE,
    retainedChannels: RETAINED,
    withdrawnChannels: ['C', 'D', 'G', 'S'],
    baselines,
    panelSha256: CANONICAL_PANEL_SHA256,
    supportRange: { zPredP05: quantile(zPred, 0.05), zPredP95: quantile(zPred, 0.95) },
    curves,
    phasePolicy: {
      note: 'Z = sigma(Phi + s) with s = ln(B/k) at the mid structural baseline; slices vary E_std at three R_std levels with M_std=0.8, T_std=1.2.',
      structuralBase,
      k: OPTIMIZED_STRUCTURAL_PARAMS.k,
      s: Math.log(structuralBase / OPTIMIZED_STRUCTURAL_PARAMS.k),
      slices,
    },
  };
  fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`✅ Generated: ${OUT}`);
  for (const b of baselines) {
    console.log(`   ${b.label.padEnd(5)} Z0 ${b.baselineZ.toFixed(4)}  ` + RETAINED.map((c) => `${c} ${b.deltaZ[c].toFixed(4)}`).join('  '));
  }
}

main();
