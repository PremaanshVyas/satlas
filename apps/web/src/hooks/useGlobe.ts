import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import type { RefObject } from 'react'
import { Globe } from '../globe/Globe'
import type { SatCategory, OrbitalParams, LivePosition, OverheadSat } from '../globe/Globe'
import type { HighlightDirective } from '../types/chat'
import type { SatcatEntry } from '../lib/satcat'
import type { SearchResult } from '../globe/searchUtils'

export type { OrbitalParams, LivePosition, OverheadSat }
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
  onSatelliteRemove?: (noradId: string) => void
  onCategoryCounts?: (counts: Record<string, number>) => void
  onCountryClick?: (name: string, continent: string, overheadSats: OverheadSat[]) => void
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
  removeFromSelection: (noradId: string) => void
  searchCatalog: (query: string) => SearchResult[]
  selectCatalogSatellite: (noradId: string) => void
} {
  const [isLoading, setIsLoading] = useState(true)
  const [satelliteCount, setSatelliteCount] = useState(0)
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
  const globeRef = useRef<Globe | null>(null)

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

    globe.onCatalogRefresh = (count) => {
      setSatelliteCount(count)
      callbacksRef.current.onCategoryCounts?.(globe.getAllCategoryCounts())
    }
    globe.onSatelliteClick = (name, noradId) => callbacksRef.current.onSatelliteClick?.(name, noradId)
    globe.onSatelliteHover = (name, altKm, screenX, screenY) => {
      if (name !== null && altKm !== null) setHoverInfo({ name, altKm, screenX, screenY })
      else setHoverInfo(null)
    }
    globe.onLivePosition = (pos) => callbacksRef.current.onLivePosition?.(pos)
    globe.onSatelliteSelectInfo = (orbital, meta) => callbacksRef.current.onSatelliteSelectInfo?.(orbital, meta)
    globe.onSatelliteRemove = (noradId) => callbacksRef.current.onSatelliteRemove?.(noradId)
    globe.onCountryClick = (name, continent, centLat, centLon) => {
      const overhead = globe.getOverheadSatellites(centLat, centLon)
      callbacksRef.current.onCountryClick?.(name, continent, overhead)
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

  const removeFromSelection = useCallback((noradId: string): void => {
    globeRef.current?.removeFromSelection(noradId)
  }, [])

  const searchCatalog = useCallback((query: string): SearchResult[] => {
    return globeRef.current?.searchCatalog(query) ?? []
  }, [])

  const selectCatalogSatellite = useCallback((noradId: string): void => {
    globeRef.current?.selectCatalogSatellite(noradId)
  }, [])

  return { isLoading, satelliteCount, hoverInfo, setActiveCategories, applyAgentFilter, removeFromSelection, searchCatalog, selectCatalogSatellite }
}
