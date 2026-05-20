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

export default function SatInfoCard({ sat, meta, position, orbital, onDismiss, onAskAI, onPredictPasses }: SatInfoCardProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2 border-b border-gray-800">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate leading-tight">{sat.name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500">NORAD {sat.noradId}</span>
            {meta && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                meta.objectType === 'PAY' ? 'bg-blue-900/60 text-blue-300' :
                meta.objectType === 'DEB' ? 'bg-red-900/60 text-red-300' :
                meta.objectType === 'R/B' ? 'bg-orange-900/60 text-orange-300' :
                'bg-gray-800 text-gray-400'
              }`}>
                {objectTypeLabel(meta.objectType)}
              </span>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-300 text-xl leading-none transition-colors touch-manipulation"
            aria-label="Dismiss"
          >×</button>
        )}
      </div>

      {/* Metadata — always visible; dashes until satcat resolves */}
      <div className="px-3 py-2 border-b border-gray-800 space-y-1.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Owner</span>
            <span className="text-gray-300 truncate">{meta?.owner || '—'}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Launched</span>
            <span className="text-gray-300">{meta?.launchDate || '—'}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Status</span>
            <span className={meta?.opsStatus === '+' ? 'text-green-400' : meta?.opsStatus ? 'text-gray-400' : 'text-gray-600'}>
              {meta?.opsStatus ? opsStatusLabel(meta.opsStatus) : '—'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Designator</span>
            <span className="text-gray-300 font-mono text-[10px]">{meta?.intlDes || '—'}</span>
          </div>
        </div>
        {meta?.launchSite && (
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Launch Site</span>
            <span className="text-gray-300 text-xs leading-snug">{meta.launchSite}</span>
          </div>
        )}
      </div>

      {/* Live position */}
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Live Position</div>
        {position ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div>
              <div className="text-[10px] text-gray-600">Latitude</div>
              <div className="text-xs font-mono text-gray-200">{latLabel(position.lat)}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-600">Longitude</div>
              <div className="text-xs font-mono text-gray-200">{lonLabel(position.lon)}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-600">Altitude</div>
              <div className="text-xs font-mono text-gray-200">{position.altKm.toLocaleString()} km</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-600">Velocity</div>
              <div className="text-xs font-mono text-gray-200">{fmt(position.velocity)} km/s</div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-600">Propagating…</div>
        )}
      </div>

      {/* Orbital parameters */}
      {orbital && (
        <div className="px-3 py-2 border-b border-gray-800">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Orbital Parameters</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div>
              <div className="text-[10px] text-gray-600">Inclination</div>
              <div className="text-xs font-mono text-gray-200">{orbital.inclination}°</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-600">Period</div>
              <div className="text-xs font-mono text-gray-200">{fmt(orbital.period, 1)} min</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-600">Apogee</div>
              <div className="text-xs font-mono text-gray-200">{orbital.apogee.toLocaleString()} km</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-600">Perigee</div>
              <div className="text-xs font-mono text-gray-200">{orbital.perigee.toLocaleString()} km</div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2 space-y-1.5">
        <button
          onClick={onPredictPasses}
          className="w-full text-xs font-medium bg-gray-700/80 hover:bg-gray-600 active:bg-gray-700 text-gray-200 rounded-md py-2 sm:py-1.5 transition-colors touch-manipulation"
        >
          Predict passes
        </button>
        <button
          onClick={onAskAI}
          className="w-full text-xs font-medium bg-blue-600/80 hover:bg-blue-500 active:bg-blue-700 text-white rounded-md py-2 sm:py-1.5 transition-colors touch-manipulation"
        >
          Ask AI about this satellite
        </button>
      </div>
    </>
  )
}
