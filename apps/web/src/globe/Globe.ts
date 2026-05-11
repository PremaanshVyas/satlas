import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EarthMesh } from './EarthMesh'
import { SatelliteMesh } from './SatelliteMesh'
import { getSunDirection } from '../lib/solar'

const ISS_TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
const ISS_TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'

export class Globe {
  private renderer!: THREE.WebGLRenderer
  private camera!: THREE.PerspectiveCamera
  private scene!: THREE.Scene
  private controls!: OrbitControls
  private earth!: EarthMesh
  private iss!: SatelliteMesh
  private rafId: number | null = null

  mount(canvas: HTMLCanvasElement): void {
    const { clientWidth: w, clientHeight: h } = canvas

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setSize(w, h, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    this.camera.position.set(0, 0, 2.5)

    this.scene = new THREE.Scene()

    this.earth = new EarthMesh()
    this.scene.add(this.earth.mesh)

    this.iss = new SatelliteMesh(ISS_TLE1, ISS_TLE2)
    this.scene.add(this.iss.group)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 1.3
    this.controls.maxDistance = 8
    this.controls.autoRotate = false

    this.tick()
  }

  private tick(): void {
    this.rafId = requestAnimationFrame(() => this.tick())
    const now = new Date()
    this.earth.update(getSunDirection(now))
    this.iss.update(now)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  unmount(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.controls.dispose()
    this.earth.dispose()
    this.iss.dispose()
    this.renderer.dispose()
  }
}
