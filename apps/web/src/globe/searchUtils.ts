export interface SearchResult {
  name: string
  noradId: string
}

export function matchSatelliteQuery(
  query: string,
  names: string[],
  noradIds: string[],
  maxResults: number,
): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const results: SearchResult[] = []
  for (let i = 0; i < names.length; i++) {
    const name = names[i] ?? ''
    const noradId = noradIds[i] ?? ''
    if (name.toLowerCase().includes(q) || noradId.startsWith(q)) {
      results.push({ name, noradId })
      if (results.length >= maxResults) break
    }
  }
  return results
}
