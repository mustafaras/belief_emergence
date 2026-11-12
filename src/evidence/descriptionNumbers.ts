/**
 * Numbers stated in artifact descriptions, and where each one is derived from.
 *
 * The descriptions are hand-written prose, but several of them quote a figure — a VIF, an
 * adopted window. Prose is not checked by anything: a number typed into a sentence is
 * exactly the kind of claim this project has already shipped wrong. Each entry below
 * declares the source, and `npm run check:description-numbers` recomputes it and fails on
 * drift.
 *
 * A description with no number needs no entry. A description that gains a number without
 * an entry here fails the check, so the list cannot be quietly bypassed.
 */

/** `derived` renders the value from the artifact; `literal` is prose that cannot be computed. */
export type NumericClaim =
  | {
      kind: 'derived'
      /** Basename of the artifact the number comes from. */
      artifact: string
      /** What the description calls it, for the failure message. */
      label: string
      /** Recompute the value the sentence should quote, from the raw artifact. */
      compute: (artifact: Record<string, unknown>) => number | string | undefined
    }
  | {
      kind: 'literal'
      label: string
      /** The prose value, and why it is not derivable. */
      value: string
      reason: string
    }

export const DESCRIPTION_NUMBERS: Readonly<Record<string, NumericClaim[]>> = Object.freeze({
  collinearity_diagnostics: [
    {
      kind: 'derived',
      artifact: 'collinearity_diagnostics',
      label: 'maximum VIF (description quotes 2 decimal places)',
      // The prose says "9.43"; the artifact holds 9.4274. The description is written to
      // two places, so the check compares at that precision rather than demanding the
      // sentence carry the unrounded figure.
      compute: (a) => {
        const vif = a.maxVif
        return typeof vif === 'number' ? vif.toFixed(2) : undefined
      },
    },
  ],
  gini_window_sensitivity: [
    {
      kind: 'derived',
      artifact: 'gini_window_sensitivity',
      label: 'adopted Gini borrowing window, in years',
      // No structured field carries the adopted window; it is stated in the artifact's
      // own `purpose` sentence ("The adopted window is +/-5"). Read it from there rather
      // than restating it, so the description cannot drift from the artifact it describes.
      compute: (a) => {
        const purpose = a.purpose
        if (typeof purpose !== 'string') return undefined
        const match = /adopted window is \+\/-(\d+)/i.exec(purpose)
        return match ? match[1] : undefined
      },
    },
  ],
})

/**
 * Numbers that are prose, not claims.
 *
 * "R2" and "A/B/C" contain digits but state no quantity. Kept as an explicit pattern list
 * rather than stripping digits before comparison, so a real number cannot slip through by
 * resembling one of these.
 */
export const NON_NUMERIC_PROSE_PATTERN = /\bR2\b|[ABC]\/[ABC]|\bTier\s+[ABC]\b/g

/** Numeric tokens in a description, ignoring known non-numeric prose. */
export function extractNumericClaims(description: string): string[] {
  const stripped = description.replace(NON_NUMERIC_PROSE_PATTERN, ' ')
  return stripped.match(/\d+(?:\.\d+)?/g) ?? []
}
