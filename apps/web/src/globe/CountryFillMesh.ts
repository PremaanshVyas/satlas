import * as THREE from 'three'
import earcut from 'earcut'
import type { GeoJSONCollection } from './CountryBorderMesh'

// Just above Earth surface (r=1.0), below graticule (r=1.0015) and borders (r=1.002)
const R = 1.001
const DEG = Math.PI / 180

function pushVert(arr: number[], lon: number, lat: number): void {
  const φ = lat * DEG, λ = lon * DEG
  arr.push(R * Math.cos(φ) * Math.cos(λ), R * Math.sin(φ), -R * Math.cos(φ) * Math.sin(λ))
}

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
        const base = allVerts.length / 3

        // Flatten outer ring + holes for earcut (lon, lat pairs)
        const flat: number[] = []
        const holeIndices: number[] = []

        for (let r = 0; r < rings.length; r++) {
          if (r > 0) holeIndices.push(flat.length / 2)
          for (const pt of rings[r]) flat.push(pt[0], pt[1])
        }

        const tris = earcut(flat, holeIndices.length > 0 ? holeIndices : undefined, 2)
        if (tris.length === 0) continue

        // Convert flat 2D coords → 3D sphere verts
        for (let i = 0; i < flat.length; i += 2) {
          pushVert(allVerts, flat[i], flat[i + 1])
        }
        for (const idx of tris) allIndices.push(base + idx)
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
