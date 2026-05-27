import { NORMALIZED_ALIASES } from '../lib/satelliteNames'

export interface SearchResult {
  name: string
  noradId: string
}

export interface SearchResults {
  results: SearchResult[]
  total: number
}

// Strip spaces, hyphens, underscores, brackets, dots, slashes so:
//   "starlink 1001" matches "STARLINK-1001"
//   "rb" / "r/b" both match "ATLAS V R/B"
const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_()[\]./]/g, '')

// Strip leading zeros for NORAD comparison so "6707" matches catalog entry "06707"
const stripLeadingZeros = (s: string) => s.replace(/^0+/, '') || '0'

// True if a single normalized token matches a normalized satellite name.
// Per-token alias prefix: "hubbl".startsWith() of "hubblespacetelescope" → resolves to "hst".
// This makes partial typing ("hubbl", "jam") resolve via aliases as the user types.
function tokenMatches(token: string, normName: string): boolean {
  if (normName.includes(token)) return true
  for (const [key, value] of NORMALIZED_ALIASES) {
    if (key.startsWith(token) && normName.includes(value)) return true
  }
  return false
}

export function matchSatelliteQuery(
  query: string,
  names: string[],
  noradIds: string[],
  maxResults: number,
): SearchResults {
  const q = query.trim().toLowerCase()
  if (!q) return { results: [], total: 0 }

  // Split on any delimiter; filter empties so "---" or "()" return nothing
  const rawTokens = q.split(/[\s\-_()[\].]+/).filter(Boolean)
  if (rawTokens.length === 0) return { results: [], total: 0 }

  // Deduplicate so "starlink starlink" costs the same as "starlink"
  const normTokens = [...new Set(rawTokens.map(normalize))]

  // Join tokens into one string to check multi-word alias prefixes.
  // "hubble spa" → "hubblspa" → prefix of "hubblespacetelescope" → finds HST.
  // This handles partial multi-word typing that per-token alone can't resolve.
  const normJoined = normTokens.join('')
  let joinedAliasValue: string | undefined
  for (const [key, value] of NORMALIZED_ALIASES) {
    if (key.startsWith(normJoined)) { joinedAliasValue = value; break }
  }

  // Pure-digit query → also check NORAD prefix (strip leading zeros on both sides)
  const isNumeric = /^\d+$/.test(q)
  const qNorad = isNumeric ? stripLeadingZeros(q) : ''

  const results: SearchResult[] = []
  let total = 0

  for (let i = 0; i < names.length; i++) {
    const name = names[i] ?? ''
    const noradId = noradIds[i] ?? ''
    const normName = normalize(name)

    // NORAD prefix: strip leading zeros so "6707" finds "06707"
    const noradMatch = isNumeric && stripLeadingZeros(noradId).startsWith(qNorad)
    // Per-token AND-logic with alias prefix expansion — "hubbl" finds HST, "jam" finds JWST
    const nameMatch = normTokens.every(t => tokenMatches(t, normName))
    // Joined-token alias — "hubble sp" joined is "hubblesp" → prefix of "hubblespacetelescope"
    const joinedMatch = joinedAliasValue !== undefined && normName.includes(joinedAliasValue)

    if (noradMatch || nameMatch || joinedMatch) {
      total++
      if (results.length < maxResults) results.push({ name, noradId })
    }
  }

  return { results, total }
}

// Single-satellite check — used by Globe.searchCatalog for the ISS special case.
export function matchesSatellite(query: string, name: string, noradId: string): boolean {
  return matchSatelliteQuery(query, [name], [noradId], 1).total > 0
}
