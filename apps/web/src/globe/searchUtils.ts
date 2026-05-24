export interface SearchResult {
  name: string
  noradId: string
}

export interface SearchResults {
  results: SearchResult[]
  total: number
}

export function matchSatelliteQuery(
  query: string,
  names: string[],
  noradIds: string[],
  maxResults: number,
): SearchResults {
  const q = query.trim().toLowerCase()
  if (!q) return { results: [], total: 0 }
  const results: SearchResult[] = []
  let total = 0
  for (let i = 0; i < names.length; i++) {
    const name = names[i] ?? ''
    const noradId = noradIds[i] ?? ''
    if (name.toLowerCase().includes(q) || noradId.startsWith(q)) {
      total++
      if (results.length < maxResults) results.push({ name, noradId })
    }
  }
  return { results, total }
}
