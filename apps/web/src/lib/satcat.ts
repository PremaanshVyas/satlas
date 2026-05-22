// Satellite catalog metadata served from our own S3/CloudFront (written by ECS from Space-Track).
// Fetched once per session and cached in localStorage.
// All data is optional — if the fetch fails, the info card still shows TLE-derived params.

// Derive satcat URL from the same CloudFront bucket that serves catalog.tle.
// Falls back to the known CloudFront origin when VITE_CATALOG_URL is not set (e.g. Vercel without the env var).
const _cfBase = (import.meta.env.VITE_CATALOG_URL as string | undefined)?.replace('/catalog.tle', '')
  ?? 'https://dgsll6twimcwl.cloudfront.net'
const SATCAT_URL = `${_cfBase}/satcat.json`

const SATCAT_CACHE_KEY = 'satlas-satcat-v6'
const SATCAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000  // 24 h

export interface SatcatEntry {
  noradId: string
  objectType: string   // PAY, R/B, DEB, UNK
  opsStatus: string    // 'tracked' | 'decayed' (derived from Space-Track CURRENT/DECAY)
  owner: string        // readable country/org name
  launchDate: string   // YYYY-MM-DD or ''
  launchSite: string   // readable facility name + location or ''
  intlDes: string      // international designator e.g. "1998-067A"
}

// Space-Track satcat condensed row shape (as written by ECS to S3)
interface SatcatRow {
  norad_id: string
  intl_des: string
  type: string      // already normalised: PAY, R/B, DEB, UNK
  owner: string     // country code e.g. US, CIS
  launch: string    // YYYY-MM-DD or ''
  site: string      // site code or ''
  decay: string | null
}

const OWNER_MAP: Record<string, string> = {
  US: 'United States', CIS: 'Russia', CN: 'China', ESA: 'Europe (ESA)',
  IN: 'India', JP: 'Japan', FR: 'France', UK: 'United Kingdom',
  CA: 'Canada', AU: 'Australia', IT: 'Italy', DE: 'Germany',
  ISR: 'Israel', TW: 'Taiwan', KR: 'South Korea', BR: 'Brazil',
  AE: 'UAE', SA: 'Saudi Arabia', SES: 'SES (Luxembourg)',
  IRIDIUM: 'Iridium', SPACEX: 'SpaceX', O3B: 'O3b Networks',
  NATO: 'NATO', AB: 'Arab Satellite Communications', PRC: 'China',
  ORB: 'Orbital Sciences', SEA: 'Sea Launch', NZ: 'New Zealand',
  ARGN: 'Argentina', CHBZ: 'Brazil / China', CIS2: 'Russia',
  EUTE: 'Eutelsat', FRNCE: 'France', GREC: 'Greece',
  INDO: 'Indonesia', IRAN: 'Iran', MEX: 'Mexico',
  NETH: 'Netherlands', NKOR: 'North Korea', NOR: 'Norway',
  PAKI: 'Pakistan', SING: 'Singapore', SWED: 'Sweden',
  SWTZ: 'Switzerland', THAI: 'Thailand', TURK: 'Turkey',
  UAE: 'UAE', USBZ: 'USA / Brazil', USEU: 'USA / Europe',
  ISS: 'International (ISS)',
}

// CelesTrak / Space-Track LAUNCH_SITE codes → readable facility name + location
const SITE_MAP: Record<string, string> = {
  // United States
  AFETR: 'Cape Canaveral SFS, Florida, USA',
  AFWTR: 'Vandenberg SFB, California, USA',
  WFF:   'Wallops Flight Facility, Virginia, USA',
  KODAK: 'Kodiak Launch Complex, Alaska, USA',
  KWAJL: 'Kwajalein Atoll, Marshall Islands',
  OMELEK:'Omelek Island, Kwajalein Atoll',
  AIRL:  'Air Launch (Pegasus), USA',
  // Russia / Kazakhstan
  TTMTR: 'Baikonur Cosmodrome, Kazakhstan',
  TYMSC: 'Baikonur Cosmodrome, Kazakhstan',
  PKMSC: 'Plesetsk Cosmodrome, Arkhangelsk, Russia',
  KYMSC: 'Kapustin Yar, Astrakhan, Russia',
  VOSTO: 'Vostochny Cosmodrome, Amur Oblast, Russia',
  YMAS:  'Yasny (Dombarovsky), Orenburg, Russia',
  // Europe
  FRGUI: 'Guiana Space Centre, Kourou, French Guiana',
  CAS:   'Canary Islands Launch Site, Spain',
  // China
  JSC:   'Jiuquan Satellite Launch Centre, Inner Mongolia, China',
  TSC:   'Taiyuan Satellite Launch Centre, Shanxi, China',
  XSLC:  'Xichang Satellite Launch Centre, Sichuan, China',
  WSLC:  'Wenchang Space Launch Site, Hainan, China',
  // Japan
  TNSC:  'Tanegashima Space Centre, Kagoshima, Japan',
  KASC:  'Uchinoura Space Centre, Kagoshima, Japan',
  KSCUT: 'Uchinoura Space Centre, Kagoshima, Japan',
  // India
  SRISR: 'Satish Dhawan Space Centre, Sriharikota, India',
  // Israel
  PALMA: 'Palmachim Airbase, Tel Nof, Israel',
  // Iran
  SEMNA: 'Imam Khomeini SLC, Semnan, Iran',
  SADOL: 'Shahroud Space Complex, Shahroud, Iran',
  // Australia
  WOMRA: 'Woomera, South Australia, Australia',
  // New Zealand
  RLLB:  'Rocket Lab LC-1, Māhia Peninsula, New Zealand',
  // Brazil
  AGSAC: 'Alcântara Launch Centre, Maranhão, Brazil',
  LPRM:  'Alcântara Launch Centre, Maranhão, Brazil',
  // South Korea
  NSC:   'Naro Space Centre, Goheung, South Korea',
  // Sea / mobile
  PLAXS: 'Sea Launch Platform (Pacific Ocean)',
  SNMLP: 'San Marco Platform, Indian Ocean, Kenya',
  // Historical
  HGSTR: 'Hammaguira, Algeria',
}

// NORAD ID overrides for satellites where Space-Track's country code is misleading.
// Keyed by unpadded NORAD ID string.
const NORAD_OWNER_OVERRIDES: Record<string, string> = {
  '25544': 'ISS Partnership (NASA · Roscosmos · ESA · JAXA · CSA)',
}

function parseSatcatJson(rows: SatcatRow[]): Map<string, SatcatEntry> {
  const map = new Map<string, SatcatEntry>()
  for (const r of rows) {
    if (!r.norad_id) continue
    // Space-Track omits leading zeros (e.g. '6707'); TLE catalog pads to 5 digits ('06707').
    // Pad here so Map lookups using the TLE-derived NORAD ID always hit.
    const paddedId = r.norad_id.padStart(5, '0')
    const owner = NORAD_OWNER_OVERRIDES[r.norad_id] ?? OWNER_MAP[r.owner] ?? r.owner
    map.set(paddedId, {
      noradId: paddedId,
      intlDes: r.intl_des,
      objectType: r.type,
      opsStatus: r.decay ? 'decayed' : 'tracked',
      owner,
      launchDate: r.launch,
      launchSite: SITE_MAP[r.site] ?? (r.site || ''),
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
  if (!SATCAT_URL) return new Map()  // no CloudFront URL set (local dev without env var)
  try {
    const res = await fetch(SATCAT_URL)
    if (!res.ok) throw new Error(`satcat ${res.status}`)
    const rows: SatcatRow[] = await res.json()
    const map = parseSatcatJson(rows)
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
    // Space-Track derived
    'tracked': 'In orbit',
    'decayed': 'Decayed',
    // CelesTrak legacy codes (kept for cached data compatibility)
    '+': 'Operational', '-': 'Non-operational', 'P': 'Partially operational',
    'B': 'Standby', 'S': 'Spare', 'X': 'Extended mission', 'D': 'Decayed', '?': 'Unknown',
  }
  return map[status] ?? status
}
