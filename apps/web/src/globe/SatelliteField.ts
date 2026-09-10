import * as THREE from 'three'
import vertexShader from './shaders/satellite.vert.glsl?raw'
import fragmentShader from './shaders/satellite.frag.glsl?raw'

export const DEFAULT_COLOR = new THREE.Color(0x00d4ff)

// Base disc diameter in scene units (globe radius = 1).
// Matches the previous SphereGeometry radius of 0.005 so hit-test math is unchanged.
const DOT_SIZE = 0.010

/**
 * The satellite dot field.
 *
 * Positions live in instanced attributes rather than the instance matrix, and the vertex
 * shader interpolates between the previous and current set. Two problems drove that:
 *
 *  1. Rebuilding an instance matrix per satellite meant ~34,000 matrix compositions and
 *     copies on the MAIN thread every time the propagator replied — a visible hitch, and
 *     it grew with the catalog. Writing an attribute is a memcpy instead.
 *
 *  2. Positions only changed when the worker replied (~every 35ms for the full catalog)
 *     while the scene renders at 60fps, so motion advanced in steps. At 1x the step is too
 *     small to notice; at 100x each step is 100x larger and reads as stutter. Interpolating
 *     on the GPU decouples smoothness from how fast the propagator can run.
 */
export class SatelliteField {
  readonly mesh: THREE.InstancedMesh
  private readonly mat: THREE.ShaderMaterial
  private readonly aPos: THREE.InstancedBufferAttribute
  private readonly aPrev: THREE.InstancedBufferAttribute
  private readonly aScale: THREE.InstancedBufferAttribute
  private readonly count: number
  private seeded = false

  constructor(count: number) {
    // Unit plane — the vertex shader billboards it toward the camera each frame.
    const geo = new THREE.PlaneGeometry(1, 1)

    this.count = count
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    this.aPrev = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    // Default scale 1 so a field renders correctly even before any visibility pass.
    this.aScale = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1)
    this.aPos.setUsage(THREE.DynamicDrawUsage)
    this.aPrev.setUsage(THREE.DynamicDrawUsage)
    this.aScale.setUsage(THREE.DynamicDrawUsage)

    geo.setAttribute('aPos', this.aPos)
    geo.setAttribute('aPrev', this.aPrev)
    geo.setAttribute('aScale', this.aScale)

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uSize:    { value: DOT_SIZE },
        uOpacity: { value: 0.85 },
        uLerp:    { value: 1 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    })

    this.mesh = new THREE.InstancedMesh(geo, this.mat, count)

    // The instance matrix is no longer the source of position, so three.js cannot derive a
    // meaningful bounding volume from it and would cull the entire field. The field spans
    // the whole scene anyway, so culling it as one object was never useful.
    this.mesh.frustumCulled = false

    // Pre-init instanceColor to DEFAULT_COLOR (blue). Buffer stays non-null always
    // to avoid null→non-null VAO rebinding bugs when colours change later.
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, DEFAULT_COLOR)
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  /**
   * Publish a new set of positions. The outgoing set becomes the interpolation origin, so
   * the shader can walk from where the dots currently are to where they belong.
   */
  setPositions(buffer: Float32Array): void {
    const pos = this.aPos.array as Float32Array
    const prev = this.aPrev.array as Float32Array

    // A delta catalog refresh can hand over a slightly different object count while reusing
    // this field, so copy what fits rather than dropping the frame. Any instance past the
    // end of the new set keeps its last position and is hidden by setVisibility, which
    // reads a short mask as "inactive".
    const src = buffer.length > pos.length ? buffer.subarray(0, pos.length) : buffer

    if (!this.seeded) {
      // First frame has no history. Starting from zero would fling every satellite out of
      // the centre of the Earth, so begin already at the target.
      prev.set(src)
      this.seeded = true
    } else {
      // Continue from where the dots are actually being DRAWN, not from the previous
      // target. Those differ whenever a set lands earlier or later than the cadence
      // estimate predicted, and taking the old target instead would teleport every dot
      // across the remaining gap. Folding the current lerp into prev makes the motion
      // continuous no matter how wrong the estimate was: a bad estimate can only vary the
      // speed slightly, never break the path.
      const t = this.mat.uniforms.uLerp.value as number
      if (t >= 1) prev.set(pos)
      else if (t > 0) for (let i = 0; i < prev.length; i++) prev[i] += (pos[i] - prev[i]) * t
    }

    pos.set(src)
    this.aPrev.needsUpdate = true
    this.aPos.needsUpdate = true
  }

  /**
   * Per-instance scale, where 0 hides the dot. Separate from positions because category
   * filters change rarely while positions change many times a second.
   */
  setVisibility(activeMask?: Uint8Array | null, scales?: Float32Array | null): void {
    const arr = this.aScale.array as Float32Array
    for (let i = 0; i < this.count; i++) {
      arr[i] = activeMask && !activeMask[i] ? 0 : (scales ? scales[i] : 1)
    }
    this.aScale.needsUpdate = true
  }

  /** Interpolation factor, 0 at the previous set and 1 at the current one. */
  setLerp(t: number): void {
    this.mat.uniforms.uLerp.value = t < 0 ? 0 : t > 1 ? 1 : t
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
