import * as THREE from 'three'

export function getSunDirection(date: Date, target = new THREE.Vector3()): THREE.Vector3 {
  const JD = date.getTime() / 86400000 + 2440587.5
  const n = JD - 2451545.0 // days since J2000.0

  const L = (280.460 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * (Math.PI / 180)

  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * (Math.PI / 180)
  const epsilon = (23.439 - 0.0000004 * n) * (Math.PI / 180)

  // ECI (J2000) direction
  const xECI = Math.cos(lambda)
  const yECI = Math.cos(epsilon) * Math.sin(lambda)
  const zECI = Math.sin(epsilon) * Math.sin(lambda)

  // ECI → Three.js world: ECI X → world X, ECI Z (north pole) → world Y, ECI Y → world -Z
  // No ECEF rotation needed — world space is now ECI; earthGroup rotates by GMST each frame.
  return target.set(xECI, zECI, -yECI).normalize()
}
