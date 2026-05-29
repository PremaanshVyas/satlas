export interface TLERecord {
  name: string
  norad_id: string
  tle1: string
  tle2: string
}

// Bump this key whenever the cached shape changes so browsers discard stale data.
const CACHE_KEY = 'satlas-catalog-v5'
// Serve cached data immediately (stale-while-revalidate) for up to 24h.
// Background refresh fires on every call regardless. Between 24h and 72h the data
// is served instantly AND refreshed in the background. Past 72h we must wait for
// a fresh fetch — but we'll still serve stale rather than show a blank globe.
const MAX_CACHE_AGE_MS = 72 * 60 * 60 * 1000 // 72h — prefer fresh, but stale beats blank

// Primary: /api/tles — same handler as /api/catalog but avoids uBlock Origin false-positive.
// "/api/catalog" matches ad-tracker filter rules (product catalog trackers), causing
// NS_BINDING_ABORTED at 0ms for uBlock users. /api/catalog stays live for public API consumers.
const CATALOG_API_URL = import.meta.env.VITE_CATALOG_URL || '/api/tles'

// CelesTrak direct — browser user IPs are never blocked for GROUP=active.
// (Cloud/datacenter IPs get 403 — that's why we go through /api/catalog first.)
const ACTIVE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE'

// CelesTrak CATNR endpoint for ISS — works from any IP including cloud/Vercel.
const ISS_CATNR_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'

// 25s for /api/catalog (Vercel cold start + Space-Track login + 5MB fetch can take 12-15s).
// CelesTrak fallback shares the same limit — it's also a large download on slow connections.
const FETCH_TIMEOUT_MS = 25_000

// Previous cache key versions — may hold stale 10k-era data. Cleaned up on every
// successful save so they never resurface as a fallback.
const LEGACY_KEYS = ['satlas-catalog-v4', 'aussie-sky-catalog-v4', 'aussie-sky-catalog-v3', 'aussie-sky-catalog-v2', 'aussie-sky-catalog-v1']

export function parseTleText(text: string): TLERecord[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const records: TLERecord[] = []
  let i = 0
  while (i + 2 < lines.length) {
    const name = lines[i]
    const tle1 = lines[i + 1]
    const tle2 = lines[i + 2]
    if (tle1.startsWith('1 ') && tle2.startsWith('2 ')) {
      // Space-Track 3LE prefixes name lines with "0 " as a line-type indicator.
      const cleanName = name.startsWith('0 ') ? name.slice(2) : name
      records.push({ name: cleanName, norad_id: tle1.slice(2, 7).trim(), tle1, tle2 })
      i += 3
    } else {
      i += 1
    }
  }
  return records
}

function loadCache(): { data: TLERecord[]; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data: TLERecord[]; ts: number }
    if (!Array.isArray(parsed.data) || parsed.data.length < 100) return null
    return parsed
  } catch {
    return null
  }
}

function saveCache(data: TLERecord[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
    // Remove old cache versions that may hold stale 10k-era data.
    for (const key of LEGACY_KEYS) {
      localStorage.removeItem(key)
    }
  } catch {
    // localStorage quota exceeded or unavailable — not fatal
  }
}

// Fetch from /api/catalog — Vercel edge-cached, served in <100ms after first warm call.
async function fetchFromApi(): Promise<TLERecord[]> {
  const res = await fetch(CATALOG_API_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`/api/catalog returned ${res.status}`)
  const text = await res.text()
  const records = parseTleText(text)
  if (records.length < 100) throw new Error(`/api/catalog returned only ${records.length} records`)
  return records
}

// Fetch from CelesTrak directly — works from user IPs, sometimes slow for non-US users.
async function fetchFromCelesTrak(): Promise<TLERecord[]> {
  const res = await fetch(ACTIVE_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`CelesTrak GROUP=active returned ${res.status}`)
  const text = await res.text()
  const records = parseTleText(text)
  if (records.length < 100) throw new Error(`CelesTrak returned only ${records.length} records`)
  return records
}

// Try primary source first. CelesTrak is only a fallback — its GROUP=active has ~10k
// operational satellites, far fewer than the full Space-Track catalog (~25k+). Racing
// them would let CelesTrak win and silently serve a much smaller catalog.
async function fetchFresh(): Promise<TLERecord[]> {
  try {
    return await fetchFromApi()
  } catch {
    return await fetchFromCelesTrak()
  }
}

export async function fetchSatelliteCatalog(): Promise<TLERecord[]> {
  const cached = loadCache()

  if (cached) {
    const age = Date.now() - cached.ts
    // Always fire a background refresh so the next call gets fresh data.
    void fetchFresh().then(data => saveCache(data)).catch(() => {})
    if (age <= MAX_CACHE_AGE_MS) return cached.data
    // Cache is stale but still usable while the background refresh runs.
    return cached.data
  }

  // No usable cache — must wait for network.
  try {
    const data = await fetchFresh()
    saveCache(data)
    return data
  } catch (err) {
    // Both sources failed. Fall back to any previous cache key we can find.
    // CelesTrak rate-limits to ~1 download per IP per 2-hour update cycle. A cache-key
    // bump forces all users to re-fetch; if the same IP already fetched within that 2h
    // window, CelesTrak may 403 the new fetch. Fall back to any previous cache key.
    const stale = loadCache()
    if (stale) return stale.data
    const legacy = loadAnyLegacyCache()
    if (legacy) return legacy
    throw err
  }
}

// Check previous cache key versions in order. TLEs are valid for days, so v3 data
// is better than nothing even if it's a few hours old.
function loadAnyLegacyCache(): TLERecord[] | null {
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as { data: TLERecord[]; ts: number }
      if (Array.isArray(parsed.data) && parsed.data.length >= 100) return parsed.data
    } catch {
      // corrupt entry — skip
    }
  }
  return null
}

// Fetch ISS TLE directly from CelesTrak CATNR — works from all IPs including cloud.
// This replaces the old Railway /tle/iss call. Railway is no longer in the ISS TLE path.
export async function fetchIssTle(): Promise<{ tle1: string; tle2: string }> {
  const res = await fetch(ISS_CATNR_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`ISS TLE fetch failed: ${res.status}`)
  const text = await res.text()
  const records = parseTleText(text)
  if (!records[0]) throw new Error('ISS TLE not found in CelesTrak response')
  return { tle1: records[0].tle1, tle2: records[0].tle2 }
}
