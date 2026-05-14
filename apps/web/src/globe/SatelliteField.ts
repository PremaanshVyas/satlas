import * as THREE from 'three'

const DEFAULT_COLOR = new THREE.Color(0x60a5fa)
const DIM_COLOR = new THREE.Color(0x1e3a5f)
const WHITE = new THREE.Color(1, 1, 1)

export class SatelliteField {
  readonly mesh: THREE.InstancedMesh
  private readonly mat: THREE.MeshBasicMaterial
  private dummy = new THREE.Object3D()

  constructor(count: number) {
    const geo = new THREE.SphereGeometry(0.005, 6, 6)
    // Material stays DEFAULT_COLOR permanently.
    this.mat = new THREE.MeshBasicMaterial({ color: DEFAULT_COLOR, transparent: true, opacity: 0.7 })
    this.mesh = new THREE.InstancedMesh(geo, this.mat, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Pre-initialise instanceColor to WHITE so the buffer is always live.
    // DEFAULT_COLOR (mat) × WHITE (instanceColor) = DEFAULT_COLOR visually — identical to no instanceColor.
    // Keeping the buffer alive avoids null → non-null VAO rebinding issues after filter toggles.
    for (let i = 0; i < count; i++) {
      this.mesh.setColorAt(i, WHITE)
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

  // Apply a group highlight: highlighted instances get highlightColor, others DIM_COLOR.
  // Pass null to clear — resets all to WHITE so material colour (blue) shows through unchanged.
  setGroupHighlight(highlightMask: Uint8Array | null, highlightColor: THREE.Color): void {
    const count = this.mesh.count
    if (highlightMask === null) {
      this.mat.color.set(DEFAULT_COLOR)
      for (let i = 0; i < count; i++) this.mesh.setColorAt(i, WHITE)
    } else {
      this.mat.color.set(0xffffff)
      for (let i = 0; i < count; i++) {
        this.mesh.setColorAt(i, highlightMask[i] ? highlightColor : DIM_COLOR)
      }
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}
