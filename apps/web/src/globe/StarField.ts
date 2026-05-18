import * as THREE from 'three'

// Three size tiers give the illusion of depth without a texture asset.
// Background: dense, tiny, dim.  Mid: moderate density, normal size.  Bright: sparse, large.
const TIERS = [
  { count: 44000, size: 0.055, opacity: 0.65 },
  { count:  5000, size: 0.11,  opacity: 0.85 },
  { count:   300, size: 0.20,  opacity: 1.00 },
]
const STAR_RADIUS = 90

function randomOnSphere(): [number, number, number] {
  let x, y, z, len
  do {
    x = Math.random() * 2 - 1
    y = Math.random() * 2 - 1
    z = Math.random() * 2 - 1
    len = Math.sqrt(x * x + y * y + z * z)
  } while (len > 1 || len < 0.001)
  const r = STAR_RADIUS / len
  return [x * r, y * r, z * r]
}

function starColor(colors: Float32Array, base: number): void {
  const tint = Math.random()
  if (tint < 0.08) {
    // Hot blue-white (O/B type)
    colors[base] = 0.75; colors[base + 1] = 0.85; colors[base + 2] = 1.0
  } else if (tint < 0.18) {
    // Warm orange-red (K/M type)
    colors[base] = 1.0; colors[base + 1] = 0.75; colors[base + 2] = 0.55
  } else if (tint < 0.26) {
    // Yellow-white (F/G type like our sun)
    colors[base] = 1.0; colors[base + 1] = 0.97; colors[base + 2] = 0.82
  } else {
    // Pure white (A type, most common appearance)
    colors[base] = 1.0; colors[base + 1] = 1.0; colors[base + 2] = 1.0
  }
}

export class StarField {
  private tiers: THREE.Points[]

  get points(): THREE.Points {
    return this.tiers[0]
  }

  constructor() {
    this.tiers = TIERS.map(({ count, size, opacity }) => {
      const positions = new Float32Array(count * 3)
      const colors = new Float32Array(count * 3)

      for (let i = 0; i < count; i++) {
        const [x, y, z] = randomOnSphere()
        positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z
        starColor(colors, i * 3)
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      const mat = new THREE.PointsMaterial({
        size,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity,
        depthWrite: false,
      })

      return new THREE.Points(geo, mat)
    })
  }

  addToScene(scene: THREE.Scene): void {
    for (const tier of this.tiers) scene.add(tier)
  }

  removeFromScene(scene: THREE.Scene): void {
    for (const tier of this.tiers) scene.remove(tier)
  }

  dispose(): void {
    for (const tier of this.tiers) {
      tier.geometry.dispose()
      ;(tier.material as THREE.Material).dispose()
    }
  }
}
