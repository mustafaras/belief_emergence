/**
 * Record the software environment the numbers came from.
 *
 * A reviewer reproducing a fit needs the numeric stack, not just the code. This
 * writes the versions actually installed rather than the versions someone typed
 * into the manuscript, and the consistency checker compares the two.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'software_environment.json');

const probe = (cmd: string, args: string[]): string | null => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

const pythonVersion = (() => {
  const out = probe('python3', ['-c', 'import sys; print(sys.version.split()[0])']);
  return out;
})();

const wheelVersions = (() => {
  const out = probe('python3', ['-c', 'import numpy, scipy; print(numpy.__version__, scipy.__version__)']);
  if (!out) return { numpy: null, scipy: null };
  const [numpy, scipy] = out.split(/\s+/);
  return { numpy: numpy ?? null, scipy: scipy ?? null };
})();

const nodeVersion = probe('node', ['--version']);

const payload = {
  schemaVersion: 'phase1.software_environment.v1',
  generatedAtIso: new Date().toISOString(),
  python: pythonVersion,
  node: nodeVersion,
  numpy: wheelVersions.numpy,
  scipy: wheelVersions.scipy,
  estimator: 'scipy.optimize.differential_evolution then minimize(method="L-BFGS-B")',
  note: 'Versions are probed from the environment that produced the committed artifacts, not typed by hand.',
};

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`wrote ${path.relative(REPO_ROOT, OUT)}`);
console.log(`  python ${payload.python ?? '?'} | numpy ${payload.numpy ?? '?'} | scipy ${payload.scipy ?? '?'} | node ${payload.node ?? '?'}`);
