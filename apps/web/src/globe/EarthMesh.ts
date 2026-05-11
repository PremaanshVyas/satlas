import * as THREE from 'three'
import vertexShader from './shaders/earth.vert.glsl?raw'
import fragmentShader from './shaders/earth.frag.glsl?raw'

export class EarthMesh {
  readonly mesh: THREE.Mesh
  private material: THREE.ShaderMaterial
  private dayTex: THREE.Texture
  private nightTex: THREE.Texture

  constructor() {
    const geometry = new THREE.SphereGeometry(1, 64, 64)
    const loader = new THREE.TextureLoader()
    this.dayTex = loader.load('/textures/earth-day.jpg')
    this.nightTex = loader.load('/textures/earth-night.jpg')

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: this.dayTex },
        nightTexture: { value: this.nightTex },
        sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader,
      fragmentShader,
    })

    this.mesh = new THREE.Mesh(geometry, this.material)
  }

  update(sunDirection: THREE.Vector3): void {
    this.material.uniforms.sunDirection.value.copy(sunDirection)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.dayTex.dispose()
    this.nightTex.dispose()
  }
}
