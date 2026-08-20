import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MobileControlsSheet from './MobileControlsSheet'
import { ALL_CATEGORIES } from '../globe/Globe'

function make(overrides: Partial<Parameters<typeof MobileControlsSheet>[0]> = {}) {
  return {
    utcClock: '12:34:56 UTC',
    timeScale: 1,
    onSetScale: vi.fn(),
    cloudsVisible: true,
    onToggleClouds: vi.fn(),
    starsVisible: true,
    onToggleStars: vi.fn(),
    bordersVisible: false,
    onToggleBorders: vi.fn().mockResolvedValue(undefined),
    activeCategories: new Set(ALL_CATEGORIES),
    onToggleCategory: vi.fn(),
    ...overrides,
  }
}

describe('MobileControlsSheet', () => {
  it('renders the hamburger button', () => {
    render(<MobileControlsSheet {...make()} />)
    expect(screen.getByTitle('Open controls')).toBeInTheDocument()
  })

  it('hamburger button has sm:hidden to hide on desktop', () => {
    render(<MobileControlsSheet {...make()} />)
    expect(screen.getByTitle('Open controls').className).toContain('sm:hidden')
  })

  it('shows clock text after opening the sheet', async () => {
    render(<MobileControlsSheet {...make()} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    expect(await screen.findByText('12:34:56 UTC')).toBeInTheDocument()
  })

  it('shows LIVE speed badge when timeScale is 1', async () => {
    render(<MobileControlsSheet {...make({ timeScale: 1 })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    const badge = await screen.findByTestId('mobile-speed-badge')
    expect(badge).toHaveTextContent('LIVE')
  })

  it('shows pause badge when timeScale is 0', async () => {
    render(<MobileControlsSheet {...make({ timeScale: 0 })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    const badge = await screen.findByTestId('mobile-speed-badge')
    expect(badge).toHaveTextContent('⏸')
  })

  it('clicking Pause calls onSetScale(0)', async () => {
    const onSetScale = vi.fn()
    render(<MobileControlsSheet {...make({ timeScale: 1, onSetScale })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    fireEvent.click(await screen.findByTitle('Pause'))
    expect(onSetScale).toHaveBeenCalledWith(0)
  })

  it('clicking LIVE calls onSetScale(1)', async () => {
    const onSetScale = vi.fn()
    render(<MobileControlsSheet {...make({ timeScale: 0, onSetScale })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    fireEvent.click(await screen.findByTitle('Snap to real time'))
    expect(onSetScale).toHaveBeenCalledWith(1)
  })

  it('clicking 10× forward calls onSetScale(10)', async () => {
    const onSetScale = vi.fn()
    render(<MobileControlsSheet {...make({ onSetScale })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    fireEvent.click(await screen.findByTitle('10× forward'))
    expect(onSetScale).toHaveBeenCalledWith(10)
  })

  it('clicking the already-active speed still calls onSetScale with that speed (no toggle-to-pause)', async () => {
    const onSetScale = vi.fn()
    render(<MobileControlsSheet {...make({ timeScale: 10, onSetScale })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    fireEvent.click(await screen.findByTitle('10× forward'))
    expect(onSetScale).toHaveBeenCalledWith(10)
  })

  it('clicking Clouds calls onToggleClouds', async () => {
    const onToggleClouds = vi.fn()
    render(<MobileControlsSheet {...make({ onToggleClouds })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    fireEvent.click(await screen.findByTitle('Toggle clouds'))
    expect(onToggleClouds).toHaveBeenCalled()
  })

  it('clicking Stars calls onToggleStars', async () => {
    const onToggleStars = vi.fn()
    render(<MobileControlsSheet {...make({ onToggleStars })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    fireEvent.click(await screen.findByTitle('Toggle stars'))
    expect(onToggleStars).toHaveBeenCalled()
  })

  it('Stars toggle reflects the off state', async () => {
    render(<MobileControlsSheet {...make({ starsVisible: false })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    const label = await screen.findByText('Stars')
    expect(label.className).toContain('text-label')
  })

  it('clicking Borders calls onToggleBorders', async () => {
    const onToggleBorders = vi.fn().mockResolvedValue(undefined)
    render(<MobileControlsSheet {...make({ onToggleBorders })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    fireEvent.click(await screen.findByTitle('Toggle borders'))
    expect(onToggleBorders).toHaveBeenCalled()
  })

  it('clicking a category pill calls onToggleCategory with that category', async () => {
    const onToggleCategory = vi.fn()
    render(<MobileControlsSheet {...make({ onToggleCategory })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    fireEvent.click(await screen.findByTitle('Toggle GPS'))
    expect(onToggleCategory).toHaveBeenCalledWith('GPS')
  })

  it('active categories show the accent style', async () => {
    render(<MobileControlsSheet {...make({ activeCategories: new Set(['GPS'] as const) })} />)
    fireEvent.click(screen.getByTitle('Open controls'))
    const gpsPill = await screen.findByTitle('Toggle GPS')
    expect(gpsPill.className).toContain('text-accent')
  })
})
