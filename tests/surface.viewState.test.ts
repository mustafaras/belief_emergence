import { describe, expect, it } from 'vitest'
import { camerasAlmostEqual } from '../src/components/visualization/surface/useSurface3DViewState'
import { DEFAULT_CAMERA } from '../src/components/visualization/surface/camera'

describe('surface view state', () => {
  it('treats camera updates within the relayout tolerance as unchanged', () => {
    const near = {
      ...DEFAULT_CAMERA,
      eye: { ...DEFAULT_CAMERA.eye, x: DEFAULT_CAMERA.eye.x + 0.0005 },
    }
    expect(camerasAlmostEqual(DEFAULT_CAMERA, near)).toBe(true)
    expect(camerasAlmostEqual(DEFAULT_CAMERA, { ...DEFAULT_CAMERA, eye: { ...DEFAULT_CAMERA.eye, x: DEFAULT_CAMERA.eye.x + 0.01 } })).toBe(false)
    expect(camerasAlmostEqual(null, DEFAULT_CAMERA)).toBe(false)
  })
})
