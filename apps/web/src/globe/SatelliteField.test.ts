import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { SatelliteField } from './SatelliteField'

const attr = (f: SatelliteField, name: string) =>
  f.mesh.geometry.getAttribute(name).array as Float32Array

const lerp = (f: SatelliteField) =>
  (f.mesh.material as THREE.ShaderMaterial).uniforms.uLerp.value as number

describe('SatelliteField positions', () => {
  it('publishes positions into the instanced attribute', () => {
    const f = new SatelliteField(2)
    f.setPositions(new Float32Array([1, 2, 3, 4, 5, 6]))
    expect(Array.from(attr(f, 'aPos'))).toEqual([1, 2, 3, 4, 5, 6])
    f.dispose()
  })

  it('starts the first set already at the target, not at the origin', () => {
    // There is no history on the first frame. Leaving the previous set at zero would
    // interpolate every satellite outward from the centre of the Earth.
    const f = new SatelliteField(1)
    f.setPositions(new Float32Array([1, 2, 3]))
    expect(Array.from(attr(f, 'aPrev'))).toEqual([1, 2, 3])
    f.dispose()
  })

  it('later sets interpolate from where the dots already were', () => {
    const f = new SatelliteField(1)
    f.setPositions(new Float32Array([1, 2, 3]))
    f.setPositions(new Float32Array([4, 5, 6]))
    expect(Array.from(attr(f, 'aPrev'))).toEqual([1, 2, 3])
    expect(Array.from(attr(f, 'aPos'))).toEqual([4, 5, 6])
    f.dispose()
  })

  it('a longer buffer is truncated rather than dropped', () => {
    // A delta catalog refresh can grow the object count while reusing the field. Dropping
    // the frame would freeze every satellite on screen until the next full reload.
    const f = new SatelliteField(1)
    f.setPositions(new Float32Array([1, 2, 3, 9, 9, 9]))
    expect(Array.from(attr(f, 'aPos'))).toEqual([1, 2, 3])
    f.dispose()
  })
})

describe('SatelliteField interpolation factor', () => {
  it('defaults to the current set', () => {
    const f = new SatelliteField(1)
    expect(lerp(f)).toBe(1)
    f.dispose()
  })

  it('clamps, so a late position set parks the dots on target instead of overshooting', () => {
    const f = new SatelliteField(1)
    f.setLerp(2.5)
    expect(lerp(f)).toBe(1)
    f.setLerp(-0.3)
    expect(lerp(f)).toBe(0)
    f.setLerp(0.5)
    expect(lerp(f)).toBe(0.5)
    f.dispose()
  })
})

describe('SatelliteField visibility', () => {
  it('scales masked-out satellites to zero and keeps the rest', () => {
    const f = new SatelliteField(3)
    f.setVisibility(new Uint8Array([1, 0, 1]), new Float32Array([2, 2, 3]))
    expect(Array.from(attr(f, 'aScale'))).toEqual([2, 0, 3])
    f.dispose()
  })

  it('shows everything at scale 1 when no mask or scales are given', () => {
    const f = new SatelliteField(2)
    f.setVisibility(null, null)
    expect(Array.from(attr(f, 'aScale'))).toEqual([1, 1])
    f.dispose()
  })

  it('hides the tail when the catalog shrinks under a reused field', () => {
    // Instances past the end of the new mask hold stale positions, so they must not render.
    const f = new SatelliteField(3)
    f.setVisibility(new Uint8Array([1, 1]), new Float32Array([1, 1]))
    expect(Array.from(attr(f, 'aScale'))).toEqual([1, 1, 0])
    f.dispose()
  })
})

describe('SatelliteField mesh', () => {
  it('is not frustum culled', () => {
    // Position no longer lives in the instance matrix, so three.js cannot derive a bounding
    // volume from it and would cull the whole field away.
    const f = new SatelliteField(1)
    expect(f.mesh.frustumCulled).toBe(false)
    f.dispose()
  })
})

describe('SatelliteField continuity', () => {
  it('resumes from the drawn position when a set lands mid-interpolation', () => {
    // The cadence estimate is never exact, so a set often arrives before the dots have
    // finished travelling. Taking the previous target as the new origin would jump them
    // across the remaining gap — the stutter this whole change exists to remove.
    const f = new SatelliteField(1)
    f.setPositions(new Float32Array([0, 0, 0]))
    f.setPositions(new Float32Array([10, 0, 0]))
    f.setLerp(0.25) // dots are drawn at x = 2.5
    f.setPositions(new Float32Array([20, 0, 0]))
    expect(attr(f, 'aPrev')[0]).toBeCloseTo(2.5, 6)
    expect(attr(f, 'aPos')[0]).toBe(20)
    f.dispose()
  })

  it('takes the full target when the interpolation had already finished', () => {
    const f = new SatelliteField(1)
    f.setPositions(new Float32Array([0, 0, 0]))
    f.setPositions(new Float32Array([10, 0, 0]))
    f.setLerp(1)
    f.setPositions(new Float32Array([20, 0, 0]))
    expect(attr(f, 'aPrev')[0]).toBe(10)
    f.dispose()
  })
})
