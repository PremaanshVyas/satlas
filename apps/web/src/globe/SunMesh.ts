import * as THREE from 'three'

// Sun sits at 80 scene units — far enough to look like a distant star,
// close enough to stay out of Three.js far-plane culling issues.
const SUN_DISTANCE = 80

function makeSunTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size / 2

  // Radial gradient: white-hot core → golden glow → faint corona → transparent
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx)
  g.addColorStop(0.00, 'rgba(255, 255, 245, 1.00)')  // white-hot core
  g.addColorStop(0.06, 'rgba(255, 248, 180, 0.95)')  // bright inner glow
  g.addColorStop(0.18, 'rgba(255, 210,  70, 0.65)')  // golden halo
  g.addColorStop(0.38, 'rgba(255, 160,  20, 0.25)')  // orange mid-corona
  g.addColorStop(0.65, 'rgba(255, 110,   0, 0.06)')  // faint outer corona
  g.addColorStop(1.00, 'rgba(255,  80,   0, 0.00)')  // fully transparent edge

  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  return new THREE.CanvasTexture(canvas)
}

export class SunMesh {
  private sprite: THREE.Sprite
  private tex: THREE.CanvasTexture

  constructor() {
    this.tex = makeSunTexture()
    const mat = new THREE.SpriteMaterial({
      map: this.tex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
    this.sprite = new THREE.Sprite(mat)
    // 6 world units wide at distance 80 → ~2.2° apparent diameter (cinematic, not physically accurate)
    this.sprite.scale.setScalar(6)
  }

  update(sunDirection: THREE.Vector3): void {
    this.sprite.position.copy(sunDirection).multiplyScalar(SUN_DISTANCE)
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.sprite)
  }

  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.sprite)
  }

  dispose(): void {
    this.tex.dispose()
    ;(this.sprite.material as THREE.Material).dispose()
  }
}
