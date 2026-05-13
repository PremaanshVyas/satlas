import { describe, test, expect, vi, afterEach } from 'vitest'
import { fetchSatelliteCatalog, fetchIssTle } from './celestrak'
import type { TLERecord } from './celestrak'

describe('fetchSatelliteCatalog', () => {
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
