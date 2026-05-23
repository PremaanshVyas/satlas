import * as THREE from 'three'

export class EarthMesh {
  readonly mesh: THREE.Mesh
  private material: THREE.MeshBasicMaterial

  constructor() {
    const geometry = new THREE.SphereGeometry(1, 128, 64)
    // Deep ocean dark — country fills sit on top at r=1.001
    this.material = new THREE.MeshBasicMaterial({ color: 0x060d18 })
    this.mesh = new THREE.Mesh(geometry, this.material)
  }

  // Kept for call-site compatibility; no-op in flat map style
  update(_sunDirection: THREE.Vector3): void {}

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
