import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const SATCAT_CACHE_KEY = 'satlas-satcat-v6'

function makeLocalStorageMock(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial }
  return {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v }),
    removeItem: vi.fn((k: string) => { delete store[k] }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
  }
}

// Space-Track satcat rows, in the shape parseSatcatJson expects.
function makeRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    norad_id: String(i + 1).padStart(5, '0'),
    intl_des: `2020-${String(i).padStart(3, '0')}A`,
    type: 'PAY',
    owner: 'US',
    launch: '2020-01-01',
    site: 'AFETR',
    decay: null,
  }))
}

// satcat.ts holds a module-level in-memory cache, so each test needs a fresh module.
async function freshModule() {
  vi.resetModules()
  return await import('./satcat')
}

describe('satcat cache', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock())
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('caches metadata that fits within the size budget', async () => {
    const store = makeLocalStorageMock()
    vi.stubGlobal('localStorage', store)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeRows(200)),
    }))

    const { fetchSatcat } = await freshModule()
    const map = await fetchSatcat()

    expect(map.size).toBe(200)
    expect(store.setItem).toHaveBeenCalledWith(SATCAT_CACHE_KEY, expect.any(String))
  })

  test('does not attempt a write when the payload exceeds the size budget', async () => {
    // The real satcat.json is ~8.7 MB and cannot fit in localStorage. Relying on a thrown
    // QuotaExceededError meant the failure was silent and the stale entry survived.
    const store = makeLocalStorageMock()
    vi.stubGlobal('localStorage', store)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeRows(30000)),
    }))

    const { fetchSatcat } = await freshModule()
    const map = await fetchSatcat()

    expect(map.size).toBe(30000)
    expect(store.setItem).not.toHaveBeenCalled()
    expect(store.removeItem).toHaveBeenCalledWith(SATCAT_CACHE_KEY)
  })

  test('evicts the cached entry when the write is rejected', async () => {
    const store = makeLocalStorageMock()
    store.setItem = vi.fn(() => { throw new DOMException('quota', 'QuotaExceededError') })
    vi.stubGlobal('localStorage', store)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeRows(200)),
    }))

    const { fetchSatcat } = await freshModule()
    await fetchSatcat()

    expect(store.removeItem).toHaveBeenCalledWith(SATCAT_CACHE_KEY)
  })

  test('returns an empty map rather than throwing when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const { fetchSatcat } = await freshModule()
    const map = await fetchSatcat()

    expect(map.size).toBe(0)
  })
})
