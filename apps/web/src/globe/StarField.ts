import * as THREE from 'three'

const STAR_COUNT = 8000
const STAR_RADIUS = 50

export class StarField {
  readonly points: THREE.Points

  constructor() {
    const positions = new Float32Array(STAR_COUNT * 3)
    const colors = new Float32Array(STAR_COUNT * 3)

    for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform distribution on sphere surface via rejection sampling
      let x, y, z, len
      do {
        x = Math.random() * 2 - 1
        y = Math.random() * 2 - 1
        z = Math.random() * 2 - 1
        len = Math.sqrt(x * x + y * y + z * z)
      } while (len > 1 || len < 0.001)
      const r = STAR_RADIUS / len
      positions[i * 3]     = x * r
      positions[i * 3 + 1] = y * r
      positions[i * 3 + 2] = z * r

      // Slight colour variation: mostly white, occasional blue-white or warm tints
      const tint = Math.random()
      if (tint < 0.15) {
        colors[i * 3] = 0.9; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 1.0  // blue-white
      } else if (tint < 0.25) {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.75 // warm orange
      } else {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 1.0; colors[i * 3 + 2] = 1.0  // pure white
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })

    this.points = new THREE.Points(geometry, material)
  }

  dispose(): void {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
  }
}
