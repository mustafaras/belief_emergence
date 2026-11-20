/**
 * Write the reproduction manifest the Evidence section renders.
 *
 * Answers three questions the interface could otherwise only imply:
 *   - which claims a route can reach, and through which file,
 *   - which artifacts back those claims,
 *   - which npm script would rebuild each artifact.
 *
 * Everything is derived from the real source tree. A hand-written mapping would be a
 * second place to keep in sync, and the failure mode is silent: a claim shown under the
 * wrong section looks exactly like a correct one.
 *
 * Usage:
 *   npm run generate:reproduction-manifest
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  artifactImportsIn,
  findClaimReferences,
  generatorInvocations,
  isArtifactProducer,
  outputArtifactsIn,
  resolveLocalImports,
  selectorClaimFacts,
} from '../src/evidence/reproductionManifest'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = path.join(REPO_ROOT, 'src')
const ANALYSIS_DIR = path.join(SRC, 'data', 'analysis')
const OUT_PATH = path.join(SRC, 'evidence', 'reproductionManifest.generated.ts')
const PACKAGE_JSON = path.join(REPO_ROOT, 'package.json')

type Manifest = {
  generatedFrom: {
    routes: number
    claimModules: number
    artifacts: number
  }

  routes: Array<{
    id: string
    files: number
    directClaimIds: string[]
    claimIds: string[]
    unresolvedClaimModules: string[]
    artifacts: string[]
    reachableArtifacts: number
    generators: string[]
  }>
  artifacts: Array<{
    name: string
    claimedBy: number
    routes: string[]
    generator: string | null
    sourceTwin: string | null
    provenance: 'generated' | 'copied' | 'recorded'
  }>
  claimModules: Array<{ module: string; declaredIds: number; unresolved: boolean; routes: string[] }>
}

const toPosix = (p: string) => p.split(path.sep).join('/')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'analysis') continue
      walk(full, out)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

const allFiles = [...walk(SRC), ...walk(path.join(REPO_ROOT, 'scripts'))]
  .map((f) => toPosix(path.relative(REPO_ROOT, f)))
const fileSet = new Set(allFiles)
const sourceOf = new Map(allFiles.map((f) => [f, readFileSync(path.join(REPO_ROOT, f), 'utf8')]))

/** Every module reachable from a route entry point through local imports. */
function reachable(entry: string): string[] {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length) {
    const file = queue.shift() as string
    if (seen.has(file) || !fileSet.has(file)) continue
    seen.add(file)
    const source = sourceOf.get(file) ?? ''
    for (const specifier of resolveLocalImports(file, source)) {
      for (const candidate of expansion(specifier)) {
        if (fileSet.has(candidate) && !seen.has(candidate)) queue.push(candidate)
      }
    }
  }
  return [...seen].sort()
}

/** The resolved specifier plus the alternatives `resolveSpecifier` cannot disambiguate. */
function expansion(base: string): string[] {
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
}

const artifactNames = readdirSync(ANALYSIS_DIR)
  .filter((f) => f.endsWith('.json') && statSync(path.join(ANALYSIS_DIR, f)).isFile())
  .map((f) => f.slice(0, -'.json'.length))
  .sort()

/** Claims each selector module declares, so a selector import can be turned into ids. */
const selectorClaims = new Map<string, { ids: string[]; unresolved: boolean }>()
for (const file of allFiles.filter((f) => f.startsWith('src/claims/selectors/'))) {
  const facts = selectorClaimFacts(sourceOf.get(file) ?? '')
  const base = file.replace(/^src\/claims\/selectors\//, '').replace(/\.tsx?$/, '')
  selectorClaims.set(base, { ids: facts.declaredIds, unresolved: facts.unresolved })
}

const routeFiles = readdirSync(path.join(SRC, 'sections'))
  .filter((name) => statSync(path.join(SRC, 'sections', name)).isDirectory())
  .sort()

const routes: Manifest['routes'] = []
const artifactRoutes = new Map<string, Set<string>>()
const artifactGenerators = new Map<string, Set<string>>()
const claimModuleRoutes = new Map<string, Set<string>>()

for (const routeId of routeFiles) {
  const entry = `src/sections/${routeId}/index.tsx`
  if (!fileSet.has(entry)) continue
  const files = reachable(entry)
  const claimIds = new Set<string>()
  const directClaimIds = new Set<string>()
  const unresolvedClaimModules: string[] = []
  const artifacts = new Set<string>()
  const directArtifacts = new Set<string>()

  for (const file of files) {
    const source = sourceOf.get(file) ?? ''
    // Claims the route's own section modules name. The registry is reachable from every
    // route, so the transitive set is the whole corpus and says nothing about what a
    // reader sees on this page; `src/sections/<routeId>/...` is what the section displays.
    const isOwnSection = file.startsWith(`src/sections/${routeId}/`)
    for (const ref of findClaimReferences(source)) {
      if (isOwnSection && ref.kind === 'id') directClaimIds.add(ref.id)
    }
    for (const ref of findClaimReferences(source)) {
      if (ref.kind === 'id') {
        claimIds.add(ref.id)
      } else if (ref.kind === 'selector') {
        // A selector import names the module, not the ids; the module's own claim array
        // is the authority for which ids it contributes.
        const selectorFile = [...selectorClaims.keys()].find((name) =>
          (sourceOf.get(`src/claims/selectors/${name}.ts`) ?? '').includes(`export const ${ref.name}`),
        )
        if (!selectorFile) continue
        const facts = selectorClaims.get(selectorFile) as { ids: string[]; unresolved: boolean }
        facts.ids.forEach((id) => {
          claimIds.add(id)
          // A section that imports a selector displays that selector's claims; counting
          // only literal `getClaim('…')` calls would understate every table-driven route.
          if (isOwnSection) directClaimIds.add(id)
        })
        if (facts.unresolved && !unresolvedClaimModules.includes(selectorFile)) {
          unresolvedClaimModules.push(selectorFile)
        }
      }
    }
    for (const name of artifactImportsIn(source)) {
      artifacts.add(name)
      // "Used in sections" means the artifact reaches a component this page renders.
      // Counting anything reachable would list all 26 every time, because the claim
      // registry — and through it every selector and artifact — is imported by the shell
      // on every route. Only files under `src/sections/<routeId>/` speak for this page.
      if (file.startsWith(`src/sections/${routeId}/`)) {
        directArtifacts.add(name)
        if (!artifactRoutes.has(name)) artifactRoutes.set(name, new Set())
        ;(artifactRoutes.get(name) as Set<string>).add(routeId)
      }
      for (const generator of generatorInvocations(source)) {
        if (!artifactGenerators.has(name)) artifactGenerators.set(name, new Set())
        ;(artifactGenerators.get(name) as Set<string>).add(generator)
      }
    }
    if (file.startsWith('src/claims/selectors/')) {
      const base = file.replace(/^src\/claims\/selectors\//, '').replace(/\.tsx?$/, '')
      if (!claimModuleRoutes.has(base)) claimModuleRoutes.set(base, new Set())
      ;(claimModuleRoutes.get(base) as Set<string>).add(routeId)
    }
  }

  routes.push({
    id: routeId,
    files: files.length,
    directClaimIds: [...directClaimIds].sort(),
    claimIds: [...claimIds].sort(),
    unresolvedClaimModules: unresolvedClaimModules.sort(),
    artifacts: [...directArtifacts].sort(),
    reachableArtifacts: artifacts.size,
    generators: [...new Set([...directArtifacts].flatMap((a) => [...(artifactGenerators.get(a) ?? [])]))].sort(),
  })
}

/**
 * Artifact → generator, resolved from `package.json` rather than from prose.
 *
 * The `generate:*` script's command names a `scripts/*.ts` file; that file's own imports
 * are what tie it to an artifact. Reading the mapping from the scripts is the only
 * version that stays true when a generator is renamed.
 */
const packageScripts = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as {
  scripts?: Record<string, string>
}
const generatorByArtifact = new Map<string, string>()
const generatorScripts = new Map<string, string>()
for (const [name, command] of Object.entries(packageScripts.scripts ?? {})) {
  // `build:` scripts produce artifacts too — `build:wvs-constructs` writes the construct
  // audit. Restricting to `generate:` reported that artifact as having no producer.
  if (!name.startsWith('generate:') && !name.startsWith('build:')) continue
  const scriptMatch = /(scripts\/[A-Za-z0-9_./-]+\.(?:ts|py|mjs))/.exec(command)
  if (!scriptMatch) continue
  const scriptPath = scriptMatch[1]
  if (!fileSet.has(scriptPath)) continue
  if (!isArtifactProducer(scriptPath)) continue
  generatorScripts.set(scriptPath, `npm run ${name}`)
  // A generator does not import the artifact it writes at the top level — it points at an
  // output path and writes the file. Reading `OUT = ...analysis/x.json` is what ties the
  // script to its artifact; `artifactImportsIn` only catches the few that re-read one.
  const produced = [
    ...outputArtifactsIn(sourceOf.get(scriptPath) ?? ''),
    ...artifactImportsIn(sourceOf.get(scriptPath) ?? ''),
  ]
  for (const artifact of produced) {
    if (!generatorByArtifact.has(artifact)) generatorByArtifact.set(artifact, `npm run ${name}`)
  }
}

/**
 * Artifacts with no producing script, classified by what can be established about them.
 *
 * `copied` means a byte-identical file sits in `rawdata/`: the committed artifact is that
 * measurement, moved into the tree by hand rather than written there by a script.
 * `recorded` means neither a producer nor a rawdata twin was found — the artifact is
 * evidence this checkout cannot rebuild, which is exactly what a reader needs to know.
 * Nothing is guessed: both classifications are decided by content or by absence.
 */
// `rawdata/` is gitignored and lives only in the manuscript worktree. When it is absent
// the copy check cannot be made at all, and `rawdataChecked` says so rather than letting
// an empty result read as "no artifact was copied".
const RAW_DIR = path.join(REPO_ROOT, 'rawdata')
const RAW_AVAILABLE = (() => {
  try {
    return statSync(RAW_DIR).isDirectory()
  } catch {
    return false
  }
})()
function classificationFor(name: string): { provenance: 'copied' | 'recorded'; twin: string | null } {
  if (!RAW_AVAILABLE) return { provenance: 'recorded', twin: null }
  const twin = path.join(RAW_DIR, `${name}.json`)
  try {
    if (statSync(twin).isFile()) {
      const analysis = readFileSync(path.join(ANALYSIS_DIR, `${name}.json`))
      const raw = readFileSync(twin)
      if (analysis.equals(raw)) return { provenance: 'copied', twin: `rawdata/${name}.json` }
    }
  } catch {
    // Absent or unreadable rawdata is the normal case on a clean clone.
  }
  return { provenance: 'recorded', twin: null }
}

const artifacts: Manifest['artifacts'] = artifactNames.map((name) => {
  const generator = generatorByArtifact.get(name) ?? null
  const classification = generator ? null : classificationFor(name)
  return {
    name,
    sourceTwin: classification?.twin ?? null,
    // Direct importers only: how many pages render a value out of this artifact. The
    // transitive count is 26 for every artifact and tells a reader nothing.
    claimedBy: routes.reduce((count, route) => count + (route.artifacts.includes(name) ? 1 : 0), 0),
    routes: [...(artifactRoutes.get(name) ?? [])].sort(),
    generator,
    // "recorded" when the artifact exists but no script writes it: the restricted export
    // is not in this checkout and the JSON was committed as evidence, not recomputed.
    provenance: generator ? 'generated' : (classification as { provenance: 'copied' | 'recorded' }).provenance,
  }
})

const manifest: Manifest = {
  generatedFrom: {
    routes: routes.length,
    claimModules: claimModuleRoutes.size,
    artifacts: artifacts.length,
  },
  routes,
  artifacts,
  claimModules: [...selectorClaims.entries()]
    .map(([module, facts]) => ({
      module,
      declaredIds: facts.ids.length,
      unresolved: facts.unresolved,
      routes: [...(claimModuleRoutes.get(module) ?? [])].sort(),
    }))
    .sort((a, b) => a.module.localeCompare(b.module)),
}

const totalClaims = new Set(routes.flatMap((route) => route.claimIds)).size

const source = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by \`npm run generate:reproduction-manifest\` from the real import graph under
 * \`src/\`. \`npm run check:reproduction-manifest\` re-derives it and fails on drift, so the
 * Evidence section cannot claim a claim belongs to a section it is not reachable from.
 */
export type RouteManifest = {
  id: string
  files: number
  directClaimIds: string[]
  claimIds: string[]
  unresolvedClaimModules: string[]
  artifacts: string[]
  reachableArtifacts: number
  generators: string[]
}

export type ArtifactManifest = {
  name: string
  claimedBy: number
  routes: string[]
  generator: string | null
  sourceTwin: string | null
  provenance: 'generated' | 'copied' | 'recorded'
}

export type ClaimModuleManifest = {
  module: string
  declaredIds: number
  unresolved: boolean
  routes: string[]
}

export const REPRODUCTION_MANIFEST = ${JSON.stringify(manifest, null, 2)} as {
  generatedFrom: {
    routes: number
    claimModules: number
    artifacts: number
  }
  routes: RouteManifest[]
  artifacts: ArtifactManifest[]
  claimModules: ClaimModuleManifest[]
}

/** Claims reachable from at least one route. */
export const MANIFEST_CLAIM_COUNT = ${totalClaims}
`

writeFileSync(OUT_PATH, source)
console.log(
  `wrote ${path.relative(REPO_ROOT, OUT_PATH)}: ` +
    `${routes.length} routes, ${artifacts.length} artifacts, ${totalClaims} distinct claims, ` +
    `${manifest.artifacts.filter((a) => a.provenance === 'generated').length} generated, ` +
    `${manifest.artifacts.filter((a) => a.provenance === 'copied').length} copied from rawdata, ` +
    `${manifest.artifacts.filter((a) => a.provenance === 'recorded').length} recorded only`,
)
for (const route of routes) {
  const note = route.unresolvedClaimModules.length
    ? `  (${route.unresolvedClaimModules.join(', ')} build claims dynamically)`
    : ''
  console.log(`  ${route.id.padEnd(12)} ${String(route.files).padStart(3)} files  ` +
    `${String(route.directClaimIds.length).padStart(3)} direct / ${String(route.claimIds.length).padStart(3)} reachable claims  ` +
    `${String(route.artifacts.length).padStart(2)} artifacts${note}`)
}
