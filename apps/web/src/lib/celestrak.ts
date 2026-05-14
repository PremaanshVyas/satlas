export interface TLERecord {
  name: string
  norad_id: string
  tle1: string
  tle2: string
}

const CACHE_KEY = 'aussie-sky-catalog-v2'
// Discard cache only after 24 h — stale-while-revalidate means satellites are
// always shown immediately from cache while a fresh fetch runs in background.
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000

// CelesTrak serves TLE data directly to browsers (CORS enabled, user IPs never blocked).
// Cloud IPs (Railway, AWS, etc.) get 403 on GROUP=active — browser IPs do not.
const CELESTRAK_ACTIVE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE'

export function parseTleText(text: string): TLERecord[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const records: TLERecord[] = []
  let i = 0
  while (i + 2 < lines.length) {
    const name = lines[i]
    const tle1 = lines[i + 1]
    const tle2 = lines[i + 2]
    if (tle1.startsWith('1 ') && tle2.startsWith('2 ')) {
      records.push({ name, norad_id: tle1.slice(2, 7).trim(), tle1, tle2 })
      i += 3
    } else {
      i += 1  // skip malformed line, same as Python _parse_tle_text
    }
  }
  return records
}

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

async function fetchFromCelesTrak(): Promise<TLERecord[]> {
  const res = await fetch(CELESTRAK_ACTIVE_URL)
  if (!res.ok) throw new Error(`CelesTrak ${res.status}`)
  const text = await res.text()
  const records = parseTleText(text)
  if (records.length < 100) throw new Error(`CelesTrak returned only ${records.length} records`)
  return records
}

async function fetchFromRailway(baseUrl: string): Promise<TLERecord[]> {
  const res = await fetch(`${baseUrl}/satellites`)
  if (!res.ok) throw new Error(`Railway /satellites ${res.status}`)
  return res.json() as Promise<TLERecord[]>
}

async function fetchCatalogFromNetwork(baseUrl: string): Promise<TLERecord[]> {
  try {
    // Primary: direct browser fetch from CelesTrak CDN — no cold starts, no Railway needed.
    const data = await fetchFromCelesTrak()
    saveCatalogToCache(data)
    return data
  } catch {
    // Fallback: Railway /satellites, which has its own CelesTrak → SpaceTrack → stale chain.
    const data = await fetchFromRailway(baseUrl)
    saveCatalogToCache(data)
    return data
  }
}

export async function fetchSatelliteCatalog(baseUrl: string): Promise<TLERecord[]> {
  const cached = loadCachedCatalog()
  if (cached) {
    // Always serve cached data immediately then refresh in background (stale-while-revalidate).
    // Cold starts on Railway only affect the background refresh — never the foreground load.
    void fetchCatalogFromNetwork(baseUrl).catch(() => {})
    return cached
  }
  // No usable cache (first visit ever, or > 24 h old): must wait for network.
  return fetchCatalogFromNetwork(baseUrl)
}

export async function fetchIssTle(baseUrl: string): Promise<{ tle1: string; tle2: string }> {
  const response = await fetch(`${baseUrl}/tle/iss`)
  if (!response.ok) throw new Error(`ISS TLE fetch failed: ${response.status}`)
  return response.json() as Promise<{ tle1: string; tle2: string }>
}
