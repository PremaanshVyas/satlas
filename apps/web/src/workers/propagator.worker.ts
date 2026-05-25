/// <reference lib="webworker" />
import * as satellite from 'satellite.js'

import type { TLERecord } from '../lib/celestrak'

interface InitMessage {
  type: 'init'
  tles: TLERecord[]
}

interface TickMessage {
  type: 'tick'
  timestamp: number
}

type WorkerMessage = InitMessage | TickMessage

const R_EARTH_KM = 6371.0

let satrecs: (satellite.SatRec | null)[] = []

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data

  if (msg.type === 'init') {
    satrecs = msg.tles.map(t => {
      try {
        return satellite.twoline2satrec(t.tle1, t.tle2)
      } catch {
        return null  // malformed TLE — slot stays null, skipped on every tick
      }
    })
    self.postMessage({ type: 'ready', count: satrecs.length })
    return
  }

  if (msg.type === 'tick') {
    if (satrecs.length === 0) return

    const date = new Date(msg.timestamp)
    const buffer = new Float32Array(satrecs.length * 3)

    satrecs.forEach((satrec, i) => {
      if (!satrec) return  // skip malformed TLE slots from init
      try {
        const posVel = satellite.propagate(satrec, date)
        // Guard against false (propagation error) and any other non-object result
        if (!posVel.position || typeof posVel.position !== 'object') return

        // Emit ECI positions — world space is ECI; earthGroup rotates by GMST each frame.
        // ECI X → world X, ECI Z (north pole) → world Y, ECI Y → world -Z
        const pos = posVel.position as satellite.EciVec3<number>
        const mag = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z)
        if (mag < 1) return
        const r = mag / R_EARTH_KM

        buffer[i * 3]     =  pos.x / mag * r
        buffer[i * 3 + 1] =  pos.z / mag * r
        buffer[i * 3 + 2] = -pos.y / mag * r
      } catch {
        // Single bad satellite — zero its slot and continue (never crash the whole frame)
      }
    })

    self.postMessage({ type: 'positions', buffer }, [buffer.buffer])
  }
}
