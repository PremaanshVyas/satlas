import * as THREE from 'three'
import vertexShader from './shaders/atmosphere.vert.glsl?raw'
import fragmentShader from './shaders/atmosphere.frag.glsl?raw'

export class AtmosphereMesh {
  readonly mesh: THREE.Mesh

  constructor() {
    // Slightly larger than Earth (1.015 vs 1.0) — the rim glow sits just outside the surface
    const geometry = new THREE.SphereGeometry(1.015, 128, 64)
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.FrontSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.mesh = new THREE.Mesh(geometry, material)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
