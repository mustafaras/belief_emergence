import { describe, expect, it } from 'vitest'
import { applySurface3DStateToSearchParams, readSurface3DStateFromSearchParams } from '../src/utils/urlState'

describe('urlState Surface3D', () => {
  it('roundtrips surface3d state via URLSearchParams', () => {
    const qs = new URLSearchParams('x=0.1&y=0.2&preset=demo')

    applySurface3DStateToSearchParams(qs, {
      plotView: '3D',
      resolutionMode: 'AUTO',
      contoursOn: true,
      axisMode: 'DOC',
      viewMode: 'ISO',
      camera: {
        eye: { x: 1.6, y: 1.6, z: 1.15 },
        up: { x: 0, y: 0, z: 1 },
        center: { x: 0, y: 0, z: 0 },
      },
    })

    expect(qs.get('pv')).toBe('3D')
    expect(qs.get('rm')).toBe('AUTO')
    expect(qs.get('co')).toBe('1')
    expect(qs.get('vm')).toBe('ISO')
    expect(qs.get('ax')).toBe('DOC')
    expect(qs.get('cam')).toBeTypeOf('string')

    const readBack = readSurface3DStateFromSearchParams(qs)
    expect(readBack?.plotView).toBe('3D')
    expect(readBack?.resolutionMode).toBe('AUTO')
    expect(readBack?.contoursOn).toBe(true)
    expect(readBack?.viewMode).toBe('ISO')
    expect(readBack?.axisMode).toBe('DOC')
    expect(readBack?.camera?.eye?.x).toBeCloseTo(1.6, 3)
    expect(readBack?.camera?.up?.z).toBe(1)

    // unrelated keys preserved
    expect(qs.get('preset')).toBe('demo')
  })

  it('returns undefined when no surface3d keys are present', () => {
    const qs = new URLSearchParams('x=0.1&y=0.2')
    expect(readSurface3DStateFromSearchParams(qs)).toBeUndefined()
  })
})
