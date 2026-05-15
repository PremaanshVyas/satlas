import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SearchBar from './SearchBar'

const mockResults = [
  { name: 'ISS (ZARYA)', noradId: '25544' },
  { name: 'STARLINK-1001', noradId: '45178' },
]

describe('SearchBar', () => {
  it('renders input with placeholder', () => {
    render(<SearchBar onSearch={() => []} onSelect={() => {}} />)
    expect(screen.getByPlaceholderText('Search satellites…')).toBeInTheDocument()
  })

  it('shows results when onSearch returns matches', () => {
    render(<SearchBar onSearch={() => mockResults} onSelect={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Search satellites…'), { target: { value: 'iss' } })
    expect(screen.getByText('ISS (ZARYA)')).toBeInTheDocument()
    expect(screen.getByText('25544')).toBeInTheDocument()
  })

  it('calls onSelect when a result is clicked', () => {
    const onSelect = vi.fn()
    render(<SearchBar onSearch={() => mockResults} onSelect={onSelect} />)
    fireEvent.change(screen.getByPlaceholderText('Search satellites…'), { target: { value: 'iss' } })
    fireEvent.mouseDown(screen.getByText('ISS (ZARYA)'))
    expect(onSelect).toHaveBeenCalledWith('25544', 'ISS (ZARYA)')
  })

  it('clears input after selection', () => {
    render(<SearchBar onSearch={() => mockResults} onSelect={() => {}} />)
    const input = screen.getByPlaceholderText('Search satellites…') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'iss' } })
    fireEvent.mouseDown(screen.getByText('ISS (ZARYA)'))
    expect(input.value).toBe('')
  })

  it('hides results when query is cleared', () => {
    render(<SearchBar onSearch={q => (q ? mockResults : [])} onSelect={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Search satellites…'), { target: { value: 'iss' } })
    expect(screen.getByText('ISS (ZARYA)')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search satellites…'), { target: { value: '' } })
    expect(screen.queryByText('ISS (ZARYA)')).not.toBeInTheDocument()
  })
})
