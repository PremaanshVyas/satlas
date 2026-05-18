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
  // The satellite whose info card is currently shown (most recently clicked)
  const [cardSat, setCardSat] = useState<SelectedSat | null>(null)
  const [livePosition, setLivePosition] = useState<LivePosition | null>(null)
  const [selectedOrbital, setSelectedOrbital] = useState<OrbitalParams | null>(null)
  const [selectedMeta, setSelectedMeta] = useState<SatcatEntry | null>(null)
  const [shownCategories, setShownCategories] = useState<string[]>([...ALL_CATEGORIES])

  // removeFromSelectionRef: called when tray chip ✕ is clicked
  const removeFromSelectionRef = useRef<((noradId: string) => void) | null>(null)

  const handleSendMessage = useCallback((content: string) => {
    sendMessage(content, shownCategories)
  }, [sendMessage, shownCategories])

  // Called every time a satellite is clicked — adds to tray + shows card
  function handleSatelliteSelect(name: string, noradId: string) {
    setSelectedSats(prev =>
      prev.find(s => s.noradId === noradId) ? prev : [...prev, { name, noradId }]
    )
    setCardSat({ name, noradId })
  }

  function handleSatelliteSelectInfo(orbital: OrbitalParams, meta: SatcatEntry | null) {
    setSelectedOrbital(orbital)
    setSelectedMeta(meta)
  }

  function handleLivePosition(pos: LivePosition | null) {
    setLivePosition(pos)
  }

  // Globe fires this when a satellite is removed from selection (tray ✕ or catalog rebuild)
  function handleSatelliteRemove(noradId: string) {
    setSelectedSats(prev => prev.filter(s => s.noradId !== noradId))
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

  // Card ✕ — closes the info card, keeps the satellite in the tray + orbit line on globe
  function handleDismissCard() {
    setCardSat(null)
    setLivePosition(null)
    setSelectedOrbital(null)
    setSelectedMeta(null)
  }

  // Tray chip ✕ — removes satellite from globe selection + tray
  function handleRemoveFromTray(noradId: string) {
    removeFromSelectionRef.current?.(noradId)
    // Globe fires onSatelliteRemove which updates selectedSats and cardSat
  }

  function handleAskAI() {
    if (!cardSat) return
    setPrefill(`Tell me about NORAD ${cardSat.noradId} (${cardSat.name})`)
    setChatOpen(true)
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gray-950">
      {/* Globe — full screen */}
      <GlobeView
        highlight={highlight}
        setFilter={setFilter}
        onSatelliteSelect={handleSatelliteSelect}
        onSatelliteSelectInfo={handleSatelliteSelectInfo}
        onLivePosition={handleLivePosition}
        onSatelliteRemove={handleSatelliteRemove}
        onCategoriesChange={setShownCategories}
        onRemoveReady={(fn) => { removeFromSelectionRef.current = fn }}
      />

      {/* Selection tray — bottom-left, above category pills, scrollable chips */}
      {selectedSats.length > 0 && (
        <div className="absolute bottom-14 left-3 z-20 flex gap-1.5 flex-wrap max-w-[calc(100vw-1.5rem)] sm:max-w-sm">
          {selectedSats.map(sat => (
            <div
              key={sat.noradId}
              onClick={() => setCardSat(sat)}
              className={`flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-xs border cursor-pointer transition-colors touch-manipulation ${
                cardSat?.noradId === sat.noradId
                  ? 'bg-blue-600/80 border-blue-500 text-white'
                  : 'bg-gray-900/90 border-gray-700 text-gray-300 hover:border-gray-500'
              }`}
            >
              <span className="truncate max-w-[100px] sm:max-w-[140px]">{sat.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleRemoveFromTray(sat.noradId) }}
                className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
                aria-label={`Remove ${sat.name}`}
              >
                ×
              </button>
            </div>
          ))}
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
              className="text-gray-600 hover:text-gray-300 text-xl leading-none flex-shrink-0 mt-0.5 transition-colors touch-manipulation w-8 h-8 flex items-center justify-center"
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
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/95 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm font-medium text-gray-200">AI Assistant</span>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="text-gray-500 hover:text-gray-300 transition-colors w-10 h-10 flex items-center justify-center rounded touch-manipulation"
              aria-label="Close chat"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <AgentPanel
              messages={messages}
              isLoading={isLoading}
              sendMessage={handleSendMessage}
              prefill={prefill}
              onClearPrefill={() => setPrefill(null)}
            />
          </div>
        </div>
      )}

      {/* Chat toggle button — bottom-right, always visible */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="absolute bottom-16 right-4 z-30 w-12 h-12 rounded-full bg-blue-600 active:bg-blue-700 hover:bg-blue-500 text-white shadow-lg flex items-center justify-center transition-colors touch-manipulation"
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
        <div className="absolute bottom-[74px] right-3 z-40 w-3 h-3 rounded-full bg-blue-400 border-2 border-gray-950" />
      )}
    </div>
  )
}
