export interface TLERecord {
  name: string
  norad_id: string
  tle1: string
  tle2: string
}

// v4: forces browsers to discard v3 cache (which was populated from Railway's 10k SpaceTrack fallback).
// Fresh fetch from CelesTrak GROUP=active gives ~15k+ active satellites.
const CACHE_KEY = 'aussie-sky-catalog-v4'
// Serve cached data immediately for up to SERVE_AGE_MS without waiting for network.
// After that, still serve stale data instantly but always refresh in the background.
// TLEs are valid for several days, so serving up to 48 h old data is safe while fresh
// data loads. Only reject the cache entirely if it is >72 h old or malformed.
const SERVE_AGE_MS     = 24 * 60 * 60 * 1000  // 24 h — always serve from here instantly
const MAX_CACHE_AGE_MS = 72 * 60 * 60 * 1000  // 72 h — hard expiry (satellite orbits too stale)

// Primary group: active payloads (~15k objects, CORS-enabled, user IPs never blocked).
// Debris groups: notable debris fields trackable via the same gp.php endpoint.
// All fetched in parallel and merged by NORAD ID (deduplication).
const CELESTRAK_GROUPS = [
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=fengyun-1c-debris&FORMAT=TLE',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=TLE',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=TLE',
]

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
      i += 1  // skip malformed line
    }
  }
  return records
}

function loadCachedCatalog(): { data: TLERecord[]; needsRefresh: boolean } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: TLERecord[]; ts: number }
    if (!Array.isArray(data) || data.length < 100) return null
    const age = Date.now() - ts
    if (age > MAX_CACHE_AGE_MS) return null          // truly too old — reject
    return { data, needsRefresh: age > SERVE_AGE_MS }// stale but usable — serve + refresh
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

// Fetch all CelesTrak groups in parallel, merge and deduplicate by NORAD ID.
// Parallel fetch means the total latency ≈ slowest single group, not the sum.
async function fetchFromCelesTrak(): Promise<TLERecord[]> {
  const results = await Promise.allSettled(
    CELESTRAK_GROUPS.map(url => fetch(url).then(r => {
      if (!r.ok) throw new Error(`CelesTrak ${r.status} (${url})`)
      return r.text()
    }))
  )
  const seen = new Set<string>()
  const merged: TLERecord[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const rec of parseTleText(result.value)) {
      if (!seen.has(rec.norad_id)) {
        seen.add(rec.norad_id)
        merged.push(rec)
      }
    }
  }
  if (merged.length < 100) throw new Error(`CelesTrak returned only ${merged.length} records`)
  return merged
}

async function fetchFromRailway(baseUrl: string): Promise<TLERecord[]> {
  const res = await fetch(`${baseUrl}/satellites`)
  if (!res.ok) throw new Error(`Railway /satellites ${res.status}`)
  return res.json() as Promise<TLERecord[]>
}

async function fetchCatalogFromNetwork(baseUrl: string): Promise<TLERecord[]> {
  try {
    // Primary: direct browser fetch from CelesTrak CDN — no cold starts, no Railway needed.
    // Fetches active payloads + major debris groups in parallel (~18-20k objects total).
    const data = await fetchFromCelesTrak()
    saveCatalogToCache(data)
    return data
  } catch {
    // Fallback: Railway /satellites, which serves the full SpaceTrack catalog (all object types)
    // when it is warm. This is a larger set (~25-35k) but requires Railway to not be cold-starting.
    const data = await fetchFromRailway(baseUrl)
    saveCatalogToCache(data)
    return data
  }
}

export async function fetchSatelliteCatalog(baseUrl: string): Promise<TLERecord[]> {
  const cached = loadCachedCatalog()
  if (cached) {
    // Always serve cached data immediately (stale-while-revalidate).
    // Background refresh runs whenever cache is older than SERVE_AGE_MS (24 h) or on every
    // call — either way the foreground load is always instant for the user.
    void fetchCatalogFromNetwork(baseUrl).catch(() => {})
    return cached.data
  }
  // No usable cache (first visit ever, or > 72 h old): must wait for network.
  return fetchCatalogFromNetwork(baseUrl)
}

export async function fetchIssTle(baseUrl: string): Promise<{ tle1: string; tle2: string }> {
  const response = await fetch(`${baseUrl}/tle/iss`)
  if (!response.ok) throw new Error(`ISS TLE fetch failed: ${response.status}`)
  return response.json() as Promise<{ tle1: string; tle2: string }>
}
