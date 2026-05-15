import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import type { RefObject } from 'react'
import { Globe } from '../globe/Globe'
import type { SatCategory, OrbitalParams, LivePosition } from '../globe/Globe'
import type { HighlightDirective } from '../types/chat'
import type { SatcatEntry } from '../lib/satcat'

export type { OrbitalParams, LivePosition }
export type { SatcatEntry }

export interface HoverInfo {
  name: string
  altKm: number
  screenX: number
  screenY: number
}

interface UseGlobeCallbacks {
  onSatelliteClick?: (name: string, noradId: string) => void
  onSatelliteSelectInfo?: (orbital: OrbitalParams, meta: SatcatEntry | null) => void
  onLivePosition?: (pos: LivePosition | null) => void
  onSatelliteDeselect?: () => void
}

export function useGlobe(
  containerRef: RefObject<HTMLDivElement | null>,
  highlight: HighlightDirective | null,
  callbacks: UseGlobeCallbacks,
): {
  isLoading: boolean
  satelliteCount: number
  hoverInfo: HoverInfo | null
  setActiveCategories: (cats: Set<SatCategory>) => void
  applyAgentFilter: (cats: SatCategory[]) => void
  deselectSatellite: () => void
} {
  const [isLoading, setIsLoading] = useState(true)
  const [satelliteCount, setSatelliteCount] = useState(0)
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
  const globeRef = useRef<Globe | null>(null)

  // Keep callback refs fresh so Globe callbacks always call the current version.
  const callbacksRef = useRef(callbacks)
  useLayoutEffect(() => { callbacksRef.current = callbacks })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block'
    container.appendChild(canvas)

    const globe = new Globe()
    globe.mount(canvas, () => setIsLoading(false))

    globe.onCatalogRefresh = (count) => setSatelliteCount(count)
    globe.onSatelliteClick = (name, noradId) => callbacksRef.current.onSatelliteClick?.(name, noradId)
    globe.onSatelliteHover = (name, altKm, screenX, screenY) => {
      if (name !== null && altKm !== null) setHoverInfo({ name, altKm, screenX, screenY })
      else setHoverInfo(null)
    }
    globe.onLivePosition = (pos) => callbacksRef.current.onLivePosition?.(pos)
    globe.onSatelliteSelectInfo = (orbital, meta) => callbacksRef.current.onSatelliteSelectInfo?.(orbital, meta)
    globe.onSatelliteDeselect = () => {
      callbacksRef.current.onLivePosition?.(null)
      callbacksRef.current.onSatelliteDeselect?.()
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
  }, [containerRef])

  useEffect(() => {
    if (highlight && globeRef.current) {
      globeRef.current.highlightSatellite(highlight.norad_id, highlight.latitude, highlight.longitude)
    }
  }, [highlight])

  const setActiveCategories = useCallback((cats: Set<SatCategory>) => {
    globeRef.current?.setActiveCategories(cats)
  }, [])

  const applyAgentFilter = useCallback((cats: SatCategory[]) => {
    globeRef.current?.applyAgentFilter(cats)
  }, [])

  const deselectSatellite = useCallback(() => {
    globeRef.current?.clearSelection()
  }, [])

  return { isLoading, satelliteCount, hoverInfo, setActiveCategories, applyAgentFilter, deselectSatellite }
}
