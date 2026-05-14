import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchSatelliteCatalog, fetchIssTle } from './celestrak'
import type { TLERecord } from './celestrak'

function makeLocalStorageMock(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial }
  return {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v }),
    removeItem: vi.fn((k: string) => { delete store[k] }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
  }
}

describe('fetchSatelliteCatalog', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock())
  })
  afterEach(() => vi.restoreAllMocks())

  test('fetches from baseUrl/satellites and returns TLERecord array', async () => {
    const mockData: TLERecord[] = [
      { name: 'ISS (ZARYA)', norad_id: '25544', tle1: '1 25544U ...', tle2: '2 25544 ...' },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      }),
    )

    const result = await fetchSatelliteCatalog('http://localhost:8000')

    expect(result).toEqual(mockData)
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/satellites')
  })

  test('throws when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    )

    await expect(fetchSatelliteCatalog('http://localhost:8000')).rejects.toThrow('503')
  })

  test('returns cached data from localStorage when fresh', async () => {
    const mockData: TLERecord[] = Array.from({ length: 110 }, (_, i) => ({
      name: `SAT-${i}`, norad_id: `${i + 1}`, tle1: `1 0000${i}U ...`, tle2: `2 0000${i} ...`,
    }))
    vi.stubGlobal('localStorage', makeLocalStorageMock({
      'aussie-sky-catalog-v1': JSON.stringify({ data: mockData, ts: Date.now() }),
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }))

    const result = await fetchSatelliteCatalog('http://localhost:8000')

    expect(result).toEqual(mockData)
  })
})

describe('fetchIssTle', () => {
  afterEach(() => vi.restoreAllMocks())

  test('fetches from baseUrl/tle/iss and returns tle1 and tle2', async () => {
    const mockData = {
      tle1: '1 25544U 98067A   26133.54791667  .00016717  00000-0  10270-3 0  9993',
      tle2: '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) }),
    )

    const result = await fetchIssTle('http://localhost:8000')

    expect(result.tle1).toMatch(/^1 25544/)
    expect(result.tle2).toMatch(/^2 25544/)
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/tle/iss')
  })

  test('throws when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    )

    await expect(fetchIssTle('http://localhost:8000')).rejects.toThrow('503')
  })
})
