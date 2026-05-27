import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as satellite from 'satellite.js'

export const config = { maxDuration: 30 }

const CLOUDFRONT_CATALOG = process.env.CLOUDFRONT_CATALOG ?? 'https://dgsll6twimcwl.cloudfront.net/catalog.tle'

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

const MAX_QUERY_LEN = 200

interface TleRecord { name: string; noradId: string; tle1: string; tle2: string }

function parseTleText(text: string): TleRecord[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const out: TleRecord[] = []
  let i = 0
  while (i + 2 < lines.length) {
    const name = lines[i], tle1 = lines[i + 1], tle2 = lines[i + 2]
    if (tle1.startsWith('1 ') && tle2.startsWith('2 ')) {
      out.push({ name, noradId: tle1.slice(2, 7).trim(), tle1, tle2 })
      i += 3
    } else { i++ }
  }
  return out
}

let _cache: TleRecord[] | null = null
let _cacheAt = 0

async function fetchTle(query: string): Promise<TleRecord | null> {
  const now = Date.now()
  if (!_cache || now - _cacheAt > 120_000) {
    const res = await fetch(CLOUDFRONT_CATALOG, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const tles = parseTleText(await res.text())
    _cache = tles.map(r => ({ ...r, name: r.name.replace(/^0 /, '') }))
    _cacheAt = now
  }
  const isNorad = /^\d+$/.test(query.trim())
  if (isNorad) {
    const queryInt = parseInt(query.trim(), 10)
    return _cache.find(r => parseInt(r.noradId, 10) === queryInt) ?? null
  }
  const q = query.trim().toUpperCase()
  return _cache.find(r => r.name.toUpperCase().includes(q)) ?? null
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

  const { query } = req.query
  if (!query) {
    res.status(400).json({ error: 'query parameter is required (satellite name or NORAD ID)' })
    return
  }
  const queryStr = String(query).trim()
  if (queryStr.length > MAX_QUERY_LEN) {
    res.status(400).json({ error: `Query too long (max ${MAX_QUERY_LEN} characters).` })
    return
  }

  try {
    const rec = await fetchTle(queryStr)
    if (!rec) { res.status(404).json({ error: 'Satellite not found.' }); return }

    const satrec = satellite.twoline2satrec(rec.tle1, rec.tle2)
    const now = new Date()
    const posVel = satellite.propagate(satrec, now)
    if (!posVel.position || typeof posVel.position === 'boolean') {
      res.status(500).json({ error: 'Could not compute orbital position.' }); return
    }

    const gmst = satellite.gstime(now)
    const geo = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, gmst)
    const vel = posVel.velocity as satellite.EciVec3<number>
    const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2)
    const period = (2 * Math.PI / satrec.no) / 60

    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30')
    res.status(200).json({
      name: rec.name,
      norad_id: rec.noradId,
      latitude:  Math.round(satellite.degreesLat(geo.latitude)  * 10000) / 10000,
      longitude: Math.round(satellite.degreesLong(geo.longitude) * 10000) / 10000,
      altitude_km: Math.round(geo.height * 10) / 10,
      velocity_kmps: Math.round(speed * 100) / 100,
      orbital_period_min: Math.round(period * 10) / 10,
      inclination_deg: Math.round(satrec.inclo * (180 / Math.PI) * 100) / 100,
    })
  } catch {
    res.status(503).json({ error: 'Satellite info unavailable — please try again.' })
  }
}
