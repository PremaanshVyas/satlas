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

// 25s for /api/catalog (Vercel cold start + Space-Track login + 5MB fetch can take 12-15s).
// CelesTrak fallback shares the same limit — it's also a large download on slow connections.
const FETCH_TIMEOUT_MS = 25_000

// localStorage counts UTF-16 code units, so an N-character payload costs ~2N bytes against
// a per-origin cap of roughly 5-10 MB depending on the browser. The full ~35k catalog
// serialises to ~7M characters (~13.5 MB) and cannot be stored in any browser. Payloads
// above this budget are not even attempted, so we never rely on catching a quota error.
const MAX_CACHE_CHARS = 2_000_000

// Previous cache key versions — may hold stale 10k-era data. Purged on every fetch,
// successful write or not, so they can never resurface through loadAnyLegacyCache().
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

function purgeLegacyKeys(): void {
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      // storage unavailable — nothing to clean up
    }
  }
}

function dropCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // storage unavailable — nothing to drop
  }
}

function saveCache(data: TLERecord[]): void {
  // Purge first, and unconditionally. This used to run only after a successful setItem,
  // so once the catalog outgrew the quota the write always threw and the old 10k-era
  // keys were never removed.
  purgeLegacyKeys()

  const payload = JSON.stringify({ data, ts: Date.now() })

  if (payload.length > MAX_CACHE_CHARS) {
    // We cannot persist what we just fetched. Anything still stored under CACHE_KEY is
    // therefore smaller and older than the live catalog, and nothing will ever overwrite
    // it, so it would be served on every future load. Evict it rather than leave the
    // browser pinned to a stale object count.
    dropCache()
    return
  }

  try {
    localStorage.setItem(CACHE_KEY, payload)
  } catch {
    // Quota, private browsing, or storage disabled. Same reasoning as above: an entry we
    // have no way to refresh is worse than no entry at all.
    dropCache()
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

interface FreshCatalog {
  data: TLERecord[]
  /** true when the data came from CelesTrak GROUP=active, which is far smaller. */
  degraded: boolean
}

// Try the primary source first. CelesTrak is only a fallback — its GROUP=active carries
// the operational subset (~15k), far fewer than the full Space-Track catalog (~35k). Racing
// them would let CelesTrak win and silently serve a much smaller catalog, so the caller is
// told which source answered via `degraded`.
async function fetchFresh(): Promise<FreshCatalog> {
  try {
    return { data: await fetchFromApi(), degraded: false }
  } catch {
    return { data: await fetchFromCelesTrak(), degraded: true }
  }
}

// Persist a full catalog only. Caching the degraded fallback would pin the browser to a
// much smaller object count after a single transient failure of the primary source, which
// is exactly the failure mode this cache keeps reproducing.
function persist(fresh: FreshCatalog): void {
  if (fresh.degraded) {
    purgeLegacyKeys()
    return
  }
  saveCache(fresh.data)
}

export async function fetchSatelliteCatalog(): Promise<TLERecord[]> {
  const cached = loadCache()

  if (cached && Date.now() - cached.ts <= MAX_CACHE_AGE_MS) {
    // Recent enough to paint instantly; refresh in the background for the next load.
    void fetchFresh().then(persist).catch(() => {})
    return cached.data
  }

  // No cache, or one too old to trust. Wait for the network. A stale copy is a fallback
  // now, never the answer when a fresh fetch is available — returning it unconditionally
  // is what let an un-replaceable entry pin a browser to an old object count forever.
  try {
    const fresh = await fetchFresh()
    persist(fresh)
    return fresh.data
  } catch (err) {
    // Both sources failed. Fall back to any previous cache key we can find.
    // CelesTrak rate-limits to ~1 download per IP per 2-hour update cycle. A cache-key
    // bump forces all users to re-fetch; if the same IP already fetched within that 2h
    // window, CelesTrak may 403 the new fetch. Fall back to any previous cache key.
    if (cached) return cached.data
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

