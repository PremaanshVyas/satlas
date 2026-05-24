import type { VercelRequest, VercelResponse } from '@vercel/node'
import catalogHandler from './catalog'

// Alias for /api/catalog — same handler, different URL.
// "/api/catalog" matches uBlock Origin ad-tracker filter rules, causing
// NS_BINDING_ABORTED at 0ms for affected users. The frontend fetches /api/tles;
// /api/catalog stays live for public API consumers.
export const config = { maxDuration: 30 }

export default function handler(req: VercelRequest, res: VercelResponse) {
  return catalogHandler(req, res)
}
