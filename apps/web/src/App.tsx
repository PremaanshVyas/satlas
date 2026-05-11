import GlobeView from './components/GlobeView'
import AgentPanel from './components/AgentPanel'
import { useChat } from './hooks/useChat'

export default function App() {
  const { messages, isLoading, sendMessage, highlight } = useChat()

  return (
    <div className="flex h-screen w-screen bg-gray-950 overflow-hidden">
      <div className="flex-[65]">
        <GlobeView highlight={highlight} />
      </div>
      <div className="flex-[35] border-l border-gray-800">
        <AgentPanel messages={messages} isLoading={isLoading} sendMessage={sendMessage} />
      </div>
    </div>
  )
}
