import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The commit this build came from, exposed as `import.meta.env.VITE_COMMIT`.
 *
 * The evidence bundle prints it on its cover, which is what makes the PDF tieable to a
 * version of the site. Read at config time from git rather than from an environment variable
 * a CI step has to remember to set: a value that depends on being passed is absent exactly
 * when someone builds from a fresh clone and does not know to pass it.
 */
function readCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  base: '/belief_emergence/',
  define: {
    'import.meta.env.VITE_COMMIT': JSON.stringify(readCommit()),
  },
  plugins: [react()],
  /*
   * Vitest and Playwright both collect `*.spec.ts`. Without this, `npm run test:run` imports
   * the six Playwright files, fails on `@playwright/test` being outside its environment, and
   * reports six broken suites that are not broken — while the real e2e run passes. The
   * exclusion is by directory, which is why the specs live in `e2e/` rather than beside the
   * unit tests.
   */
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    /*
     * Bounded concurrency, because the default is derived from the CPU count and a hosted runner
     * reports more cores than it can usefully schedule.
     *
     * In CI the suite completed 459 of 463 tests and then stopped: 36 of 76 files never started,
     * the process sat idle for 21 minutes, and the job was killed with SIGTERM (exit 143). Locally
     * the same suite finishes in seconds. Four workers on a two-core runner, each holding a jsdom
     * environment, is the shape of that failure.
     */
    /*
     * One fork, not two.
     *
     * Two still stalled on the hosted runner: the suite has to finish inside the job's budget and
     * each fork holds a jsdom environment plus a React tree. Serial execution costs about 40
     * seconds locally against a suite that took 21 minutes to be killed in CI — the trade is
     * obvious.
     */
    poolOptions: {
      forks: { maxForks: 1, minForks: 1, singleFork: true },
    },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
