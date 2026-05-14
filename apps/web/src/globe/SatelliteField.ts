import * as THREE from 'three'

const DEFAULT_COLOR = new THREE.Color(0x60a5fa)
const DIM_COLOR = new THREE.Color(0x1e3a5f)

export class SatelliteField {
  readonly mesh: THREE.InstancedMesh
  private readonly mat: THREE.MeshBasicMaterial
  private dummy = new THREE.Object3D()

  constructor(count: number) {
    const geo = new THREE.SphereGeometry(0.005, 6, 6)
    // Material stays white permanently — instanceColor provides the per-instance colour.
    // Never toggling material colour avoids Three.js shader recompilation on every highlight change.
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
    this.mesh = new THREE.InstancedMesh(geo, this.mat, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Pre-initialise instanceColor so the buffer is always live and never needs to be
    // null → non-null transitioned (which causes WebGL VAO rebinding bugs after filter toggles).
    for (let i = 0; i < count; i++) {
      this.mesh.setColorAt(i, DEFAULT_COLOR)
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  update(buffer: Float32Array, activeMask?: Uint8Array | null): void {
    const count = buffer.length / 3
    for (let i = 0; i < count; i++) {
      if (activeMask && !activeMask[i]) {
        this.dummy.position.set(0, 0, 0)
        this.dummy.scale.set(0, 0, 0)
      } else {
        this.dummy.position.set(buffer[i * 3], buffer[i * 3 + 1], buffer[i * 3 + 2])
        this.dummy.scale.set(1, 1, 1)
      }
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  // Sets per-instance colours for a group highlight.
  // highlightMask[i] === 1 → highlightColor, 0 → DIM_COLOR, null → DEFAULT_COLOR (clear).
  setGroupHighlight(highlightMask: Uint8Array | null, highlightColor: THREE.Color): void {
    const count = this.mesh.count
    for (let i = 0; i < count; i++) {
      this.mesh.setColorAt(
        i,
        highlightMask === null ? DEFAULT_COLOR : highlightMask[i] ? highlightColor : DIM_COLOR,
      )
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}
