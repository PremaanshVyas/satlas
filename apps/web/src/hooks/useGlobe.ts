import { useEffect, useRef, useState, useCallback } from 'react'
import type { RefObject } from 'react'
import { Globe } from '../globe/Globe'
import type { SatCategory } from '../globe/Globe'
import type { HighlightDirective, GroupHighlightDirective } from '../types/chat'

export interface HoverInfo {
  name: string
  altKm: number
  screenX: number
  screenY: number
}

export function useGlobe(
  containerRef: RefObject<HTMLDivElement | null>,
  highlight: HighlightDirective | null,
  onSatelliteClick?: (name: string, noradId: string) => void,
  groupHighlight?: GroupHighlightDirective | null,
): {
  isLoading: boolean
  satelliteCount: number
  hoverInfo: HoverInfo | null
  setActiveCategories: (cats: Set<SatCategory>) => void
} {
  const [isLoading, setIsLoading] = useState(true)
  const [satelliteCount, setSatelliteCount] = useState(0)
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
  const globeRef = useRef<Globe | null>(null)
  const onSatelliteClickRef = useRef(onSatelliteClick)
  onSatelliteClickRef.current = onSatelliteClick

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
    globe.onSatelliteClick = (name, noradId) => onSatelliteClickRef.current?.(name, noradId)
    globe.onSatelliteHover = (name, altKm, screenX, screenY) => {
      if (name !== null && altKm !== null) {
        setHoverInfo({ name, altKm, screenX, screenY })
      } else {
        setHoverInfo(null)
      }
    }
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

  useEffect(() => {
    // groupHighlight === undefined means prop was not passed — skip to avoid spurious null call on mount
    if (globeRef.current && groupHighlight !== undefined) {
      globeRef.current.setGroupHighlight(groupHighlight?.category ?? null)
    }
  }, [groupHighlight])

  const setActiveCategories = useCallback((cats: Set<SatCategory>) => {
    globeRef.current?.setActiveCategories(cats)
  }, [])

  return { isLoading, satelliteCount, hoverInfo, setActiveCategories }
}
