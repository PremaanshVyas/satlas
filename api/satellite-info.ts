import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

const ORBITAL_SERVICE_URL =
  process.env.ORBITAL_SERVICE_URL ?? 'https://api.satlas.app'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { query } = req.query
  if (!query) {
    res.status(400).json({ error: 'query parameter is required (satellite name or NORAD ID)' })
    return
  }

  try {
    const upstream = await fetch(
      `${ORBITAL_SERVICE_URL}/satellite-info?query=${encodeURIComponent(String(query))}`,
      { signal: AbortSignal.timeout(10_000) },
    )
    const data = await upstream.json()
    if (!upstream.ok) {
      res.status(upstream.status).json(data)
      return
    }
    // Short cache — position changes every second, but stale-while-revalidate keeps latency low
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30')
    res.status(200).json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    res.status(503).json({ error: `Satellite info unavailable: ${message}` })
  }
}
