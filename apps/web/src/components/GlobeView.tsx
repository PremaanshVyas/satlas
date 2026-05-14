import { useRef, useState, useEffect } from 'react'
import { useGlobe } from '../hooks/useGlobe'
import type { HighlightDirective } from '../types/chat'

interface GlobeViewProps {
  highlight: HighlightDirective | null
  onSatelliteSelect?: (name: string, noradId: string) => void
}

export default function GlobeView({ highlight, onSatelliteSelect }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { isLoading, satelliteCount } = useGlobe(containerRef, highlight, onSatelliteSelect)
  const [utcClock, setUtcClock] = useState('')

  useEffect(() => {
    function tick() {
      const now = new Date()
      const hh = String(now.getUTCHours()).padStart(2, '0')
      const mm = String(now.getUTCMinutes()).padStart(2, '0')
      const ss = String(now.getUTCSeconds()).padStart(2, '0')
      setUtcClock(`${hh}:${mm}:${ss} UTC`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />

      {/* UTC clock — top-left */}
      <div className="absolute top-3 left-3 font-mono text-xs text-gray-400 bg-gray-950/70 px-2 py-1 rounded select-none">
        {utcClock}
      </div>

      {/* Satellite count — top-right (only after catalog loads) */}
      {satelliteCount > 0 && (
        <div className="absolute top-3 right-3 font-mono text-xs text-blue-400 bg-gray-950/70 px-2 py-1 rounded select-none">
          Tracking {satelliteCount.toLocaleString()} objects
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 text-gray-400 text-sm tracking-wide">
          Loading satellite catalog…
        </div>
      )}
    </div>
  )
}
