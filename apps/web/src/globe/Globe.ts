import * as THREE from 'three'
import * as satellite from 'satellite.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EarthMesh } from './EarthMesh'
import { AtmosphereMesh } from './AtmosphereMesh'
import { StarField } from './StarField'
import { SatelliteMesh } from './SatelliteMesh'
import { SatelliteField } from './SatelliteField'
import { getSunDirection } from '../lib/solar'
import { fetchSatelliteCatalog, fetchIssTle } from '../lib/celestrak'
import type { TLERecord } from '../lib/celestrak'

const ISS_TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
const ISS_TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'
const ISS_NORAD = '25544'
const FLY_DURATION_MS = 1500
const CAMERA_DISTANCE = 2.5
const FIELD_TICK_MS = 100
const R_EARTH_KM = 6371.0
const ARC_POINTS = 180

export type SatCategory = 'STARLINK' | 'GPS' | 'IRIDIUM' | 'DEBRIS' | 'OTHER'
export const ALL_CATEGORIES: SatCategory[] = ['STARLINK', 'GPS', 'IRIDIUM', 'DEBRIS', 'OTHER']

function classifySatellite(name: string): SatCategory {
  const n = name.toUpperCase()
  if (n.startsWith('STARLINK')) return 'STARLINK'
  if (n.startsWith('GPS') || n.includes('NAVSTAR') || n.startsWith('BIIF') || n.startsWith('BIII')) return 'GPS'
  if (n.startsWith('IRIDIUM')) return 'IRIDIUM'
  if (n.includes(' DEB') || n.endsWith(' DEB') || n.includes('DEBRIS') || n.includes('R/B') || n.includes('ROCKET BODY')) return 'DEBRIS'
  return 'OTHER'
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function computeArcPoints(satrec: satellite.SatRec): THREE.Vector3[] {
  const periodMs = (2 * Math.PI / satrec.no) * 60 * 1000
  const now = new Date()
  const gmst = satellite.gstime(now)
  const cosG = Math.cos(gmst)
  const sinG = Math.sin(gmst)
  const points: THREE.Vector3[] = []
  for (let i = 0; i < ARC_POINTS; i++) {
    const t = new Date(now.getTime() + (i / ARC_POINTS) * periodMs)
    const posVel = satellite.propagate(satrec, t)
    if (typeof posVel.position === 'boolean') continue
    const pos = posVel.position as satellite.EciVec3<number>
    const mag = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2)
    if (mag < 1) continue
    const r = mag / R_EARTH_KM
    const ex = (pos.x * cosG + pos.y * sinG) / mag
    const ey = (-pos.x * sinG + pos.y * cosG) / mag
    const ez = pos.z / mag
    points.push(new THREE.Vector3(ex * r, ez * r, -ey * r))
  }
  return points
}

export class Globe {
  private renderer!: THREE.WebGLRenderer
  private camera!: THREE.PerspectiveCamera
  private scene!: THREE.Scene
  private controls!: OrbitControls
  private earth!: EarthMesh
  private atmosphere!: AtmosphereMesh
  private stars!: StarField
  private iss!: SatelliteMesh
  private field: SatelliteField | null = null
  private worker: Worker | null = null
  private lastFieldTickMs = 0
  private mounted = false
  private rafId: number | null = null
  private catalogRefreshInterval: ReturnType<typeof setInterval> | null = null

  private flyFromPos: THREE.Vector3 | null = null
  private flyToPos: THREE.Vector3 | null = null
  private flyStartTime: number | null = null
  private catalogCount = 0
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null
  private issTleInterval: ReturnType<typeof setInterval> | null = null
  private visibilityHandler: (() => void) | null = null
  private satNames: string[] = []
  private satNoradIds: string[] = []
  private satTles: Array<{ tle1: string; tle2: string }> = []
  private satCategories: SatCategory[] = []
  private lastPositionBuffer: Float32Array | null = null
  private clickCanvas: HTMLCanvasElement | null = null
  private _projPos = new THREE.Vector3()

  // Category filtering
  private activeCategories: Set<SatCategory> = new Set(ALL_CATEGORIES)
  private activeCategoryMask: Uint8Array | null = null

  // Ground track for selected catalog satellite
  private groundTrackLine: THREE.LineLoop | null = null
  private selectedSatIdx = -1
  private groundTrackRecomputeInterval: ReturnType<typeof setInterval> | null = null

  // ISS identity (name captured from catalog; NORAD 25544 is always Zarya)
  private issName = 'ISS (ZARYA)'

  // Hover
  private hoveredIdx = -1
  private hoverThrottleMs = 0

  onCatalogRefresh: ((count: number) => void) | null = null
  onSatelliteClick: ((name: string, noradId: string) => void) | null = null
  onSatelliteHover: ((name: string | null, altKm: number | null, screenX: number, screenY: number) => void) | null = null

  mount(canvas: HTMLCanvasElement, onReady?: () => void): void {
    this.mounted = true
    const w = canvas.clientWidth || canvas.width || 800
    const h = canvas.clientHeight || canvas.height || 600

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setSize(w, h, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200)
    this.camera.position.set(0, 0, CAMERA_DISTANCE)

    this.scene = new THREE.Scene()

    this.stars = new StarField()
    this.scene.add(this.stars.points)

    this.earth = new EarthMesh(this.renderer)
    this.scene.add(this.earth.mesh)

    this.atmosphere = new AtmosphereMesh()
    this.scene.add(this.atmosphere.mesh)

    this.iss = new SatelliteMesh(ISS_TLE1, ISS_TLE2)
    this.scene.add(this.iss.group)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 1.3
    this.controls.maxDistance = 15
    this.controls.autoRotate = false

    this.tick()
    void this.refreshIssTle()
    this.issTleInterval = setInterval(() => void this.refreshIssTle(), 2 * 60 * 1000)
    void this.initCatalog(onReady)
    this.catalogRefreshInterval = setInterval(() => {
      void this.initCatalog()
    }, 30 * 60 * 1000)

    this.clickCanvas = canvas
    canvas.addEventListener('click', this.onCanvasClick)
    canvas.addEventListener('mousemove', this.onCanvasMouseMove)

    const baseUrl = import.meta.env.VITE_ORBITAL_SERVICE_URL ?? 'http://localhost:8000'
    const ping = () => fetch(`${baseUrl}/health`).catch(() => undefined)
    void ping()
    this.keepaliveInterval = setInterval(ping, 4 * 60 * 1000)
    this.visibilityHandler = () => { if (!document.hidden) void ping() }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  private async refreshIssTle(): Promise<void> {
    const baseUrl = import.meta.env.VITE_ORBITAL_SERVICE_URL ?? 'http://localhost:8000'
    try {
      const { tle1, tle2 } = await fetchIssTle(baseUrl)
      if (this.mounted) this.iss.updateTle(tle1, tle2)
    } catch {
      // silent — ISS keeps its current TLE
    }
  }

  private async initCatalog(onReady?: () => void): Promise<void> {
    const baseUrl = import.meta.env.VITE_ORBITAL_SERVICE_URL ?? 'http://localhost:8000'
    try {
      const tles = await fetchSatelliteCatalog(baseUrl)
      if (!this.mounted) return
      if (this.field) {
        this.scene.remove(this.field.mesh)
        this.field.dispose()
        this.field = null
      }
      if (this.worker) {
        this.worker.terminate()
        this.worker = null
      }
      const issTle = tles.find((t: TLERecord) => t.norad_id === ISS_NORAD)
      if (issTle) {
        this.iss.updateTle(issTle.tle1, issTle.tle2)
        this.issName = issTle.name || 'ISS (ZARYA)'
      }
      const others = tles.filter((t: TLERecord) => t.norad_id !== ISS_NORAD)
      this.satNames = others.map((t: TLERecord) => t.name)
      this.satNoradIds = others.map((t: TLERecord) => t.norad_id)
      this.satTles = others.map((t: TLERecord) => ({ tle1: t.tle1, tle2: t.tle2 }))
      this.satCategories = others.map((t: TLERecord) => classifySatellite(t.name))
      this.catalogCount = others.length + 1
      this.onCatalogRefresh?.(this.catalogCount)
      this.rebuildCategoryMask()

      // Deselect ground track if catalog rebuilt
      this.clearGroundTrack()

      this.field = new SatelliteField(others.length)
      this.scene.add(this.field.mesh)

      this.worker = new Worker(
        new URL('../workers/propagator.worker.ts', import.meta.url),
        { type: 'module' },
      )
      this.worker.onmessage = (e: MessageEvent) => {
        const msg = e.data as { type: string; buffer?: Float32Array }
        if (msg.type === 'ready') {
          onReady?.()
        } else if (msg.type === 'positions' && msg.buffer && this.field) {
          this.lastPositionBuffer = msg.buffer
          this.field.update(msg.buffer, this.activeCategoryMask)
        }
      }
      this.worker.onerror = (e: ErrorEvent) => {
        console.warn('[Globe] Propagator worker error, running ISS-only:', e.message)
        if (this.mounted) onReady?.()
      }
      this.worker.postMessage({ type: 'init', tles: others })
    } catch (err) {
      console.warn('[Globe] Catalog unavailable, running ISS-only:', err)
      if (this.mounted) onReady?.()
    }
  }

  // ── Category filtering ──────────────────────────────────────────────────────

  setActiveCategories(cats: Set<SatCategory>): void {
    this.activeCategories = cats
    this.rebuildCategoryMask()
    if (this.field && this.lastPositionBuffer) {
      this.field.update(this.lastPositionBuffer, this.activeCategoryMask)
    }
  }

  getCategoryCount(cat: SatCategory): number {
    return this.satCategories.filter(c => c === cat).length
  }

  private rebuildCategoryMask(): void {
    if (this.satCategories.length === 0) {
      this.activeCategoryMask = null
      return
    }
    const mask = new Uint8Array(this.satCategories.length)
    for (let i = 0; i < this.satCategories.length; i++) {
      mask[i] = this.activeCategories.has(this.satCategories[i]) ? 1 : 0
    }
    this.activeCategoryMask = mask
  }

  // ── Ground track ────────────────────────────────────────────────────────────

  private clearGroundTrack(): void {
    if (this.groundTrackLine) {
      this.scene.remove(this.groundTrackLine)
      this.groundTrackLine.geometry.dispose()
      ;(this.groundTrackLine.material as THREE.Material).dispose()
      this.groundTrackLine = null
    }
    if (this.groundTrackRecomputeInterval !== null) {
      clearInterval(this.groundTrackRecomputeInterval)
      this.groundTrackRecomputeInterval = null
    }
    this.selectedSatIdx = -1
  }

  private showGroundTrack(idx: number): void {
    this.clearGroundTrack()
    const tle = this.satTles[idx]
    if (!tle) return
    const satrec = satellite.twoline2satrec(tle.tle1, tle.tle2)
    this.selectedSatIdx = idx

    const points = computeArcPoints(satrec)
    if (points.length < 2) return

    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 })
    this.groundTrackLine = new THREE.LineLoop(geo, mat)
    this.scene.add(this.groundTrackLine)

    // Recompute every 60s to keep the arc aligned with GMST drift
    this.groundTrackRecomputeInterval = setInterval(() => {
      if (this.groundTrackLine && this.selectedSatIdx >= 0) {
        const t = this.satTles[this.selectedSatIdx]
        if (t) {
          const sr = satellite.twoline2satrec(t.tle1, t.tle2)
          this.groundTrackLine.geometry.setFromPoints(computeArcPoints(sr))
        }
      }
    }, 60 * 1000)
  }

  // ── Click handler ────────────────────────────────────────────────────────────

  private onCanvasClick = (e: MouseEvent): void => {
    if (!this.onSatelliteClick) return
    const canvas = e.target as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const fovFactor = rect.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360))
    const camX = this.camera.position.x
    const camY = this.camera.position.y
    const camZ = this.camera.position.z

    // Check ISS first — it sits at the same location as docked modules in the catalog
    // (Unity, Destiny, etc.) so without this the wrong NORAD ID gets returned.
    const issPos = this.iss.getCurrentPosition()
    if (issPos) {
      this._projPos.copy(issPos).project(this.camera)
      if (this._projPos.z <= 1) {
        const sx = (this._projPos.x + 1) * 0.5 * rect.width
        const sy = (1 - this._projPos.y) * 0.5 * rect.height
        const screenDist = Math.hypot(sx - clickX, sy - clickY)
        const dx = issPos.x - camX, dy = issPos.y - camY, dz = issPos.z - camZ
        const depth = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const dotRadiusPx = (0.008 / depth) * fovFactor  // 0.008 = ISS dot radius
        if (screenDist <= dotRadiusPx + 2) {
          this.clearGroundTrack()  // ISS already has its own arc via SatelliteMesh
          this.onSatelliteClick(this.issName, ISS_NORAD)
          return
        }
      }
    }

    if (!this.lastPositionBuffer) return
    const buf = this.lastPositionBuffer
    const count = buf.length / 3
    const SPHERE_RADIUS = 0.005

    let bestScreenDist = Infinity
    let bestIdx = -1

    for (let i = 0; i < count; i++) {
      if (this.activeCategoryMask && !this.activeCategoryMask[i]) continue
      this._projPos.set(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2])
      this._projPos.project(this.camera)
      if (this._projPos.z > 1) continue

      const sx = (this._projPos.x + 1) * 0.5 * rect.width
      const sy = (1 - this._projPos.y) * 0.5 * rect.height
      const screenDist = Math.hypot(sx - clickX, sy - clickY)

      const dx = buf[i * 3] - camX
      const dy = buf[i * 3 + 1] - camY
      const dz = buf[i * 3 + 2] - camZ
      const depth = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const dotRadiusPx = (SPHERE_RADIUS / depth) * fovFactor

      if (screenDist <= dotRadiusPx + 1 && screenDist < bestScreenDist) {
        bestScreenDist = screenDist
        bestIdx = i
      }
    }

    if (bestIdx >= 0) {
      const name = this.satNames[bestIdx]
      const noradId = this.satNoradIds[bestIdx]
      if (name && noradId) {
        this.showGroundTrack(bestIdx)
        this.onSatelliteClick(name, noradId)
      }
    } else {
      // Click on empty space — clear selection
      this.clearGroundTrack()
    }
  }

  // ── Hover handler ────────────────────────────────────────────────────────────

  private onCanvasMouseMove = (e: MouseEvent): void => {
    if (!this.onSatelliteHover) return
    const now = performance.now()
    if (now - this.hoverThrottleMs < 40) return
    this.hoverThrottleMs = now

    const canvas = e.target as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const fovFactor = rect.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360))
    const camX = this.camera.position.x
    const camY = this.camera.position.y
    const camZ = this.camera.position.z
    const HOVER_EXTRA_PX = 6

    // Check ISS first (same reason as click handler)
    const issPos = this.iss.getCurrentPosition()
    if (issPos) {
      this._projPos.copy(issPos).project(this.camera)
      if (this._projPos.z <= 1) {
        const sx = (this._projPos.x + 1) * 0.5 * rect.width
        const sy = (1 - this._projPos.y) * 0.5 * rect.height
        const screenDist = Math.hypot(sx - mouseX, sy - mouseY)
        const dx = issPos.x - camX, dy = issPos.y - camY, dz = issPos.z - camZ
        const depth = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const dotRadiusPx = (0.008 / depth) * fovFactor
        if (screenDist <= dotRadiusPx + HOVER_EXTRA_PX) {
          const r = issPos.length()
          const altKm = Math.round((r - 1) * R_EARTH_KM)
          if (this.hoveredIdx !== -2) {
            this.hoveredIdx = -2  // sentinel for ISS
            this.onSatelliteHover(this.issName, altKm, e.clientX, e.clientY)
          }
          return
        }
      }
    }

    if (!this.lastPositionBuffer) {
      if (this.hoveredIdx !== -1) { this.hoveredIdx = -1; this.onSatelliteHover(null, null, e.clientX, e.clientY) }
      return
    }

    const buf = this.lastPositionBuffer
    const count = buf.length / 3
    const SPHERE_RADIUS = 0.005

    let bestDist = Infinity
    let bestIdx = -1

    for (let i = 0; i < count; i++) {
      if (this.activeCategoryMask && !this.activeCategoryMask[i]) continue
      this._projPos.set(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2])
      this._projPos.project(this.camera)
      if (this._projPos.z > 1) continue

      const sx = (this._projPos.x + 1) * 0.5 * rect.width
      const sy = (1 - this._projPos.y) * 0.5 * rect.height
      const screenDist = Math.hypot(sx - mouseX, sy - mouseY)

      const dx = buf[i * 3] - camX
      const dy = buf[i * 3 + 1] - camY
      const dz = buf[i * 3 + 2] - camZ
      const depth = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const dotRadiusPx = (SPHERE_RADIUS / depth) * fovFactor

      if (screenDist <= dotRadiusPx + HOVER_EXTRA_PX && screenDist < bestDist) {
        bestDist = screenDist
        bestIdx = i
      }
    }

    if (bestIdx >= 0) {
      const name = this.satNames[bestIdx]
      const x = buf[bestIdx * 3], y = buf[bestIdx * 3 + 1], z = buf[bestIdx * 3 + 2]
      const r = Math.sqrt(x * x + y * y + z * z)
      const altKm = Math.round((r - 1) * R_EARTH_KM)
      if (bestIdx !== this.hoveredIdx) {
        this.hoveredIdx = bestIdx
        this.onSatelliteHover(name ?? null, altKm, e.clientX, e.clientY)
      }
    } else {
      if (this.hoveredIdx !== -1) {
        this.hoveredIdx = -1
        this.onSatelliteHover(null, null, e.clientX, e.clientY)
      }
    }
  }

  // ── Agent highlight ──────────────────────────────────────────────────────────

  highlightSatellite(noradId: string, latDeg?: number, lonDeg?: number): void {
    let targetPos: THREE.Vector3 | null = null

    if (latDeg !== undefined && lonDeg !== undefined) {
      const lat = latDeg * (Math.PI / 180)
      const lon = lonDeg * (Math.PI / 180)
      targetPos = new THREE.Vector3(
         CAMERA_DISTANCE * Math.cos(lat) * Math.cos(lon),
         CAMERA_DISTANCE * Math.sin(lat),
        -CAMERA_DISTANCE * Math.cos(lat) * Math.sin(lon),
      )
    } else if (noradId === ISS_NORAD) {
      const issPos = this.iss.getCurrentPosition()
      if (issPos) targetPos = issPos.clone().normalize().multiplyScalar(CAMERA_DISTANCE)
    }

    if (!targetPos) return

    this.flyFromPos = this.camera.position.clone()
    this.flyToPos = targetPos
    this.flyStartTime = performance.now()

    if (noradId === ISS_NORAD) this.iss.startPulse()
  }

  getSatelliteCount(): number {
    return this.catalogCount
  }

  private tick(): void {
    this.rafId = requestAnimationFrame(() => this.tick())
    const now = new Date()
    const nowMs = now.getTime()

    this.earth.update(getSunDirection(now))
    this.iss.update(now)

    if (this.worker && nowMs - this.lastFieldTickMs >= FIELD_TICK_MS) {
      this.lastFieldTickMs = nowMs
      this.worker.postMessage({ type: 'tick', timestamp: nowMs })
    }

    if (this.flyFromPos && this.flyToPos && this.flyStartTime !== null) {
      const elapsed = performance.now() - this.flyStartTime
      const t = Math.min(elapsed / FLY_DURATION_MS, 1)
      const eased = easeInOutCubic(t)
      this.camera.position.lerpVectors(this.flyFromPos, this.flyToPos, eased)
      if (t >= 1) {
        this.flyFromPos = null
        this.flyToPos = null
        this.flyStartTime = null
      }
    }

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  unmount(): void {
    this.mounted = false
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    if (this.catalogRefreshInterval !== null) { clearInterval(this.catalogRefreshInterval); this.catalogRefreshInterval = null }
    if (this.keepaliveInterval !== null) { clearInterval(this.keepaliveInterval); this.keepaliveInterval = null }
    if (this.issTleInterval !== null) { clearInterval(this.issTleInterval); this.issTleInterval = null }
    if (this.visibilityHandler !== null) { document.removeEventListener('visibilitychange', this.visibilityHandler); this.visibilityHandler = null }
    if (this.clickCanvas !== null) {
      this.clickCanvas.removeEventListener('click', this.onCanvasClick)
      this.clickCanvas.removeEventListener('mousemove', this.onCanvasMouseMove)
      this.clickCanvas = null
    }
    this.clearGroundTrack()
    this.worker?.terminate()
    this.worker = null
    this.controls.dispose()
    this.earth.dispose()
    this.atmosphere.dispose()
    this.stars.dispose()
    this.iss.dispose()
    this.field?.dispose()
    this.renderer.dispose()
  }
}
