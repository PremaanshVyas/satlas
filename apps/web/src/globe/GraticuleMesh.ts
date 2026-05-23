import * as THREE from 'three'

// Above country fills (r=1.001), below borders (r=1.002)
const R = 1.0015
const DEG = Math.PI / 180

function push3(arr: number[], lon: number, lat: number): void {
  const φ = lat * DEG, λ = lon * DEG
  arr.push(R * Math.cos(φ) * Math.cos(λ), R * Math.sin(φ), -R * Math.cos(φ) * Math.sin(λ))
}

export class GraticuleMesh {
  readonly mesh: THREE.LineSegments

  constructor() {
    const positions: number[] = []
    const SEG = 180  // 2° per segment — smooth curves

    // Latitude lines every 30° from -60 to 60 (skip poles — they look odd)
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let i = 0; i < SEG; i++) {
        const lon0 = -180 + (i / SEG) * 360
        const lon1 = -180 + ((i + 1) / SEG) * 360
        push3(positions, lon0, lat)
        push3(positions, lon1, lat)
      }
    }

    // Longitude lines every 30° — full meridians from -90 to 90
    for (let lon = -180; lon < 180; lon += 30) {
      for (let i = 0; i < SEG; i++) {
        const lat0 = -90 + (i / SEG) * 180
        const lat1 = -90 + ((i + 1) / SEG) * 180
        push3(positions, lon, lat0)
        push3(positions, lon, lat1)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

    const mat = new THREE.LineBasicMaterial({
      color: 0x4a6680,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })

    this.mesh = new THREE.LineSegments(geo, mat)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
