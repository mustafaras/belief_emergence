/**
 * The gate's own step list, read from `scripts/ci_gate.ts`.
 *
 * The Evidence page tells a reader which checks stand between an edit and a release. That
 * list is written in `ci_gate.ts` as data, so it is parsed from there rather than copied:
 * a hand-maintained copy would be wrong within a week, and being wrong about what the gate
 * checks is worse than not listing it.
 *
 * Parsed at build time by `scripts/generate_gate_steps.ts`; this module is the runtime
 * shape the page imports.
 */
export type GateStep = {
  /** Which phase of the gate runs it. */
  phase: string
  /** The label the gate prints. */
  label: string
  /** What the step needs beyond Node — a browser, a server, or nothing. */
  needs: string
}

export const GATE_STEPS: GateStep[] = []
