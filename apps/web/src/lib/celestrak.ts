export interface TLERecord {
  name: string
  norad_id: string
  tle1: string
  tle2: string
}

const CACHE_KEY = 'aussie-sky-catalog-v1'
// Discard cache only if it is more than 24 h old or corrupt.
// Stale-while-revalidate: even "old" data is shown immediately while a fresh
// fetch runs in the background — satellites don't change meaningfully in hours.
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000

function loadCachedCatalog(): TLERecord[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: TLERecord[]; ts: number }
    if (!Array.isArray(data) || data.length < 100) return null
    if (Date.now() - ts > MAX_CACHE_AGE_MS) return null
    return data
  } catch {
    return null
  }
}

function saveCatalogToCache(data: TLERecord[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
  } catch {
    // localStorage quota exceeded or unavailable (private browsing) — not fatal
  }
}

async function fetchCatalogFromNetwork(baseUrl: string): Promise<TLERecord[]> {
  const response = await fetch(`${baseUrl}/satellites`)
  if (!response.ok) throw new Error(`Catalog fetch failed: ${response.status}`)
  const data = await response.json() as TLERecord[]
  saveCatalogToCache(data)
  return data
}

export async function fetchSatelliteCatalog(baseUrl: string): Promise<TLERecord[]> {
  const cached = loadCachedCatalog()
  if (cached) {
    // Always return cached data immediately (stale-while-revalidate).
    // Background refresh keeps the cache warm — Railway cold starts only affect
    // the refresh, never the foreground load. Users always see satellites instantly.
    void fetchCatalogFromNetwork(baseUrl).catch(() => {})
    return cached
  }
  // No usable cache (first ever visit, or > 24h old): must wait for network.
  return fetchCatalogFromNetwork(baseUrl)
}

export async function fetchIssTle(baseUrl: string): Promise<{ tle1: string; tle2: string }> {
  const response = await fetch(`${baseUrl}/tle/iss`)
  if (!response.ok) throw new Error(`ISS TLE fetch failed: ${response.status}`)
  return response.json() as Promise<{ tle1: string; tle2: string }>
}
