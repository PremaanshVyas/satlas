import * as THREE from 'three'
import * as satellite from 'satellite.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { EarthMesh } from './EarthMesh'
import { AtmosphereMesh } from './AtmosphereMesh'
import { CloudMesh } from './CloudMesh'
import { StarField } from './StarField'
import { SunMesh } from './SunMesh'
import { SatelliteMesh } from './SatelliteMesh'
import { SatelliteField, DEFAULT_COLOR as SAT_DEFAULT_COLOR } from './SatelliteField'
import { getSunDirection } from '../lib/solar'
import { fetchSatelliteCatalog, fetchIssTle } from '../lib/celestrak'
import type { TLERecord } from '../lib/celestrak'
import { fetchSatcat } from '../lib/satcat'
import type { SatcatEntry } from '../lib/satcat'
import { matchSatelliteQuery, matchesSatellite } from './searchUtils'
import type { SearchResults } from './searchUtils'
import type { SearchResult } from './searchUtils'
import { geoContains } from 'd3-geo'
import type { Feature as GeoFeature } from 'geojson'
import { CountryBorderMesh } from './CountryBorderMesh'
import { CountryFillMesh } from './CountryFillMesh'
import { CountryHighlightMesh } from './CountryHighlightMesh'
import { GraticuleMesh } from './GraticuleMesh'
import type { GeoJSONFeature, GeoJSONCollection } from './CountryBorderMesh'

export interface OverheadSat {
  name: string
  noradId: string
  elevDeg: number
}

export function computeOverhead(
  buf: Float32Array,
  names: string[],
  noradIds: string[],
  mask: Uint8Array | null,
  latDeg: number,
  lonDeg: number,
  minElevDeg = 10,
  gmstRad = 0,
): OverheadSat[] {
  const lat = latDeg * (Math.PI / 180)
  // Geographic lon + GMST = ECI longitude; satellite buffer is in ECI world space
  const lon = lonDeg * (Math.PI / 180) + gmstRad
  const ox = Math.cos(lat) * Math.cos(lon)
  const oy = Math.sin(lat)
  const oz = -Math.cos(lat) * Math.sin(lon)
  const minSin = Math.sin(minElevDeg * Math.PI / 180)
  const count = Math.floor(buf.length / 3)
  const result: OverheadSat[] = []

  for (let i = 0; i < count; i++) {
    if (mask && !mask[i]) continue
    const x = buf[i * 3], y = buf[i * 3 + 1], z = buf[i * 3 + 2]
    const dx = x - ox, dy = y - oy, dz = z - oz
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (dist < 0.001) continue
    const sinElev = (x * ox + y * oy + z * oz - 1) / dist
    if (sinElev < minSin) continue
    result.push({
      name: names[i] ?? '',
      noradId: noradIds[i] ?? '',
      elevDeg: Math.round(Math.asin(Math.max(-1, Math.min(1, sinElev))) * (180 / Math.PI)),
    })
  }

  result.sort((a, b) => b.elevDeg - a.elevDeg)
  return result
}

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
const CAMERA_DISTANCE = 3.5
const FIELD_TICK_MS = 50
const R_EARTH_KM = 6371.0
const ARC_POINTS = 180
const TOUCH_MIN_RADIUS_PX = 24  // finger-friendly minimum hit radius for touch events

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
  const points: THREE.Vector3[] = []
  for (let i = 0; i < ARC_POINTS; i++) {
    const t = new Date(now.getTime() + (i / ARC_POINTS) * periodMs)
    const posVel = satellite.propagate(satrec, t)
    if (typeof posVel.position === 'boolean') continue
    const pos = posVel.position as satellite.EciVec3<number>
    const mag = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2)
    if (mag < 1) continue
    const r = mag / R_EARTH_KM
    points.push(new THREE.Vector3(pos.x / mag * r, pos.z / mag * r, -pos.y / mag * r))
  }
  return points
}

export class Globe {
  private renderer!: THREE.WebGLRenderer
  private camera!: THREE.PerspectiveCamera
  private scene!: THREE.Scene
  private earthGroup!: THREE.Group
  private controls!: OrbitControls
  private earth!: EarthMesh
  private atmosphere!: AtmosphereMesh
  private clouds!: CloudMesh
  private stars!: StarField
  private sun!: SunMesh
  private iss!: SatelliteMesh
  private field: SatelliteField | null = null
  private worker: Worker | null = null
  private lastFieldTickMs = 0
  private workerBusy = false
  private mounted = false
  private rafId: number | null = null
  private catalogRefreshInterval: ReturnType<typeof setInterval> | null = null

  private _sunDir = new THREE.Vector3()
  private _lastGmst = 0
  private _tempLabelWorldPos = new THREE.Vector3()
  private _simTimeMs = Date.now()
  private _timeScale = 1.0
  private _lastTickRealMs = 0
  private _lastSimSecond = -1
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
  private _mouseDownX = 0
  private _mouseDownY = 0
  private _lastInputWasTouch = false

  // Per-satellite dot scale (GEO → 1.5×, DEBRIS → 0.6×, others → 1.0)
  private satScales: Float32Array | null = null

  // Category filtering
  private activeCategories: Set<SatCategory> = new Set(ALL_CATEGORIES)
  private activeCategoryMask: Uint8Array | null = null
  private agentFilterCategories: SatCategory[] | null = null

  // Multi-satellite selection — keyed by NORAD ID string
  private selectedNoradIds: Set<string> = new Set()
  private selectedIdxs: Set<number> = new Set()  // catalog indices only, for refreshInstanceColor
  private groundTrackLines: Map<string, THREE.LineLoop> = new Map()
  private trailLines: Map<string, THREE.Line> = new Map()
  private recomputeIntervals: Map<string, ReturnType<typeof setInterval>> = new Map()

  // ISS identity (name captured from catalog; NORAD 25544 is always Zarya)
  private issName = 'ISS (ZARYA)'
  private issSatrec: satellite.SatRec = satellite.twoline2satrec(ISS_TLE1, ISS_TLE2)

  // Hover
  private hoveredIdx = -1
  private hoverThrottleMs = 0
  private hoveredCountryName: string | null = null

  // Satellite catalog metadata (country, launch date, etc.) keyed by NORAD ID.
  private satcat: Map<string, SatcatEntry> = new Map()
  // Last satellite whose info card is showing — used to retroactively fill meta once satcat loads.
  private _lastInfoNorad: string | null = null
  private _lastInfoSatrec: satellite.SatRec | null = null

  // Live position ticking for the selected satellite info card.
  private liveTickInterval: ReturnType<typeof setInterval> | null = null
  private liveSelectedSatrec: satellite.SatRec | null = null

  // Country map layer (loaded lazily when border mode is first enabled)
  private bordersEnabled = false
  private _countryDataLoading = false
  private _userCloudsVisible = true
  private countryFillMesh: CountryFillMesh | null = null
  private countryBorderMesh: CountryBorderMesh | null = null
  private countryHighlightMesh: CountryHighlightMesh | null = null
  private graticuleMesh: GraticuleMesh | null = null
  private countryFeatures: GeoJSONFeature[] = []
  private _raycaster = new THREE.Raycaster()

  // Country name labels (CSS2D overlay)
  private labelRenderer: CSS2DRenderer | null = null
  private countryLabelObjects: CSS2DObject[] = []
  private countryLabelPositions: THREE.Vector3[] = []
  private countryLabelSizes: number[] = []

  onCatalogRefresh: ((count: number) => void) | null = null
  onCatalogError: (() => void) | null = null
  onSatelliteClick: ((name: string, noradId: string) => void) | null = null
  onSatelliteHover: ((name: string | null, altKm: number | null, screenX: number, screenY: number) => void) | null = null
  onLivePosition: ((pos: LivePosition) => void) | null = null
  onSatelliteSelectInfo: ((orbital: OrbitalParams, meta: SatcatEntry | null) => void) | null = null
  // Fires when a satellite is individually removed from selection (tray ✕).
  onSatelliteRemove: ((noradId: string) => void) | null = null
  onCountryClick: ((name: string, continent: string, centLat: number, centLon: number) => void) | null = null
  onSimulatedTime: ((date: Date) => void) | null = null

  setTimeScale(scale: number): void {
    this._timeScale = scale
    if (scale === 1) this._simTimeMs = Date.now()
    // Reset rate-limiter and busy flag so the next RAF frame immediately sends a fresh tick
    this.lastFieldTickMs = 0
    this.workerBusy = false
  }

  getSimulatedTime(): Date {
    return new Date(this._simTimeMs)
  }

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

    // earthGroup rotates by GMST each frame — all Earth-surface geometry lives here
    // (Earth mesh, clouds, borders, fills, graticule, country labels, highlight).
    // Satellites and arcs remain in scene (ECI world space).
    this.earthGroup = new THREE.Group()
    this.scene.add(this.earthGroup)

    this.stars = new StarField()
    this.stars.addToScene(this.scene)

    this.sun = new SunMesh()
    this.sun.addToScene(this.scene)

    this.earth = new EarthMesh(this.renderer)
    this.earthGroup.add(this.earth.mesh)

    this.clouds = new CloudMesh()
    this.earthGroup.add(this.clouds.mesh)

    this.atmosphere = new AtmosphereMesh()
    this.scene.add(this.atmosphere.mesh)

    this.iss = new SatelliteMesh(ISS_TLE1, ISS_TLE2)
    this.scene.add(this.iss.group)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.minDistance = 1.3
    this.controls.maxDistance = 15
    this.controls.autoRotate = false

    // CSS2D label overlay — positioned over the canvas inside its container div
    const container = canvas.parentElement
    if (container) {
      this.labelRenderer = new CSS2DRenderer()
      this.labelRenderer.setSize(w, h)
      this.labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:hidden'
      container.appendChild(this.labelRenderer.domElement)
      this._injectLabelStyles()
    }

    this.tick()
    requestAnimationFrame(() => { if (this.mounted) onReady?.() })
    void this.refreshIssTle()
    this.issTleInterval = setInterval(() => void this.refreshIssTle(), 2 * 60 * 1000)
    void this.initCatalog()
    this.catalogRefreshInterval = setInterval(() => {
      void this.initCatalog()
    }, 30 * 60 * 1000)

    this.clickCanvas = canvas
    canvas.addEventListener('mousedown', this.onCanvasMouseDown)
    canvas.addEventListener('click', this.onCanvasClick)
    canvas.addEventListener('mousemove', this.onCanvasMouseMove)
    canvas.addEventListener('touchstart', this.onCanvasTouchStart, { passive: true })

    void fetchSatcat().then(m => {
      if (!this.mounted) return
      this.satcat = m
      // If a satellite was selected before satcat loaded, re-fire with the now-available meta.
      if (this._lastInfoNorad && this._lastInfoSatrec) {
        const meta = m.get(this._lastInfoNorad) ?? null
        if (meta) {
          const orbital = Globe.computeOrbitalParams(this._lastInfoSatrec)
          this.onSatelliteSelectInfo?.(orbital, meta)
        }
      }
    })
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

  setCloudVisibility(visible: boolean): void {
    this._userCloudsVisible = visible
    // In border/map mode clouds are always hidden; respect user preference otherwise
    if (!this.bordersEnabled) this.clouds.mesh.visible = visible
  }

  async setBordersVisible(visible: boolean): Promise<void> {
    this.bordersEnabled = visible

    if (!visible) {
      // Restore photorealistic style
      this.earth.setMapMode(false)
      this.clouds.mesh.visible = this._userCloudsVisible
      if (this.countryFillMesh) this.earthGroup.remove(this.countryFillMesh.mesh)
      if (this.graticuleMesh) this.earthGroup.remove(this.graticuleMesh.mesh)
      if (this.countryBorderMesh) this.earthGroup.remove(this.countryBorderMesh.mesh)
      this.countryHighlightMesh?.clear()
      for (const label of this.countryLabelObjects) label.visible = false
      // Hide label overlay DOM so frozen CSS2D elements don't linger ("screen burn")
      if (this.labelRenderer) this.labelRenderer.domElement.style.display = 'none'
      this.hoveredCountryName = null
      return
    }

    // Switch to dark map style
    this.earth.setMapMode(true)
    this.clouds.mesh.visible = false
    if (this.labelRenderer) this.labelRenderer.domElement.style.display = ''

    // Already loaded — just re-add to earthGroup
    if (this.countryFeatures.length > 0 && this.countryBorderMesh) {
      if (this.countryFillMesh) this.earthGroup.add(this.countryFillMesh.mesh)
      if (this.graticuleMesh) this.earthGroup.add(this.graticuleMesh.mesh)
      this.earthGroup.add(this.countryBorderMesh.mesh)
      return
    }

    // First enable — fetch GeoJSON and build all layers
    if (this._countryDataLoading) return
    this._countryDataLoading = true
    try {
      const res = await fetch('/data/countries-50m.json')
      if (!res.ok) throw new Error(`status ${res.status}`)
      const geojson: GeoJSONCollection = await res.json() as GeoJSONCollection
      if (!this.mounted) return

      this.countryFeatures = geojson.features

      this.countryFillMesh = new CountryFillMesh(geojson)
      this.earthGroup.add(this.countryFillMesh.mesh)

      this.graticuleMesh = new GraticuleMesh()
      this.earthGroup.add(this.graticuleMesh.mesh)

      this.countryBorderMesh = new CountryBorderMesh(geojson)
      this.earthGroup.add(this.countryBorderMesh.mesh)

      this.countryHighlightMesh = new CountryHighlightMesh(this.earthGroup)

      this._initCountryLabels(geojson)
    } catch (err) {
      console.warn('[Globe] Country GeoJSON load failed:', err)
      this.bordersEnabled = false
      this.earth.setMapMode(false)
      this.clouds.mesh.visible = this._userCloudsVisible
      throw err
    } finally {
      this._countryDataLoading = false
    }
  }

  private _injectLabelStyles(): void {
    if (document.getElementById('globe-label-styles')) return
    const style = document.createElement('style')
    style.id = 'globe-label-styles'
    style.textContent = [
      '.globe-country-label{',
      "font-family:'JetBrains Mono',monospace;",
      'font-size:10px;font-weight:600;',
      'color:rgba(148,163,184,0.7);',
      'letter-spacing:0.1em;',
      'text-shadow:0 1px 4px rgba(0,0,0,0.95);',
      'pointer-events:none;user-select:none;white-space:nowrap}',
    ].join('')
    document.head.appendChild(style)
  }

  private _initCountryLabels(geojson: GeoJSONCollection): void {
    const DEG = Math.PI / 180
    for (const feature of geojson.features) {
      if (!feature.properties) continue
      const name = feature.properties.NAME as string | undefined
      const lon = feature.properties.LABEL_X as number | undefined
      const lat = feature.properties.LABEL_Y as number | undefined
      if (!name || lon === undefined || lat === undefined) continue

      const φ = lat * DEG, λ = lon * DEG
      const pos = new THREE.Vector3(
        Math.cos(φ) * Math.cos(λ),
        Math.sin(φ),
        -Math.cos(φ) * Math.sin(λ),
      )

      // Compute bounding-box size proxy for zoom-scaled label visibility
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
      const polys: number[][][][] = feature.geometry.type === 'Polygon'
        ? [(feature.geometry.coordinates as number[][][])]
        : (feature.geometry.coordinates as number[][][][])
      for (const poly of polys) {
        for (const ring of poly) {
          for (const [lo, la] of ring) {
            if (lo < minLon) minLon = lo
            if (lo > maxLon) maxLon = lo
            if (la < minLat) minLat = la
            if (la > maxLat) maxLat = la
          }
        }
      }
      const dLon = maxLon < minLon ? 0 : maxLon - minLon
      const dLat = maxLat < minLat ? 0 : maxLat - minLat
      const sizeProxy = Math.sqrt(dLon * dLat)

      const div = document.createElement('div')
      div.textContent = name.toUpperCase()
      div.className = 'globe-country-label'

      const label = new CSS2DObject(div)
      label.position.copy(pos)
      label.visible = false
      this.earthGroup.add(label)
      this.countryLabelObjects.push(label)
      this.countryLabelPositions.push(pos.clone())
      this.countryLabelSizes.push(sizeProxy)
    }
  }

  private _updateLabelVisibility(): void {
    const camDist = this.camera.position.length()
    const camDir = this.camera.position.clone().normalize()

    for (let i = 0; i < this.countryLabelObjects.length; i++) {
      const sizeProxy = this.countryLabelSizes[i] ?? 0
      const showThreshold = Math.max(1.5, Math.min(2.5, 1.4 + sizeProxy * 0.01))
      // Labels are in earthGroup (local ECEF space) — must use world position for cull check
      this.countryLabelObjects[i].getWorldPosition(this._tempLabelWorldPos)
      const onFront = this._tempLabelWorldPos.dot(camDir) > 0.15
      this.countryLabelObjects[i].visible = onFront && camDist < showThreshold
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

      if (this.field && this.worker && Math.abs(others.length - this.satNames.length) <= 200) {
        this.satNames = others.map((t: TLERecord) => t.name)
        this.satNoradIds = others.map((t: TLERecord) => t.norad_id)
        this.satTles = others.map((t: TLERecord) => ({ tle1: t.tle1, tle2: t.tle2 }))
        this.satCategories = others.map((t: TLERecord) => classifySatellite(t.name))
        this.catalogCount = others.length + 1
        this.onCatalogRefresh?.(this.catalogCount)
        this.rebuildCategoryMask()
        this.buildSatScales()
        if (this.agentFilterCategories) this.applyAgentCategoryColors()
        this.worker.postMessage({ type: 'init', tles: others })
        return
      }

      // Full init — clear selections first (indices are about to become stale)
      this.clearAllSelections()

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
      this.buildSatScales()

      this.hoveredIdx = -1

      this.field = new SatelliteField(others.length)
      this.scene.add(this.field.mesh)
      if (this.agentFilterCategories) this.applyAgentCategoryColors()

      this.worker = new Worker(
        new URL('../workers/propagator.worker.ts', import.meta.url),
        { type: 'module' },
      )
      this.worker.onmessage = (e: MessageEvent) => {
        this.workerBusy = false
        const msg = e.data as { type: string; buffer?: Float32Array }
        if (msg.type === 'positions' && msg.buffer && this.field) {
          this.lastPositionBuffer = msg.buffer
          this.field.update(msg.buffer, this.activeCategoryMask, this.satScales)
        }
      }
      this.worker.onerror = (e: ErrorEvent) => {
        this.workerBusy = false
        console.warn('[Globe] Propagator worker error, running ISS-only:', e.message)
      }
      this.worker.postMessage({ type: 'init', tles: others })
    } catch (err) {
      console.warn('[Globe] Catalog unavailable, running ISS-only:', err)
      this.onCatalogError?.()
    }
  }

  // ── Category filtering ──────────────────────────────────────────────────────

  setActiveCategories(cats: Set<SatCategory>): void {
    this.agentFilterCategories = null
    this.activeCategories = cats
    this.rebuildCategoryMask()
    if (this.field && this.lastPositionBuffer) {
      this.field.update(this.lastPositionBuffer, this.activeCategoryMask, this.satScales)
    }
    if (this.field) this.field.setCategoryColors([], null)
    if (this.hoveredIdx >= 0) this.refreshInstanceColor(this.hoveredIdx)
    for (const idx of this.selectedIdxs) this.refreshInstanceColor(idx)
  }

  applyAgentFilter(categories: SatCategory[]): void {
    const cats = categories.length > 0 ? categories : [...ALL_CATEGORIES]
    this.agentFilterCategories = categories.length > 0 ? [...categories] : null
    this.activeCategories = new Set(cats)
    this.rebuildCategoryMask()
    if (this.field && this.lastPositionBuffer) {
      this.field.update(this.lastPositionBuffer, this.activeCategoryMask, this.satScales)
    }
    this.applyAgentCategoryColors()
  }

  applySpotlight(noradId: string | null): void {
    if (noradId === null) {
      this.rebuildCategoryMask()
    } else if (noradId === ISS_NORAD) {
      // ISS is its own SatelliteMesh — zero out the field mask to hide all catalog satellites
      const count = this.satCategories.length
      this.activeCategoryMask = count > 0 ? new Uint8Array(count) : null
    } else {
      const idx = this.satNoradIds.indexOf(noradId)
      const count = this.satCategories.length
      if (idx !== -1 && count > 0) {
        const mask = new Uint8Array(count)
        mask[idx] = 1
        this.activeCategoryMask = mask
      } else {
        // Not in catalog — fall back to normal mask
        this.rebuildCategoryMask()
      }
    }
    if (this.field && this.lastPositionBuffer) {
      this.field.update(this.lastPositionBuffer, this.activeCategoryMask, this.satScales)
    }
    this.field?.setCategoryColors([], null)
    if (this.hoveredIdx >= 0) this.refreshInstanceColor(this.hoveredIdx)
    for (const idx of this.selectedIdxs) this.refreshInstanceColor(idx)
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
    if (this.hoveredIdx >= 0) this.refreshInstanceColor(this.hoveredIdx)
    for (const idx of this.selectedIdxs) this.refreshInstanceColor(idx)
  }

  getCategoryCount(cat: SatCategory): number {
    return this.satCategories.filter(c => c === cat).length
  }

  private buildSatScales(): void {
    const count = this.satTles.length
    const scales = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const cat = this.satCategories[i]
      if (cat === 'DEBRIS') {
        scales[i] = 0.6
      } else {
        const tle2 = this.satTles[i]?.tle2 ?? ''
        const motionRevDay = parseFloat(tle2.substring(52, 63))
        scales[i] = (!isNaN(motionRevDay) && motionRevDay < 1.5) ? 1.5 : 1.0
      }
    }
    this.satScales = scales
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

  // ── Live position tick ───────────────────────────────────────────────────────

  private static computeOrbitalParams(satrec: satellite.SatRec): OrbitalParams {
    const MU = 398600.4418
    const noRads = satrec.no / 60
    const a = Math.cbrt(MU / (noRads * noRads))
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
      const now = new Date(this._simTimeMs)
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

  private handleSatSelect(noradId: string, satrec: satellite.SatRec): void {
    this.startLiveTick(satrec)
    this._lastInfoNorad = noradId
    this._lastInfoSatrec = satrec
    const orbital = Globe.computeOrbitalParams(satrec)
    const meta = this.satcat.get(noradId) ?? null
    this.onSatelliteSelectInfo?.(orbital, meta)
  }

  // ── Multi-satellite selection ─────────────────────────────────────────────────

  // Remove one satellite from scene resources (arc, trail, interval) without touching state sets.
  private _disposeSatFromScene(noradId: string): void {
    const arc = this.groundTrackLines.get(noradId)
    if (arc) {
      this.scene.remove(arc)
      arc.geometry.dispose()
      ;(arc.material as THREE.Material).dispose()
      this.groundTrackLines.delete(noradId)
    }
    const trail = this.trailLines.get(noradId)
    if (trail) {
      this.scene.remove(trail)
      trail.geometry.dispose()
      ;(trail.material as THREE.Material).dispose()
      this.trailLines.delete(noradId)
    }
    const interval = this.recomputeIntervals.get(noradId)
    if (interval !== undefined) {
      clearInterval(interval)
      this.recomputeIntervals.delete(noradId)
    }
  }

  // Clear all selections at once (used during full catalog rebuild).
  // Fires onSatelliteRemove for each removed satellite so App.tsx stays in sync.
  private clearAllSelections(): void {
    const norads = [...this.selectedNoradIds]
    for (const noradId of norads) {
      this._disposeSatFromScene(noradId)
    }
    // Restore instance colors for any catalog dots that were highlighted
    for (const idx of this.selectedIdxs) {
      if (this.field) this.field.setInstanceColor(idx, this.getBaseInstanceColor(idx))
    }
    this.selectedNoradIds.clear()
    this.selectedIdxs.clear()
    this.stopLiveTick()
    // Notify App.tsx for each removed satellite
    for (const noradId of norads) {
      this.onSatelliteRemove?.(noradId)
    }
  }

  // Public — called from App.tsx when tray chip ✕ is clicked.
  removeFromSelection(noradId: string): void {
    if (!this.selectedNoradIds.has(noradId)) return
    this._disposeSatFromScene(noradId)
    this.selectedNoradIds.delete(noradId)
    if (noradId !== ISS_NORAD) {
      const idx = this.satNoradIds.indexOf(noradId)
      if (idx >= 0) {
        this.selectedIdxs.delete(idx)
        this.refreshInstanceColor(idx)
      }
    }
    if (this.selectedNoradIds.size === 0) this.stopLiveTick()
    this.onSatelliteRemove?.(noradId)
  }

  // Build a trail line object (last 10 min of propagated path) without adding to scene.
  private _buildTrail(satrec: satellite.SatRec): THREE.Line | null {
    const now = new Date()
    const nowMs = now.getTime()

    const TRAIL_POINTS = 60
    const TRAIL_MS = 10 * 60 * 1000
    const positions: number[] = []
    const colors: number[] = []

    for (let i = 0; i < TRAIL_POINTS; i++) {
      const t = new Date(nowMs - (TRAIL_POINTS - 1 - i) * (TRAIL_MS / TRAIL_POINTS))
      const posVel = satellite.propagate(satrec, t)
      if (!posVel.position || typeof posVel.position !== 'object') continue
      const pos = posVel.position as satellite.EciVec3<number>
      const mag = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2)
      if (mag < 1) continue
      const r = mag / R_EARTH_KM
      positions.push(pos.x / mag * r, pos.z / mag * r, -pos.y / mag * r)
      const alpha = i / (TRAIL_POINTS - 1)
      colors.push(0x4a / 255 * alpha, 0xde / 255 * alpha, 0x80 / 255 * alpha)
    }

    if (positions.length < 6) return null

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    return new THREE.Line(geo, mat)
  }

  // Replace the trail for a satellite in-scene (removes old one if present).
  private _refreshTrail(noradId: string, satrec: satellite.SatRec): void {
    const old = this.trailLines.get(noradId)
    if (old) {
      this.scene.remove(old)
      old.geometry.dispose()
      ;(old.material as THREE.Material).dispose()
      this.trailLines.delete(noradId)
    }
    const trail = this._buildTrail(satrec)
    if (trail) {
      this.trailLines.set(noradId, trail)
      this.scene.add(trail)
    }
  }

  // Add a catalog satellite to the selection tray (or re-focus if already there).
  private _addCatalogSatToSelection(idx: number, noradId: string): void {
    const tle = this.satTles[idx]
    if (!tle) return
    const satrec = satellite.twoline2satrec(tle.tle1, tle.tle2)

    // Always update live tick and card info, even if already selected.
    this.handleSatSelect(noradId, satrec)

    if (this.selectedNoradIds.has(noradId)) return  // arc + trail already exist

    this.selectedNoradIds.add(noradId)
    this.selectedIdxs.add(idx)

    // Build arc
    const points = computeArcPoints(satrec)
    if (points.length >= 2) {
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 })
      const arc = new THREE.LineLoop(geo, mat)
      this.groundTrackLines.set(noradId, arc)
      this.scene.add(arc)
    }

    this._refreshTrail(noradId, satrec)
    this.refreshInstanceColor(idx)

    // Recompute arc every 60 s to keep its start point near the current position
    const interval = setInterval(() => {
      if (!this.selectedNoradIds.has(noradId)) return
      const t = this.satTles[idx]
      if (!t) return
      const sr = satellite.twoline2satrec(t.tle1, t.tle2)
      const arc = this.groundTrackLines.get(noradId)
      if (arc) arc.geometry.setFromPoints(computeArcPoints(sr))
      this._refreshTrail(noradId, sr)
    }, 60 * 1000)
    this.recomputeIntervals.set(noradId, interval)
  }

  // Add ISS to the selection tray (or re-focus if already there).
  // ISS arc is managed by SatelliteMesh; we only manage the trail here.
  private _addIssToSelection(): void {
    this.handleSatSelect(ISS_NORAD, this.issSatrec)
    if (this.selectedNoradIds.has(ISS_NORAD)) return
    this.selectedNoradIds.add(ISS_NORAD)
    this._refreshTrail(ISS_NORAD, this.issSatrec)
  }

  searchCatalog(query: string, maxResults = 8): SearchResults {
    if (!query.trim()) return { results: [], total: 0 }
    const results: SearchResult[] = []
    const issMatch = matchesSatellite(query, this.issName, ISS_NORAD)
    if (issMatch) results.push({ name: this.issName, noradId: ISS_NORAD })
    const { results: rest, total: restTotal } = matchSatelliteQuery(
      query, this.satNames, this.satNoradIds, maxResults - results.length,
    )
    results.push(...rest)
    return { results, total: restTotal + (issMatch ? 1 : 0) }
  }

  private _flyToCurrentPosition(satrec: satellite.SatRec): void {
    const now = new Date()
    const posVel = satellite.propagate(satrec, now)
    if (!posVel.position || typeof posVel.position !== 'object') return
    const pos = posVel.position as satellite.EciVec3<number>
    const mag = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z)
    if (mag < 1) return
    const flyDistance = Math.max(CAMERA_DISTANCE, (mag / R_EARTH_KM) * 1.5)
    this.flyFromPos = this.camera.position.clone()
    this.flyToPos = new THREE.Vector3(
       (pos.x / mag) * flyDistance,
       (pos.z / mag) * flyDistance,  // ECI Z → world Y
      -(pos.y / mag) * flyDistance,  // ECI Y → world -Z
    )
    this.flyStartTime = performance.now()
  }

  private _satFlyDistance(satrec: satellite.SatRec): number {
    const posVel = satellite.propagate(satrec, new Date())
    if (!posVel.position || typeof posVel.position !== 'object') return CAMERA_DISTANCE
    const pos = posVel.position as satellite.EciVec3<number>
    const mag = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z)
    return mag < 1 ? CAMERA_DISTANCE : Math.max(CAMERA_DISTANCE, (mag / R_EARTH_KM) * 1.5)
  }

  selectCatalogSatellite(noradId: string): void {
    if (noradId === ISS_NORAD) {
      this._addIssToSelection()
      this._flyToCurrentPosition(this.issSatrec)
      this.onSatelliteClick?.(this.issName, ISS_NORAD)
      return
    }
    const idx = this.satNoradIds.indexOf(noradId)
    if (idx < 0) return
    this._addCatalogSatToSelection(idx, noradId)
    const tle = this.satTles[idx]
    if (tle) this._flyToCurrentPosition(satellite.twoline2satrec(tle.tle1, tle.tle2))
    this.onSatelliteClick?.(this.satNames[idx] ?? noradId, noradId)
  }

  // ── Instance colour helpers ──────────────────────────────────────────────────

  private getBaseInstanceColor(idx: number): THREE.Color {
    if (this.agentFilterCategories !== null) {
      const cat = this.satCategories[idx]
      return cat ? (GROUP_HIGHLIGHT_COLORS[cat] ?? SAT_DEFAULT_COLOR) : SAT_DEFAULT_COLOR
    }
    return SAT_DEFAULT_COLOR
  }

  private refreshInstanceColor(idx: number): void {
    if (idx < 0 || !this.field) return
    if (idx === this.hoveredIdx || this.selectedIdxs.has(idx)) {
      this.field.setInstanceColor(idx, HIGHLIGHT_COLOR)
    } else {
      this.field.setInstanceColor(idx, this.getBaseInstanceColor(idx))
    }
  }

  // ── Click handler ────────────────────────────────────────────────────────────

  private onCanvasMouseDown = (e: MouseEvent): void => {
    this._lastInputWasTouch = false
    this._mouseDownX = e.clientX
    this._mouseDownY = e.clientY
  }

  private onCanvasTouchStart = (e: TouchEvent): void => {
    const touch = e.touches[0]
    if (!touch) return
    this._lastInputWasTouch = true
    this._mouseDownX = touch.clientX
    this._mouseDownY = touch.clientY
  }

  private onCanvasClick = (e: MouseEvent): void => {
    if (!this.onSatelliteClick && !this.onCountryClick) return
    const isTouch = this._lastInputWasTouch
    // Drag threshold: 12 px for touch (fingers aren't pixel-precise), 5 px for mouse.
    const dx = e.clientX - this._mouseDownX
    const dy = e.clientY - this._mouseDownY
    if (dx * dx + dy * dy > (isTouch ? 144 : 25)) return
    // On touch, enforce a minimum hit radius so a finger can reliably tap a 2 px dot.
    const minRadiusPx = isTouch ? TOUCH_MIN_RADIUS_PX : 0

    const canvas = e.target as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const fovFactor = rect.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360))
    const camX = this.camera.position.x
    const camY = this.camera.position.y
    const camZ = this.camera.position.z
    // Camera-space z-depth: me is column-major, so row 2 of the view matrix is [me[2], me[6], me[10], me[14]].
    // depth = -(viewMatrix * worldPos).z — positive value for objects in front of camera.
    const me = this.camera.matrixWorldInverse.elements

    // Check ISS first — it shares a position with docked modules in the catalog.
    const issPos = this.iss.getCurrentPosition()
    if (issPos) {
      this._projPos.copy(issPos).project(this.camera)
      if (this._projPos.z <= 1) {
        const sx = (this._projPos.x + 1) * 0.5 * rect.width
        const sy = (1 - this._projPos.y) * 0.5 * rect.height
        const screenDist = Math.hypot(sx - clickX, sy - clickY)
        const depth = -(me[2]*issPos.x + me[6]*issPos.y + me[10]*issPos.z + me[14])
        const dotRadiusPx = Math.max(minRadiusPx, (0.008 / depth) * fovFactor)
        if (screenDist <= dotRadiusPx) {
          this._addIssToSelection()
          this.onSatelliteClick?.(this.issName, ISS_NORAD)
          return
        }
      }
    }

    if (!this.lastPositionBuffer) return
    const buf = this.lastPositionBuffer

    // Short-circuit: if a catalog satellite is already hovered, clicking always works.
    if (this.hoveredIdx >= 0) {
      const name = this.satNames[this.hoveredIdx]
      const noradId = this.satNoradIds[this.hoveredIdx]
      if (name && noradId) {
        this._addCatalogSatToSelection(this.hoveredIdx, noradId)
        this.onSatelliteClick?.(name, noradId)
        return
      }
    }

    const count = buf.length / 3
    const SPHERE_RADIUS = 0.005

    // Touch: pick nearest in screen space so the finger always lands on the closest dot.
    // Mouse: pick nearest in depth (front-most) — same behaviour as before.
    let bestScore = Infinity
    let bestIdx = -1

    for (let i = 0; i < count; i++) {
      if (this.activeCategoryMask && !this.activeCategoryMask[i]) continue

      const satX = buf[i * 3], satY = buf[i * 3 + 1], satZ = buf[i * 3 + 2]
      if (satX * camX + satY * camY + satZ * camZ <= 0) continue

      this._projPos.set(satX, satY, satZ)
      this._projPos.project(this.camera)
      if (this._projPos.z > 1) continue

      const sx = (this._projPos.x + 1) * 0.5 * rect.width
      const sy = (1 - this._projPos.y) * 0.5 * rect.height
      const screenDist = Math.hypot(sx - clickX, sy - clickY)

      const depth = -(me[2]*satX + me[6]*satY + me[10]*satZ + me[14])
      const scale = this.satScales ? this.satScales[i] : 1.0
      const dotRadiusPx = Math.max(minRadiusPx, (SPHERE_RADIUS * scale / depth) * fovFactor)
      const score = isTouch ? screenDist : depth

      if (screenDist <= dotRadiusPx && score < bestScore) {
        bestScore = score
        bestIdx = i
      }
    }

    if (bestIdx >= 0) {
      const name = this.satNames[bestIdx]
      const noradId = this.satNoradIds[bestIdx]
      if (name && noradId) {
        this._addCatalogSatToSelection(bestIdx, noradId)
        this.onSatelliteClick?.(name, noradId)
      }
    } else if (this.bordersEnabled && this.countryFeatures.length > 0 && this.onCountryClick) {
      const ndcX = (clickX / rect.width) * 2 - 1
      const ndcY = -(clickY / rect.height) * 2 + 1
      this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
      const hits = this._raycaster.intersectObject(this.earth.mesh)
      if (hits.length > 0) {
        const p = hits[0].point
        // p is in ECI world space — subtract GMST to get geographic (ECEF) longitude
        const latDeg = Math.asin(Math.max(-1, Math.min(1, p.y))) * (180 / Math.PI)
        const lonDeg = (Math.atan2(-p.z, p.x) - this._lastGmst) * (180 / Math.PI)
        const feature = this.countryFeatures.find(
          f => geoContains(f as unknown as GeoFeature, [lonDeg, latDeg])
        )
        if (feature) {
          const name = String(feature.properties?.NAME ?? 'Unknown')
          const continent = String(feature.properties?.CONTINENT ?? '')
          const centLat = Number(feature.properties?.LABEL_Y ?? latDeg)
          const centLon = Number(feature.properties?.LABEL_X ?? lonDeg)
          this.countryHighlightMesh?.update(feature)
          this.onCountryClick(name, continent, centLat, centLon)
        }
      }
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
    const HOVER_EXTRA_PX = 0
    const me = this.camera.matrixWorldInverse.elements

    const issPos = this.iss.getCurrentPosition()
    if (issPos) {
      this._projPos.copy(issPos).project(this.camera)
      if (this._projPos.z <= 1) {
        const sx = (this._projPos.x + 1) * 0.5 * rect.width
        const sy = (1 - this._projPos.y) * 0.5 * rect.height
        const screenDist = Math.hypot(sx - mouseX, sy - mouseY)
        const depth = -(me[2]*issPos.x + me[6]*issPos.y + me[10]*issPos.z + me[14])
        const dotRadiusPx = (0.008 / depth) * fovFactor
        if (screenDist <= dotRadiusPx + HOVER_EXTRA_PX) {
          const r = issPos.length()
          const altKm = Math.round((r - 1) * R_EARTH_KM)
          if (this.hoveredIdx !== -2) {
            const prev = this.hoveredIdx
            this.hoveredIdx = -2
            if (prev >= 0) this.refreshInstanceColor(prev)
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
      if (satX * camX + satY * camY + satZ * camZ <= 0) continue

      this._projPos.set(satX, satY, satZ)
      this._projPos.project(this.camera)
      if (this._projPos.z > 1) continue

      const sx = (this._projPos.x + 1) * 0.5 * rect.width
      const sy = (1 - this._projPos.y) * 0.5 * rect.height
      const screenDist = Math.hypot(sx - mouseX, sy - mouseY)

      const depth = -(me[2]*satX + me[6]*satY + me[10]*satZ + me[14])
      const scale = this.satScales ? this.satScales[i] : 1.0
      const dotRadiusPx = (SPHERE_RADIUS * scale / depth) * fovFactor

      if (screenDist <= dotRadiusPx + HOVER_EXTRA_PX && depth < bestDepth) {
        bestDepth = depth
        bestIdx = i
      }
    }

    if (bestIdx >= 0) {
      this.hoveredCountryName = null
      const name = this.satNames[bestIdx]
      const x = buf[bestIdx * 3], y = buf[bestIdx * 3 + 1], z = buf[bestIdx * 3 + 2]
      const r = Math.sqrt(x * x + y * y + z * z)
      const altKm = Math.round((r - 1) * R_EARTH_KM)
      if (bestIdx !== this.hoveredIdx) {
        const prev = this.hoveredIdx
        this.hoveredIdx = bestIdx
        if (prev >= 0) this.refreshInstanceColor(prev)
        this.refreshInstanceColor(bestIdx)
        this.onSatelliteHover(name ?? null, altKm, e.clientX, e.clientY)
      }
    } else {
      if (this.hoveredIdx !== -1) {
        const prev = this.hoveredIdx
        this.hoveredIdx = -1
        if (prev >= 0) this.refreshInstanceColor(prev)
      }
      // Country hover in border mode — raycast earth surface → geoContains
      if (this.bordersEnabled && this.countryFeatures.length > 0) {
        const ndcX = (mouseX / rect.width) * 2 - 1
        const ndcY = -(mouseY / rect.height) * 2 + 1
        this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
        const hits = this._raycaster.intersectObject(this.earth.mesh)
        if (hits.length > 0) {
          const p = hits[0].point
          // p is in ECI world space — subtract GMST to get geographic (ECEF) longitude
          const latDeg = Math.asin(Math.max(-1, Math.min(1, p.y))) * (180 / Math.PI)
          const lonDeg = (Math.atan2(-p.z, p.x) - this._lastGmst) * (180 / Math.PI)
          const feature = this.countryFeatures.find(
            f => geoContains(f as unknown as GeoFeature, [lonDeg, latDeg])
          )
          const name = feature ? String(feature.properties?.NAME ?? '') : ''
          if (name) {
            if (name !== this.hoveredCountryName) {
              this.hoveredCountryName = name
              this.onSatelliteHover?.(name, null, e.clientX, e.clientY)
            }
            return
          }
        }
        if (this.hoveredCountryName !== null) {
          this.hoveredCountryName = null
          this.onSatelliteHover?.(null, null, e.clientX, e.clientY)
        }
      } else {
        this.onSatelliteHover?.(null, null, e.clientX, e.clientY)
      }
    }
  }

  // ── Agent highlight ──────────────────────────────────────────────────────────

  highlightSatellite(noradId: string, latDeg?: number, lonDeg?: number): void {
    let targetPos: THREE.Vector3 | null = null

    // Compute altitude-aware fly distance
    let flyDistance = CAMERA_DISTANCE
    if (noradId === ISS_NORAD) {
      flyDistance = this._satFlyDistance(this.issSatrec)
    } else {
      const idx = this.satNoradIds.indexOf(noradId)
      if (idx >= 0) {
        const tle = this.satTles[idx]
        if (tle) flyDistance = this._satFlyDistance(satellite.twoline2satrec(tle.tle1, tle.tle2))
      }
    }

    if (latDeg !== undefined && lonDeg !== undefined) {
      const lat = latDeg * (Math.PI / 180)
      // Geographic lon → ECI lon by adding GMST (world space is ECI)
      const lon = lonDeg * (Math.PI / 180) + this._lastGmst
      targetPos = new THREE.Vector3(
         flyDistance * Math.cos(lat) * Math.cos(lon),
         flyDistance * Math.sin(lat),
        -flyDistance * Math.cos(lat) * Math.sin(lon),
      )
    } else if (noradId === ISS_NORAD) {
      const issPos = this.iss.getCurrentPosition()
      if (issPos) targetPos = issPos.clone().normalize().multiplyScalar(flyDistance)
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

  getAllCategoryCounts(): Record<string, number> {
    const counts: Record<string, number> = { STARLINK: 0, GPS: 0, IRIDIUM: 0, DEBRIS: 0, OTHER: 0 }
    for (const cat of this.satCategories) counts[cat] = (counts[cat] ?? 0) + 1
    counts.OTHER += 1 // ISS is tracked separately but is part of the total
    return counts
  }

  clearCountryHighlight(): void {
    this.countryHighlightMesh?.clear()
  }

  getOverheadSatellites(latDeg: number, lonDeg: number, minElevDeg = 10): OverheadSat[] {
    if (!this.lastPositionBuffer) return []
    // all categories off → treat as "no filter" so the overhead list always shows something
    const mask = this.activeCategories.size === 0 ? null : this.activeCategoryMask
    return computeOverhead(
      this.lastPositionBuffer,
      this.satNames,
      this.satNoradIds,
      mask,
      latDeg,
      lonDeg,
      minElevDeg,
      this._lastGmst,
    )
  }

  private tick(): void {
    this.rafId = requestAnimationFrame(() => this.tick())

    // Advance simulated time
    const realNow = performance.now()
    if (this._lastTickRealMs === 0) this._lastTickRealMs = realNow
    const dt = Math.min(realNow - this._lastTickRealMs, 200)
    this._lastTickRealMs = realNow

    if (this._timeScale === 1) {
      this._simTimeMs = Date.now()  // stay pinned to real time, no drift
    } else {
      this._simTimeMs += dt * this._timeScale
    }

    // Fire per-second callback for UI clock updates
    const simSecond = Math.floor(this._simTimeMs / 1000)
    if (simSecond !== this._lastSimSecond) {
      this._lastSimSecond = simSecond
      this.onSimulatedTime?.(new Date(this._simTimeMs))
    }

    const now = new Date(this._simTimeMs)
    const nowMs = this._simTimeMs

    const gmst = satellite.gstime(now)
    this._lastGmst = gmst
    this.earthGroup.rotation.y = gmst

    getSunDirection(now, this._sunDir)
    this.earth.update(this._sunDir)
    this.sun.update(this._sunDir)
    this.iss.update(now)

    // At fast/reverse time scales tick the worker more frequently so satellite positions
    // update closer to the RAF rate — otherwise visible jumps appear between frames.
    const dynamicTickMs = this._timeScale === 1
      ? FIELD_TICK_MS
      : Math.max(16, Math.floor(FIELD_TICK_MS / Math.min(Math.abs(this._timeScale), 3)))
    if (this.worker && !this.workerBusy && realNow - this.lastFieldTickMs >= dynamicTickMs) {
      this.workerBusy = true
      this.lastFieldTickMs = realNow
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

    // Rotate/zoom speed scale with camera distance — slower when close for precision.
    {
      const t = Math.max(0, Math.min(1, (this.camera.position.length() - 1.3) / 13.7))
      const tSqrt = Math.sqrt(t)
      this.controls.rotateSpeed = 0.15 + tSqrt * 0.35  // 0.15 close → 0.50 far
      this.controls.zoomSpeed   = 0.50 + t    * 0.50   // 0.50 close → 1.00 far
    }

    this.renderer.render(this.scene, this.camera)
    if (this.labelRenderer && this.bordersEnabled) {
      this._updateLabelVisibility()
      this.labelRenderer.render(this.scene, this.camera)
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.labelRenderer?.setSize(width, height)
  }

  unmount(): void {
    this.mounted = false
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    if (this.catalogRefreshInterval !== null) { clearInterval(this.catalogRefreshInterval); this.catalogRefreshInterval = null }
    if (this.issTleInterval !== null) { clearInterval(this.issTleInterval); this.issTleInterval = null }
    if (this.clickCanvas !== null) {
      this.clickCanvas.removeEventListener('mousedown', this.onCanvasMouseDown)
      this.clickCanvas.removeEventListener('click', this.onCanvasClick)
      this.clickCanvas.removeEventListener('mousemove', this.onCanvasMouseMove)
      this.clickCanvas.removeEventListener('touchstart', this.onCanvasTouchStart)
      this.clickCanvas = null
    }
    this.clearAllSelections()
    this.worker?.terminate()
    this.worker = null
    this.countryFillMesh?.dispose()
    this.graticuleMesh?.dispose()
    this.countryBorderMesh?.dispose()
    this.countryHighlightMesh?.clear()
    for (const label of this.countryLabelObjects) this.earthGroup.remove(label)
    this.countryLabelObjects = []
    this.countryLabelPositions = []
    this.countryLabelSizes = []
    if (this.labelRenderer) {
      this.labelRenderer.domElement.remove()
      this.labelRenderer = null
    }
    this.controls.dispose()
    this.earth.dispose()
    this.clouds.dispose()
    this.atmosphere.dispose()
    this.stars.removeFromScene(this.scene)
    this.stars.dispose()
    this.iss.dispose()
    this.field?.dispose()
    this.renderer.dispose()
  }
}
