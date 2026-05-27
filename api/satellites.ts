import type { VercelRequest, VercelResponse } from '@vercel/node'

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

interface SatRecord { name: string; noradId: string; category: Category }

function classify(name: string): Category {
  const n = name.toUpperCase()
  if (n.startsWith('STARLINK')) return 'STARLINK'
  if (n.startsWith('GPS') || n.includes('NAVSTAR') || n.startsWith('BIIF') || n.startsWith('BIII')) return 'GPS'
  if (n.startsWith('IRIDIUM')) return 'IRIDIUM'
  if (n.includes(' DEB') || n.endsWith(' DEB') || n.includes('DEBRIS') || n.includes('R/B') || n.includes('ROCKET BODY')) return 'DEBRIS'
  return 'OTHER'
}

function parseCatalog(text: string): SatRecord[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const out: SatRecord[] = []
  for (let i = 0; i + 2 < lines.length; i++) {
    const name = lines[i].replace(/^0 /, ''), tle1 = lines[i + 1]
    if (tle1.startsWith('1 ')) {
      out.push({ name, noradId: tle1.slice(2, 7).trim(), category: classify(name) })
      i += 2
    }
  }
  return out
}

let _cache: SatRecord[] | null = null
let _fetchedAt = 0

async function getCatalog(): Promise<SatRecord[]> {
  const now = Date.now()
  if (_cache && now - _fetchedAt < 120_000) return _cache
  const cfFetch = fetch(CLOUDFRONT_CATALOG, { signal: AbortSignal.timeout(8_000) })
    .then(r => r.ok ? r.text() : Promise.reject(new Error(`CF ${r.status}`)))
  const apiFetch = fetch(`${CATALOG_BASE}/api/catalog`, { signal: AbortSignal.timeout(10_000) })
    .then(r => r.ok ? r.text() : Promise.reject(new Error(`API ${r.status}`)))
  const text = await Promise.any([cfFetch, apiFetch])
  _cache = parseCatalog(text)
  _fetchedAt = now
  return _cache
}

const MAX_QUERY_LEN = 200

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

  const { q, category, limit: limitParam = '20' } = req.query

  if (!q && !category) {
    res.status(400).json({
      error: 'Provide at least one of: q (name substring or NORAD ID) or category (STARLINK | GPS | IRIDIUM | DEBRIS | OTHER)',
    })
    return
  }

  const catFilter = category ? String(category).toUpperCase() as Category : null
  if (catFilter && !CATEGORIES.includes(catFilter)) {
    res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` })
    return
  }

  const limit = Math.min(Math.max(1, parseInt(String(limitParam), 10) || 20), 100)

  if (q && String(q).length > MAX_QUERY_LEN) {
    res.status(400).json({ error: `Query too long (max ${MAX_QUERY_LEN} characters).` })
    return
  }

  try {
    const catalog = await getCatalog()
    let results = catalog

    if (catFilter) {
      results = results.filter(r => r.category === catFilter)
    }

    if (q) {
      const query = String(q).trim()
      if (/^\d+$/.test(query)) {
        // NORAD ID — exact integer match to handle leading-zero variants
        const queryInt = parseInt(query, 10)
        results = results.filter(r => parseInt(r.noradId, 10) === queryInt)
      } else {
        const qLower = query.toLowerCase()
        results = results.filter(r => r.name.toLowerCase().includes(qLower))
      }
    }

    // 2-min cache — catalog refreshes every 2h, no need to serve stale faster
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300')
    res.status(200).json({
      total: results.length,
      limit,
      results: results.slice(0, limit).map(r => ({
        name:     r.name,
        norad_id: r.noradId,
        category: r.category,
      })),
    })
  } catch {
    res.status(503).json({ error: 'Catalog unavailable — please try again.' })
  }
}
