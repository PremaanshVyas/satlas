import { useState, useCallback, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Drawer } from 'vaul'
import GlobeView from './components/GlobeView'
import AgentPanel from './components/AgentPanel'
import SatInfoCard from './components/SatInfoCard'
import PassPanel from './components/PassPanel'
import CountryPanel from './components/CountryPanel'
import DevNotes from './components/DevNotes'
import TimeControls from './components/TimeControls'
import type { OverheadSat } from './components/GlobeView'
import { useChat } from './hooks/useChat'
import { ALL_CATEGORIES } from './globe/Globe'
import type { OrbitalParams, LivePosition, SatcatEntry } from './components/GlobeView'

interface SelectedSat {
  name: string
  noradId: string
}

interface SelectedCountry {
  name: string
  continent: string
  overheadSats: OverheadSat[]
}

export default function App() {
  const { messages, isLoading, sendMessage, highlight, setFilter, spotlight } = useChat()
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

  const [passOpen, setPassOpen] = useState(false)
  const [passSat, setPassSat] = useState<SelectedSat | null>(null)

  const [selectedCountry, setSelectedCountry] = useState<SelectedCountry | null>(null)

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

  const [timeScale, setTimeScaleState] = useState(1)
  const setTimeScaleRef = useRef<((scale: number) => void) | null>(null)

  function handleSetScale(scale: number) {
    setTimeScaleRef.current?.(scale)
    setTimeScaleState(scale)
  }

  const removeFromSelectionRef = useRef<((noradId: string) => void) | null>(null)
  const selectSatRef = useRef<((noradId: string) => void) | null>(null)
  const clearCountryHighlightRef = useRef<(() => void) | null>(null)

  function dismissCountry() {
    setSelectedCountry(null)
    clearCountryHighlightRef.current?.()
  }

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

  function handlePredictPasses() {
    if (!cardSat) return
    setPassSat(cardSat)
    setPassOpen(true)
    handleDismissCard()
  }

  return (
    <div className="relative w-screen overflow-hidden bg-[#080808]" style={{ height: '100dvh' }}>
      {/* Globe — full screen */}
      <GlobeView
        highlight={highlight}
        setFilter={setFilter}
        spotlight={spotlight}
        onSatelliteSelect={handleSatelliteSelect}
        onSatelliteSelectInfo={handleSatelliteSelectInfo}
        onLivePosition={handleLivePosition}
        onSatelliteRemove={handleSatelliteRemove}
        onCategoriesChange={setShownCategories}
        onCategoryCounts={setCategoryCounts}
        onRemoveReady={(fn) => { removeFromSelectionRef.current = fn }}
        onSelectReady={(fn) => { selectSatRef.current = fn }}
        onClearHighlightReady={(fn) => { clearCountryHighlightRef.current = fn }}
        onCountryClick={(name, continent, overheadSats) => setSelectedCountry({ name, continent, overheadSats })}
        onTimeReady={({ setTimeScale }) => { setTimeScaleRef.current = setTimeScale }}
      />

      {/* Bottom-left cluster: satellite tray above, time controls below */}
      <div
        className="absolute left-3 z-20 flex flex-col gap-2 w-44 sm:w-56"
        style={{ bottom: 'max(3.75rem, calc(env(safe-area-inset-bottom, 0px) + 3.25rem))' }}
      >
        {/* Satellite selection tray */}
        <AnimatePresence>
          {selectedSats.length > 0 && (
            <motion.div
              key="tray"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <button
                onClick={() => setTrayOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] font-mono text-[9px] touch-manipulation"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-secondary">{selectedSats.length} Selected</span>
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
                    className="mt-1 bg-[rgba(9,9,9,0.95)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] overflow-hidden"
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="max-h-32 sm:max-h-44 overflow-y-auto divide-y divide-[rgba(255,255,255,0.04)]">
                      {selectedSats.map(sat => (
                        <div
                          key={sat.noradId}
                          className={`flex items-center gap-2 px-3 py-3 sm:py-2.5 transition-colors ${
                            cardSat?.noradId === sat.noradId ? 'bg-[rgba(0,212,255,0.06)]' : ''
                          }`}
                        >
                          <button
                            className="flex-1 min-w-0 text-left touch-manipulation"
                            onClick={() => handleTrayChipClick(sat)}
                          >
                            <div className="font-mono text-[11px] text-secondary truncate leading-tight uppercase tracking-[0.03em]">{sat.name}</div>
                            <div className="font-mono text-[10px] text-label mt-0.5">{sat.noradId}</div>
                          </button>
                          <button
                            onClick={() => handleRemoveFromTray(sat.noradId)}
                            className="flex-shrink-0 w-7 h-7 flex items-center justify-center font-mono text-label hover:text-secondary rounded-[2px] touch-manipulation transition-colors"
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

        {/* Time controls — hidden on mobile, always visible on desktop */}
        <div className="hidden sm:block">
          <TimeControls
            timeScale={timeScale}
            onSetScale={handleSetScale}
          />
        </div>
      </div>

      {/* Desktop left column — SatInfoCard / PassPanel stacked above CountryPanel */}
      {!isMobile && (
        <div className="absolute top-10 left-3 mt-2 w-64 z-20 flex flex-col gap-2">
          <AnimatePresence>
            {cardSat && (
              <motion.div
                key={`card-${cardSat.noradId}`}
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] shadow-2xl overflow-hidden"
              >
                <SatInfoCard
                  sat={cardSat}
                  meta={selectedMeta}
                  position={livePosition}
                  orbital={selectedOrbital}
                  onDismiss={handleDismissCard}
                  onAskAI={handleAskAI}
                  onPredictPasses={handlePredictPasses}
                />
              </motion.div>
            )}
            {passOpen && passSat && (
              <motion.div
                key={`pass-${passSat.noradId}`}
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] shadow-2xl overflow-hidden flex flex-col"
                style={{ maxHeight: 'calc(50dvh - 2rem)' }}
              >
                <PassPanel sat={passSat} onClose={() => setPassOpen(false)} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectedCountry && (
              <motion.div
                key="country-panel"
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] shadow-2xl overflow-hidden"
              >
                <CountryPanel
                  country={selectedCountry}
                  overheadSats={selectedCountry.overheadSats}
                  onDismiss={dismissCountry}
                  onAskAI={() => {
                    setPrefill(`What satellites are above ${selectedCountry.name} right now?`)
                    setChatOpen(true)
                  }}
                  onSelectSatellite={(noradId) => selectSatRef.current?.(noradId)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Mobile info card — Vaul bottom sheet */}
      <Drawer.Root
        open={isMobile && !!cardSat}
        onOpenChange={(open) => { if (!open) handleDismissCard() }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" />
          <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-[rgba(9,9,9,0.98)] border-t border-[rgba(255,255,255,0.07)] shadow-2xl outline-none">
            <div className="mx-auto w-10 h-1 rounded-full bg-[rgba(255,255,255,0.08)] mt-3 mb-1" />
            {cardSat && (
              <SatInfoCard
                sat={cardSat}
                meta={selectedMeta}
                position={livePosition}
                orbital={selectedOrbital}
                onAskAI={() => { handleDismissCard(); handleAskAI() }}
                onPredictPasses={() => { handlePredictPasses() }}
              />
            )}
            <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Mobile pass panel — Vaul bottom sheet */}
      <Drawer.Root
        open={isMobile && passOpen && !!passSat}
        onOpenChange={(open) => { if (!open) setPassOpen(false) }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" />
          <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-[rgba(9,9,9,0.98)] border-t border-[rgba(255,255,255,0.07)] shadow-2xl outline-none" style={{ maxHeight: '80dvh' }}>
            <div className="mx-auto w-10 h-1 rounded-full bg-[rgba(255,255,255,0.08)] mt-3 mb-1" />
            {passSat && (
              <div className="overflow-hidden flex flex-col" style={{ maxHeight: 'calc(80dvh - 1.5rem)' }}>
                <PassPanel sat={passSat} onClose={() => setPassOpen(false)} />
              </div>
            )}
            <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Mobile country panel — Vaul bottom sheet */}
      <Drawer.Root
        open={isMobile && !!selectedCountry}
        onOpenChange={(open) => { if (!open) dismissCountry() }}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" />
          <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-[rgba(9,9,9,0.98)] border-t border-[rgba(255,255,255,0.07)] shadow-2xl outline-none">
            <div className="mx-auto w-10 h-1 rounded-full bg-[rgba(255,255,255,0.08)] mt-3 mb-1" />
            {selectedCountry && (
              <CountryPanel
                country={selectedCountry}
                overheadSats={selectedCountry.overheadSats}
                onDismiss={dismissCountry}
                onAskAI={() => {
                  dismissCountry()
                  setPrefill(`What satellites are above ${selectedCountry.name} right now?`)
                  setChatOpen(true)
                }}
                onSelectSatellite={(noradId) => selectSatRef.current?.(noradId)}
              />
            )}
            <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Chat panel — fixed to viewport, single flat flex column.
          AgentPanel renders a fragment so message list + input bar are
          direct children here — no nested height propagation needed. */}
      {chatOpen && (
        <div
          className="fixed right-0 w-full sm:w-80 border-l border-[rgba(255,255,255,0.07)] shadow-2xl z-30 flex flex-col bg-[#080808] overflow-hidden"
          style={{ top: 0, bottom: 0 }}
        >
          {/* Header — flex-none, never shrinks */}
          <div
            className="flex-none flex items-center gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.04)]"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-secondary">AI · Assistant</span>
          </div>
          {/* Message list + input bar rendered as direct flex children */}
          <AgentPanel
            messages={messages}
            isLoading={isLoading}
            sendMessage={handleSendMessage}
            prefill={prefill}
            onClearPrefill={() => setPrefill(null)}
            onClose={() => setChatOpen(false)}
          />
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
            className="absolute right-4 z-30 w-12 h-12 rounded-full bg-[rgba(9,9,9,0.9)] border border-[rgba(0,212,255,0.25)] text-accent shadow-lg flex items-center justify-center touch-manipulation hover:border-[rgba(0,212,255,0.45)] transition-colors"
            style={{ bottom: 'max(4.5rem, calc(env(safe-area-inset-bottom, 0px) + 4rem))' }}
            aria-label="Open AI chat"
          >
            {messages.length > 0 ? (
              <span className="font-mono text-[11px] font-medium text-accent">{messages.filter(m => m.role === 'assistant').length}</span>
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
          className="absolute right-3 z-40 w-2.5 h-2.5 rounded-full bg-accent border border-[#080808]"
          style={{ bottom: 'max(5.75rem, calc(env(safe-area-inset-bottom, 0px) + 5.25rem))' }}
        />
      )}

      <DevNotes hidden={chatOpen} />
    </div>
  )
}
