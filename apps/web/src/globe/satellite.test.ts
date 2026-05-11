import { describe, test, expect } from 'vitest'
import * as satellite from 'satellite.js'

const TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
const TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'

describe('ISS TLE propagation', () => {
  test('parses TLE without error', () => {
    const satrec = satellite.twoline2satrec(TLE1, TLE2)
    expect(satrec.error).toBe(0)
  })

  test('propagates to a position within LEO altitude bounds', () => {
    const satrec = satellite.twoline2satrec(TLE1, TLE2)
    // Date close to TLE epoch (2024-03-27) to minimise propagation error
    const posVel = satellite.propagate(satrec, new Date('2024-03-27T13:08:00Z'))
    expect(typeof posVel.position).not.toBe('boolean')

    const pos = posVel.position as { x: number; y: number; z: number }
    // ISS orbits at ~400 km. Earth radius ~6371 km → expect 6500–6900 km
    const radiusKm = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2)
    expect(radiusKm).toBeGreaterThan(6500)
    expect(radiusKm).toBeLessThan(6900)
  })
})
