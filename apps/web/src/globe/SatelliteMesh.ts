import * as THREE from 'three'
import * as satellite from 'satellite.js'

const PULSE_DURATION_MS = 1000
const PULSE_SCALE = 1.6
const PULSE_REPEATS = 3
const R_EARTH_KM = 6371.0

export class SatelliteMesh {
  readonly group: THREE.Group
  private dot: THREE.Mesh
  private halo: THREE.Mesh
  private arc: THREE.LineLoop
  private satrec: satellite.SatRec
  private pulseStartTime: number | null = null

  constructor(tle1: string, tle2: string) {
    this.satrec = satellite.twoline2satrec(tle1, tle2)
    this.group = new THREE.Group()

    this.dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
    )

    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.2 }),
    )

    this.arc = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(this.computeArcPoints()),
      new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.5 }),
    )

    this.group.add(this.dot, this.halo, this.arc)
  }

  // Dot position: ECEF (Earth-fixed) so it appears over the correct geography.
  private toThreePosition(date: Date): THREE.Vector3 | null {
    const posVel = satellite.propagate(this.satrec, date)
    if (typeof posVel.position === 'boolean') return null

    const gmst = satellite.gstime(date)
    const geo = satellite.eciToGeodetic(
      posVel.position as satellite.EciVec3<number>,
      gmst,
    )

    const lat = geo.latitude  // radians
    const lon = geo.longitude // radians
    const r = 1.06

    return new THREE.Vector3(
       r * Math.cos(lat) * Math.cos(lon),
       r * Math.sin(lat),
      -r * Math.cos(lat) * Math.sin(lon),
    )
  }

  // Orbital ring: ECI (inertial) space — a closed ellipse fixed relative to the stars.
  // We intentionally skip GMST rotation here. ECEF ground tracks are open curves
  // because the Earth rotates ~22.9° per ISS orbital period. ECI orbits are always
  // closed. The dot (ECEF) and ring (ECI) are in different frames by design:
  // the ring shows the orbital plane; the dot shows the current ground position.
  private computeArcPoints(): THREE.Vector3[] {
    const periodMs = (2 * Math.PI / this.satrec.no) * 60 * 1000
    const now = new Date()
    const points: THREE.Vector3[] = []

    for (let i = 0; i < 180; i++) {
      const t = new Date(now.getTime() + (i / 180) * periodMs)
      const posVel = satellite.propagate(this.satrec, t)
      if (typeof posVel.position === 'boolean') continue

      const pos = posVel.position as satellite.EciVec3<number>
      const mag = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2)
      if (mag < 1) continue

      // ECI → Three.js: X stays, Z (north celestial pole) → Y, Y → −Z
      // Radius in Earth-radii units (ISS ≈ 1.064), preserving true orbital altitude
      const r = mag / R_EARTH_KM
      points.push(new THREE.Vector3(
         (pos.x / mag) * r,
         (pos.z / mag) * r,
        -(pos.y / mag) * r,
      ))
    }
    return points
  }

  getCurrentPosition(): THREE.Vector3 | null {
    return this.toThreePosition(new Date())
  }

  updateTle(tle1: string, tle2: string): void {
    this.satrec = satellite.twoline2satrec(tle1, tle2)
    // Recompute orbital ring immediately — new TLE means new orbital elements
    this.arc.geometry.setFromPoints(this.computeArcPoints())
  }

  startPulse(): void {
    this.pulseStartTime = performance.now()
  }

  update(date: Date): void {
    const pos = this.toThreePosition(date)
    if (pos) {
      this.dot.position.copy(pos)
      this.halo.position.copy(pos)
    }

    // Pulse animation: scale halo 1.0 → PULSE_SCALE → 1.0 for PULSE_REPEATS cycles
    if (this.pulseStartTime !== null) {
      const elapsed = performance.now() - this.pulseStartTime
      const cycleIndex = Math.floor(elapsed / PULSE_DURATION_MS)

      if (cycleIndex >= PULSE_REPEATS) {
        this.pulseStartTime = null
        this.halo.scale.setScalar(1)
      } else {
        const t = (elapsed % PULSE_DURATION_MS) / PULSE_DURATION_MS
        const scale = 1 + (PULSE_SCALE - 1) * Math.sin(t * Math.PI)
        this.halo.scale.setScalar(scale)
      }
    }
  }

  dispose(): void {
    this.dot.geometry.dispose()
    this.halo.geometry.dispose()
    this.arc.geometry.dispose()
    ;(this.dot.material as THREE.Material).dispose()
    ;(this.halo.material as THREE.Material).dispose()
    ;(this.arc.material as THREE.Material).dispose()
  }
}
