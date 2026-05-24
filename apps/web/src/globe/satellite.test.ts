import { describe, test, expect, it } from 'vitest'
import * as satellite from 'satellite.js'
import { matchSatelliteQuery } from './searchUtils'

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

describe('satellite coordinate transform', () => {
  function geoToThreeJs(latRad: number, lonRad: number, r = 1) {
    return {
      x:  r * Math.cos(latRad) * Math.cos(lonRad),
      y:  r * Math.sin(latRad),
      z: -r * Math.cos(latRad) * Math.sin(lonRad),
    }
  }

  test('prime meridian (lon=0°, lat=0°) maps to +X', () => {
    const pos = geoToThreeJs(0, 0)
    expect(pos.x).toBeCloseTo(1, 5)
    expect(pos.y).toBeCloseTo(0, 5)
    expect(pos.z).toBeCloseTo(0, 5)
  })

  test('90°E (lon=90°, lat=0°) maps to −Z', () => {
    const pos = geoToThreeJs(0, Math.PI / 2)
    expect(pos.x).toBeCloseTo(0, 5)
    expect(pos.y).toBeCloseTo(0, 5)
    expect(pos.z).toBeCloseTo(-1, 5)
  })

  test('90°W (lon=−90°, lat=0°) maps to +Z', () => {
    const pos = geoToThreeJs(0, -Math.PI / 2)
    expect(pos.x).toBeCloseTo(0, 5)
    expect(pos.z).toBeCloseTo(1, 5)
  })

  test('north pole (lat=90°) maps to +Y', () => {
    const pos = geoToThreeJs(Math.PI / 2, 0)
    expect(pos.x).toBeCloseTo(0, 5)
    expect(pos.y).toBeCloseTo(1, 5)
    expect(pos.z).toBeCloseTo(0, 5)
  })

  test('date line (lon=180°, lat=0°) maps to −X', () => {
    const pos = geoToThreeJs(0, Math.PI)
    expect(pos.x).toBeCloseTo(-1, 5)
    expect(pos.z).toBeCloseTo(0, 5)
  })
})

describe('matchSatelliteQuery', () => {
  const names   = ['ISS (ZARYA)', 'STARLINK-1001', 'GPS BIIF-1', 'HUBBLE']
  const noradIds = ['25544',       '45178',         '37753',      '20580']

  it('returns matches by name substring (case-insensitive)', () => {
    const { results, total } = matchSatelliteQuery('starlink', names, noradIds, 10)
    expect(results).toHaveLength(1)
    expect(total).toBe(1)
    expect(results[0].name).toBe('STARLINK-1001')
    expect(results[0].noradId).toBe('45178')
  })

  it('returns matches by NORAD ID prefix', () => {
    const { results, total } = matchSatelliteQuery('255', names, noradIds, 10)
    expect(results).toHaveLength(1)
    expect(total).toBe(1)
    expect(results[0].noradId).toBe('25544')
  })

  it('respects maxResults limit', () => {
    const bigNames   = Array.from({ length: 20 }, (_, i) => `SAT-${i}`)
    const bigNoradIds = Array.from({ length: 20 }, (_, i) => `1000${i}`)
    const { results, total } = matchSatelliteQuery('sat', bigNames, bigNoradIds, 5)
    expect(results).toHaveLength(5)
    expect(total).toBe(20)
  })

  it('returns empty array for empty query', () => {
    expect(matchSatelliteQuery('', names, noradIds, 10).results).toHaveLength(0)
    expect(matchSatelliteQuery('   ', names, noradIds, 10).results).toHaveLength(0)
  })
})
