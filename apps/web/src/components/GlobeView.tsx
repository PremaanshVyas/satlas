import { useRef, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Cloud, Layers, LayoutGrid, RefreshCw, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { getDisplayName } from '../lib/satelliteNames'
import { useGlobe } from '../hooks/useGlobe'
import type { OrbitalParams, LivePosition, SatcatEntry, OverheadSat } from '../hooks/useGlobe'
export type { OverheadSat }
import type { HighlightDirective, SetFilterDirective, SpotlightDirective } from '../types/chat'
import type { SatCategory } from '../globe/Globe'
import { ALL_CATEGORIES } from '../globe/Globe'
import SearchBar from './SearchBar'
import TimeControls from './TimeControls'
import MobileControlsSheet from './MobileControlsSheet'

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
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Debris off by default — too numerous to show on landing (12k+ objects)
  const DEFAULT_CATEGORIES = new Set(ALL_CATEGORIES.filter(c => c !== 'DEBRIS'))
  const [activeCategories, setActiveCategoriesState] = useState<Set<SatCategory>>(DEFAULT_CATEGORIES)
  const [cloudsVisible, setCloudsVisible] = useState(true)
  const [starsVisible, setStarsVisibleState] = useState(true)
  const [bordersVisible, setBordersVisibleState] = useState(false)

  const { isLoading, satelliteCount, catalogError, hoverInfo, setActiveCategories, applyAgentFilter, applySpotlight, removeFromSelection, setCloudVisibility, setStarsVisible, searchCatalog, selectCatalogSatellite, setBordersVisible, clearCountryHighlight, simulatedTime, timeScale, setTimeScale } = useGlobe(
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

  function toggleStars() {
    const next = !starsVisible
    setStarsVisibleState(next)
    setStarsVisible(next)
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

  const toggleBtnBase = 'flex items-center gap-2 px-2.5 py-1.5 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.1em] border border-[rgba(255,255,255,0.07)] text-label hover:text-secondary transition-all duration-75 active:scale-[0.97] touch-manipulation select-none'

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
            className="hidden sm:flex items-center bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-3 py-2 shadow-lg font-mono text-[11px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors whitespace-nowrap active:scale-[0.97]"
          >
            API Docs
          </Link>
        </div>

        {/* Top-left: TimeControls on desktop, hamburger+sheet on mobile */}
        <div
          className="absolute left-3 pointer-events-auto"
          style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
        >
          <div className="hidden sm:block">
            <TimeControls clock={utcClock} timeScale={timeScale} onSetScale={setTimeScale} />
          </div>
          <MobileControlsSheet
            utcClock={utcClock}
            timeScale={timeScale}
            onSetScale={setTimeScale}
            cloudsVisible={cloudsVisible}
            onToggleClouds={toggleClouds}
            starsVisible={starsVisible}
            onToggleStars={toggleStars}
            bordersVisible={bordersVisible}
            onToggleBorders={toggleBorders}
            activeCategories={activeCategories}
            onToggleCategory={toggleCategory}
          />
        </div>

        {/* Satellite count — top-right */}
        {!isLoading && (
          catalogError ? (
            <button
              onClick={() => window.location.reload()}
              className="absolute right-3 font-mono text-[13px] text-label hover:text-secondary transition-colors select-none cursor-pointer active:scale-95"
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
          className="absolute right-3 z-20 pointer-events-auto hidden sm:flex flex-col gap-1.5"
          style={{ top: `max(2.75rem, calc(${safeTop} + 2.25rem))` }}
        >
          <button
            onClick={toggleClouds}
            title={cloudsVisible ? 'Hide clouds' : 'Show clouds'}
            className={toggleBtnBase}
          >
            <Cloud size={13} className="flex-shrink-0" />
            <span className="hidden sm:inline">Clouds</span>
            <div className={`relative w-7 h-4 rounded-full border overflow-hidden transition-colors flex-shrink-0 ${cloudsVisible ? 'bg-[rgba(0,212,255,0.12)] border-[rgba(0,212,255,0.35)]' : 'border-[rgba(255,255,255,0.1)]'}`}>
              <div className={`absolute top-[2px] w-2.5 h-2.5 rounded-full transition-all duration-200 ${cloudsVisible ? 'left-[14px] bg-accent' : 'left-[2px] bg-[rgba(255,255,255,0.25)]'}`} />
            </div>
          </button>

          <button
            onClick={toggleStars}
            title={starsVisible ? 'Hide stars' : 'Show stars'}
            className={toggleBtnBase}
          >
            <Sparkles size={13} className="flex-shrink-0" />
            <span className="hidden sm:inline">Stars</span>
            <div className={`relative w-7 h-4 rounded-full border overflow-hidden transition-colors flex-shrink-0 ${starsVisible ? 'bg-[rgba(0,212,255,0.12)] border-[rgba(0,212,255,0.35)]' : 'border-[rgba(255,255,255,0.1)]'}`}>
              <div className={`absolute top-[2px] w-2.5 h-2.5 rounded-full transition-all duration-200 ${starsVisible ? 'left-[14px] bg-accent' : 'left-[2px] bg-[rgba(255,255,255,0.25)]'}`} />
            </div>
          </button>

          <button
            onClick={() => toggleCategory('DEBRIS')}
            title={activeCategories.has('DEBRIS') ? 'Hide debris' : 'Show debris'}
            className={toggleBtnBase}
          >
            <Layers size={13} className="flex-shrink-0" />
            <span className="hidden sm:inline">Debris</span>
            <div className={`relative w-7 h-4 rounded-full border overflow-hidden transition-colors flex-shrink-0 ${activeCategories.has('DEBRIS') ? 'bg-[rgba(0,212,255,0.12)] border-[rgba(0,212,255,0.35)]' : 'border-[rgba(255,255,255,0.1)]'}`}>
              <div className={`absolute top-[2px] w-2.5 h-2.5 rounded-full transition-all duration-200 ${activeCategories.has('DEBRIS') ? 'left-[14px] bg-accent' : 'left-[2px] bg-[rgba(255,255,255,0.25)]'}`} />
            </div>
          </button>

          <button
            onClick={() => void toggleBorders()}
            title={bordersVisible ? 'Hide map mode' : 'Show map mode'}
            className={toggleBtnBase}
          >
            <LayoutGrid size={13} className="flex-shrink-0" />
            <span className="hidden sm:inline">Borders</span>
            <div className={`relative w-7 h-4 rounded-full border overflow-hidden transition-colors flex-shrink-0 ${bordersVisible ? 'bg-[rgba(0,212,255,0.12)] border-[rgba(0,212,255,0.35)]' : 'border-[rgba(255,255,255,0.1)]'}`}>
              <div className={`absolute top-[2px] w-2.5 h-2.5 rounded-full transition-all duration-200 ${bordersVisible ? 'left-[14px] bg-accent' : 'left-[2px] bg-[rgba(255,255,255,0.25)]'}`} />
            </div>
          </button>
        </div>

        {/* Category filter pills — desktop only, bottom-center */}
        <div
          className="absolute left-0 right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 pointer-events-auto px-3 sm:px-0 hidden sm:block"
          style={{ bottom: `max(1rem, calc(${safeBottom} + 0.5rem))` }}
        >
          <div className="flex gap-1.5 flex-nowrap sm:flex-wrap sm:justify-center overflow-x-auto sm:overflow-x-visible bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-3 py-2 shadow-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ALL_CATEGORIES.map(cat => (
              <button
                key={cat}
                data-active={activeCategories.has(cat)}
                onClick={() => toggleCategory(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.1em] border transition-all duration-75 active:scale-95 touch-manipulation select-none ${
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

        {/* Hover tooltip — screen-space positioned, animated */}
        <AnimatePresence>
          {hoverInfo && (
            <motion.div
              key={hoverInfo.name}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
              className="absolute z-10 bg-[rgba(9,9,9,0.9)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-2.5 py-1.5 whitespace-nowrap shadow-lg pointer-events-none"
              style={{
                left: hoverInfo.screenX + tooltipOffset,
                top: hoverInfo.screenY - tooltipOffset,
                transform: 'translateY(-100%)',
              }}
            >
              <div className="font-mono text-[12px] text-secondary">{getDisplayName(hoverInfo.name)}</div>
              {hoverInfo.altKm !== null && (
                <div className="font-mono text-[10px] text-label">{hoverInfo.altKm.toLocaleString()} km</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

      </div>{/* /overlay layer */}

      {/* Loading overlay — animated spinner */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-[#080808] gap-4"
          >
            <div className="relative w-10 h-10">
              <svg className="animate-spin w-10 h-10" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="16" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
                <path d="M20 4 A16 16 0 0 1 36 20" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              </div>
            </div>
            <span className="font-mono text-[10px] text-label tracking-[0.15em] uppercase">Initializing</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Catalog error retry — shown outside loading state if catalog fails after init */}
      {!isLoading && catalogError && (
        <div className="absolute top-0 left-0 right-0 flex justify-center pt-2 pointer-events-none z-30">
          <button
            onClick={() => window.location.reload()}
            className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 bg-[rgba(9,9,9,0.9)] border border-[rgba(255,68,68,0.2)] rounded-[3px] font-mono text-[10px] text-danger hover:border-[rgba(255,68,68,0.4)] transition-colors active:scale-95"
          >
            <RefreshCw size={11} />
            Retry catalog
          </button>
        </div>
      )}
    </div>
  )
}
