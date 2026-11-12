/**
 * Camera and view-state: the named viewpoints and the documentation-mode axis bounds.
 *
 * Extracted from `Surface3DSurface.tsx` under Prompt 9. These are values rather than
 * behaviour — four camera presets and four limits — but they sat in the middle of the
 * component's state machine, where it was hard to tell which numbers were presentation and
 * which were computation.
 *
 * Moved verbatim. The `up` vectors especially: a single changed component moves the
 * rendered surface, and the acceptance test for this refactor is a pixel-identical
 * screenshot.
 */

export type Camera = {
  up?: { x: number; y: number; z: number }
  center?: { x: number; y: number; z: number }
  eye?: { x: number; y: number; z: number }
}

export const DEFAULT_CAMERA: Camera = {
  eye: { x: 1.6, y: 1.6, z: 1.15 },
  up: { x: 0, y: 0, z: 1 },
  center: { x: 0, y: 0, z: 0 },
}

export const ISO_CAMERA: Camera = {
  eye: { x: 1.9, y: 1.35, z: 1.2 },
  up: { x: 0, y: 0, z: 1 },
  center: { x: 0, y: 0, z: 0 },
}

export const TOP_CAMERA: Camera = {
  eye: { x: 0, y: 0, z: 2.6 },
  up: { x: 0, y: 1, z: 0 },
  center: { x: 0, y: 0, z: 0 },
}

export const FRONT_CAMERA: Camera = {
  eye: { x: 0, y: 2.6, z: 0.45 },
  up: { x: 0, y: 0, z: 1 },
  center: { x: 0, y: 0, z: 0 },
}

// Documentation (paper) axes bounds for (φ, ln(B/k)) visualization.
// Keep as module-level constants so hooks don't need to depend on them.
// Must match the canonical domain used for the publication-grade figure.
// See `paper/scripts/generate_main_function_surface3d.py`.
export const DOC_PHI_MIN = -6
export const DOC_PHI_MAX = 6
export const DOC_L_MIN = -3
export const DOC_L_MAX = 3

export function logit(z: number): number {
  // Inverse logistic (safe enough for our fixed levels).
  return Math.log(z / (1 - z))
}

