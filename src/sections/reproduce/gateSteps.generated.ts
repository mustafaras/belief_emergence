/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by `npm run generate:gate-steps` from the step declarations in
 * `scripts/ci_gate.ts`. `npm run check:gate-steps` fails when the two disagree, so this
 * page cannot describe a gate the repository does not run.
 */
import type { GateStep } from './gateSteps'

/** Steps written as a literal in the gate. */
export const GATE_STEPS: GateStep[] = [
  { phase: "Phase 1: Artifact Generation", label: "Generate authoritative analysis", needs: "Node only" },
  { phase: "Phase 1: Artifact Generation", label: "Generate headline metrics", needs: "Node only" },
  { phase: "Phase 1: Artifact Generation", label: "Generate phase-1 validation suite", needs: "Node only" },
  { phase: "Phase 1: Artifact Generation", label: "Generate repeated grouped k-fold validation", needs: "Node only" },
  { phase: "Phase 1: Artifact Generation", label: "Generate functional-form comparison", needs: "Node only" },
  { phase: "Phase 1: Artifact Generation", label: "Regenerate artifact fact table", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Manuscript consistency", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "UI agrees with artifacts", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Section references", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "No hardcoded headline metrics", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Evidence index matches tree", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Reproduction manifest matches tree", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Gate step list matches gate", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "README links resolve", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "README metrics current", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Paper figure specs", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Description numbers", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Presets reproduce", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Rendered numbers", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Construct audit table", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Support picture", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Stated limits", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Route reachability", needs: "a browser and a running server" },
  { phase: "Phase 6: Validation Checks", label: "Render / stale values", needs: "a browser and a running server" },
  { phase: "Phase 6: Validation Checks", label: "Bundle budget", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "Surface snapshot", needs: "a browser and a running server" },
  { phase: "Phase 7: Code Quality", label: "Lint", needs: "Node only" },
  { phase: "Phase 7: Code Quality", label: "Tests", needs: "Node only" },
  { phase: "Phase 7: Code Quality", label: "Build", needs: "Node only" },
  { phase: "Preflight", label: "step: string", needs: "Node only" },
  { phase: "Preflight", label: "label", needs: "Node only" },
  { phase: "Phase 1: Artifact Generation", label: "s.label", needs: "Node only" },
  { phase: "Phase 6: Validation Checks", label: "c.label", needs: "Node only" },
]

/**
 * Additional checks the gate runs from inside a loop: one per expected artifact and one per
 * expected schema version. Together with GATE_STEPS these account for every row the gate
 * prints, so a page can say "91 checks" without hardcoding the number.
 */
export const GATE_LOOP_CHECKS = {
  artifactPresence: 32,
  schemaVersions: 25,
  canonicalMetrics: 6,
  total: 96,
} as const
