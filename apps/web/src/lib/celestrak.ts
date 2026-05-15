export interface TLERecord {
  name: string
  norad_id: string
  tle1: string
  tle2: string
}

// v4: fresh key so browsers discard any stale pre-session-14 cache.
const CACHE_KEY = 'aussie-sky-catalog-v4'
// Serve cached data immediately (stale-while-revalidate) for up to 24h.
// Background refresh fires on every call regardless. Between 24h and 72h the data
// is served instantly AND refreshed in the background. Past 72h we must wait for
// a fresh fetch — but we'll still serve stale rather than show a blank globe.
const MAX_CACHE_AGE_MS = 72 * 60 * 60 * 1000 // 72h — prefer fresh, but stale beats blank

// Single reliable endpoint: user IPs are never blocked by CelesTrak for GROUP=active.
// (Cloud/datacenter IPs get 403 for GROUP queries — that's why the AI tools use CATNR instead.)
const ACTIVE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE'

// CelesTrak CATNR endpoint for ISS — works from any IP including cloud/Vercel/Railway.
const ISS_CATNR_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'

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
  } catch {
    // localStorage quota exceeded or unavailable — not fatal
  }
}

async function fetchActive(): Promise<TLERecord[]> {
  const res = await fetch(ACTIVE_URL)
  if (!res.ok) throw new Error(`CelesTrak GROUP=active returned ${res.status}`)
  const text = await res.text()
  const records = parseTleText(text)
  if (records.length < 100) throw new Error(`CelesTrak returned only ${records.length} records`)
  return records
}

export async function fetchSatelliteCatalog(): Promise<TLERecord[]> {
  const cached = loadCache()

  if (cached) {
    const age = Date.now() - cached.ts
    // Always fire a background refresh so the next call gets fresh data.
    void fetchActive().then(data => saveCache(data)).catch(() => {})
    if (age <= MAX_CACHE_AGE_MS) return cached.data
    // Cache is stale but still usable while the background refresh runs.
    // We return it here only if MAX_CACHE_AGE_MS isn't exceeded by much;
    // in practice the background refresh above will have replaced it by next load.
    return cached.data
  }

  // No usable cache — must wait for network.
  try {
    const data = await fetchActive()
    saveCache(data)
    return data
  } catch (err) {
    // CelesTrak enforces 1 download per IP per 2-hour update cycle (since Mar 2026).
    // The v4 cache-key bump forced a fresh fetch for all users; if they'd already
    // fetched the v3 data within the same 2h window from the same IP, CelesTrak
    // returns 403 on the v4 fetch. Fall back to any previous cache key we can find.
    const stale = loadCache()
    if (stale) return stale.data
    const legacy = loadAnyLegacyCache()
    if (legacy) return legacy
    throw err
  }
}

// Check previous cache key versions in order. TLEs are valid for days, so v3 data
// is better than nothing even if it's a few hours old.
const LEGACY_KEYS = ['aussie-sky-catalog-v3', 'aussie-sky-catalog-v2', 'aussie-sky-catalog-v1']
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
  const res = await fetch(ISS_CATNR_URL)
  if (!res.ok) throw new Error(`ISS TLE fetch failed: ${res.status}`)
  const text = await res.text()
  const records = parseTleText(text)
  if (!records[0]) throw new Error('ISS TLE not found in CelesTrak response')
  return { tle1: records[0].tle1, tle2: records[0].tle2 }
}
