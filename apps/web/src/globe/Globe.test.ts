import { describe, test, expect } from 'vitest'
import { computeOverhead } from './Globe'

describe('computeOverhead', () => {
  test('satellite directly overhead (same lat/lon, elevated) returns 90°', () => {
    // Observer at (0°, 0°): unit vec = (1, 0, 0)
    // Satellite at (1.063, 0, 0) — ISS-like altitude
    const buf = new Float32Array([1.063, 0, 0])
    const result = computeOverhead(buf, ['ISS'], ['25544'], null, 0, 0, 0)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('ISS')
    expect(result[0].noradId).toBe('25544')
    expect(result[0].elevDeg).toBe(90)
  })

  test('satellite on the opposite side of Earth is excluded', () => {
    const buf = new Float32Array([-1.063, 0, 0])
    const result = computeOverhead(buf, ['FAR'], ['1'], null, 0, 0, 10)
    expect(result).toHaveLength(0)
  })

  test('satellite below minElevDeg threshold is excluded', () => {
    // satellite slightly above horizon but below 30° threshold
    // put it at ~3° elevation and request minElevDeg=30
    const buf = new Float32Array([1.063, 0, 1.063])
    const result = computeOverhead(buf, ['LOW'], ['2'], null, 0, 0, 30)
    expect(result).toHaveLength(0)
  })

  test('masked satellite is excluded', () => {
    const buf = new Float32Array([1.063, 0, 0])
    const mask = new Uint8Array([0])
    const result = computeOverhead(buf, ['ISS'], ['25544'], mask, 0, 0, 0)
    expect(result).toHaveLength(0)
  })

  test('results are sorted by elevation descending', () => {
    // Satellite A at (1.4, 0, 0): elevation 90°
    // Satellite B at (1.063, 0, 1.063): elevation ~3°
    const buf = new Float32Array([1.4, 0, 0, 1.063, 0, 1.063])
    const result = computeOverhead(buf, ['A', 'B'], ['1', '2'], null, 0, 0, 0)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].name).toBe('A')
  })

  test('returns all overhead results without a cap', () => {
    // 30 satellites all directly overhead — all 30 should be returned
    const buf = new Float32Array(30 * 3).fill(0)
    for (let i = 0; i < 30; i++) buf[i * 3] = 1.063 + i * 0.001
    const names = Array.from({ length: 30 }, (_, i) => `SAT${i}`)
    const ids = Array.from({ length: 30 }, (_, i) => String(i))
    const result = computeOverhead(buf, names, ids, null, 0, 0, 0)
    expect(result).toHaveLength(30)
  })
})
