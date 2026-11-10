/**
 * Do the structural exponents sit at their lower bound because the constraint
 * binds, or because the optimum lies beyond it? Run the fit twice with different
 * floors and compare.
 *
 * Expensive (two full differential-evolution runs), so it is not part of the
 * default gate; the artifact it writes is committed and checked.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'elasticity_bound_sensitivity.json');
const TEMP = path.join(REPO_ROOT, 'rawdata', 'coefficients_v2_boundtest.json');

const runWithBound = (lower: number): { alpha: number; beta: number; k: number; r2: number; corr: number } => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'fit_coefficients_v2.py'), 'utf8');
  const patched = src
    .replace(/(math\.log\()0\.05(\)\s*,\s*math\.log\(5\.0\)\)\s*,\s*#\s*alpha)/, `$1${lower}$2`)
    .replace(/(math\.log\()0\.05(\)\s*,\s*math\.log\(5\.0\)\)\s*,\s*#\s*beta)/, `$1${lower}$2`)
    .replace(/OUT = ROOT \/ "rawdata" \/ "coefficients_v2\.json"/, `OUT = ROOT / "rawdata" / "coefficients_v2_boundtest.json"`)
    .replace(/COMMITTED = ROOT \/ "src" \/ "data" \/ "analysis" \/ "coefficient_fit\.json"/,
             'COMMITTED = ROOT / "rawdata" / "_boundtest_committed.json"');
  const tmp = path.join(REPO_ROOT, 'scripts', '_boundtest_fit.py');
  fs.writeFileSync(tmp, patched, 'utf8');
  try {
    execFileSync('python3', [tmp], { cwd: REPO_ROOT, stdio: 'pipe' });
  } finally {
    fs.unlinkSync(tmp);
  }
  const payload = JSON.parse(fs.readFileSync(TEMP, 'utf8')) as {
    parameters: { alpha: number; beta: number; k: number };
    fit: { r2: number; corr: number };
  };
  return {
    alpha: payload.parameters.alpha,
    beta: payload.parameters.beta,
    k: payload.parameters.k,
    r2: payload.fit.r2,
    corr: payload.fit.corr,
  };
};

const runs = [
  { lowerBound: 0.05, ...runWithBound(0.05) },
  { lowerBound: 0.001, ...runWithBound(0.001) },
].map((r) => ({
  lowerBound: r.lowerBound,
  alpha: Number(r.alpha.toFixed(6)),
  beta: Number(r.beta.toFixed(6)),
  k: Number(r.k.toFixed(4)),
  r2: Number(r.r2.toFixed(4)),
  corr: Number(r.corr.toFixed(4)),
  atBound: Math.abs(r.alpha - r.lowerBound) < 1e-5,
}));

for (const f of [TEMP, path.join(REPO_ROOT, 'rawdata', '_boundtest_committed.json')]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const improved = runs[1].r2 > runs[0].r2;
const payload = {
  schemaVersion: 'phase1.elasticity_bound_sensitivity.v1',
  generatedAtIso: new Date().toISOString(),
  question: 'Do alpha and beta sit at their lower bound because that bound is too tight, or because the panel cannot identify them?',
  design: 'The same fit is repeated with the alpha/beta lower bound moved from 0.05 to 0.001, everything else held fixed.',
  runs,
  finding: improved
    ? `Both runs terminate at whatever lower bound is in force, and relaxing it improves in-sample R2 from ${runs[0].r2} to ${runs[1].r2}. The exponents are not merely bounded: they are driven toward zero, and the fit prefers it.`
    : `Both runs terminate at their lower bound but relaxing it does not improve the fit, so the bound may be slack.`,
  interpretation: 'As alpha and beta approach zero, X^alpha Y^beta approaches one, so the multiplicative structural baseline drops out and the map reduces to exp(Phi)/(exp(Phi)+k). X and Y still enter through the interaction terms, but carry no separate power term.',
  consequence: 'The paper reports the shipped fit (bound 0.05) and states that alpha and beta are at the floor. It does not describe the bound as harmless: relaxing it raises the fit, which is what a binding constraint looks like.',
};

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`wrote ${path.relative(REPO_ROOT, OUT)}`);
for (const r of runs) console.log(`  bound ${r.lowerBound}: alpha=${r.alpha} beta=${r.beta} R2=${r.r2} atBound=${r.atBound}`);
