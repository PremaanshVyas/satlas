import { useRef, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useGlobe } from '../hooks/useGlobe'
import type { OrbitalParams, LivePosition, SatcatEntry } from '../hooks/useGlobe'
import type { HighlightDirective, SetFilterDirective } from '../types/chat'
import type { SatCategory } from '../globe/Globe'
import { ALL_CATEGORIES } from '../globe/Globe'
import SearchBar from './SearchBar'

export type { OrbitalParams, LivePosition, SatcatEntry }

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
  onSatelliteSelectInfo?: (orbital: OrbitalParams, meta: SatcatEntry | null) => void
  onLivePosition?: (pos: LivePosition | null) => void
  onSatelliteRemove?: (noradId: string) => void
  onCategoriesChange?: (cats: string[]) => void
  onCategoryCounts?: (counts: Record<string, number>) => void
  onRemoveReady?: (remove: (noradId: string) => void) => void
  onSelectReady?: (select: (noradId: string) => void) => void
}

export default function GlobeView({
  highlight,
  setFilter,
  onSatelliteSelect,
  onSatelliteSelectInfo,
  onLivePosition,
  onSatelliteRemove,
  onCategoriesChange,
  onCategoryCounts,
  onRemoveReady,
  onSelectReady,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeCategories, setActiveCategoriesState] = useState<Set<SatCategory>>(
    new Set(ALL_CATEGORIES),
  )
  const [cloudsVisible, setCloudsVisible] = useState(true)

  const { isLoading, satelliteCount, hoverInfo, setActiveCategories, applyAgentFilter, removeFromSelection, setCloudVisibility, searchCatalog, selectCatalogSatellite } = useGlobe(
    containerRef,
    highlight,
    { onSatelliteClick: onSatelliteSelect, onSatelliteSelectInfo, onLivePosition, onSatelliteRemove, onCategoryCounts },
  )

  // Expose removeFromSelection + selectCatalogSatellite to App.tsx via callback refs
  const onRemoveReadyRef = useRef(onRemoveReady)
  useEffect(() => { onRemoveReadyRef.current = onRemoveReady })
  useEffect(() => { onRemoveReadyRef.current?.(removeFromSelection) }, [removeFromSelection])

  const onSelectReadyRef = useRef(onSelectReady)
  useEffect(() => { onSelectReadyRef.current = onSelectReady })
  useEffect(() => { onSelectReadyRef.current?.(selectCatalogSatellite) }, [selectCatalogSatellite])

  // Agent directive: update filter pills AND apply category colours
  useEffect(() => {
    if (!setFilter) return
    const cats = setFilter.categories.length > 0
      ? (setFilter.categories as SatCategory[])
      : ALL_CATEGORIES
    const next = new Set(cats)
    // Syncing agent directive into local pill state — intentional setState in effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveCategoriesState(next)
    applyAgentFilter(cats)
    onCategoriesChange?.([...next])
  }, [setFilter, applyAgentFilter, onCategoriesChange])

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

  const toggleCategory = useCallback((cat: SatCategory) => {
    setActiveCategoriesState(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        if (next.size === 1) return prev
        next.delete(cat)
      } else {
        next.add(cat)
      }
      setActiveCategories(next)
      onCategoriesChange?.([...next])
      return next
    })
  }, [setActiveCategories, onCategoriesChange])

  function toggleClouds() {
    const next = !cloudsVisible
    setCloudsVisible(next)
    setCloudVisibility(next)
  }

  const tooltipOffset = 14

  // Safe-area inset values for overlay positioning (avoids browser chrome overlap)
  const safeTop = 'env(safe-area-inset-top, 0px)'
  const safeBottom = 'env(safe-area-inset-bottom, 0px)'

  return (
    <div className="w-full h-full relative">
      {/* Canvas — full bleed, behind everything */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Overlay layer — all UI chips/buttons live here, inset from safe areas */}
      <div className="absolute inset-0 pointer-events-none">

        {/* Search bar + API docs link — top-center */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2"
          style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
        >
          <SearchBar
            onSearch={searchCatalog}
            onSelect={(noradId) => { selectCatalogSatellite(noradId) }}
          />
          <Link
            to="/docs"
            className="flex items-center bg-gray-900/90 backdrop-blur-sm border border-gray-700/80 rounded-lg px-3 py-2 shadow-lg text-sm text-gray-400 hover:text-gray-200 transition-colors whitespace-nowrap"
          >
            API
          </Link>
        </div>

        {/* UTC clock — top-left */}
        <div
          className="absolute left-3 font-mono text-xs text-gray-400 bg-black/50 px-2 py-1 rounded select-none"
          style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
        >
          {utcClock}
        </div>

        {/* Satellite count — top-right */}
        {!isLoading && (
          satelliteCount > 0 ? (
            <div
              className="absolute right-3 font-mono text-xs text-blue-400 bg-black/50 px-2 py-1 rounded select-none"
              style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
            >
              <span className="hidden sm:inline">Tracking </span>
              {satelliteCount.toLocaleString()}
              <span className="hidden sm:inline"> objects</span>
            </div>
          ) : (
            <div
              className="absolute right-3 font-mono text-xs text-gray-500 bg-black/50 px-2 py-1 rounded select-none animate-pulse"
              style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
            >
              <span className="sm:hidden">Loading…</span>
              <span className="hidden sm:inline">Loading catalog…</span>
            </div>
          )
        )}

        {/* Cloud toggle — top-right, below satellite count */}
        <button
          onClick={toggleClouds}
          title={cloudsVisible ? 'Hide clouds' : 'Show clouds'}
          className={`absolute right-3 z-20 flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors pointer-events-auto touch-manipulation ${
            cloudsVisible
              ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
              : 'bg-gray-800/60 border-gray-700 text-gray-500'
          }`}
          style={{ top: `max(2.5rem, calc(${safeTop} + 2rem))` }}
        >
          <span>☁</span>
          <span className="hidden sm:inline">{cloudsVisible ? 'On' : 'Off'}</span>
        </button>

        {/* Category filter pills — bottom-center */}
        <div
          className="absolute left-0 right-0 flex gap-1.5 justify-center px-4 flex-wrap sm:flex-nowrap overflow-x-auto scrollbar-none pointer-events-auto"
          style={{ bottom: `max(1rem, calc(${safeBottom} + 0.5rem))` }}
        >
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              data-active={activeCategories.has(cat)}
              onClick={() => toggleCategory(cat)}
              className={`px-2.5 py-1.5 sm:py-1 rounded-full text-xs font-medium border transition-all select-none touch-manipulation ${CATEGORY_COLORS[cat]}`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Hover tooltip — screen-space positioned, pointer-events-none */}
        {hoverInfo && (
          <div
            className="absolute z-10 bg-gray-900/90 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-200 whitespace-nowrap shadow-lg"
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

      </div>{/* /overlay layer */}

      {/* Loading overlay — full bleed, outside the safe-area wrapper */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 text-gray-400 text-sm tracking-wide">
          Initializing…
        </div>
      )}
    </div>
  )
}
