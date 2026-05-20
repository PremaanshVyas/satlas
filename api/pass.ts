import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

const ORBITAL_SERVICE_URL =
  process.env.ORBITAL_SERVICE_URL ??
  'http://satlas-1659207311.ap-southeast-2.elb.amazonaws.com'

const ALLOWED_ORIGINS = [
  'https://getsatlas.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

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
  if (norad_id) params.set('norad_id', String(norad_id))

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
