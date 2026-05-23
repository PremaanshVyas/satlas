import type { OverheadSat } from '../globe/Globe'

interface CountryPanelProps {
  country: { name: string; continent: string }
  overheadSats: OverheadSat[]
  onDismiss: () => void
  onAskAI: () => void
  onSelectSatellite: (noradId: string) => void
}

export default function CountryPanel({
  country,
  overheadSats,
  onDismiss,
  onAskAI,
  onSelectSatellite,
}: CountryPanelProps) {
  const primary = overheadSats.filter(s => s.elevDeg > 15)
  const secondary = overheadSats.filter(s => s.elevDeg <= 15)

  return (
    <div className="px-4 py-3 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-[#555555] uppercase tracking-[0.1em]">Country</span>
        <button
          onClick={onDismiss}
          aria-label="Dismiss country panel"
          className="text-label hover:text-secondary text-[13px] leading-none transition-colors"
        >×</button>
      </div>

      <div className="text-[13px] font-bold text-white uppercase tracking-[0.04em] mb-0.5">
        {country.name}
      </div>
      <div className="text-[10px] text-label mb-3">
        {country.continent} · {overheadSats.length} overhead
      </div>

      {overheadSats.length === 0 ? (
        <div className="text-[10px] text-label">Loading catalog…</div>
      ) : (
        <>
          <div className="text-[9px] text-[#555555] uppercase tracking-[0.1em] mb-2">Overhead Now</div>
          <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
            {primary.map(sat => (
              <button
                key={sat.noradId}
                onClick={() => onSelectSatellite(sat.noradId)}
                className="flex items-center justify-between px-1.5 py-1 rounded-[2px] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] transition-colors text-left w-full"
              >
                <span className="text-[10px] text-accent truncate">{sat.name}</span>
                <span className="text-[10px] text-accent flex-shrink-0 ml-2">↑ {sat.elevDeg}°</span>
              </button>
            ))}
            {secondary.map(sat => (
              <button
                key={sat.noradId}
                onClick={() => onSelectSatellite(sat.noradId)}
                className="flex items-center justify-between px-1.5 py-1 rounded-[2px] hover:bg-[rgba(255,255,255,0.03)] transition-colors text-left w-full"
              >
                <span className="text-[10px] text-secondary truncate">{sat.name}</span>
                <span className="text-[10px] text-label flex-shrink-0 ml-2">↑ {sat.elevDeg}°</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="border-t border-[rgba(255,255,255,0.05)] mt-3 pt-3">
        <button
          onClick={onAskAI}
          className="w-full py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-label bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-[2px] hover:text-secondary hover:border-[rgba(255,255,255,0.12)] transition-colors"
        >
          Ask AI about this country
        </button>
      </div>
    </div>
  )
}
