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

  it('shows all four endpoint paths', () => {
    renderApiDocs()
    expect(screen.getAllByText('/api/catalog').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('/api/pass').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('/api/chat').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('/api/satellite-info').length).toBeGreaterThanOrEqual(1)
  })

  it('shows GET badges', () => {
    renderApiDocs()
    const badges = screen.getAllByText('GET')
    expect(badges.length).toBeGreaterThanOrEqual(3)
  })

  it('shows POST badge for chat endpoint', () => {
    renderApiDocs()
    expect(screen.getByText('POST')).toBeInTheDocument()
  })

  it('shows the base URL label', () => {
    renderApiDocs()
    expect(screen.getByText(/base urls/i)).toBeInTheDocument()
  })

  it('shows the errors section', () => {
    renderApiDocs()
    expect(screen.getAllByText('Errors').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/503/)).toBeInTheDocument()
  })

  it('shows the data sources section', () => {
    renderApiDocs()
    expect(screen.getAllByText('Data Sources').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Space-Track.org')).toBeInTheDocument()
  })

  it('shows response schema for satellite-info', () => {
    renderApiDocs()
    expect(screen.getByText('altitude_km')).toBeInTheDocument()
    expect(screen.getByText('velocity_kmps')).toBeInTheDocument()
    expect(screen.getByText('orbital_period_min')).toBeInTheDocument()
  })

  it('shows correct pass response field names', () => {
    renderApiDocs()
    expect(screen.getByText('start_utc')).toBeInTheDocument()
    expect(screen.getByText('end_utc')).toBeInTheDocument()
    expect(screen.getByText('max_elevation_deg')).toBeInTheDocument()
  })
})
