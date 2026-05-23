import * as THREE from 'three'

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
  properties: Record<string, unknown> | null
}

export interface GeoJSONCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

// Render borders just above Earth surface (Earth r=1, clouds r=1.012)
const R = 1.002
const DEG = Math.PI / 180

function push3(arr: number[], lon: number, lat: number): void {
  const φ = lat * DEG, λ = lon * DEG
  arr.push(R * Math.cos(φ) * Math.cos(λ), R * Math.sin(φ), -R * Math.cos(φ) * Math.sin(λ))
}

export class CountryBorderMesh {
  readonly mesh: THREE.LineSegments

  constructor(geojson: GeoJSONCollection) {
    const positions: number[] = []

    for (const feature of geojson.features) {
      const geom = feature.geometry
      // Normalize Polygon and MultiPolygon to a flat list of rings
      const rings: number[][][] = geom.type === 'Polygon'
        ? (geom.coordinates as number[][][])
        : (geom.coordinates as number[][][][]).flat(1)

      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const [lon0, lat0] = ring[i]
          const [lon1, lat1] = ring[i + 1]
          // Skip edges that cross the antimeridian (|Δlon| > 180)
          if (Math.abs(lon1 - lon0) > 180) continue
          push3(positions, lon0, lat0)
          push3(positions, lon1, lat1)
        }
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const mat = new THREE.LineBasicMaterial({
      color: 0xaabfd4,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
    this.mesh = new THREE.LineSegments(geo, mat)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
