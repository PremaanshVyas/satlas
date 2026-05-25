import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

vi.mock('./hooks/useGlobe', () => ({
  useGlobe: vi.fn(() => ({
    isLoading: true,
    satelliteCount: 0,
    catalogError: false,
    hoverInfo: null,
    setActiveCategories: vi.fn(),
    applyAgentFilter: vi.fn(),
    applySpotlight: vi.fn(),
    removeFromSelection: vi.fn(),
    setCloudVisibility: vi.fn(),
    searchCatalog: vi.fn(() => ({ results: [], total: 0 })),
    selectCatalogSatellite: vi.fn(),
    setBordersVisible: vi.fn(),
    clearCountryHighlight: vi.fn(),
    simulatedTime: new Date('2026-01-01T00:00:00Z'),
    timeScale: 1,
    setTimeScale: vi.fn(),
  })),
}))
vi.mock('./hooks/useChat', () => ({
  useChat: vi.fn(() => ({
    messages: [],
    isLoading: false,
    sendMessage: vi.fn(),
    highlight: null,
  })),
}))

window.HTMLElement.prototype.scrollIntoView = vi.fn()

test('App renders without crashing', () => {
  const { container } = render(<MemoryRouter><App /></MemoryRouter>)
  expect(container.firstChild).toBeTruthy()
})
