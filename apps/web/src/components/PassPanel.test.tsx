import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PassPanel from './PassPanel'

const SAT = { name: 'ISS (ZARYA)', noradId: '25544' }

// Mock geolocation
function mockGeo(succeed: boolean) {
  Object.defineProperty(navigator, 'geolocation', {
    writable: true,
    value: {
      getCurrentPosition: vi.fn((onSuccess, onError) => {
        if (succeed) {
          onSuccess({ coords: { latitude: -37.8136, longitude: 144.9631 } } as GeolocationPosition)
        } else {
          onError({ code: 1, message: 'denied' } as GeolocationPositionError)
        }
      }),
    },
  })
}

beforeEach(() => { vi.restoreAllMocks() })

describe('PassPanel', () => {
  it('shows the satellite name in the header', () => {
    mockGeo(false)
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    expect(screen.getByText('ISS (ZARYA)')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    mockGeo(false)
    const onClose = vi.fn()
    render(<PassPanel sat={SAT} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close pass panel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows geolocation requesting state initially when geo is available', () => {
    // Mock as pending (never calls callback)
    Object.defineProperty(navigator, 'geolocation', {
      writable: true,
      value: { getCurrentPosition: vi.fn() },
    })
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    expect(screen.getByText(/getting your location/i)).toBeInTheDocument()
  })

  it('shows manual location inputs when geolocation is denied', async () => {
    mockGeo(false)
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Latitude')).toBeInTheDocument()
    })
    expect(screen.getByPlaceholderText('Longitude')).toBeInTheDocument()
  })

  it('shows manual inputs when no geolocation API', () => {
    Object.defineProperty(navigator, 'geolocation', { writable: true, value: undefined })
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    expect(screen.getByPlaceholderText('Latitude')).toBeInTheDocument()
  })

  it('fetches passes and shows results when geolocation succeeds', async () => {
    mockGeo(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        passes: [
          {
            start_utc: '2026-05-21T10:00:00Z',
            end_utc: '2026-05-21T10:06:00Z',
            max_elevation_deg: 45.2,
            direction: 'NW',
          },
        ],
      }),
    }))
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('45.2°')).toBeInTheDocument()
    })
    expect(screen.getByText('NW')).toBeInTheDocument()
  })

  it('shows empty state when no passes returned', async () => {
    mockGeo(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ passes: [] }),
    }))
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/no passes/i)).toBeInTheDocument()
    })
  })

  it('shows error message when fetch fails', async () => {
    mockGeo(true)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    })
  })
})
