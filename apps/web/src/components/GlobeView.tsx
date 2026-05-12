import { useRef } from 'react'
import { useGlobe } from '../hooks/useGlobe'
import type { HighlightDirective } from '../types/chat'

interface GlobeViewProps {
  highlight: HighlightDirective | null
}

export default function GlobeView({ highlight }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { isLoading } = useGlobe(containerRef, highlight)
  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 text-gray-400 text-sm tracking-wide">
          Loading satellite catalog…
        </div>
      )}
    </div>
  )
}
