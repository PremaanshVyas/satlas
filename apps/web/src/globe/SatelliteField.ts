import * as THREE from 'three'
import vertexShader from './shaders/satellite.vert.glsl?raw'
import fragmentShader from './shaders/satellite.frag.glsl?raw'

export const DEFAULT_COLOR = new THREE.Color(0x00d4ff)

// Base disc diameter in scene units (globe radius = 1).
// Matches the previous SphereGeometry radius of 0.005 so hit-test math is unchanged.
const DOT_SIZE = 0.010

export class SatelliteField {
  readonly mesh: THREE.InstancedMesh
  private readonly mat: THREE.ShaderMaterial
  private dummy = new THREE.Object3D()

  constructor(count: number) {
    // Unit plane — the vertex shader billboards it toward the camera each frame.
    const geo = new THREE.PlaneGeometry(1, 1)

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uSize:    { value: DOT_SIZE },
        uOpacity: { value: 0.85 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    })

    this.mesh = new THREE.InstancedMesh(geo, this.mat, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    // Pre-init instanceColor to DEFAULT_COLOR (blue). Buffer stays non-null always
    // to avoid null→non-null VAO rebinding bugs when colours change later.
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, DEFAULT_COLOR)
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  update(buffer: Float32Array, activeMask?: Uint8Array | null, scales?: Float32Array | null): void {
    const count = buffer.length / 3
    for (let i = 0; i < count; i++) {
      if (activeMask && !activeMask[i]) {
        this.dummy.position.set(0, 0, 0)
        this.dummy.scale.set(0, 0, 0)
      } else {
        const s = scales ? scales[i] : 1.0
        this.dummy.position.set(buffer[i * 3], buffer[i * 3 + 1], buffer[i * 3 + 2])
        this.dummy.scale.set(s, s, s)
      }
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  // Color each instance by category. catColors=null resets all to default blue.
  setCategoryColors(catMap: string[], catColors: Record<string, THREE.Color> | null): void {
    const count = this.mesh.count
    if (catColors === null) {
      for (let i = 0; i < count; i++) this.mesh.setColorAt(i, DEFAULT_COLOR)
    } else {
      for (let i = 0; i < count; i++) {
        const c = catColors[catMap[i]]
        this.mesh.setColorAt(i, c ?? DEFAULT_COLOR)
      }
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  // Set the colour of a single instance (used for hover / selection highlight).
  setInstanceColor(idx: number, color: THREE.Color): void {
    this.mesh.setColorAt(idx, color)
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}
