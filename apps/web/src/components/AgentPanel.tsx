export default function AgentPanel() {
  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <span className="text-sm font-medium text-gray-300">AI agent</span>
        <span className="text-xs text-gray-600">coming soon</span>
      </div>
      <div className="border-t border-gray-800 p-4">
        <div className="bg-gray-900 rounded-lg px-4 py-3 text-xs text-gray-700 cursor-not-allowed select-none">
          Ask anything...
        </div>
      </div>
    </div>
  )
}
