import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import ApiDocs from './ApiDocs'

function renderApiDocs() {
  return render(
    <MemoryRouter>
      <ApiDocs />
    </MemoryRouter>,
  )
}

describe('ApiDocs', () => {
  it('renders the page heading', () => {
    renderApiDocs()
    expect(screen.getByText('API Reference')).toBeInTheDocument()
  })

  it('shows the Satlas API title in the header', () => {
    renderApiDocs()
    expect(screen.getByText('Satlas API')).toBeInTheDocument()
  })

  it('renders a link back to the globe', () => {
    renderApiDocs()
    const link = screen.getByRole('link', { name: /back to globe/i })
    expect(link).toHaveAttribute('href', '/')
  })

  it('shows all three endpoint paths', () => {
    renderApiDocs()
    expect(screen.getByText('/api/catalog')).toBeInTheDocument()
    expect(screen.getByText('/api/pass')).toBeInTheDocument()
    expect(screen.getByText('/api/chat')).toBeInTheDocument()
  })

  it('shows GET badge for catalog and pass endpoints', () => {
    renderApiDocs()
    const badges = screen.getAllByText('GET')
    expect(badges.length).toBeGreaterThanOrEqual(2)
  })

  it('shows POST badge for chat endpoint', () => {
    renderApiDocs()
    expect(screen.getByText('POST')).toBeInTheDocument()
  })

  it('shows the base URL label', () => {
    renderApiDocs()
    expect(screen.getByText(/base url/i)).toBeInTheDocument()
  })
})
