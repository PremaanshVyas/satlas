import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

const ORBITAL_SERVICE_URL =
  process.env.ORBITAL_SERVICE_URL ??
  'http://satlas-1659207311.ap-southeast-2.elb.amazonaws.com'

const CLOUDFRONT_CATALOG =
  process.env.CLOUDFRONT_CATALOG ?? 'https://dgsll6twimcwl.cloudfront.net/catalog.tle'

const CATALOG_BASE = process.env.CATALOG_BASE ?? 'https://getsatlas.vercel.app'

const ALLOWED_ORIGINS = [
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
  return _catalog.find(r => r.noradId === noradId.trim()) ?? null
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
  if (norad_id) {
    const rec = await resolveTle(String(norad_id))
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
    res.status(200).json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    res.status(503).json({ error: `Pass prediction service unavailable: ${message}` })
  }
}
