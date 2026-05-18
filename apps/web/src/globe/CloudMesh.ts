import * as THREE from 'three'

// NASA Visible Earth cloud texture (same server as earth-day/night, always available)
const CLOUD_URL = '/textures/earth-clouds.jpg'

export class CloudMesh {
  readonly mesh: THREE.Mesh
  private material: THREE.MeshBasicMaterial
  private texture: THREE.Texture

  constructor() {
    const geometry = new THREE.SphereGeometry(1.012, 64, 32)
    const loader = new THREE.TextureLoader()
    this.texture = loader.load(CLOUD_URL)
    // White material + alphaMap: cloud density controls transparency.
    // AdditiveBlending: clouds brighten the surface beneath rather than darkening it.
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      alphaMap: this.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.75,
    })
    this.mesh = new THREE.Mesh(geometry, this.material)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
  }
}
