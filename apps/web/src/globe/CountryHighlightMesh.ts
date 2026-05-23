import * as THREE from 'three'
import earcut from 'earcut'
import type { GeoJSONFeature } from './CountryBorderMesh'

const FILL_R = 1.0022
const BORDER_R = 1.004
const MAX_ARC_DEG = 4   // max edge arc before subdivision / split
const DEG = Math.PI / 180

// ─── sphere helpers ──────────────────────────────────────────────────────────

function toUnit(lon: number, lat: number): [number, number, number] {
  const φ = lat * DEG, λ = lon * DEG
  return [Math.cos(φ) * Math.cos(λ), Math.sin(φ), -Math.cos(φ) * Math.sin(λ)]
}

function toVec3(lon: number, lat: number, r: number): [number, number, number] {
  const [x, y, z] = toUnit(lon, lat)
  return [x * r, y * r, z * r]
}

function unitToLL(v: [number, number, number]): [number, number] {
  return [
    Math.atan2(-v[2], v[0]) / DEG,
    Math.asin(Math.max(-1, Math.min(1, v[1]))) / DEG,
  ]
}

function arcDeg(lon0: number, lat0: number, lon1: number, lat1: number): number {
  const a = toUnit(lon0, lat0), b = toUnit(lon1, lat1)
  const d = Math.max(-1, Math.min(1, a[0]*b[0] + a[1]*b[1] + a[2]*b[2]))
  return Math.acos(d) / DEG
}

// SLERP midpoint (t=0.5) of two unit vectors; result is unit length.
function slerpMid(lon0: number, lat0: number, lon1: number, lat1: number): [number, number] {
  const a = toUnit(lon0, lat0), b = toUnit(lon1, lat1)
  const dot = Math.max(-1, Math.min(1, a[0]*b[0] + a[1]*b[1] + a[2]*b[2]))
  const theta = Math.acos(dot)
  if (theta < 1e-10) return [(lon0 + lon1) * 0.5, (lat0 + lat1) * 0.5]
  const f = Math.sin(0.5 * theta) / Math.sin(theta)
  return unitToLL([(a[0]+b[0])*f, (a[1]+b[1])*f, (a[2]+b[2])*f])
}

// ─── ring subdivision ────────────────────────────────────────────────────────
// Inserts SLERP-interpolated points on every edge that exceeds maxDeg of arc.

function subdivideRing(ring: number[][], maxDeg: number): number[][] {
  const out: number[][] = []
  for (let i = 0; i < ring.length - 1; i++) {
    out.push(ring[i])
    const [lon0, lat0] = ring[i]
    const [lon1, lat1] = ring[i + 1]
    if (Math.abs(lon1 - lon0) > 180) continue   // antimeridian skip
    const arc = arcDeg(lon0, lat0, lon1, lat1)
    if (arc <= maxDeg) continue
    const a = toUnit(lon0, lat0), b = toUnit(lon1, lat1)
    const dot = Math.max(-1, Math.min(1, a[0]*b[0] + a[1]*b[1] + a[2]*b[2]))
    const theta = Math.acos(dot)
    const sinT = Math.sin(theta)
    const n = Math.ceil(arc / maxDeg)
    for (let j = 1; j < n; j++) {
      const t = j / n
      const wa = Math.sin((1 - t) * theta) / sinT
      const wb = Math.sin(t * theta) / sinT
      out.push(unitToLL([a[0]*wa + b[0]*wb, a[1]*wa + b[1]*wb, a[2]*wa + b[2]*wb]))
    }
  }
  out.push(ring[ring.length - 1])
  return out
}

// ─── triangle refinement ─────────────────────────────────────────────────────
// Splits any earcut triangle whose longest edge exceeds maxDeg.
// Mutates `flat` by appending midpoint vertices as needed.
// Uses an edge cache so adjacent triangles sharing a split edge get the same midpoint (no cracks).

function refineTris(flat: number[], tris: number[], maxDeg: number): number[] {
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

    // Find longest edge [ea, eb] with opposite vertex ec
    let ea: number, eb: number, ec: number
    if (d01 >= d12 && d01 >= d20) [ea, eb, ec] = [i0, i1, i2]
    else if (d12 >= d20)           [ea, eb, ec] = [i1, i2, i0]
    else                           [ea, eb, ec] = [i2, i0, i1]

    // Reuse midpoint if this edge was already split by an adjacent triangle
    const key = ea < eb ? `${ea},${eb}` : `${eb},${ea}`
    let iMid = edgeCache.get(key)
    if (iMid === undefined) {
      const [mLon, mLat] = slerpMid(flat[2*ea], flat[2*ea+1], flat[2*eb], flat[2*eb+1])
      iMid = flat.length / 2
      flat.push(mLon, mLat)
      edgeCache.set(key, iMid)
    }

    // Two new triangles; re-push so they're checked again if still too large
    queue.push(ea, iMid, ec, iMid, eb, ec)
  }

  return result
}

// ─── main class ──────────────────────────────────────────────────────────────

export class CountryHighlightMesh {
  private scene: THREE.Scene
  private meshes: THREE.Object3D[] = []

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  update(feature: GeoJSONFeature): void {
    this.clear()

    const geom = feature.geometry
    const polygons: number[][][][] = geom.type === 'Polygon'
      ? [(geom.coordinates as number[][][])]
      : (geom.coordinates as number[][][][])

    for (const polygon of polygons) {
      // ── fill ──────────────────────────────────────────────────────────────
      const fillFlat: number[] = []
      const holeIndices: number[] = []

      for (let r = 0; r < polygon.length; r++) {
        const sub = subdivideRing(polygon[r], MAX_ARC_DEG)
        if (r > 0) holeIndices.push(fillFlat.length / 2)
        for (const pt of sub) fillFlat.push(pt[0], pt[1])
      }

      const rawTris = earcut(fillFlat, holeIndices.length ? holeIndices : undefined, 2)
      if (rawTris.length > 0) {
        // fillFlat may grow during refinement; capture vertex array after
        const refined = refineTris(fillFlat, rawTris, MAX_ARC_DEG)

        const fillVerts: number[] = []
        for (let i = 0; i < fillFlat.length; i += 2) {
          const [x, y, z] = toVec3(fillFlat[i], fillFlat[i + 1], FILL_R)
          fillVerts.push(x, y, z)
        }

        const fillGeo = new THREE.BufferGeometry()
        fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fillVerts, 3))
        fillGeo.setIndex(refined)
        const fillMat = new THREE.MeshBasicMaterial({
          color: 0x00d4ff,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
          side: THREE.FrontSide,
        })
        const fill = new THREE.Mesh(fillGeo, fillMat)
        this.scene.add(fill)
        this.meshes.push(fill)
      }

      // ── border ────────────────────────────────────────────────────────────
      const borderPos: number[] = []
      for (const ring of polygon) {
        for (let i = 0; i < ring.length - 1; i++) {
          const [lon0, lat0] = ring[i]
          const [lon1, lat1] = ring[i + 1]
          if (Math.abs(lon1 - lon0) > 180) continue
          const [x0, y0, z0] = toVec3(lon0, lat0, BORDER_R)
          const [x1, y1, z1] = toVec3(lon1, lat1, BORDER_R)
          borderPos.push(x0, y0, z0, x1, y1, z1)
        }
      }
      if (borderPos.length > 0) {
        const borderGeo = new THREE.BufferGeometry()
        borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(borderPos, 3))
        const border = new THREE.LineSegments(
          borderGeo,
          new THREE.LineBasicMaterial({ color: 0x00d4ff }),
        )
        this.scene.add(border)
        this.meshes.push(border)
      }
    }
  }

  clear(): void {
    for (const obj of this.meshes) {
      this.scene.remove(obj)
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose()
        ;(obj.material as THREE.Material).dispose()
      }
    }
    this.meshes = []
  }
}
