import * as THREE from 'three'
import type { GeoJSONFeature } from './CountryBorderMesh'

// Well above all other layers — only border lines, no fill
// Fill is deferred: polygon triangulation for large spherical polygons requires
// edge subdivision (<5° per segment) before earcut to prevent flat triangles
// dipping below the sphere surface (r=1.0) and failing depth test.
const BORDER_R = 1.004
const DEG = Math.PI / 180

function toVec3(lon: number, lat: number, r: number): [number, number, number] {
  const φ = lat * DEG, λ = lon * DEG
  return [r * Math.cos(φ) * Math.cos(λ), r * Math.sin(φ), -r * Math.cos(φ) * Math.sin(λ)]
}

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
      // Border lines for all rings (outer + holes)
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
        const border = new THREE.LineSegments(borderGeo, new THREE.LineBasicMaterial({ color: 0x00d4ff }))
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
