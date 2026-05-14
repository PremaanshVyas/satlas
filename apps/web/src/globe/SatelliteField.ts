import * as THREE from 'three'

const DEFAULT_COLOR = new THREE.Color(0x60a5fa)
const WHITE = new THREE.Color(1, 1, 1)

export class SatelliteField {
  readonly mesh: THREE.InstancedMesh
  private readonly mat: THREE.MeshBasicMaterial
  private dummy = new THREE.Object3D()

  constructor(count: number) {
    const geo = new THREE.SphereGeometry(0.005, 6, 6)
    this.mat = new THREE.MeshBasicMaterial({ color: DEFAULT_COLOR, transparent: true, opacity: 0.7 })
    this.mesh = new THREE.InstancedMesh(geo, this.mat, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Pre-init instanceColor to WHITE so the buffer is always live.
    // mat.color × WHITE = mat.color visually. Keeping the buffer non-null avoids
    // null→non-null VAO rebinding issues when setCategoryColors is called later.
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, WHITE)
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

  // Color each instance by category. catColors=null resets to default blue.
  // When active: mat=white so instanceColor shows through unmodified.
  // When cleared: mat=DEFAULT_COLOR, instanceColor=all-white → blue.
  setCategoryColors(catMap: string[], catColors: Record<string, THREE.Color> | null): void {
    const count = this.mesh.count
    if (catColors === null) {
      this.mat.color.set(DEFAULT_COLOR)
      for (let i = 0; i < count; i++) this.mesh.setColorAt(i, WHITE)
    } else {
      this.mat.color.set(0xffffff)
      for (let i = 0; i < count; i++) {
        const c = catColors[catMap[i]]
        this.mesh.setColorAt(i, c ?? DEFAULT_COLOR)
      }
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}
