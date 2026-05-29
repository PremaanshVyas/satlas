import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Maintenance from './Maintenance'

describe('Maintenance', () => {
  it('shows the maintenance headline', () => {
    render(<Maintenance />)
    expect(screen.getByText(/performing maintenance/i)).toBeInTheDocument()
  })

  it('explains the catalog is refreshing', () => {
    render(<Maintenance />)
    expect(screen.getByText(/refreshing the live satellite catalog/i)).toBeInTheDocument()
  })

  it('links to the API docs as a fallback', () => {
    render(<Maintenance />)
    const link = screen.getByRole('link', { name: /api docs/i })
    expect(link).toHaveAttribute('href', '/docs')
  })
})
