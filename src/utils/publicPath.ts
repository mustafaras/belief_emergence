/**
 * Resolve a path served from `public/` against the deployment base.
 *
 * Vite serves `public/` under `base` (here `/belief_emergence/` — see vite.config.ts),
 * so an absolute `/data/...` or `/fonts/...` request misses the base and 404s on any
 * sub-path deployment. `import.meta.env.BASE_URL` is the base with a trailing slash and
 * is `/` for a root deployment.
 *
 * `base` is injectable only so the rule can be tested: Vite statically replaces
 * `import.meta.env.BASE_URL`, so it cannot be varied at runtime from a test.
 */
export function resolvePublicPath(
  pathFromPublicRoot: string,
  base: string = import.meta.env?.BASE_URL ?? '/',
): string {
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}${pathFromPublicRoot.replace(/^\/+/, '')}`
}
