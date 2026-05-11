import { renderHook, act } from '@testing-library/react'
import { useGlobe } from './useGlobe'
import type { HighlightDirective } from '../types/chat'

// Mock the Globe class entirely — Three.js requires WebGL which jsdom doesn't provide
vi.mock('../globe/Globe', () => ({
  Globe: vi.fn(function () {
    return {
      mount: vi.fn(),
      resize: vi.fn(),
      unmount: vi.fn(),
      highlightSatellite: vi.fn(),
    }
  }),
}))

// Mock ResizeObserver (not available in jsdom)
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

    expect(globeInstance.highlightSatellite).toHaveBeenCalledWith('25544')
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
})
