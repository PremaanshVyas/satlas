import * as THREE from 'three'
import * as satellite from 'satellite.js'

const PULSE_DURATION_MS = 1000
const PULSE_SCALE = 1.6
const PULSE_REPEATS = 3
const R_EARTH_KM = 6371.0
const ARC_RECOMPUTE_MS = 60 * 1000

export class SatelliteMesh {
  readonly group: THREE.Group
  private dot: THREE.Mesh
  private halo: THREE.Mesh
  private arc: THREE.LineLoop
  private satrec: satellite.SatRec
  private pulseStartTime: number | null = null
  private lastArcRecompute = 0

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
    // Hide the ring until a fresh TLE is loaded — the hardcoded fallback TLE can be
    // months old, which propagates to a completely wrong orbital position.
    this.arc.visible = false

    this.group.add(this.dot, this.halo, this.arc)
  }

  // Dot position: ECI world space — earthGroup rotates by GMST each frame so the ISS
  // appears over the correct geography without any manual ECEF conversion here.
  private toThreePosition(date: Date): THREE.Vector3 | null {
    const posVel = satellite.propagate(this.satrec, date)
    if (typeof posVel.position === 'boolean') return null

    const pos = posVel.position as satellite.EciVec3<number>
    const mag = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z)
    if (mag < 1) return null
    const r = mag / R_EARTH_KM

    return new THREE.Vector3(pos.x / mag * r, pos.z / mag * r, -pos.y / mag * r)
  }

  // Orbital ring: ECI positions directly — world space is ECI so no GMST rotation needed.
  // The ring is naturally a correct inertial ellipse; earthGroup.rotation.y = GMST makes
  // the Earth surface rotate beneath it, keeping satellite and ring aligned geographically.
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

      const r = mag / R_EARTH_KM
      points.push(new THREE.Vector3(pos.x / mag * r, pos.z / mag * r, -pos.y / mag * r))
    }
    return points
  }

  getCurrentPosition(): THREE.Vector3 | null {
    return this.toThreePosition(new Date())
  }

  updateTle(tle1: string, tle2: string): void {
    this.satrec = satellite.twoline2satrec(tle1, tle2)
    this.arc.geometry.setFromPoints(this.computeArcPoints())
    // Show the ring now that we have a verified fresh TLE.
    this.arc.visible = true
    // Defer the next periodic recompute in update() by a full cycle.
    this.lastArcRecompute = Date.now()
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

    // Recompute arc every 60 s so the ring's start point stays near the current position.
    const nowMs = date.getTime()
    if (nowMs - this.lastArcRecompute >= ARC_RECOMPUTE_MS) {
      this.lastArcRecompute = nowMs
      this.arc.geometry.setFromPoints(this.computeArcPoints())
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
