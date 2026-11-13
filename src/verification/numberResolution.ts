/**
 * Deciding whether a number on screen is backed by something.
 *
 * The interface prints several hundred numeric tokens. Most are transcribed from an
 * artifact; some are computed from artifact values (`e^Φ`, a ratio, a percentage); a few
 * are constants that live in code. A naive "does this string appear anywhere in the
 * artifacts" test fails on all three of the latter cases, and — worse — a substring test
 * succeeds on values that are merely adjacent in a longer number.
 *
 * So a token is resolved only by an exact numeric match, at the token's own printed
 * precision. `9.43` matching `9.4274` is a real rounding relationship; `35.2` matching
 * `135.2561` is not, and substring search cannot tell them apart.
 *
 * This module is pure and browser-free so the rules can be unit-tested.
 */

/** Numbers a rendered token may legitimately equal. */
export type Corpus = {
  /** Every number appearing in any artifact, including inside strings. */
  values: ReadonlySet<number>
}

/** Build a corpus from parsed artifacts. */
export function buildCorpus(sources: unknown[]): Corpus {
  const values = new Set<number>()
  const visit = (node: unknown): void => {
    if (typeof node === 'boolean') return
    if (typeof node === 'number') {
      if (Number.isFinite(node)) values.add(node)
      return
    }
    if (typeof node === 'string') {
      for (const match of node.matchAll(/-?\d+(?:\.\d+)?/g)) {
        const n = Number(match[0])
        if (Number.isFinite(n)) values.add(n)
      }
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (node && typeof node === 'object') {
      for (const value of Object.values(node as Record<string, unknown>)) visit(value)
    }
  }
  for (const source of sources) visit(source)
  return { values }
}

/**
 * How a rounded (non-exact) match is allowed to behave, which differs by corpus.
 *
 * The artifact corpus holds ~77,000 numbers scraped from a 207-row panel. At that density
 * almost any printed token sits within a rounding window of *something*, so a loose
 * round-to rule resolves values it should reject: the displayed panel mean -0.0856
 * rendered as -0.0846 still matched, because an artifact happened to contain 0.084606.
 * For that corpus a rounded match therefore demands at least three decimal places.
 *
 * The derived corpus is different: it holds only values recomputed by the interface's own
 * code, so the correct number is *in* it and a near miss means a real defect. Rounding
 * there is safe at any precision, and needed, because the interface prints derived values
 * at one or two places.
 */
export type RoundingPolicy = 'strict' | 'permissive' | 'exact'

/**
 * A two-place token may still round, but only from a value that is itself far more
 * precise than the token.
 *
 * `9.4274 -> 9.43` is a genuine rounding of a four-decimal artifact value, and rejecting
 * it would remove real coverage: the VIF is legitimately printed at two places. The thing
 * that must not pass is a *coarse* value matching a coarse token, where the window is
 * wide enough that coincidence is likely — so a two-place token requires the source to
 * carry at least four decimals.
 */
const COARSE_TOKEN_DECIMALS = 2
const COARSE_TOKEN_MIN_SOURCE_DECIMALS = 4

/** Decimal places the token was printed with. */
export function printedDecimals(token: string): number {
  const dot = token.indexOf('.')
  return dot === -1 ? 0 : token.length - dot - 1
}

/**
 * True when `value` rounds to `token` at the token's printed precision.
 *
 * The tolerance is half a unit in the last printed place, which is what "rounded to this
 * many decimals" means. A token printed with no decimals therefore allows any value in
 * [token - 0.5, token + 0.5) — intended, since the interface prints counts and years as
 * integers.
 */
/**
 * Round-to matching is deliberately *not* open to arbitrary precision.
 *
 * A pure half-unit tolerance is far too permissive over a corpus of ~77,000 numbers from
 * a 207-row panel: any four-decimal token will sit within 0.00005 of something, so the
 * check resolves values it should reject. A 0.001 error in the displayed panel mean
 * (-0.0856 rendered as -0.0846) passed for exactly that reason, because an artifact held
 * 0.084606.
 *
 * So a rounded match requires the token to carry at least three decimal places *and* to
 * agree to that many places, which is a real rounding relationship rather than
 * coincidence. Coarser tokens — `207`, `0.69` — must match exactly, because a coarse
 * value is far more likely to be adjacent to an unrelated number than to be a rounding of
 * the intended one.
 */
export function roundsToToken(
  value: number,
  token: string,
  policy: RoundingPolicy = 'strict',
): boolean {
  const target = Number(token)
  if (!Number.isFinite(target) || !Number.isFinite(value)) return false
  const decimals = printedDecimals(token)
  // Guard the exact match separately: floating-point subtraction at 1e-12 must not
  // reject a value that is textually the same number.
  if (value === target) return true

  if (policy === 'strict') {
    if (decimals < COARSE_TOKEN_DECIMALS) return false
    if (decimals === COARSE_TOKEN_DECIMALS) {
      // Require the source to be more precise than the token by at least two places.
      const sourceDecimals = (String(value).split('.')[1] ?? '').length
      if (sourceDecimals < COARSE_TOKEN_MIN_SOURCE_DECIMALS) return false
    }
  }

  const tolerance = 0.5 * 10 ** -decimals
  return Math.abs(value - target) < tolerance
}

export type Resolution =
  | { status: 'resolved'; how: 'exact' | 'rounded' }
  | { status: 'unresolved' }

/**
 * Resolve one rendered token against a corpus.
 *
 * An integer token with no decimal point is deliberately *not* matched against every
 * larger number that contains it: `11` is not justified by `2026-11-11T…` being in a
 * timestamp string unless 11 is genuinely a value in the corpus. The corpus includes
 * numbers parsed out of strings, so timestamp components are legitimately present — which
 * is correct, because a rendered date part does come from the artifact's timestamp.
 */
export function resolveToken(
  token: string,
  corpus: Corpus,
  policy: RoundingPolicy = 'strict',
): Resolution {
  const target = Number(token)
  if (!Number.isFinite(target)) return { status: 'unresolved' }

  if (corpus.values.has(target)) return { status: 'resolved', how: 'exact' }

  // Artifact-wide rounding is not provenance: over a large corpus, an unrelated value
  // can fall inside the token's rounding window. DOM audits use `exact` and must derive
  // rounded display values from the specific code/data source that produced them.
  if (policy === 'exact') return { status: 'unresolved' }

  for (const value of corpus.values) {
    if (roundsToToken(value, token, policy)) return { status: 'resolved', how: 'rounded' }
  }
  return { status: 'unresolved' }
}

/**
 * Extract the numeric tokens the interface renders.
 *
 * The sign is kept. A bare `\d+(\.\d+)?` (as the prompt illustrates) turns `-0.0856`
 * into `0.0856`, which would make a sign error undetectable: the panel mean is -0.0856,
 * and a build that printed +0.0856 would resolve just as happily. Signs are substantive
 * here — a flipped coefficient changes the reading of the model — so the minus is part
 * of the token.
 */
export function extractTokens(text: string): string[] {
  return text.match(/-?\d+(?:\.\d+)?/g) ?? []
}
