import { describe, test, expect, vi, afterEach } from 'vitest'
import { fetchSatelliteCatalog } from './celestrak'
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
