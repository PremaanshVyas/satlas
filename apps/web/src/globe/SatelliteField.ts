import * as THREE from 'three'

export const DEFAULT_COLOR = new THREE.Color(0x60a5fa)

export class SatelliteField {
  readonly mesh: THREE.InstancedMesh
  private readonly mat: THREE.MeshBasicMaterial
  private dummy = new THREE.Object3D()

  constructor(count: number) {
    const geo = new THREE.SphereGeometry(0.005, 6, 6)
    // Mat stays white always — all coloring is done via instanceColor so individual
    // instances can be recoloured (hover, selection, category highlight) without
    // changing the shared material. mat × instanceColor = instanceColor when mat=white.
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
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
  // Mat is always white — instanceColor is the sole source of per-dot colour.
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
