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

    // Held at the edge for 30 min. The refresh job publishes hourly, so a 2h cache meant
    // the globe could sit two hours behind a catalog we were spending Space-Track queries
    // to keep fresh, and a correctness fix took that long to reach anyone.
    //
    // Shortening this is safe for compliance precisely because of the rule at the top of
    // this file: a cache miss here re-reads the Blob copy, never Space-Track. Cache misses
    // fanning out to Space-Track is the thing that got the account suspended, and that path
    // no longer exists. More misses cost Blob reads, not query budget.
    //
    // stale-while-revalidate keeps the endpoint instant across the turnover: the first
    // request after expiry is served the old copy while the new one is fetched behind it.
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.status(200).send(text)
  } catch {
    res.status(503).json({ error: 'Catalog service temporarily unavailable.' })
  }
}
