import { useRef } from 'react'
import { useGlobe } from '../hooks/useGlobe'
import type { HighlightDirective } from '../types/chat'

interface GlobeViewProps {
  highlight: HighlightDirective | null
}

export default function GlobeView({ highlight }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useGlobe(containerRef, highlight)
  return <div ref={containerRef} className="w-full h-full" />
}
