import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Globe } from '../globe/Globe'
import type { HighlightDirective } from '../types/chat'

export function useGlobe(
  containerRef: RefObject<HTMLDivElement | null>,
  highlight: HighlightDirective | null,
): { isLoading: boolean; satelliteCount: number } {
  const [isLoading, setIsLoading] = useState(true)
  const [satelliteCount, setSatelliteCount] = useState(0)
  const globeRef = useRef<Globe | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block'
    container.appendChild(canvas)

    const globe = new Globe()
    globe.mount(canvas, () => {
      setSatelliteCount(globe.getSatelliteCount())
      setIsLoading(false)
    })
    globe.onCatalogRefresh = (count) => setSatelliteCount(count)
    globeRef.current = globe

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      globe.resize(width, height)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      globe.onCatalogRefresh = null
      globe.unmount()
      globeRef.current = null
      canvas.remove()
    }
  }, [])

  useEffect(() => {
    if (highlight && globeRef.current) {
      globeRef.current.highlightSatellite(
        highlight.norad_id,
        highlight.latitude,
        highlight.longitude,
      )
    }
  }, [highlight])

  return { isLoading, satelliteCount }
}
