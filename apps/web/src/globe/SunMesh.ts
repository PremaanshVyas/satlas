import * as THREE from 'three'

// Sun is placed at 80 scene units in the real astronomical direction.
// Three concentric spheres (core + two halos) give a simple glow without post-processing.
const SUN_DISTANCE = 80

export class SunMesh {
  private group: THREE.Group
  private meshes: THREE.Mesh[]

  constructor() {
    this.group = new THREE.Group()

    const layers: [number, number, number, number][] = [
      // [radius, color, opacity, depthWrite]
      [2.2,  0xfffbe8, 1.0,  1],  // core — bright warm white
      [4.0,  0xffd060, 0.35, 0],  // inner halo — golden yellow
      [7.5,  0xff9900, 0.10, 0],  // outer corona — orange, very transparent
    ]

    this.meshes = layers.map(([r, color, opacity, dw]) => {
      const geo = new THREE.SphereGeometry(r, 16, 8)
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: !!dw,
      })
      const mesh = new THREE.Mesh(geo, mat)
      this.group.add(mesh)
      return mesh
    })
  }

  update(sunDirection: THREE.Vector3): void {
    this.group.position.copy(sunDirection).multiplyScalar(SUN_DISTANCE)
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group)
  }

  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.group)
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
  }
}
