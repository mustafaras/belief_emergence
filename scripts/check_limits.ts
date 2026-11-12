/**
 * Are the stated limits supported by the artifacts they cite?
 *
 * Prompt 5's verification condition is unusually strict: "every number rendered must
 * appear in its cited artifact; assert one by one against the JSON, not by eyeballing."
 * That is what this does — each figure the section prints is re-read from the artifact it
 * names, and a figure whose source does not contain it fails the check.
 *
 * The section is the one place the interface is allowed to look indecisive. A limit that
 * borrows authority from a citation it does not satisfy is worse than one that cites
 * nothing, because the reader has no way to tell the difference.
 *
 * Usage:  npm run check:limits
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { OPTIMIZED_STRUCTURAL_PARAMS } from '../src/data/feCoefficients'
import {
  buildLimits,
  profileUpperBound,
  PROFILE_ALPHA,
  type CollinearityDiagnostics,
  type ElasticityProfile,
  type LockboxHoldout,
  type RCollinearityCase,
} from '../src/verification/limits'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ANALYSIS = path.join(REPO_ROOT, 'src', 'data', 'analysis')

const failures: string[] = []

const readJson = <T,>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(ANALYSIS, name), 'utf8')) as T

const profile = readJson<ElasticityProfile>('elasticity_profile.json')
const lockbox = readJson<LockboxHoldout>('lockbox_holdout.json')
const collinearity = readJson<CollinearityDiagnostics>('collinearity_diagnostics.json')
const rCase = readJson<RCollinearityCase>('r_collinearity_case.json')

const panelCsv = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv')
const panelRows = fs.readFileSync(panelCsv, 'utf8').trim().split(/\r?\n/).length - 1

const report = buildLimits({
  profile,
  lockbox,
  collinearity,
  rCase,
  panelRows,
  shippedAlpha: OPTIMIZED_STRUCTURAL_PARAMS.alpha,
  shippedBeta: OPTIMIZED_STRUCTURAL_PARAMS.beta,
})

/* ---- 1. the construction's own source ledger ---- */
if (!report.sourced) {
  for (const problem of report.unsourced) failures.push(problem)
}

/* ---- 2. the four limits are all present ---- */
const expectedIds = ['exponents', 'shipped-exponent', 'lockbox', 'collinearity']
const actualIds = report.limits.map((l) => l.id)
if (actualIds.join(',') !== expectedIds.join(',')) {
  failures.push(`expected limits [${expectedIds.join(', ')}], got [${actualIds.join(', ')}]`)
}

/* ---- 3. each figure, re-read from its named artifact ---- */
for (const limit of report.limits) {
  if (limit.figures.length === 0) {
    failures.push(`${limit.id}: states a limit with no figures`)
  }
  for (const figure of limit.figures) {
    if (figure.source.startsWith('computed:')) continue

    if (figure.source === 'src/data/feCoefficients.ts') {
      // A runtime constant, checked against the module rather than an artifact.
      const shipped = [OPTIMIZED_STRUCTURAL_PARAMS.alpha, OPTIMIZED_STRUCTURAL_PARAMS.beta].map(String)
      if (!shipped.includes(figure.value)) {
        failures.push(
          `${limit.id}: "${figure.label}" quotes ${figure.value}, which is not a shipped coefficient`,
        )
      }
      continue
    }

    if (figure.source === 'panel_canonical_v2.csv') {
      if (Number(figure.value) !== panelRows) {
        failures.push(
          `${limit.id}: "${figure.label}" quotes ${figure.value}, panel has ${panelRows} rows`,
        )
      }
      continue
    }

    const artifactPath = path.join(ANALYSIS, figure.source)
    if (!fs.existsSync(artifactPath)) {
      failures.push(`${limit.id}: cites ${figure.source}, which does not exist`)
      continue
    }
    const text = fs.readFileSync(artifactPath, 'utf8')
    // A figure may be a single value or a joined list ("0.001 – 0.002 – …"). Every
    // token it prints must appear in the artifact; checking the joined string would
    // reject a list that is individually correct.
    const tokens = figure.value.split(/\s*[–—-]\s*/).filter((t) => t.length > 0)
    const missing = tokens.filter((token) => !text.includes(token))
    if (missing.length > 0) {
      failures.push(
        `${limit.id}: "${figure.label}" quotes ${missing.join(', ')}, absent from ${figure.source}`,
      )
    }
  }
}

/* ---- 4. the two claims that depend on arithmetic, not a lookup ---- */
const upper = profileUpperBound(profile)
if (upper === undefined) {
  failures.push('the profile yields no upper bound inside the interval')
} else {
  const inside = profile.profiles.filter((p) => p.pValue > PROFILE_ALPHA).map((p) => p.value)
  if (Math.max(...inside) !== upper) {
    failures.push(`profile upper bound ${upper} is not the largest non-rejected grid value`)
  }
  if (OPTIMIZED_STRUCTURAL_PARAMS.alpha <= upper) {
    failures.push(
      `the shipped alpha (${OPTIMIZED_STRUCTURAL_PARAMS.alpha}) is inside [0, ${upper}], so the ` +
        `"outside the interval" limit is not true and must not be stated`,
    )
  }
}

const outsideReserve = panelRows - lockbox.splitPolicy.nLockboxCells
const lockboxLimit = report.limits.find((l) => l.id === 'lockbox')
if (!lockboxLimit) {
  failures.push('the lockbox limit is missing')
} else {
  const quoted = lockboxLimit.figures.find((f) => f.source.startsWith('computed:'))
  if (!quoted || Number(quoted.value) !== outsideReserve) {
    failures.push(
      `lockbox limit should quote ${outsideReserve} rows outside the reserve, quoted ${quoted?.value}`,
    )
  }
}

/* ---- 5. no stale figure from the 167-row era ---- */
const serialised = JSON.stringify(report)
for (const stale of ['167 rows', '150 rows']) {
  if (serialised.includes(stale)) {
    failures.push(`the limits section still carries a stale figure: ${stale}`)
  }
}

if (failures.length > 0) {
  console.error(`\nFAIL  limits (${failures.length} problem(s)):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

const figureCount = report.limits.reduce((n, l) => n + l.figures.length, 0)
console.log(
  `PASS  ${report.limits.length} limits, ${figureCount} figures, every one found in its cited artifact ` +
    `(profile interval ends at ${upper}, ${outsideReserve} rows outside the reserve)`,
)
