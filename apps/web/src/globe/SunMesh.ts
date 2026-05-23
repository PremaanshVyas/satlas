import * as THREE from 'three'

const SUN_DISTANCE = 50

function makeSunTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size / 2

  // 1. Soft ambient halo — large, very faint, fills the sprite
  const halo = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.6)
  halo.addColorStop(0.00, 'rgba(255, 255, 255, 0.45)')
  halo.addColorStop(0.25, 'rgba(235, 245, 255, 0.10)')
  halo.addColorStop(0.60, 'rgba(200, 220, 255, 0.02)')
  halo.addColorStop(1.00, 'rgba(200, 220, 255, 0.00)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, size, size)

  // 2. Eight diffraction spikes — additive so they brighten at the intersection
  ctx.globalCompositeOperation = 'lighter'
  const spikeLen = cx * 0.92   // extends nearly to canvas edge
  const halfW = 6               // half-width at the center, tapers to 0 at tips

  for (let i = 0; i < 8; i++) {
    ctx.save()
    ctx.translate(cx, cx)
    ctx.rotate((i * Math.PI) / 4)

    // Exponential-approximating falloff: bright only close to centre
    const g = ctx.createLinearGradient(-spikeLen, 0, spikeLen, 0)
    g.addColorStop(0.00, 'rgba(255, 255, 255, 0.00)')
    g.addColorStop(0.20, 'rgba(255, 255, 255, 0.00)')
    g.addColorStop(0.36, 'rgba(255, 255, 255, 0.06)')
    g.addColorStop(0.44, 'rgba(255, 255, 255, 0.40)')
    g.addColorStop(0.48, 'rgba(255, 255, 255, 0.80)')
    g.addColorStop(0.50, 'rgba(255, 255, 255, 1.00)')
    g.addColorStop(0.52, 'rgba(255, 255, 255, 0.80)')
    g.addColorStop(0.56, 'rgba(255, 255, 255, 0.40)')
    g.addColorStop(0.64, 'rgba(255, 255, 255, 0.06)')
    g.addColorStop(0.80, 'rgba(255, 255, 255, 0.00)')
    g.addColorStop(1.00, 'rgba(255, 255, 255, 0.00)')

    // Diamond shape: widest at centre, tapers linearly to each tip
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(-spikeLen, 0)
    ctx.lineTo(0,  halfW)
    ctx.lineTo( spikeLen, 0)
    ctx.lineTo(0, -halfW)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // 3. Bright core — solid white-hot centre drawn over the spikes
  ctx.globalCompositeOperation = 'source-over'
  const core = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.16)
  core.addColorStop(0.00, 'rgba(255, 255, 255, 1.00)')
  core.addColorStop(0.35, 'rgba(255, 255, 255, 0.95)')
  core.addColorStop(0.70, 'rgba(230, 240, 255, 0.50)')
  core.addColorStop(1.00, 'rgba(200, 220, 255, 0.00)')
  ctx.fillStyle = core
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
    // 10 world units wide at distance 80 → ~3.6° apparent diameter (cinematic)
    this.sprite.scale.setScalar(10)
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
