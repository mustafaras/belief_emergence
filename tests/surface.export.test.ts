import { describe, expect, it } from 'vitest'
import { isSnapshotImageDataUrl } from '../src/components/visualization/surface/useSurface3DExport'

describe('surface export image validation', () => {
  it('accepts a generated image data URL and rejects non-image or empty values', () => {
    expect(isSnapshotImageDataUrl('data:image/png;base64,abc')).toBe(true)
    expect(isSnapshotImageDataUrl('data:text/plain;base64,abc')).toBe(false)
    expect(isSnapshotImageDataUrl(null)).toBe(false)
    expect(isSnapshotImageDataUrl('')).toBe(false)
  })
})
