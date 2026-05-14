import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchSatelliteCatalog, fetchIssTle, parseTleText } from './celestrak'
import type { TLERecord } from './celestrak'

const CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE'

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
    // makeTleText pads IDs to 5 digits; TLE column extraction gives '00001', '00002', '00003'
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

  test('fetches TLE text directly from CelesTrak when no cache', async () => {
    const tleText = makeTleText(110)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(tleText),
    }))

    const result = await fetchSatelliteCatalog('http://localhost:8000')

    expect(result.length).toBe(110)
    expect(fetch).toHaveBeenCalledWith(CELESTRAK_URL)
  })

  test('falls back to Railway when CelesTrak fails', async () => {
    const mockData = makeRecords(110)
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockRejectedValueOnce(new Error('CelesTrak network error'))
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockData) }),
    )

    const result = await fetchSatelliteCatalog('http://localhost:8000')

    expect(result).toEqual(mockData)
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8000/satellites')
  })

  test('falls back to Railway when CelesTrak returns non-ok status', async () => {
    const mockData = makeRecords(110)
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 403 })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockData) }),
    )

    const result = await fetchSatelliteCatalog('http://localhost:8000')

    expect(result).toEqual(mockData)
  })

  test('throws when both CelesTrak and Railway fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockRejectedValueOnce(new Error('CelesTrak down'))
        .mockResolvedValueOnce({ ok: false, status: 503 }),
    )

    await expect(fetchSatelliteCatalog('http://localhost:8000')).rejects.toThrow()
  })

  test('returns cached data immediately when cache is present (stale-while-revalidate)', async () => {
    const cached = makeRecords(110)
    // Cache is 2 h old — old behavior discarded this, new behavior serves it
    vi.stubGlobal('localStorage', makeLocalStorageMock({
      'aussie-sky-catalog-v2': JSON.stringify({ data: cached, ts: Date.now() - 2 * 60 * 60 * 1000 }),
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(makeTleText(110)),
    }))

    const result = await fetchSatelliteCatalog('http://localhost:8000')

    expect(result).toEqual(cached)
  })

  test('fires background refresh when serving from cache', async () => {
    const cached = makeRecords(110)
    vi.stubGlobal('localStorage', makeLocalStorageMock({
      'aussie-sky-catalog-v2': JSON.stringify({ data: cached, ts: Date.now() }),
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(makeTleText(110)),
    }))

    await fetchSatelliteCatalog('http://localhost:8000')
    // Allow the background void promise to settle
    await new Promise(r => setTimeout(r, 0))

    expect(fetch).toHaveBeenCalledWith(CELESTRAK_URL)
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
