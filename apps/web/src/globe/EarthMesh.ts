import * as THREE from 'three'
import vertexShader from './shaders/earth.vert.glsl?raw'
import fragmentShader from './shaders/earth.frag.glsl?raw'

export class EarthMesh {
  readonly mesh: THREE.Mesh
  private photoMaterial: THREE.ShaderMaterial
  private darkMaterial: THREE.MeshBasicMaterial
  private dayTex: THREE.Texture
  private nightTex: THREE.Texture
  readonly specularTex: THREE.Texture
  readonly normalTex: THREE.Texture

  constructor(renderer: THREE.WebGLRenderer) {
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

    this.specularTex = loader.load('/textures/earth-specular.jpg')
    this.specularTex.anisotropy = maxAnisotropy
    this.specularTex.minFilter = THREE.LinearMipmapLinearFilter
    this.specularTex.magFilter = THREE.LinearFilter

    this.normalTex = loader.load('/textures/earth-normal.jpg')
    this.normalTex.anisotropy = maxAnisotropy
    this.normalTex.minFilter = THREE.LinearMipmapLinearFilter
    this.normalTex.magFilter = THREE.LinearFilter

    this.photoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture:   { value: this.dayTex },
        nightTexture: { value: this.nightTex },
        specularMap:  { value: this.specularTex },
        normalMap:    { value: this.normalTex },
        sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader,
      fragmentShader,
    })

    // Ocean dark for border/map mode — fills sit on top at r=1.001
    this.darkMaterial = new THREE.MeshBasicMaterial({ color: 0x060d18 })

    this.mesh = new THREE.Mesh(geometry, this.photoMaterial)
  }

  update(sunDirection: THREE.Vector3): void {
    if (this.mesh.material === this.photoMaterial) {
      this.photoMaterial.uniforms.sunDirection.value.copy(sunDirection)
    }
  }

  setMapMode(on: boolean): void {
    this.mesh.material = on ? this.darkMaterial : this.photoMaterial
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.photoMaterial.dispose()
    this.darkMaterial.dispose()
    this.dayTex.dispose()
    this.nightTex.dispose()
    this.specularTex.dispose()
    this.normalTex.dispose()
  }
}
