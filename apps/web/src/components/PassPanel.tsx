import { useCallback, useEffect, useState } from 'react'

interface Sat { name: string; noradId: string }

interface Pass {
  start_utc: string
  end_utc: string
  max_elevation_deg: number
  direction: string
}

interface PassPanelProps {
  sat: Sat
  onClose: () => void
}

type LocationState = 'requesting' | 'granted' | 'denied' | 'manual'

function durationMin(start: string, end: string): string {
  const secs = (new Date(end).getTime() - new Date(start).getTime()) / 1000
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function formatTime(utc: string): string {
  return new Date(utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function tzAbbr(): string {
  // Extract timezone abbreviation (e.g. "AEST") from the locale string
  const parts = new Intl.DateTimeFormat([], { timeZoneName: 'short' }).formatToParts(new Date())
  return parts.find(p => p.type === 'timeZoneName')?.value ?? ''
}

async function reverseGeocode(lat: string, lon: string): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
    { headers: { 'Accept-Language': 'en' } },
  )
  const data = await res.json()
  return data.address?.city ?? data.address?.town ?? data.address?.suburb
    ?? data.display_name?.split(',')[0] ?? ''
}

async function forwardGeocode(query: string): Promise<{ lat: string; lon: string; name: string } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
    { headers: { 'Accept-Language': 'en' } },
  )
  const [result] = await res.json()
  if (!result) return null
  return {
    lat: result.lat,
    lon: result.lon,
    name: result.display_name.split(',')[0],
  }
}

export default function PassPanel({ sat, onClose }: PassPanelProps) {
  const [locState, setLocState] = useState<LocationState>(() =>
    navigator.geolocation ? 'requesting' : 'manual'
  )
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [locationName, setLocationName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [passes, setPasses] = useState<Pass[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tz] = useState(tzAbbr)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latStr = String(pos.coords.latitude)
        const lonStr = String(pos.coords.longitude)
        setLat(latStr)
        setLon(lonStr)
        setLocState('granted')
        try {
          const name = await reverseGeocode(latStr, lonStr)
          setLocationName(name)
        } catch { /* non-critical */ }
      },
      () => setLocState('denied'),
    )
  }, [])

  const fetchPasses = useCallback(async (latVal: string, lonVal: string) => {
    setLoading(true)
    setError(null)
    setPasses(null)
    try {
      const params = new URLSearchParams({
        latitude: latVal,
        longitude: lonVal,
        hours_ahead: '24',
        norad_id: sat.noradId,
      })
      const res = await fetch(`/api/pass?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      setPasses(data.passes ?? [])
    } catch {
      setError('Failed to load passes. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [sat.noradId])

  useEffect(() => {
    if (locState === 'granted' && lat && lon) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- triggered by geolocation grant, not a state cascade
      void fetchPasses(lat, lon)
    }
  }, [locState, lat, lon, fetchPasses])

  async function handleLocationSearch() {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setError(null)
    try {
      const result = await forwardGeocode(searchQuery)
      if (!result) { setError('Location not found.'); return }
      setLat(result.lat)
      setLon(result.lon)
      setLocationName(result.name)
      setLocState('granted')
      await fetchPasses(result.lat, result.lon)
    } catch {
      setError('Location search failed. Try entering coordinates manually.')
    } finally {
      setSearchLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2 border-b border-gray-800 flex-shrink-0">
        <div className="min-w-0">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Pass Prediction · Next 24 h</div>
          <div className="text-sm font-semibold text-white truncate leading-tight">{sat.name}</div>
          <div className="text-[10px] text-gray-600 font-mono mt-0.5">NORAD {sat.noradId}</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close pass panel"
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-300 text-xl leading-none transition-colors touch-manipulation"
        >×</button>
      </div>

      {/* Location */}
      <div className="px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Observer Location</div>

        {locState === 'requesting' && (
          <div className="text-xs text-gray-500">Getting your location…</div>
        )}

        {locState === 'granted' && (
          <div className="flex items-baseline justify-between gap-2">
            <div>
              {locationName && (
                <div className="text-xs font-medium text-gray-300">{locationName}</div>
              )}
              <div className="text-[11px] text-gray-500 font-mono">
                {parseFloat(lat).toFixed(2)}° {parseFloat(lat) >= 0 ? 'N' : 'S'},{' '}
                {parseFloat(lon).toFixed(2)}° {parseFloat(lon) >= 0 ? 'E' : 'W'}
              </div>
            </div>
            <button
              onClick={() => { setLocState('manual'); setSearchQuery('') }}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0 touch-manipulation"
            >
              Change
            </button>
          </div>
        )}

        {(locState === 'denied' || locState === 'manual') && (
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Search location…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleLocationSearch() }}
              className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => void handleLocationSearch()}
              disabled={searchLoading || loading}
              aria-label="Go"
              className="px-2.5 text-xs font-medium bg-blue-600/80 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors touch-manipulation"
            >
              {searchLoading ? '…' : 'Go'}
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="px-3 py-4 text-xs text-gray-500 text-center">Computing passes…</div>
        )}
        {error && (
          <div className="px-3 py-3 text-xs text-red-400">{error}</div>
        )}
        {passes !== null && !loading && (
          passes.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-500 text-center">
              No passes above 10° in the next 24 hours.
            </div>
          ) : (
            <div className="divide-y divide-gray-800/60">
              {passes.map((p, i) => (
                <div key={i} className="px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium text-gray-200">{formatTime(p.start_utc)}</span>
                      {tz && <span className="text-[10px] text-gray-600">{tz}</span>}
                    </div>
                    <span className="text-xs text-gray-500">{durationMin(p.start_utc, p.end_utc)}</span>
                  </div>
                  <div className="flex gap-3">
                    <div>
                      <div className="text-[10px] text-gray-600 uppercase tracking-wider">Max El</div>
                      <div className="text-xs font-mono text-gray-200">{p.max_elevation_deg}°</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-600 uppercase tracking-wider">Direction</div>
                      <div className="text-xs font-mono text-gray-200">{p.direction}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
