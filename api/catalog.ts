import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

const LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
// Active objects with recent TLEs: not decayed, epoch within last 60 days, up to 20k records
// format/3le returns name + TLE1 + TLE2 (3-line format). format/tle returns 2LE (no name),
// which breaks parseTleText() — it would treat TLE line 2 of sat N as the name of sat N+1.
const QUERY_URL =
  'https://www.space-track.org/basicspacedata/query/class/gp' +
  '/DECAY_DATE/null-val' +
  '/EPOCH/%3Enow-90' +
  '/orderby/NORAD_CAT_ID' +
  '/format/3le'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = process.env.SPACE_TRACK_USER
  const pass = process.env.SPACE_TRACK_PASS

  if (!user || !pass) {
    res.status(503).json({ error: 'Catalog service not configured' })
    return
  }

  try {
    // Authenticate — Space-Track uses cookie-based sessions
    const loginRes = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `identity=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`,
      signal: AbortSignal.timeout(10_000),
    })

    if (!loginRes.ok) {
      res.status(503).json({ error: `Space-Track login failed: ${loginRes.status}` })
      return
    }

    // Extract session cookie — handle both single and multiple Set-Cookie headers
    const rawCookies: string[] = loginRes.headers.getSetCookie
      ? loginRes.headers.getSetCookie()
      : [(loginRes.headers.get('set-cookie') ?? '')].filter(Boolean)

    if (!rawCookies.length) {
      res.status(503).json({ error: 'Space-Track did not return a session cookie' })
      return
    }

    const cookie = rawCookies.map(c => c.split(';')[0].trim()).join('; ')

    // Fetch TLE data
    const dataRes = await fetch(QUERY_URL, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(20_000),
    })

    if (!dataRes.ok) {
      res.status(503).json({ error: `Space-Track data fetch failed: ${dataRes.status}` })
      return
    }

    const text = await dataRes.text()
    if (text.length < 1000) {
      res.status(503).json({ error: 'Space-Track returned unexpectedly small response' })
      return
    }

    // Vercel edge caches this response for 2h — browsers get it in <100ms from the nearest edge node
    res.setHeader('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=86400')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.status(200).send(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    res.status(503).json({ error: `Catalog fetch failed: ${message}` })
  }
}
