import * as THREE from 'three'
import * as satellite from 'satellite.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EarthMesh } from './EarthMesh'
import { AtmosphereMesh } from './AtmosphereMesh'
import { StarField } from './StarField'
import { SatelliteMesh } from './SatelliteMesh'
import { SatelliteField, DEFAULT_COLOR as SAT_DEFAULT_COLOR } from './SatelliteField'
import { getSunDirection } from '../lib/solar'
import { fetchSatelliteCatalog, fetchIssTle } from '../lib/celestrak'
import type { TLERecord } from '../lib/celestrak'
import { fetchSatcat } from '../lib/satcat'
import type { SatcatEntry } from '../lib/satcat'
import { matchSatelliteQuery } from './searchUtils'
import type { SearchResult } from './searchUtils'

// Orbital parameters computed from TLE data (satrec fields).
export interface OrbitalParams {
  inclination: number  // degrees
  period: number       // minutes
  apogee: number       // km above surface
  perigee: number      // km above surface
}

export interface LivePosition {
  lat: number      // decimal degrees, south negative
  lon: number      // decimal degrees, west negative
  altKm: number    // altitude above surface in km
  velocity: number // km/s
}


const HIGHLIGHT_COLOR = new THREE.Color(0x4ade80)  // lime-400 — hover + selected

const GROUP_HIGHLIGHT_COLORS: Record<string, THREE.Color> = {
  STARLINK: new THREE.Color(0xa78bfa),  // violet-400
  GPS:      new THREE.Color(0x34d399),  // emerald-400
  IRIDIUM:  new THREE.Color(0x38bdf8),  // sky-400
  DEBRIS:   new THREE.Color(0xf87171),  // red-400
  OTHER:    new THREE.Color(0xfbbf24),  // amber-400
}

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
  private issTleInterval: ReturnType<typeof setInterval> | null = null
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
  // When agent sets a filter, track which categories it chose so we can re-apply
  // colors after catalog refresh and clear them on manual toggle.
  private agentFilterCategories: SatCategory[] | null = null

  // Ground track for selected catalog satellite
  private groundTrackLine: THREE.LineLoop | null = null
  private selectedSatIdx = -1
  private groundTrackRecomputeInterval: ReturnType<typeof setInterval> | null = null

  // ISS identity (name captured from catalog; NORAD 25544 is always Zarya)
  private issName = 'ISS (ZARYA)'
  // ISS satrec kept in Globe.ts so we can propagate live position without touching SatelliteMesh internals.
  private issSatrec: satellite.SatRec = satellite.twoline2satrec(ISS_TLE1, ISS_TLE2)

  // Hover
  private hoveredIdx = -1
  private hoverThrottleMs = 0

  // Satellite catalog metadata (country, launch date, etc.) keyed by NORAD ID.
  private satcat: Map<string, SatcatEntry> = new Map()

  // Live position ticking for the selected satellite info card.
  private liveTickInterval: ReturnType<typeof setInterval> | null = null
  private liveSelectedSatrec: satellite.SatRec | null = null

  onCatalogRefresh: ((count: number) => void) | null = null
  onSatelliteClick: ((name: string, noradId: string) => void) | null = null
  onSatelliteHover: ((name: string | null, altKm: number | null, screenX: number, screenY: number) => void) | null = null
  // Fires every second with the selected satellite's live geodetic position.
  onLivePosition: ((pos: LivePosition) => void) | null = null
  // Fires once when a satellite is selected with static orbital params + satcat metadata.
  onSatelliteSelectInfo: ((orbital: OrbitalParams, meta: SatcatEntry | null) => void) | null = null
  // Fires when selection is cleared (click X or click empty space).
  onSatelliteDeselect: (() => void) | null = null

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
    // Show the globe (ISS only) on the first rendered frame — don't wait for catalog.
    // Catalog dots appear when /api/catalog responds; onCatalogRefresh updates the count.
    requestAnimationFrame(() => { if (this.mounted) onReady?.() })
    void this.refreshIssTle()
    this.issTleInterval = setInterval(() => void this.refreshIssTle(), 2 * 60 * 1000)
    void this.initCatalog()
    this.catalogRefreshInterval = setInterval(() => {
      void this.initCatalog()
    }, 30 * 60 * 1000)

    this.clickCanvas = canvas
    canvas.addEventListener('click', this.onCanvasClick)
    canvas.addEventListener('mousemove', this.onCanvasMouseMove)

    // Load satellite metadata (country, launch date, etc.) non-blocking.
    void fetchSatcat().then(m => { if (this.mounted) this.satcat = m })
  }

  private async refreshIssTle(): Promise<void> {
    try {
      const { tle1, tle2 } = await fetchIssTle()
      if (this.mounted) {
        this.iss.updateTle(tle1, tle2)
        this.issSatrec = satellite.twoline2satrec(tle1, tle2)
      }
    } catch {
      // silent — ISS keeps its current TLE
    }
  }

  private async initCatalog(): Promise<void> {
    try {
      const tles = await fetchSatelliteCatalog()
      if (!this.mounted) return

      const issTle = tles.find((t: TLERecord) => t.norad_id === ISS_NORAD)
      if (issTle) {
        this.iss.updateTle(issTle.tle1, issTle.tle2)
        this.issSatrec = satellite.twoline2satrec(issTle.tle1, issTle.tle2)
        this.issName = issTle.name || 'ISS (ZARYA)'
      }
      const others = tles.filter((t: TLERecord) => t.norad_id !== ISS_NORAD)

      // Soft refresh: if the InstancedMesh and worker already exist with a similar satellite
      // count, just re-send TLEs to the worker without tearing down the mesh.
      // Tearing down causes a visible "no satellites" gap while the new worker initializes.
      if (this.field && this.worker && Math.abs(others.length - this.satNames.length) <= 200) {
        this.satNames = others.map((t: TLERecord) => t.name)
        this.satNoradIds = others.map((t: TLERecord) => t.norad_id)
        this.satTles = others.map((t: TLERecord) => ({ tle1: t.tle1, tle2: t.tle2 }))
        this.satCategories = others.map((t: TLERecord) => classifySatellite(t.name))
        this.catalogCount = others.length + 1
        this.onCatalogRefresh?.(this.catalogCount)
        this.rebuildCategoryMask()
        if (this.agentFilterCategories) this.applyAgentCategoryColors()
        this.worker.postMessage({ type: 'init', tles: others })
        return
      }

      // Full init: first load, or catalog size changed significantly (new satellites launched).
      if (this.field) {
        this.scene.remove(this.field.mesh)
        this.field.dispose()
        this.field = null
      }
      if (this.worker) {
        this.worker.terminate()
        this.worker = null
      }
      this.satNames = others.map((t: TLERecord) => t.name)
      this.satNoradIds = others.map((t: TLERecord) => t.norad_id)
      this.satTles = others.map((t: TLERecord) => ({ tle1: t.tle1, tle2: t.tle2 }))
      this.satCategories = others.map((t: TLERecord) => classifySatellite(t.name))
      this.catalogCount = others.length + 1
      this.onCatalogRefresh?.(this.catalogCount)
      this.rebuildCategoryMask()

      // Deselect ground track and hover — all indices are stale after a full rebuild
      this.clearGroundTrack()
      this.hoveredIdx = -1

      this.field = new SatelliteField(others.length)
      this.scene.add(this.field.mesh)
      if (this.agentFilterCategories) this.applyAgentCategoryColors()

      this.worker = new Worker(
        new URL('../workers/propagator.worker.ts', import.meta.url),
        { type: 'module' },
      )
      this.worker.onmessage = (e: MessageEvent) => {
        const msg = e.data as { type: string; buffer?: Float32Array }
        if (msg.type === 'positions' && msg.buffer && this.field) {
          this.lastPositionBuffer = msg.buffer
          this.field.update(msg.buffer, this.activeCategoryMask)
        }
      }
      this.worker.onerror = (e: ErrorEvent) => {
        console.warn('[Globe] Propagator worker error, running ISS-only:', e.message)
      }
      this.worker.postMessage({ type: 'init', tles: others })
    } catch (err) {
      console.warn('[Globe] Catalog unavailable, running ISS-only:', err)
    }
  }

  // ── Category filtering ──────────────────────────────────────────────────────

  setActiveCategories(cats: Set<SatCategory>): void {
    this.agentFilterCategories = null  // manual toggle clears agent color mode
    this.activeCategories = cats
    this.rebuildCategoryMask()
    if (this.field && this.lastPositionBuffer) {
      this.field.update(this.lastPositionBuffer, this.activeCategoryMask)
    }
    if (this.field) this.field.setCategoryColors([], null)  // reset to default blue
    if (this.hoveredIdx >= 0) this.refreshInstanceColor(this.hoveredIdx)
    if (this.selectedSatIdx >= 0) this.refreshInstanceColor(this.selectedSatIdx)
  }

  // Called when the agent sets a filter: update shown categories AND apply per-category colours.
  applyAgentFilter(categories: SatCategory[]): void {
    const cats = categories.length > 0 ? categories : [...ALL_CATEGORIES]
    this.agentFilterCategories = categories.length > 0 ? [...categories] : null
    this.activeCategories = new Set(cats)
    this.rebuildCategoryMask()
    if (this.field && this.lastPositionBuffer) {
      this.field.update(this.lastPositionBuffer, this.activeCategoryMask)
    }
    this.applyAgentCategoryColors()
  }

  private applyAgentCategoryColors(): void {
    if (!this.field) return
    if (this.agentFilterCategories === null) {
      this.field.setCategoryColors([], null)
    } else {
      const colorMap: Record<string, THREE.Color> = {}
      for (const cat of this.agentFilterCategories) {
        colorMap[cat] = GROUP_HIGHLIGHT_COLORS[cat]
      }
      this.field.setCategoryColors(this.satCategories as string[], colorMap)
    }
    // Re-apply hover/selected highlights which were overwritten by the bulk color reset
    if (this.hoveredIdx >= 0) this.refreshInstanceColor(this.hoveredIdx)
    if (this.selectedSatIdx >= 0) this.refreshInstanceColor(this.selectedSatIdx)
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

  // ── Live position tick (for selected satellite info card) ────────────────────

  private static computeOrbitalParams(satrec: satellite.SatRec): OrbitalParams {
    // Derive period, apogee, perigee from SGP4 elements rather than parsing TLE text.
    const MU = 398600.4418           // km³/s² — Earth's gravitational parameter
    const noRads = satrec.no / 60   // mean motion: rad/min → rad/s
    const a = Math.cbrt(MU / (noRads * noRads))  // semi-major axis in km
    const e = satrec.ecco
    return {
      inclination: Math.round(satrec.inclo * (180 / Math.PI) * 10) / 10,
      period: Math.round((2 * Math.PI / satrec.no) * 10) / 10,
      apogee: Math.round(a * (1 + e) - R_EARTH_KM),
      perigee: Math.round(a * (1 - e) - R_EARTH_KM),
    }
  }

  private startLiveTick(satrec: satellite.SatRec): void {
    this.stopLiveTick()
    this.liveSelectedSatrec = satrec
    const tick = () => {
      if (!this.liveSelectedSatrec || !this.onLivePosition) return
      const now = new Date()
      const posVel = satellite.propagate(this.liveSelectedSatrec, now)
      if (!posVel.position || typeof posVel.position !== 'object') return
      const gmst = satellite.gstime(now)
      const geo = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, gmst)
      const lat = satellite.degreesLat(geo.latitude)
      const lon = satellite.degreesLong(geo.longitude)
      const altKm = geo.height
      let velocity = 0
      if (posVel.velocity && typeof posVel.velocity === 'object') {
        const v = posVel.velocity as satellite.EciVec3<number>
        velocity = Math.round(Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2) * 100) / 100
      }
      this.onLivePosition({ lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000, altKm: Math.round(altKm), velocity })
    }
    tick()
    this.liveTickInterval = setInterval(tick, 1000)
  }

  private stopLiveTick(): void {
    if (this.liveTickInterval !== null) { clearInterval(this.liveTickInterval); this.liveTickInterval = null }
    this.liveSelectedSatrec = null
  }

  // Called whenever a satellite is selected (catalog or ISS).
  // Fires onSatelliteSelectInfo with TLE-derived orbital params and any satcat metadata.
  private handleSatSelect(noradId: string, satrec: satellite.SatRec): void {
    this.startLiveTick(satrec)
    const orbital = Globe.computeOrbitalParams(satrec)
    const meta = this.satcat.get(noradId) ?? null
    this.onSatelliteSelectInfo?.(orbital, meta)
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
    const oldSelected = this.selectedSatIdx
    this.selectedSatIdx = -1
    if (oldSelected >= 0) this.refreshInstanceColor(oldSelected)
    this.stopLiveTick()
    this.onSatelliteDeselect?.()
  }

  // Public — called from App.tsx when the user clicks ✕ on the info card.
  clearSelection(): void {
    this.clearGroundTrack()
  }

  searchCatalog(query: string, maxResults = 8): SearchResult[] {
    const results: SearchResult[] = []
    const q = query.trim().toLowerCase()
    if (!q) return []
    // ISS is excluded from satNoradIds — check it separately.
    if (this.issName.toLowerCase().includes(q) || ISS_NORAD.startsWith(q)) {
      results.push({ name: this.issName, noradId: ISS_NORAD })
    }
    if (results.length < maxResults) {
      const rest = matchSatelliteQuery(query, this.satNames, this.satNoradIds, maxResults - results.length)
      results.push(...rest)
    }
    return results
  }

  selectCatalogSatellite(noradId: string): void {
    if (noradId === ISS_NORAD) {
      this.clearGroundTrack()  // ISS already has its own arc via SatelliteMesh
      this.handleSatSelect(ISS_NORAD, this.issSatrec)
      this.onSatelliteClick?.(this.issName, ISS_NORAD)
      return
    }
    const idx = this.satNoradIds.indexOf(noradId)
    if (idx < 0) return
    this.showGroundTrack(idx)
    this.onSatelliteClick?.(this.satNames[idx] ?? noradId, noradId)
  }

  private showGroundTrack(idx: number): void {
    this.clearGroundTrack()
    const tle = this.satTles[idx]
    if (!tle) return
    const satrec = satellite.twoline2satrec(tle.tle1, tle.tle2)
    this.selectedSatIdx = idx
    this.handleSatSelect(this.satNoradIds[idx] ?? '', satrec)

    const points = computeArcPoints(satrec)
    if (points.length < 2) return

    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 })
    this.groundTrackLine = new THREE.LineLoop(geo, mat)
    this.scene.add(this.groundTrackLine)
    this.refreshInstanceColor(idx)  // highlight selected dot

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

  // ── Instance colour helpers ──────────────────────────────────────────────────

  // Returns the "resting" colour for a catalog instance (no hover / selection).
  private getBaseInstanceColor(idx: number): THREE.Color {
    if (this.agentFilterCategories !== null) {
      const cat = this.satCategories[idx]
      return cat ? (GROUP_HIGHLIGHT_COLORS[cat] ?? SAT_DEFAULT_COLOR) : SAT_DEFAULT_COLOR
    }
    return SAT_DEFAULT_COLOR
  }

  // Apply the correct colour for idx based on current hover / selected state.
  private refreshInstanceColor(idx: number): void {
    if (idx < 0 || !this.field) return
    if (idx === this.hoveredIdx || idx === this.selectedSatIdx) {
      this.field.setInstanceColor(idx, HIGHLIGHT_COLOR)
    } else {
      this.field.setInstanceColor(idx, this.getBaseInstanceColor(idx))
    }
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
          this.handleSatSelect(ISS_NORAD, this.issSatrec)
          this.onSatelliteClick(this.issName, ISS_NORAD)
          return
        }
      }
    }

    if (!this.lastPositionBuffer) return
    const buf = this.lastPositionBuffer

    // Short-circuit: if a catalog satellite is already hovered (tooltip visible),
    // clicking it should always work — the hover uses a wider hit zone than the
    // click's tight dotRadiusPx+1, so without this you had to be pixel-perfect.
    if (this.hoveredIdx >= 0) {
      const name = this.satNames[this.hoveredIdx]
      const noradId = this.satNoradIds[this.hoveredIdx]
      if (name && noradId) {
        this.showGroundTrack(this.hoveredIdx)
        this.onSatelliteClick(name, noradId)
        return
      }
    }

    const count = buf.length / 3
    const SPHERE_RADIUS = 0.005

    let bestDepth = Infinity
    let bestIdx = -1

    for (let i = 0; i < count; i++) {
      if (this.activeCategoryMask && !this.activeCategoryMask[i]) continue

      const satX = buf[i * 3], satY = buf[i * 3 + 1], satZ = buf[i * 3 + 2]
      // Occlusion: skip satellites on the far side of the earth from the camera.
      // They project to valid 2D screen positions but are physically hidden by the globe.
      if (satX * camX + satY * camY + satZ * camZ <= 0) continue

      this._projPos.set(satX, satY, satZ)
      this._projPos.project(this.camera)
      if (this._projPos.z > 1) continue

      const sx = (this._projPos.x + 1) * 0.5 * rect.width
      const sy = (1 - this._projPos.y) * 0.5 * rect.height
      const screenDist = Math.hypot(sx - clickX, sy - clickY)

      const dx = satX - camX, dy = satY - camY, dz = satZ - camZ
      const depth = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const dotRadiusPx = (SPHERE_RADIUS / depth) * fovFactor

      // Among candidates in the hit zone, prefer the one closest to the camera
      // (smallest depth) so a lower-altitude satellite always wins over one behind it.
      if (screenDist <= dotRadiusPx + 1 && depth < bestDepth) {
        bestDepth = depth
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
            const prev = this.hoveredIdx
            this.hoveredIdx = -2  // sentinel for ISS
            if (prev >= 0) this.refreshInstanceColor(prev)  // restore previous catalog dot
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

    let bestDepth = Infinity
    let bestIdx = -1

    for (let i = 0; i < count; i++) {
      if (this.activeCategoryMask && !this.activeCategoryMask[i]) continue

      const satX = buf[i * 3], satY = buf[i * 3 + 1], satZ = buf[i * 3 + 2]
      // Occlusion: skip satellites on the far side of the earth from the camera.
      // They project to valid 2D screen positions but are physically hidden by the globe.
      if (satX * camX + satY * camY + satZ * camZ <= 0) continue

      this._projPos.set(satX, satY, satZ)
      this._projPos.project(this.camera)
      if (this._projPos.z > 1) continue

      const sx = (this._projPos.x + 1) * 0.5 * rect.width
      const sy = (1 - this._projPos.y) * 0.5 * rect.height
      const screenDist = Math.hypot(sx - mouseX, sy - mouseY)

      const dx = satX - camX, dy = satY - camY, dz = satZ - camZ
      const depth = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const dotRadiusPx = (SPHERE_RADIUS / depth) * fovFactor

      // Among candidates in the hit zone, prefer the one closest to the camera
      // (smallest depth) so a lower-altitude satellite always wins over one behind it.
      if (screenDist <= dotRadiusPx + HOVER_EXTRA_PX && depth < bestDepth) {
        bestDepth = depth
        bestIdx = i
      }
    }

    if (bestIdx >= 0) {
      const name = this.satNames[bestIdx]
      const x = buf[bestIdx * 3], y = buf[bestIdx * 3 + 1], z = buf[bestIdx * 3 + 2]
      const r = Math.sqrt(x * x + y * y + z * z)
      const altKm = Math.round((r - 1) * R_EARTH_KM)
      if (bestIdx !== this.hoveredIdx) {
        const prev = this.hoveredIdx
        this.hoveredIdx = bestIdx
        if (prev >= 0) this.refreshInstanceColor(prev)  // restore old
        this.refreshInstanceColor(bestIdx)               // highlight new
        this.onSatelliteHover(name ?? null, altKm, e.clientX, e.clientY)
      }
    } else {
      if (this.hoveredIdx !== -1) {
        const prev = this.hoveredIdx
        this.hoveredIdx = -1
        if (prev >= 0) this.refreshInstanceColor(prev)  // restore on hover-out
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
    if (this.issTleInterval !== null) { clearInterval(this.issTleInterval); this.issTleInterval = null }
    if (this.clickCanvas !== null) {
      this.clickCanvas.removeEventListener('click', this.onCanvasClick)
      this.clickCanvas.removeEventListener('mousemove', this.onCanvasMouseMove)
      this.clickCanvas = null
    }
    this.stopLiveTick()
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
