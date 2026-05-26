import { useRef, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useGlobe } from '../hooks/useGlobe'
import type { OrbitalParams, LivePosition, SatcatEntry, OverheadSat } from '../hooks/useGlobe'
export type { OverheadSat }
import type { HighlightDirective, SetFilterDirective, SpotlightDirective } from '../types/chat'
import type { SatCategory } from '../globe/Globe'
import { ALL_CATEGORIES } from '../globe/Globe'
import SearchBar from './SearchBar'
import TimeControls from './TimeControls'

export type { OrbitalParams, LivePosition, SatcatEntry }

const CATEGORY_LABELS: Record<SatCategory, string> = {
  STARLINK: 'Starlink',
  GPS: 'GPS',
  IRIDIUM: 'Iridium',
  DEBRIS: 'Debris',
  OTHER: 'Other',
}


interface GlobeViewProps {
  highlight: HighlightDirective | null
  setFilter: SetFilterDirective | null
  spotlight: SpotlightDirective | null
  onSatelliteSelect?: (name: string, noradId: string) => void
  onSatelliteSelectInfo?: (orbital: OrbitalParams, meta: SatcatEntry | null) => void
  onLivePosition?: (pos: LivePosition | null) => void
  onSatelliteRemove?: (noradId: string) => void
  onCategoriesChange?: (cats: string[]) => void
  onCategoryCounts?: (counts: Record<string, number>) => void
  onRemoveReady?: (remove: (noradId: string) => void) => void
  onSelectReady?: (select: (noradId: string) => void) => void
  onCountryClick?: (name: string, continent: string, overheadSats: OverheadSat[]) => void
  onClearHighlightReady?: (fn: () => void) => void
  onSimulatedTime?: (date: Date) => void
  onTimeReady?: (controls: { setTimeScale: (scale: number) => void }) => void
}

export default function GlobeView({
  highlight,
  setFilter,
  spotlight,
  onSatelliteSelect,
  onSatelliteSelectInfo,
  onLivePosition,
  onSatelliteRemove,
  onCategoriesChange,
  onCategoryCounts,
  onRemoveReady,
  onSelectReady,
  onCountryClick,
  onClearHighlightReady,
  onSimulatedTime,
  onTimeReady,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Debris off by default — too numerous to show on landing (12k+ objects)
  const DEFAULT_CATEGORIES = new Set(ALL_CATEGORIES.filter(c => c !== 'DEBRIS'))
  const [activeCategories, setActiveCategoriesState] = useState<Set<SatCategory>>(DEFAULT_CATEGORIES)
  const [cloudsVisible, setCloudsVisible] = useState(true)
  const [bordersVisible, setBordersVisibleState] = useState(false)

  const { isLoading, satelliteCount, catalogError, hoverInfo, setActiveCategories, applyAgentFilter, applySpotlight, removeFromSelection, setCloudVisibility, searchCatalog, selectCatalogSatellite, setBordersVisible, clearCountryHighlight, simulatedTime, timeScale, setTimeScale } = useGlobe(
    containerRef,
    highlight,
    { onSatelliteClick: onSatelliteSelect, onSatelliteSelectInfo, onLivePosition, onSatelliteRemove, onCategoryCounts, onCountryClick },
  )

  // Expose removeFromSelection + selectCatalogSatellite to App.tsx via callback refs
  const onRemoveReadyRef = useRef(onRemoveReady)
  useEffect(() => { onRemoveReadyRef.current = onRemoveReady })
  useEffect(() => { onRemoveReadyRef.current?.(removeFromSelection) }, [removeFromSelection])

  const onSelectReadyRef = useRef(onSelectReady)
  useEffect(() => { onSelectReadyRef.current = onSelectReady })
  useEffect(() => { onSelectReadyRef.current?.(selectCatalogSatellite) }, [selectCatalogSatellite])

  const onClearHighlightReadyRef = useRef(onClearHighlightReady)
  useEffect(() => { onClearHighlightReadyRef.current = onClearHighlightReady })
  useEffect(() => { onClearHighlightReadyRef.current?.(clearCountryHighlight) }, [clearCountryHighlight])

  const onTimeReadyRef = useRef(onTimeReady)
  useEffect(() => { onTimeReadyRef.current = onTimeReady })
  useEffect(() => {
    onTimeReadyRef.current?.({ setTimeScale })
  }, [setTimeScale])

  const onSimulatedTimeRef = useRef(onSimulatedTime)
  useEffect(() => { onSimulatedTimeRef.current = onSimulatedTime })
  useEffect(() => {
    onSimulatedTimeRef.current?.(simulatedTime)
  }, [simulatedTime])

  // Apply debris-off default to Globe engine on mount
  useEffect(() => {
    setActiveCategories(DEFAULT_CATEGORIES)
    onCategoriesChange?.([...DEFAULT_CATEGORIES])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Agent directive: spotlight a single satellite
  useEffect(() => {
    if (!spotlight) return
    applySpotlight(spotlight.norad_id)
  }, [spotlight, applySpotlight])

  const hh = String(simulatedTime.getUTCHours()).padStart(2, '0')
  const mm = String(simulatedTime.getUTCMinutes()).padStart(2, '0')
  const ss = String(simulatedTime.getUTCSeconds()).padStart(2, '0')
  const utcClock = `${hh}:${mm}:${ss} UTC`

  const toggleCategory = useCallback((cat: SatCategory) => {
    setActiveCategoriesState(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
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

  async function toggleBorders() {
    const next = !bordersVisible
    setBordersVisibleState(next)
    try {
      await setBordersVisible(next)
    } catch {
      if (next) setBordersVisibleState(false)
    }
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
            className="hidden sm:flex items-center bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-3 py-2 shadow-lg font-mono text-[11px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors whitespace-nowrap"
          >
            API Docs
          </Link>
        </div>

        {/* UTC clock + time controls — top-left, desktop only */}
        <div
          className="absolute left-3 hidden sm:block pointer-events-auto"
          style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
        >
          <TimeControls clock={utcClock} timeScale={timeScale} onSetScale={setTimeScale} />
        </div>

        {/* Satellite count — top-right */}
        {!isLoading && (
          catalogError ? (
            <button
              onClick={() => window.location.reload()}
              className="absolute right-3 font-mono text-[13px] text-label hover:text-secondary transition-colors select-none cursor-pointer"
              style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
            >
              <span className="sm:hidden">Catalog error — tap to retry</span>
              <span className="hidden sm:inline">Catalog unavailable — click to retry</span>
            </button>
          ) : satelliteCount > 0 ? (
            <div
              className="absolute right-3 font-mono text-[13px] text-accent select-none"
              style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
            >
              <span className="hidden sm:inline">Tracking </span>
              {satelliteCount.toLocaleString()}
              <span className="hidden sm:inline"> objects</span>
            </div>
          ) : (
            <div
              className="absolute right-3 font-mono text-[13px] text-label select-none animate-pulse"
              style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
            >
              <span className="sm:hidden">Loading…</span>
              <span className="hidden sm:inline">Loading catalog…</span>
            </div>
          )
        )}

        {/* Toggle group — stacked, labels hidden on mobile to keep buttons compact */}
        <div
          className="absolute right-3 z-20 pointer-events-auto flex flex-col gap-1.5"
          style={{ top: `max(2.75rem, calc(${safeTop} + 2.25rem))` }}
        >
          <button
            onClick={toggleClouds}
            title={cloudsVisible ? 'Hide clouds' : 'Show clouds'}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.1em] border border-[rgba(255,255,255,0.07)] text-label hover:text-secondary transition-colors touch-manipulation select-none"
          >
            <svg width="13" height="9" viewBox="0 0 24 16" fill="none" className="flex-shrink-0">
              <path d="M19 12a5 5 0 0 0-9.9-1A3.5 3.5 0 1 0 4 14.5h15a3.5 3.5 0 0 0 0-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="hidden sm:inline">Clouds</span>
            <div className={`relative w-7 h-4 rounded-full border transition-colors flex-shrink-0 ${cloudsVisible ? 'bg-[rgba(0,212,255,0.12)] border-[rgba(0,212,255,0.35)]' : 'border-[rgba(255,255,255,0.1)]'}`}>
              <div className={`absolute top-[2px] w-3 h-3 rounded-full transition-all duration-200 ${cloudsVisible ? 'left-[12px] bg-accent' : 'left-[2px] bg-[rgba(255,255,255,0.25)]'}`} />
            </div>
          </button>

          <button
            onClick={() => toggleCategory('DEBRIS')}
            title={activeCategories.has('DEBRIS') ? 'Hide debris' : 'Show debris'}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.1em] border border-[rgba(255,255,255,0.07)] text-label hover:text-secondary transition-colors touch-manipulation select-none"
          >
            <svg width="13" height="9" viewBox="0 0 14 10" fill="currentColor" className="flex-shrink-0">
              <circle cx="2" cy="2" r="1.3" opacity="0.6"/>
              <circle cx="7" cy="5" r="1.3" opacity="0.6"/>
              <circle cx="12" cy="2" r="1.3" opacity="0.6"/>
              <circle cx="10" cy="8.5" r="1.3" opacity="0.6"/>
              <circle cx="4" cy="8.5" r="1.3" opacity="0.6"/>
            </svg>
            <span className="hidden sm:inline">Debris</span>
            <div className={`relative w-7 h-4 rounded-full border transition-colors flex-shrink-0 ${activeCategories.has('DEBRIS') ? 'bg-[rgba(0,212,255,0.12)] border-[rgba(0,212,255,0.35)]' : 'border-[rgba(255,255,255,0.1)]'}`}>
              <div className={`absolute top-[2px] w-3 h-3 rounded-full transition-all duration-200 ${activeCategories.has('DEBRIS') ? 'left-[12px] bg-accent' : 'left-[2px] bg-[rgba(255,255,255,0.25)]'}`} />
            </div>
          </button>

          <button
            onClick={toggleBorders}
            title={bordersVisible ? 'Hide map mode' : 'Show map mode'}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.1em] border border-[rgba(255,255,255,0.07)] text-label hover:text-secondary transition-colors touch-manipulation select-none"
          >
            <svg width="13" height="9" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.4" className="flex-shrink-0">
              <rect x="0.7" y="0.7" width="12.6" height="8.6" rx="0.8"/>
              <path d="M4.7 0.7v8.6M9.3 0.7v8.6"/>
            </svg>
            <span className="hidden sm:inline">Borders</span>
            <div className={`relative w-7 h-4 rounded-full border transition-colors flex-shrink-0 ${bordersVisible ? 'bg-[rgba(0,212,255,0.12)] border-[rgba(0,212,255,0.35)]' : 'border-[rgba(255,255,255,0.1)]'}`}>
              <div className={`absolute top-[2px] w-3 h-3 rounded-full transition-all duration-200 ${bordersVisible ? 'left-[12px] bg-accent' : 'left-[2px] bg-[rgba(255,255,255,0.25)]'}`} />
            </div>
          </button>
        </div>

        {/* Category filter pills — full-width scrollable row on mobile, centered wrap on desktop */}
        <div
          className="absolute left-0 right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 pointer-events-auto px-3 sm:px-0"
          style={{ bottom: `max(1rem, calc(${safeBottom} + 0.5rem))` }}
        >
          <div className="flex gap-1.5 flex-nowrap sm:flex-wrap sm:justify-center overflow-x-auto sm:overflow-x-visible bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-3 py-2 shadow-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ALL_CATEGORIES.map(cat => (
              <button
                key={cat}
                data-active={activeCategories.has(cat)}
                onClick={() => toggleCategory(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.1em] border transition-colors touch-manipulation select-none ${
                  activeCategories.has(cat)
                    ? 'border-[rgba(0,212,255,0.4)] text-accent bg-[rgba(0,212,255,0.06)]'
                    : 'border-[rgba(255,255,255,0.07)] text-label hover:text-secondary hover:border-[rgba(255,255,255,0.12)]'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Hover tooltip — screen-space positioned, pointer-events-none */}
        {hoverInfo && (
          <div
            className="absolute z-10 bg-[rgba(9,9,9,0.9)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-2.5 py-1.5 whitespace-nowrap shadow-lg"
            style={{
              left: hoverInfo.screenX + tooltipOffset,
              top: hoverInfo.screenY - tooltipOffset,
              transform: 'translateY(-100%)',
            }}
          >
            <div className="font-mono text-[12px] text-secondary">{hoverInfo.name}</div>
            {hoverInfo.altKm !== null && (
              <div className="font-mono text-[10px] text-label">{hoverInfo.altKm.toLocaleString()} km</div>
            )}
          </div>
        )}

      </div>{/* /overlay layer */}

      {/* Loading overlay — full bleed, outside the safe-area wrapper */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#080808] font-mono text-[11px] text-label tracking-[0.1em] uppercase">
          Initializing…
        </div>
      )}
    </div>
  )
}
