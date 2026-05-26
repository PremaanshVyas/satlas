import type { FC } from 'react'

interface TimeControlsProps {
  timeScale: number
  onSetScale: (scale: number) => void
  clock?: string
}

const SPEEDS = [2, 10, 50, 100] as const

function SpeedBadge({ timeScale }: { timeScale: number }) {
  if (timeScale === 1) {
    return (
      <span
        data-testid="speed-badge"
        className="font-mono text-[9px] text-accent bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.25)] rounded-[2px] px-1.5 py-px tracking-wide"
      >
        LIVE
      </span>
    )
  }
  if (timeScale === 0) {
    return (
      <span
        data-testid="speed-badge"
        className="font-mono text-[9px] text-secondary bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.15)] rounded-[2px] px-1.5 py-px"
      >
        ⏸
      </span>
    )
  }
  const abs = Math.abs(timeScale)
  const label = timeScale > 0 ? `${abs}×►` : `◄${abs}×`
  return (
    <span
      data-testid="speed-badge"
      className="font-mono text-[9px] text-amber-400 bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] rounded-[2px] px-1.5 py-px"
    >
      {label}
    </span>
  )
}

interface BtnProps {
  active: boolean
  title: string
  label: string
  onClick: () => void
}

function Btn({ active, title, label, onClick }: BtnProps) {
  const base = 'flex-1 font-mono text-[9px] py-1.5 rounded-[2px] border transition-colors touch-manipulation select-none min-w-0'
  const inactive = 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-label hover:text-secondary hover:border-[rgba(255,255,255,0.15)]'
  const liveStyle = 'bg-[rgba(0,212,255,0.08)] border-[rgba(0,212,255,0.3)] text-accent'
  const pauseStyle = 'bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.2)] text-secondary'
  const speedStyle = 'bg-[rgba(245,158,11,0.08)] border-[rgba(245,158,11,0.25)] text-amber-400'

  let activeCls = liveStyle
  if (label === '⏸' && active) activeCls = pauseStyle
  else if (label !== 'LIVE' && label !== '⏸' && active) activeCls = speedStyle

  return (
    <button
      title={title}
      onClick={onClick}
      className={`${base} ${active ? activeCls : inactive}`}
    >
      {label}
    </button>
  )
}

const TimeControls: FC<TimeControlsProps> = ({ timeScale, onSetScale, clock }) => {
  function handleSpeed(scale: number) {
    if (timeScale === scale) onSetScale(0)
    else onSetScale(scale)
  }

  return (
    <div className="bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-2 py-1.5 shadow-lg w-56 overflow-hidden">

      {/* Clock row — shown when embedded in the top-left card */}
      {clock ? (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[13px] text-secondary">{clock}</span>
            <SpeedBadge timeScale={timeScale} />
          </div>
          <div className="border-t border-[rgba(255,255,255,0.04)] mb-1.5" />
        </>
      ) : (
        <div className="flex justify-end mb-1">
          <SpeedBadge timeScale={timeScale} />
        </div>
      )}

      {/* Transport buttons */}
      <div className="flex gap-px overflow-hidden">
        {[...SPEEDS].reverse().map(s => (
          <Btn
            key={`rev-${s}`}
            active={timeScale === -s}
            title={`${s}× reverse`}
            label={`◄${s}`}
            onClick={() => handleSpeed(-s)}
          />
        ))}
        <Btn
          active={timeScale === 0}
          title="Pause"
          label="⏸"
          onClick={() => onSetScale(0)}
        />
        <Btn
          active={timeScale === 1}
          title="Snap to real time"
          label="LIVE"
          onClick={() => onSetScale(1)}
        />
        {SPEEDS.map(s => (
          <Btn
            key={`fwd-${s}`}
            active={timeScale === s}
            title={`${s}× forward`}
            label={`${s}►`}
            onClick={() => handleSpeed(s)}
          />
        ))}
      </div>
    </div>
  )
}

export default TimeControls
