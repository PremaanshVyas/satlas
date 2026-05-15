// CelesTrak SATCAT — satellite catalog metadata (country, launch date, object type, orbital params).
// Fetched once per session from CelesTrak's public CSV endpoint and cached in localStorage.
// All data is optional — if the fetch fails, the info card still shows TLE-derived params.

const SATCAT_URL = 'https://celestrak.org/pub/satcat.csv'
const SATCAT_CACHE_KEY = 'aussie-sky-satcat-v1'
const SATCAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000  // 24 h

export interface SatcatEntry {
  noradId: string
  objectType: string   // PAY, R/B, DEB, UNK
  opsStatus: string    // +, -, P, B, S, X, D, ?
  owner: string        // readable country/org name
  launchDate: string   // YYYY-MM-DD or ''
  intlDes: string      // international designator e.g. "1998-067A"
}

// CelesTrak satcat.csv column indices (0-based, header row = row 0)
// OBJECT_NAME, OBJECT_ID(intlDes), NORAD_CAT_ID, OBJECT_TYPE, OPS_STATUS_CODE,
// OWNER, LAUNCH_DATE, LAUNCH_SITE, DECAY_DATE, PERIOD, INCLINATION, APOGEE, PERIGEE,
// RCS, DATA_STATUS_CODE, ORBIT_CENTER, ORBIT_TYPE
const C_INTLDES    = 1
const C_NORAD      = 2
const C_TYPE       = 3
const C_OPS        = 4
const C_OWNER      = 5
const C_LAUNCH     = 6

const OWNER_MAP: Record<string, string> = {
  US: 'United States', CIS: 'Russia', CN: 'China', ESA: 'Europe (ESA)',
  IN: 'India', JP: 'Japan', FR: 'France', UK: 'United Kingdom',
  CA: 'Canada', AU: 'Australia', IT: 'Italy', DE: 'Germany',
  ISR: 'Israel', TW: 'Taiwan', KR: 'South Korea', BR: 'Brazil',
  AE: 'UAE', SA: 'Saudi Arabia', SES: 'SES (Luxembourg)',
  IRIDIUM: 'Iridium', SPACEX: 'SpaceX', O3B: 'O3b Networks',
  NATO: 'NATO', AB: 'Arab Satellite', PRC: 'China',
  ORB: 'Orbital Sciences', SEA: 'Sea Launch',
}

function parseSatcatCsv(csv: string): Map<string, SatcatEntry> {
  const lines = csv.split('\n')
  const map = new Map<string, SatcatEntry>()
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < 8) continue
    const norad = cols[C_NORAD]?.trim()
    if (!norad || norad === '0') continue
    const ownerCode = cols[C_OWNER]?.trim() ?? ''
    map.set(norad, {
      noradId: norad,
      intlDes: cols[C_INTLDES]?.trim() ?? '',
      objectType: cols[C_TYPE]?.trim() ?? 'UNK',
      opsStatus: cols[C_OPS]?.trim() ?? '',
      owner: OWNER_MAP[ownerCode] ?? ownerCode,
      launchDate: cols[C_LAUNCH]?.trim() ?? '',
    })
  }
  return map
}

function loadCached(): Map<string, SatcatEntry> | null {
  try {
    const raw = localStorage.getItem(SATCAT_CACHE_KEY)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: [string, SatcatEntry][]; ts: number }
    if (Date.now() - ts > SATCAT_CACHE_TTL_MS) return null
    return new Map(data)
  } catch { return null }
}

function saveToCache(map: Map<string, SatcatEntry>): void {
  try {
    localStorage.setItem(SATCAT_CACHE_KEY, JSON.stringify({ data: [...map], ts: Date.now() }))
  } catch { /* quota or private browsing — not fatal */ }
}

let _memCache: Map<string, SatcatEntry> | null = null

export async function fetchSatcat(): Promise<Map<string, SatcatEntry>> {
  if (_memCache) return _memCache
  const cached = loadCached()
  if (cached) { _memCache = cached; return cached }
  try {
    const res = await fetch(SATCAT_URL)
    if (!res.ok) throw new Error(`satcat ${res.status}`)
    const text = await res.text()
    const map = parseSatcatCsv(text)
    if (map.size > 100) {
      _memCache = map
      saveToCache(map)
    }
    return map
  } catch {
    return new Map()  // metadata is optional — info card works without it
  }
}

export function objectTypeLabel(type: string): string {
  if (type === 'PAY') return 'Payload'
  if (type === 'R/B') return 'Rocket Body'
  if (type === 'DEB') return 'Debris'
  return 'Unknown'
}

export function opsStatusLabel(status: string): string {
  const map: Record<string, string> = {
    '+': 'Operational', '-': 'Non-operational', 'P': 'Partially operational',
    'B': 'Standby', 'S': 'Spare', 'X': 'Extended mission', 'D': 'Decayed', '?': 'Unknown',
  }
  return map[status] ?? status
}
