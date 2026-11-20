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
     * No pool tuning.
     *
     * Three attempts at bounding concurrency made it worse, each measured on the hosted runner:
     *
     *   - default workers:          459 of 463 tests completed, then the process idled 21 minutes
     *     and was killed (exit 143);
     *   - `maxForks: 2`:            24 of 76 files completed before the kill;
     *   - `maxForks: 1, singleFork`: **0 files completed** in ten minutes.
     *
     * Locally every one of those configurations finishes in 11–15 seconds, on Node 20 and Node 26
     * alike, so the variable is the runner and not the configuration — and guessing at it cost
     * three CI cycles. The pool is left at Vitest's default, which is the configuration that at
     * least made progress.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
