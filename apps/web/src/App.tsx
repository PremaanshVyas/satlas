import GlobeView from './components/GlobeView'
import AgentPanel from './components/AgentPanel'

export default function App() {
  return (
    <div className="flex h-screen w-screen bg-gray-950 overflow-hidden">
      <div className="flex-[65]">
        <GlobeView />
      </div>
      <div className="flex-[35] border-l border-gray-800">
        <AgentPanel />
      </div>
    </div>
  )
}
