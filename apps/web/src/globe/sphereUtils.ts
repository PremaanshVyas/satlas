// Shared spherical geometry helpers used by CountryFillMesh and CountryHighlightMesh.
// Subdivision inserts flat lon/lat midpoints (not great-circle SLERP) so that fill
// follows the actual polygon boundary in geographic space. Each subdivided vertex is
// then projected onto the sphere at radius r via toVec3, keeping all triangle edges
// above the Earth surface (r=1.0) and passing the WebGL depth test.

const DEG = Math.PI / 180

export function toUnit(lon: number, lat: number): [number, number, number] {
  const φ = lat * DEG, λ = lon * DEG
  return [Math.cos(φ) * Math.cos(λ), Math.sin(φ), -Math.cos(φ) * Math.sin(λ)]
}

export function toVec3(lon: number, lat: number, r: number): [number, number, number] {
  const [x, y, z] = toUnit(lon, lat)
  return [x * r, y * r, z * r]
}

export function arcDeg(lon0: number, lat0: number, lon1: number, lat1: number): number {
  const a = toUnit(lon0, lat0), b = toUnit(lon1, lat1)
  const d = Math.max(-1, Math.min(1, a[0]*b[0] + a[1]*b[1] + a[2]*b[2]))
  return Math.acos(d) / DEG
}

// Insert flat-interpolated points on every edge that exceeds maxDeg of arc.
// Flat (linear lon/lat) interpolation keeps subdivided boundary edges on the actual
// polygon path; SLERP (great-circle) would bulge outward at high latitudes (e.g.
// Russia's 80°N coast would extend into the Arctic Ocean).
// Skips antimeridian-crossing edges (|Δlon| > 180).
export function subdivideRing(ring: number[][], maxDeg: number): number[][] {
  const out: number[][] = []
  for (let i = 0; i < ring.length - 1; i++) {
    out.push(ring[i])
    const [lon0, lat0] = ring[i]
    const [lon1, lat1] = ring[i + 1]
    if (Math.abs(lon1 - lon0) > 180) continue
    const arc = arcDeg(lon0, lat0, lon1, lat1)
    if (arc <= maxDeg) continue
    const n = Math.ceil(arc / maxDeg)
    for (let j = 1; j < n; j++) {
      const t = j / n
      out.push([lon0 + (lon1 - lon0) * t, lat0 + (lat1 - lat0) * t])
    }
  }
  out.push(ring[ring.length - 1])
  return out
}

// Split any earcut triangle whose longest edge exceeds maxDeg.
// Mutates `flat` (appending midpoint vertices). Uses an edge cache so adjacent
// triangles sharing a split edge get the same midpoint vertex (no mesh cracks).
// Midpoints use flat lon/lat interpolation for the same boundary-accuracy reason
// as subdivideRing.
export function refineTris(flat: number[], tris: number[], maxDeg: number): number[] {
  const edgeCache = new Map<string, number>()
  const queue: number[] = [...tris]
  const result: number[] = []

  while (queue.length > 0) {
    const i2 = queue.pop()!, i1 = queue.pop()!, i0 = queue.pop()!
    const lon0 = flat[2*i0], lat0 = flat[2*i0+1]
    const lon1 = flat[2*i1], lat1 = flat[2*i1+1]
    const lon2 = flat[2*i2], lat2 = flat[2*i2+1]
    const d01 = arcDeg(lon0, lat0, lon1, lat1)
    const d12 = arcDeg(lon1, lat1, lon2, lat2)
    const d20 = arcDeg(lon2, lat2, lon0, lat0)

    if (Math.max(d01, d12, d20) <= maxDeg) {
      result.push(i0, i1, i2)
      continue
    }

    let ea: number, eb: number, ec: number
    if (d01 >= d12 && d01 >= d20) [ea, eb, ec] = [i0, i1, i2]
    else if (d12 >= d20)           [ea, eb, ec] = [i1, i2, i0]
    else                           [ea, eb, ec] = [i2, i0, i1]

    const key = ea < eb ? `${ea},${eb}` : `${eb},${ea}`
    let iMid = edgeCache.get(key)
    if (iMid === undefined) {
      const mLon = (flat[2*ea] + flat[2*eb]) * 0.5
      const mLat = (flat[2*ea+1] + flat[2*eb+1]) * 0.5
      iMid = flat.length / 2
      flat.push(mLon, mLat)
      edgeCache.set(key, iMid)
    }

    queue.push(ea, iMid, ec, iMid, eb, ec)
  }

  return result
}
