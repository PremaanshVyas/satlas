import { describe, test, expect, it } from 'vitest'
import * as satellite from 'satellite.js'
import { matchSatelliteQuery, matchesSatellite } from './searchUtils'

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

  it('matches across delimiters — space in query matches hyphen in name', () => {
    const { results } = matchSatelliteQuery('starlink 1001', names, noradIds, 10)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('STARLINK-1001')
  })

  it('matches across delimiters — ignores parentheses in catalog name', () => {
    const { results } = matchSatelliteQuery('iss zarya', names, noradIds, 10)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('ISS (ZARYA)')
  })

  it('token match — partial tokens hit if all present', () => {
    const { results } = matchSatelliteQuery('gps b', names, noradIds, 10)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('GPS BIIF-1')
  })

  it('returns empty for delimiter-only query', () => {
    expect(matchSatelliteQuery('---', names, noradIds, 10).results).toHaveLength(0)
    expect(matchSatelliteQuery('()', names, noradIds, 10).results).toHaveLength(0)
  })

  it('NORAD leading-zero — "6707" matches catalog entry "06707"', () => {
    const n = ['VANGUARD 1']
    const ids = ['00005']
    // typing without leading zero should still match
    const { results } = matchSatelliteQuery('5', n, ids, 10)
    expect(results).toHaveLength(1)
    expect(results[0].noradId).toBe('00005')
  })

  it('NORAD leading-zero — exact match with leading zero typed', () => {
    const n = ['VANGUARD 1']
    const ids = ['00005']
    const { results } = matchSatelliteQuery('00005', n, ids, 10)
    expect(results).toHaveLength(1)
  })

  it('numeric query also hits satellite names — "1001" finds STARLINK-1001', () => {
    const { results } = matchSatelliteQuery('1001', names, noradIds, 10)
    expect(results.some(r => r.name === 'STARLINK-1001')).toBe(true)
  })

  it('duplicate tokens — "starlink starlink" returns same results as "starlink"', () => {
    const { results: r1 } = matchSatelliteQuery('starlink', names, noradIds, 10)
    const { results: r2 } = matchSatelliteQuery('starlink starlink', names, noradIds, 10)
    expect(r2).toEqual(r1)
  })
})

describe('matchesSatellite (ISS special-case path in Globe.searchCatalog)', () => {
  it('"iss zarya" matches "ISS (ZARYA)" — the bug that prompted this fix', () => {
    expect(matchesSatellite('iss zarya', 'ISS (ZARYA)', '25544')).toBe(true)
  })

  it('"iss" matches "ISS (ZARYA)"', () => {
    expect(matchesSatellite('iss', 'ISS (ZARYA)', '25544')).toBe(true)
  })

  it('"25544" matches by NORAD', () => {
    expect(matchesSatellite('25544', 'ISS (ZARYA)', '25544')).toBe(true)
  })

  it('"255" matches as NORAD prefix', () => {
    expect(matchesSatellite('255', 'ISS (ZARYA)', '25544')).toBe(true)
  })

  it('unrelated query does not match', () => {
    expect(matchesSatellite('starlink', 'ISS (ZARYA)', '25544')).toBe(false)
  })
})

describe('alias matching — full names, partials, and mid-word typing', () => {
  const hst  = [['HST'],           ['20580']] as [string[], string[]]
  const jwst = [['JWST'],          ['50463']] as [string[], string[]]
  const css  = [['CSS (TIANHE-1)'],['48274']] as [string[], string[]]

  // Full alias names
  it('"hubble" finds HST', () =>
    expect(matchSatelliteQuery('hubble', hst[0], hst[1], 10).total).toBe(1))

  it('"hubble space telescope" finds HST', () =>
    expect(matchSatelliteQuery('hubble space telescope', hst[0], hst[1], 10).total).toBe(1))

  it('"webb" finds JWST', () =>
    expect(matchSatelliteQuery('webb', jwst[0], jwst[1], 10).total).toBe(1))

  it('"james webb" finds JWST', () =>
    expect(matchSatelliteQuery('james webb', jwst[0], jwst[1], 10).total).toBe(1))

  it('"james webb space telescope" finds JWST', () =>
    expect(matchSatelliteQuery('james webb space telescope', jwst[0], jwst[1], 10).total).toBe(1))

  it('"tiangong" finds CSS (TIANHE-1)', () =>
    expect(matchSatelliteQuery('tiangong', css[0], css[1], 10).total).toBe(1))

  // Partial typing — the key fix: incremental characters resolve before word is complete
  it('"hubbl" finds HST (partial single word)', () =>
    expect(matchSatelliteQuery('hubbl', hst[0], hst[1], 10).total).toBe(1))

  it('"hub" finds HST', () =>
    expect(matchSatelliteQuery('hub', hst[0], hst[1], 10).total).toBe(1))

  it('"jam" finds JWST', () =>
    expect(matchSatelliteQuery('jam', jwst[0], jwst[1], 10).total).toBe(1))

  it('"james w" finds JWST (partial second word)', () =>
    expect(matchSatelliteQuery('james w', jwst[0], jwst[1], 10).total).toBe(1))

  it('"web" finds JWST', () =>
    expect(matchSatelliteQuery('web', jwst[0], jwst[1], 10).total).toBe(1))

  it('"tiango" finds CSS (TIANHE-1)', () =>
    expect(matchSatelliteQuery('tiango', css[0], css[1], 10).total).toBe(1))

  // Partial multi-word — joined token is a prefix of a known alias
  it('"hubble sp" finds HST (mid-phrase partial)', () =>
    expect(matchSatelliteQuery('hubble sp', hst[0], hst[1], 10).total).toBe(1))

  it('"hubble space" finds HST', () =>
    expect(matchSatelliteQuery('hubble space', hst[0], hst[1], 10).total).toBe(1))

  it('"james web" finds JWST', () =>
    expect(matchSatelliteQuery('james web', jwst[0], jwst[1], 10).total).toBe(1))

  // Negative — alias for one should not bleed into the other
  it('"hubble" does not find JWST', () =>
    expect(matchSatelliteQuery('hubble', jwst[0], jwst[1], 10).total).toBe(0))

  it('"webb" does not find HST', () =>
    expect(matchSatelliteQuery('webb', hst[0], hst[1], 10).total).toBe(0))
})

describe('slash normalization and category aliases', () => {
  const rb  = [['ATLAS V R/B'],   ['36868']] as [string[], string[]]
  const deb = [['COSMOS 2251 DEB'], ['33791']] as [string[], string[]]

  // Slash in satellite names — "r/b" and "rb" should both find rocket bodies
  it('"r/b" finds rocket body entries', () =>
    expect(matchSatelliteQuery('r/b', rb[0], rb[1], 10).total).toBe(1))

  it('"rb" finds rocket body entries (slash stripped in normalize)', () =>
    expect(matchSatelliteQuery('rb', rb[0], rb[1], 10).total).toBe(1))

  it('"rocket body" finds R/B entries via joined alias', () =>
    expect(matchSatelliteQuery('rocket body', rb[0], rb[1], 10).total).toBe(1))

  it('"rocket" finds R/B entries via per-token alias prefix', () =>
    expect(matchSatelliteQuery('rocket', rb[0], rb[1], 10).total).toBe(1))

  it('"rocket bod" finds R/B entries (partial multi-word)', () =>
    expect(matchSatelliteQuery('rocket bod', rb[0], rb[1], 10).total).toBe(1))

  // Debris alias
  it('"deb" finds DEB entries (direct substring)', () =>
    expect(matchSatelliteQuery('deb', deb[0], deb[1], 10).total).toBe(1))

  it('"debris" finds DEB entries via alias', () =>
    expect(matchSatelliteQuery('debris', deb[0], deb[1], 10).total).toBe(1))

  it('"debri" finds DEB entries (partial alias prefix)', () =>
    expect(matchSatelliteQuery('debri', deb[0], deb[1], 10).total).toBe(1))

  // Negatives
  it('"debris" does not find rocket bodies', () =>
    expect(matchSatelliteQuery('debris', rb[0], rb[1], 10).total).toBe(0))

  it('"rocket" does not find debris', () =>
    expect(matchSatelliteQuery('rocket', deb[0], deb[1], 10).total).toBe(0))
})
