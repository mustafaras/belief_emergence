/**
 * replicate.ts — Single-command end-to-end replication pipeline.
 *
 * Runs every generation, validation, and quality-assurance step in
 * deterministic order with fail-fast semantics.
 *
 * Usage:  npm run replicate
 */

import { execSync } from 'node:child_process';

/* ------------------------------------------------------------------ */
/*  Pipeline definition                                               */
/* ------------------------------------------------------------------ */

interface PipelineStep {
  label: string;
  command: string;
}

const PIPELINE: PipelineStep[] = [
  // Phase 1 — Artifact generation (deterministic, write)
  { label: 'Phase 1a  Generate authoritative analysis',       command: 'npm run generate:analysis' },
  { label: 'Phase 1b  Generate headline metrics',             command: 'npm run generate:headline-metrics' },
  { label: 'Phase 1c  Generate Phase-1 validation suite',     command: 'npm run generate:phase1-validation' },

  // Phase 2 — Validation checks (read-only)
  { label: 'Phase 2a  Check manuscript consistency',           command: 'npm run check:manuscript-consistency' },
  { label: 'Phase 2b  Check section references',              command: 'npm run check:section-references' },
  { label: 'Phase 2c  Check no hardcoded headline metrics',   command: 'npm run check:no-hardcoded-headline' },

  // Phase 3 — Code quality
  { label: 'Phase 3a  Lint',                                  command: 'npm run lint' },
  { label: 'Phase 3b  Tests',                                 command: 'npm run test:run' },
  { label: 'Phase 3c  Build',                                 command: 'npm run build' },
];

/* ------------------------------------------------------------------ */
/*  Runner                                                            */
/* ------------------------------------------------------------------ */

function run(): void {
  const total = PIPELINE.length;
  let passed = 0;

  console.log(`\n${'='.repeat(64)}`);
  console.log('  Bounded-Belief Replication Pipeline');
  console.log(`${'='.repeat(64)}\n`);

  const t0 = Date.now();

  for (const step of PIPELINE) {
    const idx = passed + 1;
    console.log(`[${idx}/${total}] ${step.label}`);
    console.log(`       $ ${step.command}`);

    const stepStart = Date.now();
    try {
      execSync(step.command, { stdio: 'inherit' });
    } catch {
      const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
      console.error(`\n  FAIL  ${step.label}  (${elapsed}s)`);
      console.error(`\nPipeline halted at step ${idx}/${total}.\n`);
      process.exit(1);
    }

    const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
    console.log(`   OK  (${elapsed}s)\n`);
    passed++;
  }

  const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${'='.repeat(64)}`);
  console.log(`  ALL ${total} STEPS PASSED  (${totalTime}s total)`);
  console.log(`${'='.repeat(64)}\n`);
}

run();
