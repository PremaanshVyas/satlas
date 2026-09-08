import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

// Catalog source is our own Vercel Blob copy, written once per hour by the scheduled
// GitHub Actions job that is the ONLY client allowed to query Space-Track. This endpoint
// must NEVER query Space-Track directly: when it did, every Vercel edge PoP re-fetched the
// full gp catalog on cache miss, which blew past Space-Track's one-query-per-hour limit
// and got the account suspended. Serving the Blob copy keeps /api/tles (and the internal
// ${CATALOG_BASE}/api/catalog callers) working with zero load on Space-Track.
// (Was S3 + CloudFront until the AWS account was suspended; only the storage moved.)
const CATALOG_URL =
  process.env.CATALOG_BLOB_URL ?? 'https://bop9747v4vkycovg.public.blob.vercel-storage.com/catalog.tle'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const upstream = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(20_000) })

    if (!upstream.ok) {
      res.status(503).json({ error: 'Catalog service temporarily unavailable.' })
      return
    }

    const text = await upstream.text()
    if (text.length < 1000) {
      res.status(503).json({ error: 'Catalog service temporarily unavailable.' })
      return
    }

    // Vercel edge caches this for 2h; the Blob store is CDN-backed too. The frontend may
    // additionally be pointed straight at the Blob URL via VITE_CATALOG_URL to skip this hop.
    res.setHeader('Cache-Control', 'public, s-maxage=7200, stale-while-revalidate=86400')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.status(200).send(text)
  } catch {
    res.status(503).json({ error: 'Catalog service temporarily unavailable.' })
  }
}
