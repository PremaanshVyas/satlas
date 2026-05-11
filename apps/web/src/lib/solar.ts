import * as THREE from 'three'

export function getSunDirection(date: Date): THREE.Vector3 {
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

  // Rotate ECI → ECEF via Greenwich Mean Sidereal Time
  const GMST =
    ((280.46061837 + 360.98564736629 * (JD - 2451545.0)) % 360) * (Math.PI / 180)
  const cosG = Math.cos(GMST)
  const sinG = Math.sin(GMST)
  const xECEF = xECI * cosG + yECI * sinG
  const yECEF = -xECI * sinG + yECI * cosG
  const zECEF = zECI

  // ECEF → Three.js world space (Y-up, prime meridian at +Z)
  return new THREE.Vector3(-yECEF, zECEF, xECEF).normalize()
}
