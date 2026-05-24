import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import CountryPanel from './CountryPanel'
import type { OverheadSat } from '../globe/Globe'

const SATS: OverheadSat[] = [
  { name: 'ISS (ZARYA)', noradId: '25544', elevDeg: 52 },
  { name: 'STARLINK-4721', noradId: '55001', elevDeg: 78 },
  { name: 'GPS IIF-10', noradId: '39533', elevDeg: 12 },
]

const PROPS = {
  country: { name: 'AUSTRALIA', continent: 'Oceania' },
  overheadSats: SATS,
  onDismiss: vi.fn(),
  onAskAI: vi.fn(),
  onSelectSatellite: vi.fn(),
}

describe('CountryPanel', () => {
  test('renders country name', () => {
    render(<CountryPanel {...PROPS} />)
    expect(screen.getByText('AUSTRALIA')).toBeInTheDocument()
  })

  test('renders continent', () => {
    render(<CountryPanel {...PROPS} />)
    expect(screen.getByText(/Oceania/)).toBeInTheDocument()
  })

  test('renders overhead count', () => {
    render(<CountryPanel {...PROPS} />)
    expect(screen.getByText(/3 overhead/)).toBeInTheDocument()
  })

  test('renders satellite names', () => {
    render(<CountryPanel {...PROPS} />)
    expect(screen.getByText('ISS (ZARYA)')).toBeInTheDocument()
    expect(screen.getByText('STARLINK-4721')).toBeInTheDocument()
  })

  test('calls onDismiss when × button clicked', () => {
    const onDismiss = vi.fn()
    render(<CountryPanel {...PROPS} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByLabelText('Dismiss country panel'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  test('calls onAskAI when Ask AI button clicked', () => {
    const onAskAI = vi.fn()
    render(<CountryPanel {...PROPS} onAskAI={onAskAI} />)
    fireEvent.click(screen.getByText(/ask ai/i))
    expect(onAskAI).toHaveBeenCalledOnce()
  })

  test('calls onSelectSatellite with correct noradId when row clicked', () => {
    const onSelectSatellite = vi.fn()
    render(<CountryPanel {...PROPS} onSelectSatellite={onSelectSatellite} />)
    fireEvent.click(screen.getByText('ISS (ZARYA)'))
    expect(onSelectSatellite).toHaveBeenCalledWith('25544')
  })

  test('shows empty state when overheadSats is empty', () => {
    render(<CountryPanel {...PROPS} overheadSats={[]} />)
    expect(screen.getByText(/no satellites overhead/i)).toBeInTheDocument()
  })
})
