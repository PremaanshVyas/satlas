import { useState } from 'react'
import { Drawer } from 'vaul'
import type { SatCategory } from '../globe/Globe'
import { ALL_CATEGORIES } from '../globe/Globe'

interface MobileControlsSheetProps {
  utcClock: string
  timeScale: number
  onSetScale: (scale: number) => void
  cloudsVisible: boolean
  onToggleClouds: () => void
  bordersVisible: boolean
  onToggleBorders: () => Promise<void>
  activeCategories: Set<SatCategory>
  onToggleCategory: (cat: SatCategory) => void
}

const SPEEDS = [2, 10, 50, 100] as const

const CATEGORY_LABELS: Record<SatCategory, string> = {
  STARLINK: 'Starlink',
  GPS: 'GPS',
  IRIDIUM: 'Iridium',
  DEBRIS: 'Debris',
  OTHER: 'Other',
}

function SpeedBadge({ timeScale }: { timeScale: number }) {
  if (timeScale === 1) {
    return (
      <span data-testid="mobile-speed-badge" className="font-mono text-[9px] text-accent bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.25)] rounded-[2px] px-1.5 py-px tracking-wide">
        LIVE
      </span>
    )
  }
  if (timeScale === 0) {
    return (
      <span data-testid="mobile-speed-badge" className="font-mono text-[9px] text-secondary bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.15)] rounded-[2px] px-1.5 py-px">
        ⏸
      </span>
    )
  }
  const abs = Math.abs(timeScale)
  const label = timeScale > 0 ? `${abs}×►` : `◄${abs}×`
  return (
    <span data-testid="mobile-speed-badge" className="font-mono text-[9px] text-amber-400 bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] rounded-[2px] px-1.5 py-px">
      {label}
    </span>
  )
}

export default function MobileControlsSheet({
  utcClock,
  timeScale,
  onSetScale,
  cloudsVisible,
  onToggleClouds,
  bordersVisible,
  onToggleBorders,
  activeCategories,
  onToggleCategory,
}: MobileControlsSheetProps) {
  const [open, setOpen] = useState(false)

  function handleSpeed(scale: number) {
    if (timeScale === scale) onSetScale(0)
    else onSetScale(scale)
  }

  const btnBase = 'flex-none font-mono text-[9px] py-2.5 px-2 min-w-[36px] text-center rounded-[2px] border transition-all duration-75 touch-manipulation select-none active:scale-95'
  const btnInactive = 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-label'
  const btnLive = 'bg-[rgba(0,212,255,0.08)] border-[rgba(0,212,255,0.3)] text-accent'
  const btnPause = 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.2)] text-secondary'
  const btnSpeed = 'bg-[rgba(245,158,11,0.08)] border-[rgba(245,158,11,0.25)] text-amber-400'

  return (
    <>
      {/* Hamburger — visible on mobile only */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open controls"
        title="Open controls"
        className="sm:hidden flex flex-col items-center justify-center gap-[3.5px] w-8 h-8 bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] shadow-lg touch-manipulation"
      >
        <span className="block w-[13px] h-px bg-secondary" />
        <span className="block w-[13px] h-px bg-secondary" />
        <span className="block w-[13px] h-px bg-secondary" />
      </button>

      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" />
          <Drawer.Content
            className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-[rgba(9,9,9,0.98)] border-t border-[rgba(255,255,255,0.07)] shadow-2xl outline-none"
            style={{ maxHeight: '85dvh' }}
          >
            <div className="overflow-y-auto" style={{ maxHeight: '85dvh' }}>
              {/* Handle */}
              <div className="mx-auto w-10 h-1 rounded-full bg-[rgba(255,255,255,0.08)] mt-3" />

              <div
                className="px-4 pt-3 pb-6 space-y-5"
                style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}
              >
                {/* Clock + speed badge */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[15px] text-secondary">{utcClock}</span>
                  <SpeedBadge timeScale={timeScale} />
                </div>

                {/* Time transport */}
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#555555] mb-2">Time Speed</div>
                  <div className="flex flex-wrap gap-1">
                    {[...SPEEDS].reverse().map(s => (
                      <button
                        key={`rev-${s}`}
                        title={`${s}× reverse`}
                        onClick={() => handleSpeed(-s)}
                        className={`${btnBase} ${timeScale === -s ? btnSpeed : btnInactive}`}
                      >
                        ◄{s}
                      </button>
                    ))}
                    <button
                      title="Pause"
                      onClick={() => onSetScale(0)}
                      className={`${btnBase} ${timeScale === 0 ? btnPause : btnInactive}`}
                    >
                      ⏸
                    </button>
                    <button
                      title="Snap to real time"
                      onClick={() => onSetScale(1)}
                      className={`${btnBase} ${timeScale === 1 ? btnLive : btnInactive}`}
                    >
                      LIVE
                    </button>
                    {SPEEDS.map(s => (
                      <button
                        key={`fwd-${s}`}
                        title={`${s}× forward`}
                        onClick={() => handleSpeed(s)}
                        className={`${btnBase} ${timeScale === s ? btnSpeed : btnInactive}`}
                      >
                        {s}►
                      </button>
                    ))}
                  </div>
                </div>

                {/* Layer toggles */}
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#555555] mb-2">Layers</div>
                  <div className="space-y-2">
                    <button
                      title="Toggle clouds"
                      onClick={onToggleClouds}
                      className="w-full flex items-center justify-between px-3 py-3 rounded-[2px] border border-[rgba(255,255,255,0.07)] touch-manipulation active:scale-[0.98] transition-transform duration-75"
                    >
                      <span className={`font-mono text-[11px] ${cloudsVisible ? 'text-secondary' : 'text-label'}`}>Clouds</span>
                      <div className={`relative w-7 h-4 rounded-full border transition-colors ${cloudsVisible ? 'bg-[rgba(0,212,255,0.12)] border-[rgba(0,212,255,0.35)]' : 'border-[rgba(255,255,255,0.1)]'}`}>
                        <div className={`absolute top-[2px] w-3 h-3 rounded-full transition-all duration-200 ${cloudsVisible ? 'left-[12px] bg-accent' : 'left-[2px] bg-[rgba(255,255,255,0.25)]'}`} />
                      </div>
                    </button>

                    <button
                      title="Toggle borders"
                      onClick={() => void onToggleBorders()}
                      className="w-full flex items-center justify-between px-3 py-3 rounded-[2px] border border-[rgba(255,255,255,0.07)] touch-manipulation active:scale-[0.98] transition-transform duration-75"
                    >
                      <span className={`font-mono text-[11px] ${bordersVisible ? 'text-secondary' : 'text-label'}`}>Borders</span>
                      <div className={`relative w-7 h-4 rounded-full border transition-colors ${bordersVisible ? 'bg-[rgba(0,212,255,0.12)] border-[rgba(0,212,255,0.35)]' : 'border-[rgba(255,255,255,0.1)]'}`}>
                        <div className={`absolute top-[2px] w-3 h-3 rounded-full transition-all duration-200 ${bordersVisible ? 'left-[12px] bg-accent' : 'left-[2px] bg-[rgba(255,255,255,0.25)]'}`} />
                      </div>
                    </button>
                  </div>
                </div>

                {/* Category filter */}
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#555555] mb-2">Filter</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        title={`Toggle ${CATEGORY_LABELS[cat]}`}
                        onClick={() => onToggleCategory(cat)}
                        className={`px-3 py-2.5 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.1em] border transition-all duration-75 active:scale-[0.96] touch-manipulation select-none ${
                          activeCategories.has(cat)
                            ? 'border-[rgba(0,212,255,0.4)] text-accent bg-[rgba(0,212,255,0.06)]'
                            : 'border-[rgba(255,255,255,0.07)] text-label'
                        }`}
                      >
                        {CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}
