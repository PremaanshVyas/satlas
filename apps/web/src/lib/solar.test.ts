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

  test('solar direction Y component is within solar declination bounds (±sin 23.45°)', () => {
    // Sun never exceeds ±23.45° declination (obliquity of ecliptic)
    // Y = sin(declination), so |Y| ≤ sin(23.45°) ≈ 0.398 at all times of year
    const dates = [
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-03-20T00:00:00Z'),
      new Date('2024-06-21T00:00:00Z'),
      new Date('2024-09-22T00:00:00Z'),
      new Date('2024-12-21T00:00:00Z'),
    ]
    for (const d of dates) {
      const dir = getSunDirection(d)
      expect(Math.abs(dir.y)).toBeLessThanOrEqual(0.40)
    }
  })

  test('at March equinox the Y component (declination) is near zero', () => {
    // At March equinox, sun is at equatorial plane — declination ≈ 0° → Y ≈ 0
    const dir = getSunDirection(new Date('2024-03-20T12:00:00Z'))
    expect(Math.abs(dir.y)).toBeLessThan(0.1)
  })
})
