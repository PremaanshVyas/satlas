import { useState } from 'react'
import GlobeView from './components/GlobeView'
import AgentPanel from './components/AgentPanel'
import { useChat } from './hooks/useChat'

export default function App() {
  const { messages, isLoading, sendMessage, highlight } = useChat()
  const [prefill, setPrefill] = useState<string | null>(null)

  function handleSatelliteSelect(name: string) {
    setPrefill(`Tell me about ${name}`)
  }

  return (
    <div className="flex h-screen w-screen bg-gray-950 overflow-hidden">
      <div className="flex-[65]">
        <GlobeView highlight={highlight} onSatelliteSelect={handleSatelliteSelect} />
      </div>
      <div className="flex-[35] border-l border-gray-800">
        <AgentPanel
          messages={messages}
          isLoading={isLoading}
          sendMessage={sendMessage}
          prefill={prefill}
        />
      </div>
    </div>
  )
}
