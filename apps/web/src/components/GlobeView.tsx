import { useRef } from 'react'
import { useGlobe } from '../hooks/useGlobe'

export default function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null)
  useGlobe(containerRef)
  return <div ref={containerRef} className="w-full h-full" />
}
