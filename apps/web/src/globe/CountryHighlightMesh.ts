import * as THREE from 'three'
import earcut from 'earcut'
import type { GeoJSONFeature } from './CountryBorderMesh'
import { toVec3, subdivideRing, refineTris } from './sphereUtils'

const FILL_R = 1.0022
const BORDER_R = 1.004
const MAX_ARC_DEG = 4

export class CountryHighlightMesh {
  private scene: THREE.Object3D
  private meshes: THREE.Object3D[] = []

  constructor(scene: THREE.Object3D) {
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
        const refined = refineTris(fillFlat, rawTris, MAX_ARC_DEG)

        const fillVerts: number[] = []
        for (let i = 0; i < fillFlat.length; i += 2) {
          const [x, y, z] = toVec3(fillFlat[i], fillFlat[i + 1], FILL_R)
          fillVerts.push(x, y, z)
        }

        const fillGeo = new THREE.BufferGeometry()
        fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fillVerts, 3))
        fillGeo.setIndex(refined)
        // Stencil prevents additive stacking when a country has multiple sub-polygons
        // (e.g. Russia's Arctic islands overlapping the mainland in screen space).
        // Three.js clears stencil to 0 before each frame. First fill pixel at any
        // screen position writes stencil=1; subsequent fill fragments at that pixel
        // fail NotEqual and are discarded → each pixel rendered exactly once.
        const fillMat = new THREE.MeshBasicMaterial({
          color: 0x00d4ff,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
          stencilWrite: true,
          stencilRef: 1,
          stencilFunc: THREE.NotEqualStencilFunc,
          stencilZPass: THREE.ReplaceStencilOp,
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
