export interface SearchResult {
  name: string
  noradId: string
}

export interface SearchResults {
  results: SearchResult[]
  total: number
}

// Strip spaces, hyphens, underscores, brackets, dots so "starlink 1001" matches "STARLINK-1001"
const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_()\[\].]/g, '')

// Strip leading zeros for NORAD comparison so "6707" matches catalog entry "06707"
const stripLeadingZeros = (s: string) => s.replace(/^0+/, '') || '0'

export function matchSatelliteQuery(
  query: string,
  names: string[],
  noradIds: string[],
  maxResults: number,
): SearchResults {
  const q = query.trim().toLowerCase()
  if (!q) return { results: [], total: 0 }

  // Split on any delimiter; filter empties so "---" or "()" return nothing
  const rawTokens = q.split(/[\s\-_()\[\].]+/).filter(Boolean)
  if (rawTokens.length === 0) return { results: [], total: 0 }

  // Deduplicate so "starlink starlink" costs the same as "starlink"
  const normTokens = [...new Set(rawTokens.map(normalize))]

  // Pure-digit query → also check NORAD prefix (strip leading zeros on both sides)
  const isNumeric = /^\d+$/.test(q)
  const qNorad = isNumeric ? stripLeadingZeros(q) : ''

  const results: SearchResult[] = []
  let total = 0

  for (let i = 0; i < names.length; i++) {
    const name = names[i] ?? ''
    const noradId = noradIds[i] ?? ''
    const normName = normalize(name)

    // NORAD prefix: strip leading zeros so "6707" finds "06707" (same fix as fetchTle S23/S37)
    const noradMatch = isNumeric && stripLeadingZeros(noradId).startsWith(qNorad)
    // Name token match: ALL tokens must appear in the normalized name (Google AND-logic)
    // Runs for every query including numeric ones — "1001" finds "STARLINK-1001" via name
    const nameMatch = normTokens.every(t => normName.includes(t))

    if (noradMatch || nameMatch) {
      total++
      if (results.length < maxResults) results.push({ name, noradId })
    }
  }

  return { results, total }
}
