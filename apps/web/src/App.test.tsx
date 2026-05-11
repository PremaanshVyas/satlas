import { render } from '@testing-library/react'
import App from './App'

vi.mock('./hooks/useGlobe', () => ({ useGlobe: vi.fn() }))
vi.mock('./hooks/useChat', () => ({
  useChat: vi.fn(() => ({ messages: [], isLoading: false, sendMessage: vi.fn() })),
}))

window.HTMLElement.prototype.scrollIntoView = vi.fn()

test('App renders without crashing', () => {
  const { container } = render(<App />)
  expect(container.firstChild).toBeTruthy()
})
