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

let satrecs: satellite.SatRec[] = []

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data

  if (msg.type === 'init') {
    satrecs = msg.tles.map(t => satellite.twoline2satrec(t.tle1, t.tle2))
    self.postMessage({ type: 'ready', count: satrecs.length })
    return
  }

  if (msg.type === 'tick') {
    if (satrecs.length === 0) return

    const date = new Date(msg.timestamp)
    const gmst = satellite.gstime(date)
    const buffer = new Float32Array(satrecs.length * 3)

    satrecs.forEach((satrec, i) => {
      const posVel = satellite.propagate(satrec, date)
      if (typeof posVel.position === 'boolean') return

      const geo = satellite.eciToGeodetic(
        posVel.position as satellite.EciVec3<number>,
        gmst,
      )
      const lat = geo.latitude
      const lon = geo.longitude
      // 1.02 < ISS at 1.06 — field satellites sit closer to surface so ISS stays visually dominant
      const r = 1.02

      buffer[i * 3] = -r * Math.cos(lat) * Math.sin(lon)
      buffer[i * 3 + 1] = r * Math.sin(lat)
      buffer[i * 3 + 2] = r * Math.cos(lat) * Math.cos(lon)
    })

    self.postMessage({ type: 'positions', buffer }, [buffer.buffer])
  }
}
