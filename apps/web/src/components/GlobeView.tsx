import { useRef, useState, useEffect } from 'react'
import { useGlobe } from '../hooks/useGlobe'
import type { HighlightDirective, SetFilterDirective } from '../types/chat'
import type { SatCategory } from '../globe/Globe'
import { ALL_CATEGORIES } from '../globe/Globe'

const CATEGORY_LABELS: Record<SatCategory, string> = {
  STARLINK: 'Starlink',
  GPS: 'GPS',
  IRIDIUM: 'Iridium',
  DEBRIS: 'Debris',
  OTHER: 'Other',
}

const CATEGORY_COLORS: Record<SatCategory, string> = {
  STARLINK:  'bg-violet-500/20 border-violet-500/50 text-violet-300 data-[active=true]:bg-violet-500/40 data-[active=true]:border-violet-400',
  GPS:       'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 data-[active=true]:bg-emerald-500/40 data-[active=true]:border-emerald-400',
  IRIDIUM:   'bg-sky-500/20 border-sky-500/50 text-sky-300 data-[active=true]:bg-sky-500/40 data-[active=true]:border-sky-400',
  DEBRIS:    'bg-red-500/20 border-red-500/50 text-red-300 data-[active=true]:bg-red-500/40 data-[active=true]:border-red-400',
  OTHER:     'bg-gray-500/20 border-gray-500/50 text-gray-300 data-[active=true]:bg-gray-500/40 data-[active=true]:border-gray-400',
}

interface GlobeViewProps {
  highlight: HighlightDirective | null
  setFilter: SetFilterDirective | null
  onSatelliteSelect?: (name: string, noradId: string) => void
  onCategoriesChange?: (cats: string[]) => void
}

export default function GlobeView({ highlight, setFilter, onSatelliteSelect, onCategoriesChange }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeCategories, setActiveCategoriesState] = useState<Set<SatCategory>>(
    new Set(ALL_CATEGORIES),
  )
  const { isLoading, satelliteCount, hoverInfo, setActiveCategories, applyAgentFilter } = useGlobe(
    containerRef,
    highlight,
    onSatelliteSelect,
  )
  const [utcClock, setUtcClock] = useState('')

  // Agent directive: update filter pills AND apply category colours
  useEffect(() => {
    if (!setFilter) return
    const cats = setFilter.categories.length > 0
      ? (setFilter.categories as SatCategory[])
      : ALL_CATEGORIES
    const next = new Set(cats)
    setActiveCategoriesState(next)
    applyAgentFilter(cats)  // sets filter + colours in Globe
    onCategoriesChange?.([...next])
  }, [setFilter, applyAgentFilter, onCategoriesChange])

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

  function toggleCategory(cat: SatCategory) {
    setActiveCategoriesState(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        if (next.size === 1) return prev  // keep at least one active
        next.delete(cat)
      } else {
        next.add(cat)
      }
      setActiveCategories(next)  // clears agent colour mode in Globe
      onCategoriesChange?.([...next])
      return next
    })
  }

  const tooltipOffset = 14

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />

      {/* UTC clock — top-left */}
      <div className="absolute top-3 left-3 font-mono text-xs text-gray-400 bg-black/50 px-2 py-1 rounded select-none pointer-events-none">
        {utcClock}
      </div>

      {/* Satellite count — top-right */}
      {satelliteCount > 0 && (
        <div className="absolute top-3 right-3 font-mono text-xs text-blue-400 bg-black/50 px-2 py-1 rounded select-none pointer-events-none">
          Tracking {satelliteCount.toLocaleString()} objects
        </div>
      )}

      {/* Category filter pills — bottom-center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 flex-wrap justify-center px-4">
        {ALL_CATEGORIES.map(cat => (
          <button
            key={cat}
            data-active={activeCategories.has(cat)}
            onClick={() => toggleCategory(cat)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all select-none ${CATEGORY_COLORS[cat]}`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Hover tooltip */}
      {hoverInfo && (
        <div
          className="absolute pointer-events-none z-10 bg-gray-900/90 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-200 whitespace-nowrap shadow-lg"
          style={{
            left: hoverInfo.screenX + tooltipOffset,
            top: hoverInfo.screenY - tooltipOffset,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="font-medium text-white">{hoverInfo.name}</div>
          <div className="text-gray-400">{hoverInfo.altKm.toLocaleString()} km</div>
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
