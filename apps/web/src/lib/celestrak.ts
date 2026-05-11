export interface TLERecord {
  name: string
  norad_id: string
  tle1: string
  tle2: string
}

export async function fetchSatelliteCatalog(baseUrl: string): Promise<TLERecord[]> {
  const response = await fetch(`${baseUrl}/satellites`)
  if (!response.ok) throw new Error(`Catalog fetch failed: ${response.status}`)
  return response.json() as Promise<TLERecord[]>
}
