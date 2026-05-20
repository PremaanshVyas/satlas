import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PassPanel from './PassPanel'

const SAT = { name: 'ISS (ZARYA)', noradId: '25544' }

const PASS = {
  start_utc: '2026-05-21T10:00:00Z',
  end_utc: '2026-05-21T10:06:00Z',
  max_elevation_deg: 45.2,
  direction: 'NW',
}

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

// Route fetch calls: Nominatim gets a location response, /api/pass gets passes
function mockFetch(passData = [PASS], locationName = 'Melbourne') {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (String(url).includes('nominatim')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          address: { city: locationName },
          display_name: `${locationName}, Victoria, Australia`,
        }),
      })
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ passes: passData }),
    })
  }))
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
    Object.defineProperty(navigator, 'geolocation', {
      writable: true,
      value: { getCurrentPosition: vi.fn() },
    })
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    expect(screen.getByText(/getting your location/i)).toBeInTheDocument()
  })

  it('shows location search input when geolocation is denied', async () => {
    mockGeo(false)
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search location/i)).toBeInTheDocument()
    })
  })

  it('shows location search input when no geolocation API', () => {
    Object.defineProperty(navigator, 'geolocation', { writable: true, value: undefined })
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    expect(screen.getByPlaceholderText(/search location/i)).toBeInTheDocument()
  })

  it('shows location name after geolocation and reverse geocoding', async () => {
    mockGeo(true)
    mockFetch([], 'Melbourne')
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('Melbourne')).toBeInTheDocument()
    })
  })

  it('geocodes typed location and fetches passes on search', async () => {
    mockGeo(false)
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('search?q=')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ lat: '-33.8688', lon: '151.2093', display_name: 'Sydney, NSW, Australia' }],
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ passes: [PASS] }) })
    }))
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => screen.getByPlaceholderText(/search location/i))
    fireEvent.change(screen.getByPlaceholderText(/search location/i), { target: { value: 'Sydney' } })
    fireEvent.click(screen.getByRole('button', { name: /go/i }))
    await waitFor(() => {
      expect(screen.getByText('45.2°')).toBeInTheDocument()
    })
  })

  it('fetches passes and shows results when geolocation succeeds', async () => {
    mockGeo(true)
    mockFetch([PASS])
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('45.2°')).toBeInTheDocument()
    })
    expect(screen.getByText('NW')).toBeInTheDocument()
  })

  it('shows empty state when no passes returned', async () => {
    mockGeo(true)
    mockFetch([])
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/no passes/i)).toBeInTheDocument()
    })
  })

  it('shows error message when pass fetch fails', async () => {
    mockGeo(true)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    })
  })

  it('shows suggestion dropdown with city and context while typing', async () => {
    mockGeo(false)
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('search?q=')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { lat: '-37.8136', lon: '144.9631', display_name: 'Melbourne, Victoria, Australia' },
            { lat: '-37.9', lon: '145.1', display_name: 'Melbourne Airport, Victoria, Australia' },
          ],
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ passes: [] }) })
    }))
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => screen.getByPlaceholderText(/search location/i))
    fireEvent.change(screen.getByPlaceholderText(/search location/i), { target: { value: 'Melb' } })
    await waitFor(() => {
      expect(screen.getAllByText('Melbourne').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Victoria, Australia').length).toBeGreaterThanOrEqual(1)
    }, { timeout: 1500 })
  })

  it('clicking a suggestion selects the location and fetches passes', async () => {
    mockGeo(false)
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('search?q=')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { lat: '-37.8136', lon: '144.9631', display_name: 'Melbourne, Victoria, Australia' },
          ],
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ passes: [PASS] }) })
    }))
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => screen.getByPlaceholderText(/search location/i))
    fireEvent.change(screen.getByPlaceholderText(/search location/i), { target: { value: 'Melb' } })
    await waitFor(() => screen.getByText('Melbourne'), { timeout: 1500 })
    fireEvent.mouseDown(screen.getByText('Melbourne'))
    await waitFor(() => {
      expect(screen.getByText('45.2°')).toBeInTheDocument()
    })
  })

  it('pressing Escape dismisses the suggestion dropdown', async () => {
    mockGeo(false)
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (String(url).includes('search?q=')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { lat: '-37.8136', lon: '144.9631', display_name: 'Melbourne, Victoria, Australia' },
          ],
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ passes: [] }) })
    }))
    render(<PassPanel sat={SAT} onClose={() => {}} />)
    await waitFor(() => screen.getByPlaceholderText(/search location/i))
    fireEvent.change(screen.getByPlaceholderText(/search location/i), { target: { value: 'Melb' } })
    await waitFor(() => screen.getByText('Melbourne'), { timeout: 1500 })
    fireEvent.keyDown(screen.getByPlaceholderText(/search location/i), { key: 'Escape' })
    expect(screen.queryByText('Melbourne')).not.toBeInTheDocument()
  })
})
