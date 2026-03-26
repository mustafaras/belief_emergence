import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CANONICAL_PANEL_SHA256, parsePanelCsvText } from '../src/data/panelDataLoader.ts';
import { computeLeaveOneCountryOutRefit } from '../src/utils/validation/computeLeaveOneCountryOutRefit.ts';
import { computeRollingOriginRefit } from '../src/utils/validation/computeRollingOriginRefit.ts';
import {
  computeLockboxHoldoutSummary,
  type LockboxHoldoutSummary,
} from '../src/utils/validation/computeLockboxHoldoutSummary.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CANONICAL_DATASET_PATH = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_23_countries_v1.csv');
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis');
const LOCKBOX_ARTIFACT_PATH = path.join(ANALYSIS_DIR, 'lockbox_holdout.json');

type CliOptions = {
  cycleId: string;
  force: boolean;
  hashSalt?: string;
  lockboxCellFraction?: number;
  minLockboxCells?: number;
  minLockboxRows?: number;
};

function computeSha256(text: string): string {
  const hash = createHash('sha256');
  hash.update(text, 'utf8');
  return hash.digest('hex').toUpperCase();
}

function parseNumericArg(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value for --${name}: ${raw}`);
  }
  return value;
}

function parseCliOptions(argv: string[]): CliOptions {
  const args = [...argv];
  const envValue = (name: string): string | undefined => {
    const normalized = name.replace(/-/g, '_');
    return process.env[`npm_config_${normalized}`];
  };

  const pickValue = (name: string): string | undefined => {
    const direct = args.find((arg) => arg.startsWith(`--${name}=`));
    if (direct) return direct.slice(name.length + 3);

    const idx = args.findIndex((arg) => arg === `--${name}`);
    if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];

    return envValue(name);
  };

  const cycleId = pickValue('cycle') ?? process.env.LOCKBOX_RELEASE_CYCLE_ID;
  if (!cycleId || cycleId.trim().length === 0) {
    throw new Error(
      'Missing release cycle id. Provide --cycle=<id> or set LOCKBOX_RELEASE_CYCLE_ID. Example: npm run generate:lockbox-holdout -- --cycle=2026Q1-R1',
    );
  }

  const force = args.includes('--force');

  return {
    cycleId: cycleId.trim(),
    force,
    hashSalt: pickValue('salt') ?? undefined,
    lockboxCellFraction: parseNumericArg(pickValue('fraction'), 'fraction'),
    minLockboxCells: parseNumericArg(pickValue('min-cells'), 'min-cells'),
    minLockboxRows: parseNumericArg(pickValue('min-rows'), 'min-rows'),
  };
}

function loadExistingLockboxArtifact(): LockboxHoldoutSummary | null {
  if (!fs.existsSync(LOCKBOX_ARTIFACT_PATH)) return null;
  const content = fs.readFileSync(LOCKBOX_ARTIFACT_PATH, 'utf8');
  const parsed = JSON.parse(content);
  return parsed as LockboxHoldoutSummary;
}

function writeJson(fileName: string, value: unknown): void {
  fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
  fs.writeFileSync(path.join(ANALYSIS_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function generateLockboxHoldoutArtifact(): Promise<void> {
  const cli = parseCliOptions(process.argv.slice(2));
  const existing = loadExistingLockboxArtifact();

  let releaseCycleGuardPass = true;
  if (existing?.release?.cycleId === cli.cycleId) {
    if (!cli.force) {
      throw new Error(
        `Lockbox artifact already exists for release cycle "${cli.cycleId}" at ${LOCKBOX_ARTIFACT_PATH}. ` +
          'Reruns in the same cycle are blocked by protocol. Use --force only for audited emergency regeneration.',
      );
    }
    releaseCycleGuardPass = false;
  }

  const csvText = fs.readFileSync(CANONICAL_DATASET_PATH, 'utf8');
  const hash = computeSha256(csvText);
  if (hash !== CANONICAL_PANEL_SHA256) {
    throw new Error(
      `Canonical dataset checksum mismatch: expected ${CANONICAL_PANEL_SHA256}, got ${hash} at ${CANONICAL_DATASET_PATH}`,
    );
  }

  const rows = parsePanelCsvText(csvText, CANONICAL_DATASET_PATH);
  const cvCountryOut = computeLeaveOneCountryOutRefit(rows);
  const cvRollingOrigin = computeRollingOriginRefit(rows);

  const summary = computeLockboxHoldoutSummary(rows, cvCountryOut, cvRollingOrigin, {
    releaseCycleId: cli.cycleId,
    datasetPath: CANONICAL_DATASET_PATH,
    datasetSha256: hash,
    lockboxCellFraction: cli.lockboxCellFraction,
    minLockboxCells: cli.minLockboxCells,
    minLockboxRows: cli.minLockboxRows,
    hashSalt: cli.hashSalt,
  });

  summary.checks.releaseCycleGuardPass = releaseCycleGuardPass;
  if (!releaseCycleGuardPass) {
    summary.checks.protocolViolationFlags = Array.from(
      new Set([...summary.checks.protocolViolationFlags, 'release_cycle_rerun_forced']),
    );
  }

  if (summary.checks.protocolViolationFlags.length > 0) {
    throw new Error(
      `Lockbox protocol violations detected: ${summary.checks.protocolViolationFlags.join(', ')}. ` +
        'Artifact was not written.',
    );
  }

  writeJson('lockbox_holdout.json', summary);

  console.log('✅ Generated lockbox holdout artifact:');
  console.log('   - src/data/analysis/lockbox_holdout.json');
  console.log(`   Cycle: ${summary.release.cycleId}`);
  console.log(
    `   Split: ${summary.splitPolicy.nLockboxCells}/${summary.splitPolicy.nCellsTotal} cells, ` +
      `${summary.lockboxEvaluation.byTier.A.nTestRows} lockbox rows`,
  );
  console.log(`   Fingerprint: ${summary.splitPolicy.lockboxCellFingerprint}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateLockboxHoldoutArtifact().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
