import { useState, useCallback, useRef } from 'react'
import GlobeView from './components/GlobeView'
import AgentPanel from './components/AgentPanel'
import { useChat } from './hooks/useChat'
import { ALL_CATEGORIES } from './globe/Globe'
import { objectTypeLabel, opsStatusLabel } from './lib/satcat'
import type { OrbitalParams, LivePosition, SatcatEntry } from './components/GlobeView'

interface SelectedSat {
  name: string
  noradId: string
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals)
}

function latLabel(lat: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}`
}

function lonLabel(lon: number): string {
  return `${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`
}

export default function App() {
  const { messages, isLoading, sendMessage, highlight, setFilter } = useChat()
  const [chatOpen, setChatOpen] = useState(false)
  const [prefill, setPrefill] = useState<string | null>(null)

  // Multi-satellite selection tray
  const [selectedSats, setSelectedSats] = useState<SelectedSat[]>([])
  const [trayOpen, setTrayOpen] = useState(false)
  // The satellite whose info card is currently shown
  const [cardSat, setCardSat] = useState<SelectedSat | null>(null)
  const [livePosition, setLivePosition] = useState<LivePosition | null>(null)
  const [selectedOrbital, setSelectedOrbital] = useState<OrbitalParams | null>(null)
  const [selectedMeta, setSelectedMeta] = useState<SatcatEntry | null>(null)
  const [shownCategories, setShownCategories] = useState<string[]>([...ALL_CATEGORIES])
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})

  // Globe function refs — exposed from GlobeView via onRemoveReady / onSelectReady
  const removeFromSelectionRef = useRef<((noradId: string) => void) | null>(null)
  const selectSatRef = useRef<((noradId: string) => void) | null>(null)

  const handleSendMessage = useCallback((content: string) => {
    sendMessage(content, shownCategories, categoryCounts)
  }, [sendMessage, shownCategories, categoryCounts])

  // Called every time a satellite is clicked — adds to tray + shows card
  function handleSatelliteSelect(name: string, noradId: string) {
    setSelectedSats(prev =>
      prev.find(s => s.noradId === noradId) ? prev : [...prev, { name, noradId }]
    )
    setCardSat({ name, noradId })
    setTrayOpen(true)
  }

  function handleSatelliteSelectInfo(orbital: OrbitalParams, meta: SatcatEntry | null) {
    setSelectedOrbital(orbital)
    setSelectedMeta(meta)
  }

  function handleLivePosition(pos: LivePosition | null) {
    setLivePosition(pos)
  }

  // Globe fires this when a satellite is removed from selection
  function handleSatelliteRemove(noradId: string) {
    setSelectedSats(prev => {
      const next = prev.filter(s => s.noradId !== noradId)
      if (next.length === 0) setTrayOpen(false)
      return next
    })
    setCardSat(prev => {
      if (prev?.noradId === noradId) {
        setLivePosition(null)
        setSelectedOrbital(null)
        setSelectedMeta(null)
        return null
      }
      return prev
    })
  }

  // Card ✕ — closes the info card only; orbit line stays on globe
  function handleDismissCard() {
    setCardSat(null)
    setLivePosition(null)
    setSelectedOrbital(null)
    setSelectedMeta(null)
  }

  // Tray chip ✕ — removes satellite from globe selection + tray
  function handleRemoveFromTray(noradId: string) {
    removeFromSelectionRef.current?.(noradId)
    // Globe fires onSatelliteRemove → handleSatelliteRemove updates React state
  }

  // Tray chip tap — reopens the info card and restarts live tick on Globe
  function handleTrayChipClick(sat: SelectedSat) {
    selectSatRef.current?.(sat.noradId)
    setCardSat(sat)
  }

  function handleAskAI() {
    if (!cardSat) return
    setPrefill(`Tell me about NORAD ${cardSat.noradId} (${cardSat.name})`)
    setChatOpen(true)
  }

  return (
    <div className="relative w-screen overflow-hidden bg-gray-950" style={{ height: '100dvh' }}>
      {/* Globe — full screen */}
      <GlobeView
        highlight={highlight}
        setFilter={setFilter}
        onSatelliteSelect={handleSatelliteSelect}
        onSatelliteSelectInfo={handleSatelliteSelectInfo}
        onLivePosition={handleLivePosition}
        onSatelliteRemove={handleSatelliteRemove}
        onCategoriesChange={setShownCategories}
        onCategoryCounts={setCategoryCounts}
        onRemoveReady={(fn) => { removeFromSelectionRef.current = fn }}
        onSelectReady={(fn) => { selectSatRef.current = fn }}
      />

      {/* Selection tray — collapsible panel, bottom-left above category pills */}
      {selectedSats.length > 0 && (
        <div className="absolute left-3 z-20 w-52 sm:w-56" style={{ bottom: 'max(3.5rem, calc(env(safe-area-inset-bottom, 0px) + 3rem))' }}>
          {/* Header — tap to expand/collapse */}
          <button
            onClick={() => setTrayOpen(o => !o)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-900/95 border border-gray-700/80 rounded-lg backdrop-blur-sm text-xs text-gray-300 touch-manipulation"
          >
            <span className="font-medium text-white">{selectedSats.length} Selected</span>
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              className={`flex-shrink-0 transition-transform duration-200 ${trayOpen ? 'rotate-180' : ''}`}
            >
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Expanded list */}
          {trayOpen && (
            <div className="mt-1 bg-gray-900/95 border border-gray-700/80 rounded-lg backdrop-blur-sm overflow-hidden">
              <div className="max-h-44 overflow-y-auto divide-y divide-gray-800/60">
                {selectedSats.map(sat => (
                  <div
                    key={sat.noradId}
                    className={`flex items-center gap-2 px-3 py-3 sm:py-2.5 transition-colors ${
                      cardSat?.noradId === sat.noradId ? 'bg-blue-900/30' : 'active:bg-gray-800'
                    }`}
                  >
                    <button
                      className="flex-1 min-w-0 text-left touch-manipulation"
                      onClick={() => handleTrayChipClick(sat)}
                    >
                      <div className="text-xs text-gray-200 truncate leading-tight">{sat.name}</div>
                      <div className="text-[10px] text-gray-600 mt-0.5">{sat.noradId}</div>
                    </button>
                    <button
                      onClick={() => handleRemoveFromTray(sat.noradId)}
                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-300 active:text-white rounded touch-manipulation"
                      aria-label={`Remove ${sat.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selected satellite info card — top-left, below clock */}
      {cardSat && (
        <div className="absolute top-10 left-3 mt-2 w-[calc(100%-1.5rem)] sm:w-64 bg-gray-900/95 backdrop-blur-sm border border-gray-700/80 rounded-lg shadow-2xl z-20 overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2 border-b border-gray-800">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate leading-tight">{cardSat.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">NORAD {cardSat.noradId}</span>
                {selectedMeta && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    selectedMeta.objectType === 'PAY' ? 'bg-blue-900/60 text-blue-300' :
                    selectedMeta.objectType === 'DEB' ? 'bg-red-900/60 text-red-300' :
                    selectedMeta.objectType === 'R/B' ? 'bg-orange-900/60 text-orange-300' :
                    'bg-gray-800 text-gray-400'
                  }`}>
                    {objectTypeLabel(selectedMeta.objectType)}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleDismissCard}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-300 text-xl leading-none transition-colors touch-manipulation"
              aria-label="Dismiss card"
            >
              ×
            </button>
          </div>

          {/* Metadata row — country + launch date */}
          {selectedMeta && (selectedMeta.owner || selectedMeta.launchDate) && (
            <div className="flex gap-3 px-3 py-2 border-b border-gray-800 text-xs text-gray-400">
              {selectedMeta.owner && (
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Origin</span>
                  <span className="text-gray-300 truncate">{selectedMeta.owner}</span>
                </div>
              )}
              {selectedMeta.launchDate && (
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Launch</span>
                  <span className="text-gray-300">{selectedMeta.launchDate}</span>
                </div>
              )}
              {selectedMeta.opsStatus && (
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Status</span>
                  <span className={selectedMeta.opsStatus === '+' ? 'text-green-400' : 'text-gray-400'}>
                    {opsStatusLabel(selectedMeta.opsStatus)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Live position — updates every second */}
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Live Position</div>
            {livePosition ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div>
                  <div className="text-[10px] text-gray-600">Latitude</div>
                  <div className="text-xs font-mono text-gray-200">{latLabel(livePosition.lat)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-600">Longitude</div>
                  <div className="text-xs font-mono text-gray-200">{lonLabel(livePosition.lon)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-600">Altitude</div>
                  <div className="text-xs font-mono text-gray-200">{livePosition.altKm.toLocaleString()} km</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-600">Velocity</div>
                  <div className="text-xs font-mono text-gray-200">{fmt(livePosition.velocity)} km/s</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-600">Propagating…</div>
            )}
          </div>

          {/* Orbital parameters — computed from TLE */}
          {selectedOrbital && (
            <div className="px-3 py-2 border-b border-gray-800">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Orbital Parameters</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div>
                  <div className="text-[10px] text-gray-600">Inclination</div>
                  <div className="text-xs font-mono text-gray-200">{selectedOrbital.inclination}°</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-600">Period</div>
                  <div className="text-xs font-mono text-gray-200">{fmt(selectedOrbital.period, 1)} min</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-600">Apogee</div>
                  <div className="text-xs font-mono text-gray-200">{selectedOrbital.apogee.toLocaleString()} km</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-600">Perigee</div>
                  <div className="text-xs font-mono text-gray-200">{selectedOrbital.perigee.toLocaleString()} km</div>
                </div>
              </div>
            </div>
          )}

          {/* Ask AI */}
          <div className="px-3 py-2">
            <button
              onClick={handleAskAI}
              className="w-full text-xs font-medium bg-blue-600/80 hover:bg-blue-500 active:bg-blue-700 text-white rounded-md py-2 sm:py-1.5 transition-colors touch-manipulation"
            >
              Ask AI about this satellite
            </button>
          </div>
        </div>
      )}

      {/* Floating chat panel — right side overlay; full-width on mobile */}
      {chatOpen && (
        <div className="absolute top-0 right-0 h-full w-full sm:w-80 border-l border-gray-800 shadow-2xl z-30 flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-950/95 backdrop-blur-sm flex-shrink-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-200">AI Assistant</span>
          </div>
          <div className="flex-1 min-h-0">
            <AgentPanel
              messages={messages}
              isLoading={isLoading}
              sendMessage={handleSendMessage}
              prefill={prefill}
              onClearPrefill={() => setPrefill(null)}
              onClose={() => setChatOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Chat toggle button — bottom-right, always visible */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="absolute right-4 z-30 w-12 h-12 rounded-full bg-blue-600 active:bg-blue-700 hover:bg-blue-500 text-white shadow-lg flex items-center justify-center transition-colors touch-manipulation"
          style={{ bottom: 'max(4rem, calc(env(safe-area-inset-bottom, 0px) + 3.5rem))' }}
          aria-label="Open AI chat"
        >
          {messages.length > 0 ? (
            <span className="text-xs font-bold">{messages.filter(m => m.role === 'assistant').length}</span>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      )}

      {!chatOpen && messages.length > 0 && (
        <div className="absolute right-3 z-40 w-3 h-3 rounded-full bg-blue-400 border-2 border-gray-950" style={{ bottom: 'max(5.25rem, calc(env(safe-area-inset-bottom, 0px) + 4.75rem))' }} />
      )}
    </div>
  )
}
