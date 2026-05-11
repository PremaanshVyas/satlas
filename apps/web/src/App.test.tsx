import { render } from '@testing-library/react'
import App from './App'
import { vi } from 'vitest'

vi.mock('./hooks/useGlobe', () => ({ useGlobe: vi.fn() }))

test('App renders without crashing', () => {
  const { container } = render(<App />)
  expect(container.firstChild).toBeTruthy()
})
