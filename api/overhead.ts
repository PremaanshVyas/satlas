import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as satellite from 'satellite.js'

export const config = { maxDuration: 30 }

const CLOUDFRONT_CATALOG = process.env.CLOUDFRONT_CATALOG ?? 'https://dgsll6twimcwl.cloudfront.net/catalog.tle'
const CATALOG_BASE = process.env.CATALOG_BASE ?? 'https://satlas.app'

// ── Rate limiting (in-process, per warm instance) ─────────────────────────────
const RATE_WINDOW_MS = 60_000
const RATE_MAX_REQ = 60
const _ipWindows = new Map<string, { count: number; resetAt: number }>()
let _callsSincePurge = 0
function checkRateLimit(ip: string): boolean {
  if (++_callsSincePurge > 300) {
    const now = Date.now()
    for (const [k, v] of _ipWindows) if (now > v.resetAt) _ipWindows.delete(k)
    _callsSincePurge = 0
  }
  const now = Date.now()
  const entry = _ipWindows.get(ip)
  if (!entry || now > entry.resetAt) { _ipWindows.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true }
  if (entry.count >= RATE_MAX_REQ) return false
  entry.count++
  return true
}

const CATEGORIES = ['STARLINK', 'GPS', 'IRIDIUM', 'DEBRIS', 'OTHER'] as const
type Category = typeof CATEGORIES[number]

interface TleRecord { name: string; noradId: string; tle1: string; tle2: string; category: Category }

function classify(name: string): Category {
  const n = name.toUpperCase()
  if (n.startsWith('STARLINK')) return 'STARLINK'
  if (n.startsWith('GPS') || n.includes('NAVSTAR') || n.startsWith('BIIF') || n.startsWith('BIII')) return 'GPS'
  if (n.startsWith('IRIDIUM')) return 'IRIDIUM'
  if (n.includes(' DEB') || n.endsWith(' DEB') || n.includes('DEBRIS') || n.includes('R/B') || n.includes('ROCKET BODY')) return 'DEBRIS'
  return 'OTHER'
}

function parseTles(text: string): TleRecord[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const out: TleRecord[] = []
  for (let i = 0; i + 2 < lines.length; i++) {
    const name = lines[i].replace(/^0 /, ''), tle1 = lines[i + 1], tle2 = lines[i + 2]
    if (tle1.startsWith('1 ') && tle2.startsWith('2 ')) {
      out.push({ name, noradId: tle1.slice(2, 7).trim(), tle1, tle2, category: classify(name) })
      i += 2
    }
  }
  return out
}

let _cache: TleRecord[] | null = null
let _fetchedAt = 0

async function getCatalog(): Promise<TleRecord[]> {
  const now = Date.now()
  if (_cache && now - _fetchedAt < 120_000) return _cache
  const cfFetch = fetch(CLOUDFRONT_CATALOG, { signal: AbortSignal.timeout(8_000) })
    .then(r => r.ok ? r.text() : Promise.reject(new Error(`CF ${r.status}`)))
  const apiFetch = fetch(`${CATALOG_BASE}/api/catalog`, { signal: AbortSignal.timeout(10_000) })
    .then(r => r.ok ? r.text() : Promise.reject(new Error(`API ${r.status}`)))
  const text = await Promise.any([cfFetch, apiFetch])
  _cache = parseTles(text)
  _fetchedAt = now
  return _cache
}

function azToCompass(azDeg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(((azDeg % 360) + 360) / 22.5) % 16]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const ip = (req.headers['x-forwarded-for'] as string ?? '').split(',')[0].trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Too many requests — please wait a moment.' })
    return
  }

  const { latitude, longitude, min_elevation = '10', category, limit: limitParam = '25' } = req.query

  if (!latitude || !longitude) {
    res.status(400).json({ error: 'latitude and longitude are required' })
    return
  }

  const lat = parseFloat(String(latitude))
  const lon = parseFloat(String(longitude))
  if (isNaN(lat) || lat < -90 || lat > 90)  { res.status(400).json({ error: 'latitude must be -90 to 90' }); return }
  if (isNaN(lon) || lon < -180 || lon > 180) { res.status(400).json({ error: 'longitude must be -180 to 180' }); return }

  const minEl = Math.max(-90, Math.min(90, parseFloat(String(min_elevation)) || 10))
  const limit  = Math.min(Math.max(1, parseInt(String(limitParam), 10) || 25), 50)

  const catFilter = category ? String(category).toUpperCase() as Category : null
  if (catFilter && !CATEGORIES.includes(catFilter)) {
    res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` })
    return
  }

  try {
    const catalog = await getCatalog()
    const pool = catFilter ? catalog.filter(r => r.category === catFilter) : catalog

    const observerGd = {
      latitude:  satellite.degreesToRadians(lat),
      longitude: satellite.degreesToRadians(lon),
      height: 0.01,
    }
    const now  = new Date()
    const gmst = satellite.gstime(now)

    const results: Array<{
      name: string; norad_id: string; category: Category
      elevation_deg: number; azimuth_deg: number; direction: string
    }> = []

    for (const rec of pool) {
      try {
        const satrec = satellite.twoline2satrec(rec.tle1, rec.tle2)
        const posVel = satellite.propagate(satrec, now)
        if (!posVel.position || typeof posVel.position === 'boolean') continue
        const ecf  = satellite.eciToEcf(posVel.position as satellite.EciVec3<number>, gmst)
        const look = satellite.ecfToLookAngles(observerGd, ecf)
        const elDeg = look.elevation * (180 / Math.PI)
        if (elDeg < minEl) continue
        const azDeg = look.azimuth * (180 / Math.PI)
        results.push({
          name:          rec.name,
          norad_id:      rec.noradId,
          category:      rec.category,
          elevation_deg: Math.round(elDeg * 10) / 10,
          azimuth_deg:   Math.round(((azDeg % 360) + 360) * 10) / 10,
          direction:     azToCompass(azDeg),
        })
      } catch { continue }
    }

    results.sort((a, b) => b.elevation_deg - a.elevation_deg)

    // Short TTL — positions change every second
    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30')
    res.status(200).json({
      location:   { latitude: lat, longitude: lon },
      count:      results.length,
      limit,
      satellites: results.slice(0, limit),
    })
  } catch {
    res.status(503).json({ error: 'Overhead computation failed — please try again.' })
  }
}
