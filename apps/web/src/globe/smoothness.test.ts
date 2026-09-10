import { describe, it, expect } from 'vitest'
import { interpolationFactor } from './Globe'
import { SatelliteField } from './SatelliteField'

/**
 * Replays the real timing loop: the browser renders every ~16.7ms, while the propagator
 * worker takes far longer to return a position set for the whole catalog. The gap between
 * those two rates is what the user sees as stutter once fast-forward makes each step large.
 *
 * `interpolate: false` reproduces the old behaviour, where a dot only moved when a set
 * arrived. Everything else about the two runs is identical.
 */
function replay(opts: { propagatorMs: number; frames: number; interpolate: boolean }) {
  const FRAME_MS = 1000 / 60
  const SPEED = 1 // scene units per ms of real time — the satellite moves at a constant rate

  const field = new SatelliteField(1)
  const truth = (t: number) => new Float32Array([t * SPEED, 0, 0])

  let lastArrival = 0
  let interval = 50
  let inFlight: { postedAt: number; dueAt: number } | null = null
  let lastTick = 0
  const drawn: number[] = []

  for (let f = 0; f < opts.frames; f++) {
    const now = f * FRAME_MS

    // Deliver a set that finished before this frame.
    if (inFlight && inFlight.dueAt <= now) {
      field.setPositions(truth(inFlight.postedAt))
      if (lastArrival !== 0) {
        const dt = inFlight.dueAt - lastArrival
        if (dt > 0 && dt < 1000) interval = interval * 0.7 + dt * 0.3
      }
      lastArrival = inFlight.dueAt
      inFlight = null
    }

    // Post the next tick when the worker is free (Globe's workerBusy gate).
    if (!inFlight && now - lastTick >= 16) {
      lastTick = now
      inFlight = { postedAt: now, dueAt: now + opts.propagatorMs }
    }

    const t = opts.interpolate ? interpolationFactor(now, lastArrival, interval) : 1
    field.setLerp(t)

    // What the vertex shader draws: mix(aPrev, aPos, uLerp).
    const geo = field.mesh.geometry
    const pos = geo.getAttribute('aPos').array as Float32Array
    const prev = geo.getAttribute('aPrev').array as Float32Array
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t
    drawn.push(prev[0] + (pos[0] - prev[0]) * clamped)
  }
  field.dispose()

  // Ignore the warm-up frames before the first set lands.
  const steps: number[] = []
  for (let i = 1; i < drawn.length; i++) steps.push(drawn[i] - drawn[i - 1])
  const settled = steps.slice(20)
  const mean = settled.reduce((a, b) => a + b, 0) / settled.length
  return {
    frames: settled.length,
    stillFrames: settled.filter(s => Math.abs(s) < 1e-9).length,
    worstStepVsAverage: Math.max(...settled.map(s => Math.abs(s))) / Math.abs(mean),
  }
}

describe('fast-forward smoothness', () => {
  it('used to freeze most frames and lurch on the rest', () => {
    // The old path: a dot held still until the worker replied, then jumped the whole way at
    // once. That is the stutter. It is invisible at 1x because each jump is sub-pixel, and
    // obvious at 100x because each jump is 100 times larger.
    const before = replay({ propagatorMs: 35, frames: 240, interpolate: false })
    expect(before.stillFrames / before.frames).toBeGreaterThan(0.5)
    expect(before.worstStepVsAverage).toBeGreaterThan(2)
  })

  it('now moves on every frame, in near-equal steps', () => {
    const after = replay({ propagatorMs: 35, frames: 240, interpolate: true })
    expect(after.stillFrames).toBe(0)
    expect(after.worstStepVsAverage).toBeLessThan(1.6)
  })

  it('holds up when propagation takes many frames — a slow machine or a bigger catalog', () => {
    const before = replay({ propagatorMs: 120, frames: 400, interpolate: false })
    const after = replay({ propagatorMs: 120, frames: 400, interpolate: true })

    // Nearly nine frames in ten used to render no movement at all.
    expect(before.stillFrames / before.frames).toBeGreaterThan(0.85)

    // A couple survive: when a set lands exactly on a frame boundary that frame draws the
    // dot where it already was, then motion resumes. It is a single frame, not a pause, and
    // the position never jumps — but it is honest to say it is not literally zero.
    expect(after.stillFrames / after.frames).toBeLessThan(0.02)
    expect(after.stillFrames).toBeLessThan(before.stillFrames / 50)

    // And no lurch: the worst frame is close to the average instead of eight times it.
    expect(before.worstStepVsAverage).toBeGreaterThan(5)
    expect(after.worstStepVsAverage).toBeLessThan(2)
  })
})
