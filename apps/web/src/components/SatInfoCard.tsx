import { objectTypeLabel, opsStatusLabel } from '../lib/satcat'
import type { OrbitalParams, LivePosition, SatcatEntry } from './GlobeView'

interface SelectedSat { name: string; noradId: string }

interface SatInfoCardProps {
  sat: SelectedSat
  meta: SatcatEntry | null
  position: LivePosition | null
  orbital: OrbitalParams | null
  onDismiss?: () => void
  onAskAI: () => void
  onPredictPasses: () => void
}

function fmt(n: number, decimals = 2) { return n.toFixed(decimals) }
function latLabel(lat: number) { return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}` }
function lonLabel(lon: number) { return `${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}` }

function statusColor(opsStatus: string | undefined) {
  if (!opsStatus) return 'text-[#1e1e1e]'
  if (opsStatus === '+' || opsStatus === 'tracked') return 'text-accent'
  if (opsStatus === 'D' || opsStatus === 'decayed') return 'text-danger'
  return 'text-warn'
}

function badgeClass(objectType: string) {
  if (objectType === 'PAY') return 'border-[rgba(0,212,255,0.15)] text-[rgba(0,212,255,0.5)]'
  if (objectType === 'DEB') return 'border-[rgba(255,68,68,0.2)] text-[rgba(255,68,68,0.5)]'
  if (objectType === 'R/B') return 'border-[rgba(255,170,0,0.2)] text-[rgba(255,170,0,0.5)]'
  return 'border-[rgba(255,255,255,0.06)] text-[#2a2a2a]'
}

export default function SatInfoCard({ sat, meta, position, orbital, onDismiss, onAskAI, onPredictPasses }: SatInfoCardProps) {
  const isActive = meta?.opsStatus === '+' || meta?.opsStatus === 'tracked'

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2.5 border-b border-[rgba(255,255,255,0.04)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="relative flex h-[6px] w-[6px] flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-[6px] w-[6px] bg-accent" />
              </span>
            )}
            <div className="font-mono text-[11px] font-bold text-white uppercase tracking-[0.04em] truncate leading-tight">{sat.name}</div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-[8px] text-label">NORAD ID · {sat.noradId}</span>
            {meta && (
              <span className={`font-mono text-[7px] px-1.5 py-0.5 rounded-[2px] border ${badgeClass(meta.objectType)}`}>
                {objectTypeLabel(meta.objectType)}
              </span>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center font-mono text-[#1e1e1e] hover:text-secondary text-lg leading-none transition-colors touch-manipulation"
            aria-label="Dismiss"
          >×</button>
        )}
      </div>

      {/* Catalog */}
      <div className="px-3 py-2.5 border-b border-[rgba(255,255,255,0.04)]">
        <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#1a1a1a] mb-2">Catalog</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <div className="font-mono text-[8px] text-label mb-0.5">Owner</div>
            <div className="font-mono text-[10px] font-light text-secondary truncate">{meta?.owner || '—'}</div>
          </div>
          <div>
            <div className="font-mono text-[8px] text-label mb-0.5">Launched</div>
            <div className="font-mono text-[10px] font-light text-secondary">{meta?.launchDate || '—'}</div>
          </div>
          <div>
            <div className="font-mono text-[8px] text-label mb-0.5">Status</div>
            <div className={`font-mono text-[10px] font-light ${statusColor(meta?.opsStatus)}`}>
              {meta?.opsStatus ? opsStatusLabel(meta.opsStatus) : '—'}
            </div>
          </div>
          <div>
            <div className="font-mono text-[8px] text-label mb-0.5">Designator</div>
            <div className="font-mono text-[10px] font-light text-secondary">{meta?.intlDes || '—'}</div>
          </div>
        </div>
        {meta?.launchSite && (
          <div className="mt-2">
            <div className="font-mono text-[8px] text-label mb-0.5">Launch Site</div>
            <div className="font-mono text-[10px] font-light text-secondary leading-snug">{meta.launchSite}</div>
          </div>
        )}
      </div>

      {/* Live Position */}
      <div className="px-3 py-2.5 border-b border-[rgba(255,255,255,0.04)]">
        <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#1a1a1a] mb-2">Live Position</div>
        {position ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div>
              <div className="font-mono text-[8px] text-label mb-0.5">Latitude</div>
              <div className="font-mono text-[10px] text-accent">{latLabel(position.lat)}</div>
            </div>
            <div>
              <div className="font-mono text-[8px] text-label mb-0.5">Longitude</div>
              <div className="font-mono text-[10px] text-accent">{lonLabel(position.lon)}</div>
            </div>
            <div>
              <div className="font-mono text-[8px] text-label mb-0.5">Altitude</div>
              <div className="font-mono text-[10px] font-light text-secondary">{position.altKm.toLocaleString()} km</div>
            </div>
            <div>
              <div className="font-mono text-[8px] text-label mb-0.5">Velocity</div>
              <div className="font-mono text-[10px] font-light text-secondary">{fmt(position.velocity)} km/s</div>
            </div>
          </div>
        ) : (
          <div className="font-mono text-[9px] text-label">Propagating…</div>
        )}
      </div>

      {/* Orbital Parameters */}
      {orbital && (
        <div className="px-3 py-2.5 border-b border-[rgba(255,255,255,0.04)]">
          <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#1a1a1a] mb-2">Orbital Parameters</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div>
              <div className="font-mono text-[8px] text-label mb-0.5">Inclination</div>
              <div className="font-mono text-[10px] font-light text-secondary">{orbital.inclination}°</div>
            </div>
            <div>
              <div className="font-mono text-[8px] text-label mb-0.5">Period</div>
              <div className="font-mono text-[10px] font-light text-secondary">{fmt(orbital.period, 1)} min</div>
            </div>
            <div>
              <div className="font-mono text-[8px] text-label mb-0.5">Apogee</div>
              <div className="font-mono text-[10px] font-light text-secondary">{orbital.apogee.toLocaleString()} km</div>
            </div>
            <div>
              <div className="font-mono text-[8px] text-label mb-0.5">Perigee</div>
              <div className="font-mono text-[10px] font-light text-secondary">{orbital.perigee.toLocaleString()} km</div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2.5 space-y-1.5">
        <button
          onClick={onPredictPasses}
          className="w-full font-mono text-[8px] uppercase tracking-[0.08em] border border-[rgba(255,255,255,0.07)] text-[#2a2a2a] rounded-[2px] py-2 sm:py-1.5 hover:text-secondary hover:border-[rgba(255,255,255,0.14)] transition-colors touch-manipulation"
        >
          Predict Passes
        </button>
        <button
          onClick={onAskAI}
          className="w-full font-mono text-[8px] uppercase tracking-[0.08em] border border-[rgba(0,212,255,0.2)] text-accent rounded-[2px] py-2 sm:py-1.5 hover:border-[rgba(0,212,255,0.4)] transition-colors touch-manipulation"
        >
          Ask AI
        </button>
      </div>
    </>
  )
}
