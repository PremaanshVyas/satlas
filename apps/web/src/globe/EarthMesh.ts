import * as THREE from 'three'
import vertexShader from './shaders/earth.vert.glsl?raw'
import fragmentShader from './shaders/earth.frag.glsl?raw'

export class EarthMesh {
  readonly mesh: THREE.Mesh
  private material: THREE.ShaderMaterial
  private dayTex: THREE.Texture
  private nightTex: THREE.Texture
  // Preloaded for sun feature — specular (ocean=bright/land=dark) and normal map (terrain bumps)
  readonly specularTex: THREE.Texture
  readonly normalTex: THREE.Texture

  constructor(renderer: THREE.WebGLRenderer) {
    // 128×64 segments: smoother limb curve visible at close zoom
    const geometry = new THREE.SphereGeometry(1, 128, 64)
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
    const loader = new THREE.TextureLoader()

    this.dayTex = loader.load('/textures/earth-day.jpg')
    this.dayTex.anisotropy = maxAnisotropy
    this.dayTex.minFilter = THREE.LinearMipmapLinearFilter
    this.dayTex.magFilter = THREE.LinearFilter
    this.dayTex.colorSpace = THREE.SRGBColorSpace

    this.nightTex = loader.load('/textures/earth-night.jpg')
    this.nightTex.anisotropy = maxAnisotropy
    this.nightTex.minFilter = THREE.LinearMipmapLinearFilter
    this.nightTex.magFilter = THREE.LinearFilter
    this.nightTex.colorSpace = THREE.SRGBColorSpace

    // Specular: ocean=white (shiny), land=black (matte) — drives ocean glint in sun shader
    this.specularTex = loader.load('/textures/earth-specular.jpg')
    this.specularTex.anisotropy = maxAnisotropy
    this.specularTex.minFilter = THREE.LinearMipmapLinearFilter
    this.specularTex.magFilter = THREE.LinearFilter

    // Normal: terrain bump detail for realistic sun-angle shading
    this.normalTex = loader.load('/textures/earth-normal.jpg')
    this.normalTex.anisotropy = maxAnisotropy
    this.normalTex.minFilter = THREE.LinearMipmapLinearFilter
    this.normalTex.magFilter = THREE.LinearFilter

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture:    { value: this.dayTex },
        nightTexture:  { value: this.nightTex },
        specularMap:   { value: this.specularTex },
        normalMap:     { value: this.normalTex },
        sunDirection:  { value: new THREE.Vector3(1, 0, 0) },
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
    this.specularTex.dispose()
    this.normalTex.dispose()
  }
}
