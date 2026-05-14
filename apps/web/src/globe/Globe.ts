import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EarthMesh } from './EarthMesh'
import { AtmosphereMesh } from './AtmosphereMesh'
import { StarField } from './StarField'
import { SatelliteMesh } from './SatelliteMesh'
import { SatelliteField } from './SatelliteField'
import { getSunDirection } from '../lib/solar'
import { fetchSatelliteCatalog, fetchIssTle } from '../lib/celestrak'

const ISS_TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
const ISS_TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'
const ISS_NORAD = '25544'
const FLY_DURATION_MS = 1500
const CAMERA_DISTANCE = 2.5
const FIELD_TICK_MS = 100

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
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
  private raycaster = new THREE.Raycaster()
  private satNames: string[] = []
  private clickCanvas: HTMLCanvasElement | null = null
  onCatalogRefresh: ((count: number) => void) | null = null
  onSatelliteClick: ((name: string) => void) | null = null

  mount(canvas: HTMLCanvasElement, onReady?: () => void): void {
    this.mounted = true
    const w = canvas.clientWidth || canvas.width || 800
    const h = canvas.clientHeight || canvas.height || 600

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setSize(w, h, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    this.camera.position.set(0, 0, CAMERA_DISTANCE)

    this.scene = new THREE.Scene()

    this.stars = new StarField()
    this.scene.add(this.stars.points)

    this.earth = new EarthMesh(this.renderer)
    this.scene.add(this.earth.mesh)

    this.atmosphere = new AtmosphereMesh()
    this.scene.add(this.atmosphere.mesh)

    // ISS always initialised with hardcoded TLE so tick() never crashes
    // before the catalog arrives.
    this.iss = new SatelliteMesh(ISS_TLE1, ISS_TLE2)
    this.scene.add(this.iss.group)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 1.3
    this.controls.maxDistance = 8
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

    // Ping the orbital service to prevent Railway free-tier cold starts.
    const baseUrl = import.meta.env.VITE_ORBITAL_SERVICE_URL ?? 'http://localhost:8000'
    const ping = () => fetch(`${baseUrl}/health`).catch(() => undefined)
    void ping()
    this.keepaliveInterval = setInterval(ping, 4 * 60 * 1000)
    // Re-ping when the tab becomes visible (catches re-opens and tab switches).
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
      // Dispose previous field/worker before replacing them on catalog refresh
      if (this.field) {
        this.scene.remove(this.field.mesh)
        this.field.dispose()
        this.field = null
      }
      if (this.worker) {
        this.worker.terminate()
        this.worker = null
      }
      const issTle = tles.find(t => t.norad_id === ISS_NORAD)
      if (issTle) this.iss.updateTle(issTle.tle1, issTle.tle2)
      const others = tles.filter(t => t.norad_id !== ISS_NORAD)
      this.satNames = others.map(t => t.name)
      this.catalogCount = others.length + 1  // +1 for ISS
      this.onCatalogRefresh?.(this.catalogCount)

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
          this.field.update(msg.buffer)
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

  private onCanvasClick = (e: MouseEvent): void => {
    if (!this.field || !this.onSatelliteClick) return
    const canvas = e.target as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(mouse, this.camera)
    const hits = this.raycaster.intersectObject(this.field.mesh)
    if (hits.length === 0) return
    const { instanceId } = hits[0]
    if (instanceId === undefined) return
    const name = this.satNames[instanceId]
    if (name) this.onSatelliteClick(name)
  }

  highlightSatellite(noradId: string, latDeg?: number, lonDeg?: number): void {
    let targetPos: THREE.Vector3 | null = null

    if (latDeg !== undefined && lonDeg !== undefined) {
      // Fly to the satellite's current geodetic position (same coordinate convention as SatelliteMesh)
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

    // Pulse animation only for the ISS (it has the dedicated SatelliteMesh halo)
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
    if (this.catalogRefreshInterval !== null) {
      clearInterval(this.catalogRefreshInterval)
      this.catalogRefreshInterval = null
    }
    if (this.keepaliveInterval !== null) {
      clearInterval(this.keepaliveInterval)
      this.keepaliveInterval = null
    }
    if (this.issTleInterval !== null) {
      clearInterval(this.issTleInterval)
      this.issTleInterval = null
    }
    if (this.visibilityHandler !== null) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
    if (this.clickCanvas !== null) {
      this.clickCanvas.removeEventListener('click', this.onCanvasClick)
      this.clickCanvas = null
    }
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
