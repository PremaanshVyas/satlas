import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchSatelliteCatalog, fetchIssTle, parseTleText } from './celestrak'
import type { TLERecord } from './celestrak'

const ACTIVE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE'
const CACHE_KEY  = 'aussie-sky-catalog-v4'
const GROUP_COUNT = 4  // active + 3 debris groups fetched in parallel

function makeLocalStorageMock(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial }
  return {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v }),
    removeItem: vi.fn((k: string) => { delete store[k] }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
  }
}

function makeTleText(count: number): string {
  const lines: string[] = []
  for (let i = 0; i < count; i++) {
    const id = String(i + 1).padStart(5, '0')
    lines.push(`SAT-${i}`)
    lines.push(`1 ${id}U 20001A   24001.00000000  .00000000  00000-0  00000-0 0  9990`)
    lines.push(`2 ${id}  51.6000 000.0000 0001000  00.0000 000.0000 15.50000000000000`)
  }
  return lines.join('\n')
}

function makeRecords(count: number): TLERecord[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `SAT-${i}`,
    norad_id: `${i + 1}`,
    tle1: `1 0000${i}U ...`,
    tle2: `2 0000${i} ...`,
  }))
}

// Helper: mock that returns the same ok TLE response for all group fetches
function mockCelesTrakOk(count = 110) {
  return vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(makeTleText(count)),
  })
}

// Helper: mock that rejects all GROUP_COUNT CelesTrak calls, then resolves Railway
function mockCelesTrakFailRailwayOk(railwayData: TLERecord[]) {
  const m = vi.fn()
  for (let i = 0; i < GROUP_COUNT; i++) m.mockRejectedValueOnce(new Error('CelesTrak down'))
  m.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(railwayData) })
  return m
}

// Helper: mock that returns 403 for all GROUP_COUNT CelesTrak calls, then resolves Railway
function mockCelesTrakNonOkRailwayOk(railwayData: TLERecord[]) {
  const m = vi.fn()
  for (let i = 0; i < GROUP_COUNT; i++) m.mockResolvedValueOnce({ ok: false, status: 403 })
  m.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(railwayData) })
  return m
}

// ── parseTleText ─────────────────────────────────────────────────────────────

describe('parseTleText', () => {
  test('parses well-formed 3LE text into TLERecord array', () => {
    const text = [
      'ISS (ZARYA)',
      '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993',
      '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
    ].join('\n')

    const result = parseTleText(text)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('ISS (ZARYA)')
    expect(result[0].norad_id).toBe('25544')
    expect(result[0].tle1).toMatch(/^1 25544/)
    expect(result[0].tle2).toMatch(/^2 25544/)
  })

  test('skips malformed lines and keeps valid triplets', () => {
    const text = [
      'GARBAGE LINE',
      'ANOTHER BAD LINE',
      'GOOD SAT',
      '1 00001U 20001A   24001.00000000  .00000000  00000-0  00000-0 0  9990',
      '2 00001  51.6000 000.0000 0001000  00.0000 000.0000 15.50000000000000',
    ].join('\n')

    const result = parseTleText(text)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('GOOD SAT')
  })

  test('extracts norad_id from columns 2-7 of TLE line 1', () => {
    const text = makeTleText(3)
    const result = parseTleText(text)
    expect(result[0].norad_id).toBe('00001')
    expect(result[1].norad_id).toBe('00002')
    expect(result[2].norad_id).toBe('00003')
  })
})

// ── fetchSatelliteCatalog ─────────────────────────────────────────────────────

describe('fetchSatelliteCatalog', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock())
  })
  afterEach(() => vi.restoreAllMocks())

  test('fetches TLE text from all CelesTrak groups when no cache', async () => {
    vi.stubGlobal('fetch', mockCelesTrakOk(110))

    const result = await fetchSatelliteCatalog('http://localhost:8000')

    // 110 unique records (all groups return same NORAD IDs — deduplicated)
    expect(result.length).toBe(110)
    // The active group URL must have been called
    expect(fetch).toHaveBeenCalledWith(ACTIVE_URL)
    // Total of GROUP_COUNT calls (no Railway fallback needed)
    expect(fetch).toHaveBeenCalledTimes(GROUP_COUNT)
  })

  test('falls back to Railway when all CelesTrak groups fail', async () => {
    const mockData = makeRecords(110)
    vi.stubGlobal('fetch', mockCelesTrakFailRailwayOk(mockData))

    const result = await fetchSatelliteCatalog('http://localhost:8000')

    expect(result).toEqual(mockData)
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/satellites')
  })

  test('falls back to Railway when CelesTrak groups return non-ok status', async () => {
    const mockData = makeRecords(110)
    vi.stubGlobal('fetch', mockCelesTrakNonOkRailwayOk(mockData))

    const result = await fetchSatelliteCatalog('http://localhost:8000')

    expect(result).toEqual(mockData)
  })

  test('throws when both CelesTrak and Railway fail', async () => {
    const m = vi.fn()
    for (let i = 0; i < GROUP_COUNT; i++) m.mockRejectedValueOnce(new Error('CelesTrak down'))
    m.mockResolvedValueOnce({ ok: false, status: 503 })
    vi.stubGlobal('fetch', m)

    await expect(fetchSatelliteCatalog('http://localhost:8000')).rejects.toThrow()
  })

  test('returns cached data immediately when cache is present (stale-while-revalidate)', async () => {
    const cached = makeRecords(110)
    vi.stubGlobal('localStorage', makeLocalStorageMock({
      [CACHE_KEY]: JSON.stringify({ data: cached, ts: Date.now() - 2 * 60 * 60 * 1000 }),
    }))
    vi.stubGlobal('fetch', mockCelesTrakOk(110))

    const result = await fetchSatelliteCatalog('http://localhost:8000')

    expect(result).toEqual(cached)
  })

  test('fires background refresh when serving from cache', async () => {
    const cached = makeRecords(110)
    vi.stubGlobal('localStorage', makeLocalStorageMock({
      [CACHE_KEY]: JSON.stringify({ data: cached, ts: Date.now() }),
    }))
    vi.stubGlobal('fetch', mockCelesTrakOk(110))

    await fetchSatelliteCatalog('http://localhost:8000')
    // Allow the background void promise to settle
    await new Promise(r => setTimeout(r, 0))

    expect(fetch).toHaveBeenCalledWith(ACTIVE_URL)
  })
})

// ── fetchIssTle ──────────────────────────────────────────────────────────────

describe('fetchIssTle', () => {
  afterEach(() => vi.restoreAllMocks())

  test('fetches from baseUrl/tle/iss and returns tle1 and tle2', async () => {
    const mockData = {
      tle1: '1 25544U 98067A   26133.54791667  .00016717  00000-0  10270-3 0  9993',
      tle2: '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    }))

    const result = await fetchIssTle('http://localhost:8000')

    expect(result.tle1).toMatch(/^1 25544/)
    expect(result.tle2).toMatch(/^2 25544/)
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/tle/iss')
  })

  test('throws when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    await expect(fetchIssTle('http://localhost:8000')).rejects.toThrow('503')
  })
})
