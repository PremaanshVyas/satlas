import { describe, test, expect } from 'vitest'
import * as THREE from 'three'
import { getSunDirection } from './solar'

describe('getSunDirection', () => {
  test('returns a unit vector', () => {
    const dir = getSunDirection(new Date('2024-06-21T12:00:00Z'))
    expect(dir.length()).toBeCloseTo(1.0, 4)
  })

  test('returns a THREE.Vector3', () => {
    expect(getSunDirection(new Date())).toBeInstanceOf(THREE.Vector3)
  })

  test('Y is positive at June solstice (sun north of equator)', () => {
    // At June solstice declination ≈ +23.4°, so Y (north) component must be positive
    const dir = getSunDirection(new Date('2024-06-21T00:00:00Z'))
    expect(dir.y).toBeGreaterThan(0)
  })

  test('Y is negative at December solstice (sun south of equator)', () => {
    const dir = getSunDirection(new Date('2024-12-21T00:00:00Z'))
    expect(dir.y).toBeLessThan(0)
  })
})
