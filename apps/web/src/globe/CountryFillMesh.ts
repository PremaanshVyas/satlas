import * as THREE from 'three'
import earcut from 'earcut'
import type { GeoJSONCollection } from './CountryBorderMesh'
import { toVec3, subdivideRing, refineTris } from './sphereUtils'

// Just above Earth surface (r=1.0), below graticule (r=1.0015) and borders (r=1.002)
const R = 1.001
const MAX_ARC_DEG = 4

export class CountryFillMesh {
  readonly mesh: THREE.Mesh

  constructor(geojson: GeoJSONCollection) {
    const allVerts: number[] = []
    const allIndices: number[] = []

    for (const feature of geojson.features) {
      const geom = feature.geometry
      const polygons: number[][][][] = geom.type === 'Polygon'
        ? [(geom.coordinates as number[][][])]
        : (geom.coordinates as number[][][][])

      for (const rings of polygons) {
        const flat: number[] = []
        const holeIndices: number[] = []

        for (let r = 0; r < rings.length; r++) {
          const sub = subdivideRing(rings[r], MAX_ARC_DEG)
          if (r > 0) holeIndices.push(flat.length / 2)
          for (const pt of sub) flat.push(pt[0], pt[1])
        }

        const rawTris = earcut(flat, holeIndices.length > 0 ? holeIndices : undefined, 2)
        if (rawTris.length === 0) continue

        const refined = refineTris(flat, rawTris, MAX_ARC_DEG)

        const base = allVerts.length / 3
        for (let i = 0; i < flat.length; i += 2) {
          const [x, y, z] = toVec3(flat[i], flat[i + 1], R)
          allVerts.push(x, y, z)
        }
        for (const idx of refined) allIndices.push(base + idx)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(allVerts, 3))
    geo.setIndex(allIndices)

    const mat = new THREE.MeshBasicMaterial({
      color: 0x0d2040,
      depthWrite: false,
      side: THREE.FrontSide,
    })

    this.mesh = new THREE.Mesh(geo, mat)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
