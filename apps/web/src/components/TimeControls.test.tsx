import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import TimeControls from './TimeControls'

function make(overrides: Partial<Parameters<typeof TimeControls>[0]> = {}) {
  const defaults = {
    timeScale: 1,
    onSetScale: vi.fn(),
  }
  return { ...defaults, ...overrides, onSetScale: overrides.onSetScale ?? defaults.onSetScale }
}

describe('TimeControls', () => {
  it('renders all transport buttons', () => {
    render(<TimeControls {...make()} />)
    expect(screen.getByTitle('10× forward')).toBeInTheDocument()
    expect(screen.getByTitle('10× reverse')).toBeInTheDocument()
    expect(screen.getByTitle('Pause')).toBeInTheDocument()
    expect(screen.getByTitle('Snap to real time')).toBeInTheDocument()
  })

  it('shows LIVE badge when timeScale is 1', () => {
    render(<TimeControls {...make()} />)
    const badges = screen.getAllByText('LIVE')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('clicking 10x forward calls onSetScale(10)', () => {
    const onSetScale = vi.fn()
    render(<TimeControls {...make({ onSetScale })} />)
    fireEvent.click(screen.getByTitle('10× forward'))
    expect(onSetScale).toHaveBeenCalledWith(10)
  })

  it('clicking 10x reverse calls onSetScale(-10)', () => {
    const onSetScale = vi.fn()
    render(<TimeControls {...make({ onSetScale })} />)
    fireEvent.click(screen.getByTitle('10× reverse'))
    expect(onSetScale).toHaveBeenCalledWith(-10)
  })

  it('clicking pause calls onSetScale(0)', () => {
    const onSetScale = vi.fn()
    render(<TimeControls {...make({ timeScale: 10, onSetScale })} />)
    fireEvent.click(screen.getByTitle('Pause'))
    expect(onSetScale).toHaveBeenCalledWith(0)
  })

  it('clicking LIVE button calls onSetScale(1)', () => {
    const onSetScale = vi.fn()
    render(<TimeControls {...make({ timeScale: 50, onSetScale })} />)
    fireEvent.click(screen.getByTitle('Snap to real time'))
    expect(onSetScale).toHaveBeenCalledWith(1)
  })

  it('clicking the already-active speed button a second time calls onSetScale(0) (toggle-to-pause)', () => {
    const onSetScale = vi.fn()
    render(<TimeControls {...make({ timeScale: 10, onSetScale })} />)
    fireEvent.click(screen.getByTitle('10× forward'))  // already active
    expect(onSetScale).toHaveBeenCalledWith(0)
  })

  it('shows amber speed badge when a forward speed is active', () => {
    render(<TimeControls {...make({ timeScale: 50 })} />)
    expect(screen.getByTestId('speed-badge')).toHaveTextContent('50×►')
  })

  it('shows pause badge when timeScale is 0', () => {
    render(<TimeControls {...make({ timeScale: 0 })} />)
    expect(screen.getByTestId('speed-badge')).toHaveTextContent('⏸')
  })
})
