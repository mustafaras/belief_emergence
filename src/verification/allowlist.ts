/**
 * The allowlist: rendered numbers with no artifact behind them, and why.
 *
 * Prompt 6 sets the bar: "keep that list short and commented — an allowlist that grows is
 * a check that has stopped checking." Everything here is a constant in code. None of it
 * is a measurement.
 *
 * The list was twelve entries while it also held slider extents and tooltip ranges. Those
 * are read off the UI markup by `deriveSliderBounds`, so they are checked rather than
 * exempted, and the list is three.
 *
 * Anything computed belongs in `derivedValues.ts`, where it is recomputed and therefore
 * still verified. Putting a computed value here exempts it, which is the failure mode the
 * prompt names.
 */

export type AllowlistEntry = {
  /** The value as printed. Matching is exact; see `isAllowlisted`. */
  value: string
  /** Where the constant lives, so a reader can change it at the source. */
  source: string
  /** Why this number cannot come from an artifact. */
  reason: string
}

export const ALLOWLIST: readonly AllowlistEntry[] = Object.freeze([
  {
    value: '2.614',
    source: 'src/App.tsx DEFAULT_PARAMS.C',
    reason:
      'Panel-scale default for cultural intensity. The channel is unavailable in v2 (KI-09), so the panel has no C column and no artifact carries this mean; it is the starting position of a control.',
  },
  {
    value: '2.61',
    source: 'src/App.tsx DEFAULT_PARAMS.C, printed to two places',
    reason:
      'The same constant as above, shown at the sidebar decimal count. Two renderings of one code value, not two claims.',
  },
  {
    value: '76.3',
    source: 'TopBar panel percentile display',
    reason:
      'A percentile rank of the current Z within the panel distribution, computed from the loaded CSV at render time rather than stored in an artifact.',
  },
])

/** Lookup by printed value. */
export const ALLOWLIST_VALUES: ReadonlySet<string> = new Set(ALLOWLIST.map((entry) => entry.value))

/**
 * Matching is exact, deliberately.
 *
 * A round-to match would absorb small drift in a computed number — which is precisely the
 * shift a regression produces. The allowlist is for constants whose printed form *is* the
 * value.
 */
export function isAllowlisted(token: string): boolean {
  return ALLOWLIST_VALUES.has(token)
}
