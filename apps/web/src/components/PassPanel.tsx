import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'

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

interface LocationResult {
  lat: string
  lon: string
  name: string
  displayName: string
}

type LocationState = 'requesting' | 'granted' | 'denied' | 'manual'

const DIR_ANGLES: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
}

function CompassRose({ direction }: { direction: string }) {
  const angle = DIR_ANGLES[direction.toUpperCase()] ?? 0
  return (
    <svg width="34" height="34" viewBox="-17 -17 34 34" aria-label={`Direction: ${direction}`}>
      <circle r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <line x1="0" y1="-14" x2="0" y2="-10" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <line x1="14" y1="0"  x2="10" y2="0"  stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <line x1="0" y1="14"  x2="0" y2="10"  stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <line x1="-14" y1="0" x2="-10" y2="0" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <text x="0" y="-15" textAnchor="middle" fontSize="4.5" fill="#2a2a2a" fontFamily="'JetBrains Mono',monospace">N</text>
      <g transform={`rotate(${angle})`}>
        <polygon points="0,-9 -2.5,1 0,-4 2.5,1" fill="#00d4ff" />
      </g>
    </svg>
  )
}

function durationMin(start: string, end: string): string {
  const secs = (new Date(end).getTime() - new Date(start).getTime()) / 1000
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function formatDateTime(utc: string): { date: string; time: string } {
  const d = new Date(utc)
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return { date, time }
}

function tzAbbr(): string {
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

async function searchLocations(query: string, limit = 5): Promise<LocationResult[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}`,
    { headers: { 'Accept-Language': 'en' } },
  )
  const results: Array<{ lat: string; lon: string; display_name: string }> = await res.json()
  return results.map(r => {
    const parts = r.display_name.split(', ')
    return { lat: r.lat, lon: r.lon, name: parts[0], displayName: r.display_name }
  })
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
  const [suggestions, setSuggestions] = useState<LocationResult[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [passes, setPasses] = useState<Pass[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tz] = useState(tzAbbr)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchPasses(lat, lon)
    }
  }, [locState, lat, lon, fetchPasses])

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setSearchQuery(val)
    setSuggestions([])
    setActiveIndex(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setSuggestionsLoading(false); return }
    setSuggestionsLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchLocations(val)
        setSuggestions(results)
      } catch { /* non-critical */ }
      finally { setSuggestionsLoading(false) }
    }, 300)
  }

  async function handleSuggestionSelect(result: LocationResult) {
    setSuggestions([])
    setSuggestionsLoading(false)
    setActiveIndex(-1)
    setSearchQuery('')
    setLat(result.lat)
    setLon(result.lon)
    const parts = result.displayName.split(', ')
    const country = parts[parts.length - 1]
    setLocationName(country && country !== parts[0] ? `${parts[0]}, ${country}` : parts[0])
    setLocState('granted')
    await fetchPasses(result.lat, result.lon)
  }

  async function handleLocationSearch() {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setSuggestions([])
    setActiveIndex(-1)
    setError(null)
    try {
      const results = await searchLocations(searchQuery, 1)
      if (!results.length) { setError('Location not found.'); return }
      await handleSuggestionSelect(results[0])
    } catch {
      setError('Location search failed. Try entering coordinates manually.')
    } finally {
      setSearchLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => suggestions.length ? (i + 1) % suggestions.length : -1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => suggestions.length ? (i - 1 + suggestions.length) % suggestions.length : -1)
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        void handleSuggestionSelect(suggestions[activeIndex])
      } else {
        void handleLocationSearch()
      }
    } else if (e.key === 'Escape') {
      setSuggestions([])
      setActiveIndex(-1)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2.5 border-b border-[rgba(255,255,255,0.04)] flex-shrink-0">
        <div className="min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#555555] mb-1">Pass Prediction · Next 24 h</div>
          <div className="font-mono text-[13px] font-bold text-white uppercase tracking-[0.04em] truncate leading-tight">{sat.name}</div>
          <div className="font-mono text-[10px] text-label mt-0.5">NORAD ID · {sat.noradId}</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close pass panel"
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center font-mono text-label hover:text-secondary text-lg leading-none transition-colors touch-manipulation"
        >×</button>
      </div>

      {/* Location */}
      <div className="px-3 py-2.5 border-b border-[rgba(255,255,255,0.04)] flex-shrink-0">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#555555] mb-2">Observer Location</div>

        {locState === 'requesting' && (
          <div className="font-mono text-[11px] text-label">Getting your location…</div>
        )}

        {locState === 'granted' && (
          <div className="flex items-baseline justify-between gap-2">
            <div>
              {locationName && (
                <div className="font-mono text-[10px] text-secondary">{locationName}</div>
              )}
              <div className="font-mono text-[11px] text-label mt-0.5">
                {parseFloat(lat).toFixed(2)}° {parseFloat(lat) >= 0 ? 'N' : 'S'},{' '}
                {parseFloat(lon).toFixed(2)}° {parseFloat(lon) >= 0 ? 'E' : 'W'}
              </div>
            </div>
            <button
              onClick={() => { setLocState('manual'); setSearchQuery(''); setSuggestions([]); setActiveIndex(-1) }}
              className="font-mono text-[10px] uppercase tracking-[0.08em] text-label hover:text-secondary transition-colors flex-shrink-0 touch-manipulation"
            >
              Change
            </button>
          </div>
        )}

        {(locState === 'denied' || locState === 'manual') && (
          <div className="relative">
            <div className="flex gap-1.5">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  placeholder="Search location…"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={handleKeyDown}
                  onBlur={() => setTimeout(() => { setSuggestions([]); setActiveIndex(-1) }, 150)}
                  className="w-full bg-[rgba(9,9,9,0.72)] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-2 py-1.5 font-mono text-[11px] text-secondary placeholder:text-label focus:outline-none focus:border-[rgba(0,212,255,0.3)] transition-colors pr-6"
                />
                {suggestionsLoading && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <div className="w-3 h-3 border border-[rgba(255,255,255,0.1)] border-t-[rgba(0,212,255,0.5)] rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <button
                onClick={() => void handleLocationSearch()}
                disabled={searchLoading || loading}
                aria-label="Go"
                className="px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] border border-[rgba(0,212,255,0.2)] text-accent rounded-[2px] hover:border-[rgba(0,212,255,0.4)] disabled:opacity-40 transition-colors touch-manipulation flex-shrink-0"
              >
                {searchLoading ? '…' : 'Go'}
              </button>
            </div>

            <AnimatePresence>
              {suggestions.length > 0 && (
                <motion.ul
                  role="listbox"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="absolute top-full left-0 right-0 mt-1 bg-[rgba(9,9,9,0.95)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] overflow-hidden z-10 shadow-2xl"
                >
                  {suggestions.map((s, i) => {
                    const context = s.displayName.split(', ').slice(1, 4).join(', ')
                    const isActive = i === activeIndex
                    return (
                      <li
                        key={i}
                        role="option"
                        aria-selected={isActive}
                        onMouseDown={e => { e.preventDefault(); void handleSuggestionSelect(s) }}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseLeave={() => setActiveIndex(-1)}
                        className={`flex items-start gap-2 px-2.5 py-2 cursor-pointer border-b border-[rgba(255,255,255,0.04)] last:border-0 transition-colors duration-75 ${isActive ? 'bg-[rgba(255,255,255,0.04)]' : ''}`}
                      >
                        <svg className="w-3 h-3 mt-0.5 flex-shrink-0 text-label" fill="currentColor" viewBox="0 0 16 16">
                          <path d="M8 1a5 5 0 0 1 5 5c0 3.5-5 9-5 9S3 9.5 3 6a5 5 0 0 1 5-5zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
                        </svg>
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] text-secondary truncate">{s.name}</div>
                          {context && <div className="font-mono text-[10px] text-label truncate mt-0.5">{context}</div>}
                        </div>
                      </li>
                    )
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="overflow-y-auto max-h-[50dvh] min-h-[60px] pb-2">
        {loading && (
          <div className="px-3 py-4 font-mono text-[11px] text-label text-center">Computing passes…</div>
        )}
        {error && (
          <div className="px-3 py-3 font-mono text-[9px] text-danger">{error}</div>
        )}
        {passes !== null && !loading && (
          passes.length === 0 ? (
            <div className="px-3 py-4 font-mono text-[11px] text-label text-center">
              No passes above 10° in the next 24 hours.
            </div>
          ) : (
            <div className="divide-y divide-[rgba(255,255,255,0.04)]">
              {passes.map((p, i) => (
                <div key={i} className="px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#555555]">{formatDateTime(p.start_utc).date}</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[12px] font-medium text-secondary">{formatDateTime(p.start_utc).time}</span>
                        {tz && <span className="font-mono text-[10px] text-label">{tz}</span>}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-label">{durationMin(p.start_utc, p.end_utc)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="font-mono text-[7px] uppercase tracking-[0.14em] text-[#3a3a3a] mb-0.5">Max Elevation</div>
                      <div className="font-mono text-[12px] font-light text-secondary">{p.max_elevation_deg}°</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <CompassRose direction={p.direction} />
                      <div className="font-mono text-[10px] text-label mt-0.5">{p.direction}</div>
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
