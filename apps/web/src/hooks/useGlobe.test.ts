import { renderHook, act } from '@testing-library/react'
import { useGlobe } from './useGlobe'
import type { HighlightDirective } from '../types/chat'

vi.mock('../globe/Globe', () => ({
  Globe: vi.fn(function () {
    return {
      mount: vi.fn(),
      resize: vi.fn(),
      unmount: vi.fn(),
      highlightSatellite: vi.fn(),
      setActiveCategories: vi.fn(),
      onCatalogRefresh: null,
      onSatelliteClick: null,
      onSatelliteHover: null,
    }
  }),
  ALL_CATEGORIES: ['STARLINK', 'GPS', 'IRIDIUM', 'DEBRIS', 'OTHER'],
}))

const mockObserve = vi.fn()
const mockDisconnect = vi.fn()
vi.stubGlobal(
  'ResizeObserver',
  vi.fn(function () {
    return { observe: mockObserve, disconnect: mockDisconnect }
  }),
)

import { Globe } from '../globe/Globe'

describe('useGlobe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeContainerRef() {
    const div = document.createElement('div')
    return { current: div }
  }

  test('calls highlightSatellite when highlight prop changes', () => {
    const containerRef = makeContainerRef()
    const { rerender } = renderHook(
      ({ highlight }: { highlight: HighlightDirective | null }) =>
        useGlobe(containerRef as React.RefObject<HTMLDivElement>, highlight),
      { initialProps: { highlight: null as HighlightDirective | null } },
    )

    const globeInstance = vi.mocked(Globe).mock.results[0]?.value
    expect(globeInstance).toBeDefined()

    act(() => {
      rerender({ highlight: { norad_id: '25544', satellite_name: 'ISS' } })
    })

    expect(globeInstance.highlightSatellite).toHaveBeenCalledWith('25544', undefined, undefined)
  })

  test('does not call highlightSatellite when highlight is null', () => {
    const containerRef = makeContainerRef()
    renderHook(
      ({ highlight }: { highlight: HighlightDirective | null }) =>
        useGlobe(containerRef as React.RefObject<HTMLDivElement>, highlight),
      { initialProps: { highlight: null as HighlightDirective | null } },
    )

    const globeInstance = vi.mocked(Globe).mock.results[0]?.value
    expect(globeInstance?.highlightSatellite).not.toHaveBeenCalled()
  })

  test('wires onSatelliteClick callback to globe and calls it when globe fires', () => {
    const containerRef = makeContainerRef()
    const onSatelliteClick = vi.fn()
    renderHook(() =>
      useGlobe(
        containerRef as React.RefObject<HTMLDivElement>,
        null,
        onSatelliteClick,
      ),
    )

    const globeInstance = vi.mocked(Globe).mock.results[0]?.value
    expect(globeInstance).toBeDefined()

    act(() => {
      globeInstance.onSatelliteClick?.('STARLINK-1234', '44713')
    })

    expect(onSatelliteClick).toHaveBeenCalledWith('STARLINK-1234', '44713')
  })

  test('setActiveCategories calls globe.setActiveCategories', () => {
    const containerRef = makeContainerRef()
    const { result } = renderHook(() =>
      useGlobe(containerRef as React.RefObject<HTMLDivElement>, null),
    )

    const globeInstance = vi.mocked(Globe).mock.results[0]?.value
    const cats = new Set(['STARLINK', 'GPS'] as const)

    act(() => {
      result.current.setActiveCategories(cats as never)
    })

    expect(globeInstance.setActiveCategories).toHaveBeenCalledWith(cats)
  })

})
