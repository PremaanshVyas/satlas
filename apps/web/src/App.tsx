import { useState } from 'react'
import GlobeView from './components/GlobeView'
import AgentPanel from './components/AgentPanel'
import { useChat } from './hooks/useChat'

interface SelectedSat {
  name: string
  noradId: string
}

export default function App() {
  const { messages, isLoading, sendMessage, highlight, groupHighlight } = useChat()
  const [chatOpen, setChatOpen] = useState(false)
  const [prefill, setPrefill] = useState<string | null>(null)
  const [selectedSat, setSelectedSat] = useState<SelectedSat | null>(null)

  function handleSatelliteSelect(name: string, noradId: string) {
    setSelectedSat({ name, noradId })
  }

  function handleAskAI() {
    if (!selectedSat) return
    setPrefill(`Tell me about NORAD ${selectedSat.noradId} (${selectedSat.name})`)
    setChatOpen(true)
  }

  function handleDismissSat() {
    setSelectedSat(null)
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gray-950">
      {/* Globe — full screen */}
      <GlobeView highlight={highlight} groupHighlight={groupHighlight} onSatelliteSelect={handleSatelliteSelect} />

      {/* Selected satellite info card — top-left, below clock */}
      {selectedSat && (
        <div className="absolute top-10 left-3 mt-2 w-56 bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg p-3 shadow-xl z-20">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Selected</div>
              <div className="text-sm font-medium text-white truncate">{selectedSat.name}</div>
              <div className="text-xs text-gray-500">NORAD {selectedSat.noradId}</div>
            </div>
            <button
              onClick={handleDismissSat}
              className="text-gray-600 hover:text-gray-400 text-lg leading-none flex-shrink-0 mt-0.5"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <button
            onClick={handleAskAI}
            className="w-full text-xs font-medium bg-blue-600/80 hover:bg-blue-500 text-white rounded-md py-1.5 transition-colors"
          >
            Ask AI about this satellite
          </button>
        </div>
      )}

      {/* Floating chat panel — right side overlay */}
      {chatOpen && (
        <div className="absolute top-0 right-0 h-full w-80 border-l border-gray-800 shadow-2xl z-30 flex flex-col">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/95 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm font-medium text-gray-200">AI Assistant</span>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded"
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
              sendMessage={sendMessage}
              prefill={prefill}
              onClearPrefill={() => setPrefill(null)}
            />
          </div>
        </div>
      )}

      {/* Chat toggle button — bottom-right */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="absolute bottom-16 right-4 z-30 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg flex items-center justify-center transition-colors"
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

      {/* Unread indicator dot when chat is closed and there are messages */}
      {!chatOpen && messages.length > 0 && (
        <div className="absolute bottom-[74px] right-3 z-40 w-3 h-3 rounded-full bg-blue-400 border-2 border-gray-950" />
      )}
    </div>
  )
}
