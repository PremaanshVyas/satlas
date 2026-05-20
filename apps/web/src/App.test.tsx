import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

vi.mock('./hooks/useGlobe', () => ({
  useGlobe: vi.fn(() => ({ isLoading: true })),
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
