export interface TLERecord {
  name: string
  norad_id: string
  tle1: string
  tle2: string
}

const CACHE_KEY = 'aussie-sky-catalog-v1'
const CACHE_TTL_MS = 30 * 60 * 1000  // match Railway backend TTL

function loadCachedCatalog(): TLERecord[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: TLERecord[]; ts: number }
    if (!Array.isArray(data) || data.length < 100) return null
    if (Date.now() - ts > CACHE_TTL_MS) return null
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
    // Return cached data immediately for instant render.
    // Fire background refresh to update cache for next visit — don't await.
    void fetchCatalogFromNetwork(baseUrl).catch(() => {})
    return cached
  }
  // No cache: fetch from network. No artificial timeout — Railway cold starts can
  // take up to 60s. The globe is shown immediately (ISS-only) while this loads.
  return fetchCatalogFromNetwork(baseUrl)
}

export async function fetchIssTle(baseUrl: string): Promise<{ tle1: string; tle2: string }> {
  const response = await fetch(`${baseUrl}/tle/iss`)
  if (!response.ok) throw new Error(`ISS TLE fetch failed: ${response.status}`)
  return response.json() as Promise<{ tle1: string; tle2: string }>
}
