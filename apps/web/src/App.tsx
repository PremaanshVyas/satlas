import { useState, useCallback, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Drawer } from 'vaul'
import GlobeView from './components/GlobeView'
import AgentPanel from './components/AgentPanel'
import SatInfoCard from './components/SatInfoCard'
import { useChat } from './hooks/useChat'
import { ALL_CATEGORIES } from './globe/Globe'
import type { OrbitalParams, LivePosition, SatcatEntry } from './components/GlobeView'

interface SelectedSat {
  name: string
  noradId: string
}

export default function App() {
  const { messages, isLoading, sendMessage, highlight, setFilter } = useChat()
  const [chatOpen, setChatOpen] = useState(false)
  const [prefill, setPrefill] = useState<string | null>(null)

  const [selectedSats, setSelectedSats] = useState<SelectedSat[]>([])
  const [trayOpen, setTrayOpen] = useState(false)
  const [cardSat, setCardSat] = useState<SelectedSat | null>(null)
  const [livePosition, setLivePosition] = useState<LivePosition | null>(null)
  const [selectedOrbital, setSelectedOrbital] = useState<OrbitalParams | null>(null)
  const [selectedMeta, setSelectedMeta] = useState<SatcatEntry | null>(null)
  const [shownCategories, setShownCategories] = useState<string[]>([...ALL_CATEGORIES])
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})

  // Mobile detection — drives Vaul vs desktop card
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional sync with MediaQueryList on mount; handler updates on change
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const removeFromSelectionRef = useRef<((noradId: string) => void) | null>(null)
  const selectSatRef = useRef<((noradId: string) => void) | null>(null)

  const handleSendMessage = useCallback((content: string) => {
    sendMessage(content, shownCategories, categoryCounts)
  }, [sendMessage, shownCategories, categoryCounts])

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

  function handleDismissCard() {
    setCardSat(null)
    setLivePosition(null)
    setSelectedOrbital(null)
    setSelectedMeta(null)
  }

  function handleRemoveFromTray(noradId: string) {
    removeFromSelectionRef.current?.(noradId)
  }

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

      {/* Selection tray — animates up from bottom-left */}
      <AnimatePresence>
        {selectedSats.length > 0 && (
          <motion.div
            key="tray"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute left-3 z-20 w-52 sm:w-56"
            style={{ bottom: 'max(3.5rem, calc(env(safe-area-inset-bottom, 0px) + 3rem))' }}
          >
            <button
              onClick={() => setTrayOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-900/95 border border-gray-700/80 rounded-lg backdrop-blur-sm text-xs text-gray-300 touch-manipulation"
            >
              <span className="font-medium text-white">{selectedSats.length} Selected</span>
              <motion.svg
                width="12" height="12" viewBox="0 0 12 12" fill="none"
                animate={{ rotate: trayOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="flex-shrink-0"
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </motion.svg>
            </button>

            <AnimatePresence>
              {trayOpen && (
                <motion.div
                  key="traylist"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeInOut' }}
                  className="mt-1 bg-gray-900/95 border border-gray-700/80 rounded-lg backdrop-blur-sm overflow-hidden"
                  style={{ overflow: 'hidden' }}
                >
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
                        >×</button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop info card — fades in from above; hidden on mobile (Vaul handles it) */}
      <AnimatePresence>
        {cardSat && !isMobile && (
          <motion.div
            key={`card-${cardSat.noradId}`}
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute top-10 left-3 mt-2 w-64 bg-gray-900/95 backdrop-blur-sm border border-gray-700/80 rounded-lg shadow-2xl z-20 overflow-hidden"
          >
            <SatInfoCard
              sat={cardSat}
              meta={selectedMeta}
              position={livePosition}
              orbital={selectedOrbital}
              onDismiss={handleDismissCard}
              onAskAI={handleAskAI}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile info card — Vaul bottom sheet */}
      <Drawer.Root
        open={isMobile && !!cardSat}
        onOpenChange={(open) => { if (!open) handleDismissCard() }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" />
          <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-gray-900 border-t border-gray-700/80 shadow-2xl outline-none">
            <div className="mx-auto w-10 h-1 rounded-full bg-gray-700 mt-3 mb-1" />
            {cardSat && (
              <SatInfoCard
                sat={cardSat}
                meta={selectedMeta}
                position={livePosition}
                orbital={selectedOrbital}
                onAskAI={() => { handleDismissCard(); handleAskAI() }}
              />
            )}
            <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Chat panel */}
      {chatOpen && (
        <div className="absolute inset-y-0 right-0 w-full sm:w-80 border-l border-gray-800 shadow-2xl z-30 flex flex-col">
          <div
            className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-950/95 backdrop-blur-sm flex-shrink-0"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-200">AI Assistant</span>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
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

      {/* Chat toggle button — scales in when chat is closed */}
      <AnimatePresence>
        {!chatOpen && (
          <motion.button
            key="chatbtn"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            onClick={() => setChatOpen(true)}
            className="absolute right-4 z-30 w-12 h-12 rounded-full bg-blue-600 active:bg-blue-700 hover:bg-blue-500 text-white shadow-lg flex items-center justify-center touch-manipulation"
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
          </motion.button>
        )}
      </AnimatePresence>

      {/* Unread dot */}
      {!chatOpen && messages.length > 0 && (
        <div
          className="absolute right-3 z-40 w-3 h-3 rounded-full bg-blue-400 border-2 border-gray-950"
          style={{ bottom: 'max(5.25rem, calc(env(safe-area-inset-bottom, 0px) + 4.75rem))' }}
        />
      )}
    </div>
  )
}
