import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as satellite from 'satellite.js'

export const config = { maxDuration: 30 }

// ── Solar / shadow helpers ────────────────────────────────────────────────────

const DEG = Math.PI / 180
const R_EARTH_KM = 6371.0

function toJd(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5
}

// Sun ECI unit vector (Meeus simplified)
function sunEciUnit(jd: number): { x: number; y: number; z: number } {
  const T = (jd - 2451545.0) / 36525.0
  const L0 = (280.46646 + 36000.76983 * T) % 360
  const Mrad = ((357.52911 + 35999.05029 * T) % 360) * DEG
  const C = (1.914602 - 0.004817 * T) * Math.sin(Mrad)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad)
          + 0.000289 * Math.sin(3 * Mrad)
  const lon = (L0 + C) * DEG
  const eps = (23.439291 - 0.013004 * T) * DEG
  return {
    x: Math.cos(lon),
    y: Math.cos(eps) * Math.sin(lon),
    z: Math.sin(eps) * Math.sin(lon),
  }
}

// Sun elevation at observer (degrees, negative = below horizon)
function sunElevationDeg(date: Date, latDeg: number, lonDeg: number): number {
  const sun = sunEciUnit(toJd(date))
  const gmst = satellite.gstime(date)
  const latRad = latDeg * DEG, lonRad = lonDeg * DEG
  const cx = Math.cos(latRad) * Math.cos(lonRad)
  const cy = Math.cos(latRad) * Math.sin(lonRad)
  const cz = Math.sin(latRad)
  // ECEF → ECI: rotate by GMST around Z
  const ex = cx * Math.cos(gmst) - cy * Math.sin(gmst)
  const ey = cx * Math.sin(gmst) + cy * Math.cos(gmst)
  const dot = sun.x * ex + sun.y * ey + sun.z * cz
  return Math.asin(Math.max(-1, Math.min(1, dot))) / DEG
}

// Cylindrical Earth shadow check (sat pos in km ECI, sun is unit vector)
function inEarthShadow(satPos: { x: number; y: number; z: number }, sun: { x: number; y: number; z: number }): boolean {
  const proj = satPos.x * sun.x + satPos.y * sun.y + satPos.z * sun.z
  if (proj >= 0) return false  // satellite on sun-facing side
  const r2 = satPos.x ** 2 + satPos.y ** 2 + satPos.z ** 2
  return r2 - proj * proj < R_EARTH_KM * R_EARTH_KM
}

function skyCondition(sunElev: number): string {
  if (sunElev > 0)   return 'Day'
  if (sunElev > -6)  return 'Civil Twilight'
  if (sunElev > -12) return 'Nautical Twilight'
  if (sunElev > -18) return 'Astronomical Twilight'
  return 'Night'
}

function computeVisibilityScore(sunElev: number, illuminated: boolean, maxElev: number): { score: number; label: string } {
  const skyFactor = sunElev > 0 ? 0
    : sunElev > -6  ? 0.08
    : sunElev > -12 ? 0.35
    : sunElev > -18 ? 0.65
    : 0.90
  if (skyFactor === 0 || !illuminated) return { score: 0, label: 'None' }
  const elevFactor = 0.5 + 0.5 * Math.min(1, maxElev / 90)
  const score = Math.min(100, Math.round(skyFactor * elevFactor * 100))
  const label = score >= 70 ? 'Excellent' : score >= 45 ? 'Good' : score >= 20 ? 'Fair' : 'Poor'
  return { score, label }
}

const ORBITAL_SERVICE_URL =
  process.env.ORBITAL_SERVICE_URL ??
  'https://api.satlas.app'

const CLOUDFRONT_CATALOG =
  process.env.CLOUDFRONT_CATALOG ?? 'https://dgsll6twimcwl.cloudfront.net/catalog.tle'

const CATALOG_BASE = process.env.CATALOG_BASE ?? 'https://satlas.app'

const ALLOWED_ORIGINS = [
  'https://satlas.app',
  'https://getsatlas.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

// ── TLE cache (2-min in-process, same pattern as chat.ts) ────────────────────

interface TleRecord { name: string; noradId: string; tle1: string; tle2: string }

function parseTleText(text: string): TleRecord[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const out: TleRecord[] = []
  let i = 0
  while (i + 2 < lines.length) {
    const name = lines[i], tle1 = lines[i + 1], tle2 = lines[i + 2]
    if (tle1.startsWith('1 ') && tle2.startsWith('2 ')) {
      out.push({ name: name.replace(/^0 /, ''), noradId: tle1.slice(2, 7).trim(), tle1, tle2 })
      i += 3
    } else { i++ }
  }
  return out
}

let _catalog: TleRecord[] | null = null
let _fetchedAt = 0

async function resolveTle(noradId: string): Promise<TleRecord | null> {
  const now = Date.now()
  if (!_catalog || now - _fetchedAt > 120_000) {
    // Race CloudFront (fast from edge) against /api/catalog (authoritative)
    const cfFetch = fetch(CLOUDFRONT_CATALOG, { signal: AbortSignal.timeout(8_000) })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`CF ${r.status}`)))
    const apiFetch = fetch(`${CATALOG_BASE}/api/catalog`, { signal: AbortSignal.timeout(10_000) })
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`API ${r.status}`)))
    const text = await Promise.any([cfFetch, apiFetch])
    _catalog = parseTleText(text)
    _fetchedAt = now
  }
  const targetId = parseInt(noradId.trim(), 10)
  return _catalog.find(r => parseInt(r.noradId, 10) === targetId) ?? null
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin ?? ''
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { latitude, longitude, hours_ahead = '24', norad_id } = req.query

  if (!latitude || !longitude) {
    res.status(400).json({ error: 'latitude and longitude are required' })
    return
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hours_ahead: String(hours_ahead),
  })

  // Resolve TLE here so ECS doesn't need to do a catalog lookup.
  // This sidesteps ECS catalog epoch limits (30d) vs frontend catalog (60d).
  let rec: TleRecord | null = null
  if (norad_id) {
    rec = await resolveTle(String(norad_id))
    if (!rec) {
      res.status(404).json({ error: `Satellite ${norad_id} not found in catalog` })
      return
    }
    params.set('tle1', rec.tle1)
    params.set('tle2', rec.tle2)
    params.set('name', rec.name)
  }

  try {
    const upstream = await fetch(
      `${ORBITAL_SERVICE_URL}/predict-passes?${params}`,
      { signal: AbortSignal.timeout(25_000) },
    )
    const data = await upstream.json()
    if (!upstream.ok) {
      res.status(upstream.status).json(data)
      return
    }

    // Augment passes with solar visibility data
    if (rec && Array.isArray(data.passes) && data.passes.length > 0) {
      const satrec = satellite.twoline2satrec(rec.tle1, rec.tle2)
      const latNum = parseFloat(String(latitude))
      const lonNum = parseFloat(String(longitude))

      data.passes = data.passes.map((p: { start_utc: string; end_utc: string; max_elevation_deg: number; direction: string }) => {
        const midMs = (new Date(p.start_utc).getTime() + new Date(p.end_utc).getTime()) / 2
        const midDate = new Date(midMs)
        const jd = toJd(midDate)
        const sun = sunEciUnit(jd)
        const sunElev = sunElevationDeg(midDate, latNum, lonNum)

        let illuminated = true
        const posVel = satellite.propagate(satrec, midDate)
        if (posVel.position && typeof posVel.position !== 'boolean') {
          illuminated = !inEarthShadow(posVel.position as satellite.EciVec3<number>, sun)
        }

        const { score, label } = computeVisibilityScore(sunElev, illuminated, p.max_elevation_deg)
        return {
          ...p,
          sun_elevation_deg: Math.round(sunElev * 10) / 10,
          satellite_illuminated: illuminated,
          sky_condition: skyCondition(sunElev),
          visibility_score: score,
          visibility_label: label,
        }
      })
    }

    res.status(200).json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    res.status(503).json({ error: `Pass prediction service unavailable: ${message}` })
  }
}
