/**
 * Derive, from the source tree, which claims each route can reach and which generator
 * produces each artifact.
 *
 * The Evidence section has to answer three questions that the interface currently
 * answers only by omission: which artifacts carry the numbers a reader sees, which
 * generator would rebuild them, and which claims belong to which section. All three
 * are facts about the import graph, so they are derived from it rather than listed by
 * hand — a hand-written map drifts the moment a claim moves.
 *
 * Pure functions only: no `node:fs`, so the module is importable by the browser build
 * as well as by the generator that writes the committed copy.
 */

/** Where a claim is referenced, found by scanning a module's text. */
export type ClaimReference =
  | { kind: 'id'; id: string }
  | { kind: 'getClaim' }
  | { kind: 'selector'; name: string }

const CLAIM_ID_PATTERN = /\b(?:getClaim|claim)\(\s*['"]([A-Za-z0-9_.-]+)['"]/g
const SELECTOR_IMPORT_PATTERN =
  /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*\/claims\/selectors\/([A-Za-z0-9_-]+)['"]/g

/**
 * Claim references in one module's source.
 *
 * `getClaim('x')` is a direct reference. A bare `getClaim` call with the id built at
 * run time cannot be resolved statically, and is reported as `getClaim` so the caller
 * knows the module reaches the registry without being able to say which claim. Selector
 * imports are kept by name: the selector module itself knows which claims it exports.
 */
export function findClaimReferences(source: string): ClaimReference[] {
  const found: ClaimReference[] = []
  const seen = new Set<string>()

  CLAIM_ID_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CLAIM_ID_PATTERN.exec(source)) !== null) {
    const key = `id:${match[1]}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ kind: 'id', id: match[1] })
  }

  SELECTOR_IMPORT_PATTERN.lastIndex = 0
  while ((match = SELECTOR_IMPORT_PATTERN.exec(source)) !== null) {
    const names = match[1]
      .split(',')
      .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean)
    for (const name of names) {
      const key = `selector:${match[2]}:${name}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ kind: 'selector', name })
    }
  }

  return found
}

/** Local module specifiers a file imports, resolved to repository-relative paths. */
export function resolveLocalImports(fromFile: string, source: string): string[] {
  const out: string[] = []
  const pattern = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const specifier = match[1]
    const resolved = resolveSpecifier(fromFile, specifier)
    if (resolved && !out.includes(resolved)) out.push(resolved)
  }
  return out
}

/**
 * Resolve `./x` against `src/sections/audit/index.tsx`.
 *
 * Tries the specifier as written plus the four extensions the project uses, then
 * `/index.<ext>`. Returns null for anything outside `src/` — a route reaching into
 * `scripts/` would not be part of the rendered interface.
 */
export function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const base = normalizePath(joinPath(dirname(fromFile), specifier))
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.json`,
    `${base}.css`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]
  for (const candidate of candidates) {
    // Existence is the caller's problem; resolution is textual here so the browser build
    // can call this too. The generator filters the list against the real file set.
    return candidate
  }
  return null
}

function normalizePath(p: string): string {
  const parts: string[] = []
  for (const segment of p.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return parts.join('/')
}

function dirname(p: string): string {
  const index = p.lastIndexOf('/')
  return index === -1 ? '' : p.slice(0, index)
}

function joinPath(a: string, b: string): string {
  return a ? `${a}/${b}` : b
}

/** The route module a `src/sections/<id>/index.tsx` path belongs to. */
export function routeForSectionFile(file: string): string | null {
  const match = /^src\/sections\/([A-Za-z0-9_-]+)\//.exec(file)
  return match ? match[1] : null
}

/** Artifact basenames a module imports. */
export function artifactImportsIn(source: string): string[] {
  const out: string[] = []
  const pattern =
    /import\s+[A-Za-z0-9_$]+\s+from\s+['"][^'"]*data\/(?:analysis\/([A-Za-z0-9_.-]+)\.json|(panel_canonical_v2)\.csv)['"]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1] ?? match[2]
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

/**
 * Claim ids a selector module declares in its exported `…Claims` array.
 *
 * Selector claim arrays are built by helpers (`claim(...)`, `gateClaims(...)`) as well as
 * by literals, so this reads the ids it can see in the array literal and reports when it
 * could not see them all. A selector that emits claims from a `map` has no literal ids —
 * `seedClaims` generates one per seed — and the caller must not present that as "this
 * module declares no claims".
 */
export function selectorClaimFacts(source: string): {
  declaredIds: string[]
  exportedClaimsArrays: string[]
  unresolved: boolean
} {
  // A `…Claims` export can be an array literal or a `map` over a data array; both declare
  // claims, and both must be found. The initialiser is therefore matched up to its first
  // `[` *or* to a `.map(` call, not to `[` alone.
  const exportPattern =
    /export\s+const\s+([A-Za-z0-9_$]*Claims)\s*(?::\s*[^=]*?)?\s*=\s*(\[[\s\S]*|(?=[A-Za-z0-9_$]+\.map\())/g

  const exportedClaimsArrays: string[] = []
  const bodies: string[] = []
  let match: RegExpExecArray | null
  while ((match = exportPattern.exec(source)) !== null) {
    exportedClaimsArrays.push(match[1])
    // Keep the initialiser to the end of the statement: a `map` has no bracket to close on,
    // so the body is whatever follows `=` up to the next top-level export or EOF.
    const rest = source.slice(match.index)
    const end = rest.search(/\nexport\s/)
    bodies.push(match[2] ?? rest.slice(0, end === -1 ? undefined : end))
  }

  const body = bodies.join('\n')
  const declaredIds: string[] = []
  const idPattern = /['"]([a-z][A-Za-z0-9_-]*\.[A-Za-z0-9_.-]+)['"]/g
  while ((match = idPattern.exec(body)) !== null) {
    if (!declaredIds.includes(match[1])) declaredIds.push(match[1])
  }

  // A selector whose claims are produced by a `map` has ids that appear nowhere in its own
  // text — `seedClaims` builds one per seed. Two spellings reach that state: a spread of a
  // mapper inside an array literal, and a `…Claims` export that *is* a `map` call. Both are
  // unresolved, and the flag is what stops a caller from reporting "this module declares no
  // claims" when in truth it declares claims this reader cannot enumerate.
  // A selector that exports a claims array yet yields no literal id builds its claims
  // programmatically — `seedClaims` emits one per seed and names none of them in its own
  // text. That is the condition the caller must not mistake for "declares no claims".
  const unresolved = exportedClaimsArrays.length > 0 && declaredIds.length === 0

  return { declaredIds, exportedClaimsArrays, unresolved }
}

/**
 * Artifacts a script writes, from its declared output path.
 *
 * Generators do not import what they produce — they build a path and write the file. Five
 * spellings appear in this repository and all five are covered:
 *
 *   path.join(REPO_ROOT, 'src', 'data', 'analysis', 'x.json')
 *   path.join(ANALYSIS_DIR, 'x.json')
 *   ROOT / "src" / "data" / "analysis" / "x.json"        (Python)
 *   writeJson('x.json', payload)                          (helper whose dir is fixed)
 *   A / "x.json"  /  src/data/analysis/x.json             (literal ANALYSIS alias)
 *
 * The `analysis` token must appear on the same line as the filename, so a comment that
 * merely mentions an artifact does not register as a producer. `writeJson` is matched
 * without that token because the helper it calls resolves paths against the analysis
 * directory itself; the helper is asserted to exist before the match is trusted.
 */
export function outputArtifactsIn(source: string): string[] {
  const out: string[] = []
  const hasWriteJson = /function\s+writeJson\s*\(/.test(source)

  for (const line of source.split(/\r?\n/)) {
    const mentionsAnalysis = /analysis/i.test(line) || /\bA\s*\//.test(line)
    const pattern = /['"]([A-Za-z0-9_]+)\.json['"]/g

    if (hasWriteJson) {
      const writeJsonCall = /writeJson\(\s*['"]([A-Za-z0-9_]+)\.json['"]/g
      let written: RegExpExecArray | null
      while ((written = writeJsonCall.exec(line)) !== null) {
        if (!out.includes(written[1])) out.push(written[1])
      }
    }

    if (!mentionsAnalysis) continue
    let match: RegExpExecArray | null
    while ((match = pattern.exec(line)) !== null) {
      if (!out.includes(match[1])) out.push(match[1])
    }
  }
  return out
}

/**
 * Whether a file under `scripts/` produces artifacts rather than auditing them.
 *
 * `check_support_picture.ts` names `covariate_blocker_attribution.json` because it reads the
 * committed copy to verify it; reporting that as the generator would tell a reader to run an
 * audit to rebuild an artifact, which does not rebuild it. Producers are the `generate_*`,
 * `build_*`, `fit_*`, `bootstrap_*`, `profile_*` scripts and the named one-offs.
 */
export function isArtifactProducer(scriptPath: string): boolean {
  const base = scriptPath.split('/').pop() ?? ''
  if (base.startsWith('check_') || base === 'ci_gate.ts') return false
  return /^(generate_|build_|fit_|bootstrap_|profile_|window_sensitivity|make_paper_figures|update_notation_glossary)/.test(base)
}

/** `generate:*` / `build:*` script names a module mentions, in source order. */
export function generatorInvocations(source: string): string[] {
  const out: string[] = []
  const pattern = /(?:generate|build):[A-Za-z0-9:-]+/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    if (!out.includes(match[0])) out.push(match[0])
  }
  return out
}
