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
});
