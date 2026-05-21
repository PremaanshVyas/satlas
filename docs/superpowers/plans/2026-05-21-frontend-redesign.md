# Frontend Redesign — Nothing/Terminal Aesthetic

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire Satlas frontend to a Nothing/Terminal aesthetic — JetBrains Mono, electric cyan accent `#00d4ff`, glass panels, 3px corners, full-word labels throughout.

**Architecture:** Pure visual layer changes — no logic, no routing, no backend. Nine files changed. Design tokens defined in Tailwind v4 `@theme` so named utilities (`text-accent`, `text-secondary`, `text-label`, `font-mono`) work across all components. All existing tests continue to pass; no new test files needed.

**Tech Stack:** React 18, Tailwind v4, Framer Motion, TypeScript. Font: JetBrains Mono via Google Fonts.

---

## Shared class reference (read before any task)

These are used throughout every component. Memorise them; they don't repeat in each task.

```
Panel shell:    bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px]
Section divider: border-b border-[rgba(255,255,255,0.04)]
Section title:  font-mono text-[7px] uppercase tracking-[0.18em] text-[#1a1a1a] mb-2
Field label:    font-mono text-[8px] text-label mb-0.5
Static value:   font-mono text-[10px] font-light text-secondary
Live value:     font-mono text-[10px] text-accent
Primary button: font-mono text-[8px] uppercase tracking-[0.08em] border border-[rgba(0,212,255,0.2)] text-accent rounded-[2px] py-2 hover:border-[rgba(0,212,255,0.4)] transition-colors touch-manipulation
Secondary btn:  font-mono text-[8px] uppercase tracking-[0.08em] border border-[rgba(255,255,255,0.07)] text-[#2a2a2a] rounded-[2px] py-2 hover:text-secondary hover:border-[rgba(255,255,255,0.12)] transition-colors touch-manipulation
```

---

## Task 1: Design tokens + font

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Replace Geist with JetBrains Mono in index.html**

Replace the existing font `<link>` tags (lines 7–9) with:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Replace index.css**

Full new content:

```css
@import "tailwindcss";

@theme {
  --font-sans: 'JetBrains Mono', ui-monospace, monospace;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --color-accent: #00d4ff;
  --color-accent-dim: rgba(0, 212, 255, 0.53);
  --color-secondary: #888888;
  --color-label: #2a2a2a;
  --color-danger: #ff4444;
  --color-warn: #ffaa00;
}

html, body, #root {
  width: 100%;
  height: 100%;
  background: #080808;
}

[vaul-drawer] {
  touch-action: none;
}
```

- [ ] **Step 3: Verify types and tests pass**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 type errors, 75 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/index.html apps/web/src/index.css
git commit -m "feat(design): add JetBrains Mono + design tokens"
```

---

## Task 2: SatInfoCard

**Files:**
- Modify: `apps/web/src/components/SatInfoCard.tsx`

- [ ] **Step 1: Replace SatInfoCard.tsx**

```tsx
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
```

- [ ] **Step 2: Verify**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, 75 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SatInfoCard.tsx
git commit -m "feat(design): restyle SatInfoCard — Nothing/Terminal"
```

---

## Task 3: PassPanel

**Files:**
- Modify: `apps/web/src/components/PassPanel.tsx`

- [ ] **Step 1: Replace PassPanel.tsx**

```tsx
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

function formatTime(utc: string): string {
  return new Date(utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
          <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#1a1a1a] mb-1">Pass Prediction · Next 24 h</div>
          <div className="font-mono text-[11px] font-bold text-white uppercase tracking-[0.04em] truncate leading-tight">{sat.name}</div>
          <div className="font-mono text-[8px] text-label mt-0.5">NORAD ID · {sat.noradId}</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close pass panel"
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center font-mono text-[#1e1e1e] hover:text-secondary text-lg leading-none transition-colors touch-manipulation"
        >×</button>
      </div>

      {/* Location */}
      <div className="px-3 py-2.5 border-b border-[rgba(255,255,255,0.04)] flex-shrink-0">
        <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#1a1a1a] mb-2">Observer Location</div>

        {locState === 'requesting' && (
          <div className="font-mono text-[9px] text-label">Getting your location…</div>
        )}

        {locState === 'granted' && (
          <div className="flex items-baseline justify-between gap-2">
            <div>
              {locationName && (
                <div className="font-mono text-[10px] text-secondary">{locationName}</div>
              )}
              <div className="font-mono text-[9px] text-label mt-0.5">
                {parseFloat(lat).toFixed(2)}° {parseFloat(lat) >= 0 ? 'N' : 'S'},{' '}
                {parseFloat(lon).toFixed(2)}° {parseFloat(lon) >= 0 ? 'E' : 'W'}
              </div>
            </div>
            <button
              onClick={() => { setLocState('manual'); setSearchQuery(''); setSuggestions([]); setActiveIndex(-1) }}
              className="font-mono text-[8px] uppercase tracking-[0.08em] text-label hover:text-secondary transition-colors flex-shrink-0 touch-manipulation"
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
                  className="w-full bg-[rgba(9,9,9,0.72)] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-2 py-1.5 font-mono text-[9px] text-secondary placeholder-label focus:outline-none focus:border-[rgba(0,212,255,0.3)] transition-colors pr-6"
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
                className="px-2.5 font-mono text-[8px] uppercase tracking-[0.08em] border border-[rgba(0,212,255,0.2)] text-accent rounded-[2px] hover:border-[rgba(0,212,255,0.4)] disabled:opacity-40 transition-colors touch-manipulation flex-shrink-0"
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
                          <div className="font-mono text-[9px] text-secondary truncate">{s.name}</div>
                          {context && <div className="font-mono text-[8px] text-label truncate mt-0.5">{context}</div>}
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
      <div className="overflow-y-auto max-h-[50dvh] min-h-[60px]">
        {loading && (
          <div className="px-3 py-4 font-mono text-[9px] text-label text-center">Computing passes…</div>
        )}
        {error && (
          <div className="px-3 py-3 font-mono text-[9px] text-danger">{error}</div>
        )}
        {passes !== null && !loading && (
          passes.length === 0 ? (
            <div className="px-3 py-4 font-mono text-[9px] text-label text-center">
              No passes above 10° in the next 24 hours.
            </div>
          ) : (
            <div className="divide-y divide-[rgba(255,255,255,0.04)]">
              {passes.map((p, i) => (
                <div key={i} className="px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-[10px] font-medium text-secondary">{formatTime(p.start_utc)}</span>
                      {tz && <span className="font-mono text-[8px] text-label">{tz}</span>}
                    </div>
                    <span className="font-mono text-[8px] text-label">{durationMin(p.start_utc, p.end_utc)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="font-mono text-[7px] uppercase tracking-[0.14em] text-[#1a1a1a] mb-0.5">Max Elevation</div>
                      <div className="font-mono text-[10px] font-light text-secondary">{p.max_elevation_deg}°</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <CompassRose direction={p.direction} />
                      <div className="font-mono text-[8px] text-label mt-0.5">{p.direction}</div>
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
```

- [ ] **Step 2: Verify**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, 75 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/PassPanel.tsx
git commit -m "feat(design): restyle PassPanel — Nothing/Terminal"
```

---

## Task 4: AgentPanel

**Files:**
- Modify: `apps/web/src/components/AgentPanel.tsx`

- [ ] **Step 1: Replace AgentPanel.tsx**

```tsx
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import type { ChatMessage } from '../types/chat'

interface AgentPanelProps {
  messages: ChatMessage[]
  isLoading: boolean
  sendMessage: (content: string) => void
  prefill?: string | null
  onClearPrefill?: () => void
  onClose?: () => void
}

export default function AgentPanel({ messages, isLoading, sendMessage, prefill, onClearPrefill, onClose }: AgentPanelProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (prefill) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInput(prefill)
      inputRef.current?.focus()
    }
  }, [prefill])

  function handleSend() {
    if (!input.trim() || isLoading) return
    sendMessage(input.trim())
    setInput('')
    onClearPrefill?.()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Message list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-[9px] text-label text-center leading-relaxed px-4 uppercase tracking-[0.1em]">
              Ask about any satellite or the ISS.
              <br />
              <span className="text-[#1a1a1a] mt-1 block">
                e.g. "Where is the ISS right now?"
              </span>
            </p>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-[3px] px-3 py-2 font-mono text-[11px] font-light whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.15)] text-white'
                  : 'border border-[rgba(255,255,255,0.06)] text-secondary'
              }`}
            >
              {msg.content || (msg.streaming ? (
                <span className="inline-flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
                </span>
              ) : null)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="flex-none border-t border-[rgba(255,255,255,0.04)] px-3 pt-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="flex-none w-8 h-8 flex items-center justify-center rounded-[3px] border border-[rgba(255,255,255,0.07)] font-mono text-label hover:text-secondary transition-colors touch-manipulation"
              aria-label="Close chat"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            className="min-w-0 flex-1 bg-[rgba(9,9,9,0.72)] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-3 py-2 font-mono text-[11px] text-secondary placeholder:text-label outline-none focus:border-[rgba(0,212,255,0.3)] transition-colors disabled:opacity-50"
            placeholder="Ask anything…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="flex-none px-3 py-2 rounded-[2px] font-mono text-[8px] uppercase tracking-[0.08em] border border-[rgba(0,212,255,0.2)] text-accent hover:border-[rgba(0,212,255,0.4)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-manipulation"
          >
            Send
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, 75 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/AgentPanel.tsx
git commit -m "feat(design): restyle AgentPanel — Nothing/Terminal"
```

---

## Task 5: SearchBar

**Files:**
- Modify: `apps/web/src/components/SearchBar.tsx`

- [ ] **Step 1: Replace SearchBar.tsx**

```tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import type { SearchResult } from '../globe/searchUtils'

interface SearchBarProps {
  onSearch: (query: string) => SearchResult[]
  onSelect: (noradId: string, name: string) => void
}

export default function SearchBar({ onSearch, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    const r = onSearch(val)
    setResults(r)
    setOpen(r.length > 0 && val.trim().length > 0)
    setActiveIdx(-1)
  }, [onSearch])

  const handleSelect = useCallback((result: SearchResult) => {
    onSelect(result.noradId, result.name)
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.blur()
  }, [onSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); const r = results[activeIdx]; if (r) handleSelect(r) }
    if (e.key === 'Escape')    { setQuery(''); setResults([]); setOpen(false); inputRef.current?.blur() }
  }, [open, results, activeIdx, handleSelect])

  useEffect(() => {
    if (!open) return
    const handler = () => setOpen(false)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" onMouseDown={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-3 py-2 shadow-lg w-36 sm:w-64">
        <svg className="w-3.5 h-3.5 text-label flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/>
          <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder="Search satellites…"
          className="bg-transparent font-mono text-[11px] text-secondary placeholder:text-label outline-none w-full"
          aria-label="Search satellites"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
            className="font-mono text-label hover:text-secondary flex-shrink-0 leading-none transition-colors"
            aria-label="Clear search"
          >×</button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full bg-[rgba(9,9,9,0.95)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] shadow-2xl overflow-hidden z-50">
          {results.map((r, i) => (
            <button
              key={r.noradId}
              className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.04)] last:border-0 transition-colors ${
                i === activeIdx ? 'bg-[rgba(255,255,255,0.04)]' : ''
              }`}
              onMouseDown={e => { e.preventDefault(); handleSelect(r) }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="font-mono text-[11px] text-secondary truncate">{r.name}</span>
              <span className="font-mono text-[8px] text-label flex-shrink-0">{r.noradId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, 75 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SearchBar.tsx
git commit -m "feat(design): restyle SearchBar — Nothing/Terminal"
```

---

## Task 6: GlobeView overlays

**Files:**
- Modify: `apps/web/src/components/GlobeView.tsx`

Changes: UTC clock chip → bare text; satellite count chip → bare cyan text; category pills → new style; "API" button label → "API Docs"; cloud toggle style.

- [ ] **Step 1: Update UTC clock (around line 155–161)**

Replace:
```tsx
        <div
          className="absolute left-3 font-mono text-xs text-gray-400 bg-black/50 px-2 py-1 rounded select-none"
          style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
        >
          {utcClock}
        </div>
```
With:
```tsx
        <div
          className="absolute left-3 font-mono text-[9px] text-label select-none"
          style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
        >
          {utcClock}
        </div>
```

- [ ] **Step 2: Update satellite count (around lines 164–179)**

Replace the entire satellite count block:
```tsx
        {!isLoading && (
          satelliteCount > 0 ? (
            <div
              className="absolute right-3 font-mono text-xs text-blue-400 bg-black/50 px-2 py-1 rounded select-none"
              style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
            >
              <span className="hidden sm:inline">Tracking </span>
              {satelliteCount.toLocaleString()}
              <span className="hidden sm:inline"> objects</span>
            </div>
          ) : (
            <div
              className="absolute right-3 font-mono text-xs text-gray-500 bg-black/50 px-2 py-1 rounded select-none animate-pulse"
              style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
            >
              <span className="sm:hidden">Loading…</span>
```

With:
```tsx
        {!isLoading && (
          satelliteCount > 0 ? (
            <div
              className="absolute right-3 font-mono text-[9px] text-accent select-none"
              style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
            >
              <span className="hidden sm:inline">Tracking </span>
              {satelliteCount.toLocaleString()}
              <span className="hidden sm:inline"> objects</span>
            </div>
          ) : (
            <div
              className="absolute right-3 font-mono text-[9px] text-label select-none animate-pulse"
              style={{ top: `max(0.75rem, calc(${safeTop} + 0.25rem))` }}
            >
              <span className="sm:hidden">Loading…</span>
```

- [ ] **Step 3: Update "API" button label and style (around lines 147–153)**

Replace:
```tsx
          <Link
            to="/docs"
            className="flex items-center bg-gray-900/90 backdrop-blur-sm border border-gray-700/80 rounded-lg px-3 py-2 shadow-lg text-sm text-gray-400 hover:text-gray-200 transition-colors whitespace-nowrap"
          >
            API
          </Link>
```
With:
```tsx
          <Link
            to="/docs"
            className="flex items-center bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-3 py-2 shadow-lg font-mono text-[9px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors whitespace-nowrap"
          >
            API Docs
          </Link>
```

- [ ] **Step 4: Update category filter pills**

Find the category pills section (renders `CATEGORY_LABELS` buttons). Replace the button className:

Old pattern (inside the pills map):
```tsx
className={`font-mono text-[10px] ... border ... ${CATEGORY_COLORS[cat]} ...`}
```

The current pills use `data-[active=true]:` variants. Read the exact current markup in GlobeView.tsx (around lines 195–230) and replace the pill button className with:

```tsx
className={`px-2.5 py-1 rounded-[2px] font-mono text-[8px] uppercase tracking-[0.1em] border transition-colors touch-manipulation select-none ${
  activeCategories.has(cat)
    ? 'border-[rgba(0,212,255,0.4)] text-accent bg-[rgba(0,212,255,0.06)]'
    : 'border-[rgba(255,255,255,0.07)] text-label hover:text-secondary hover:border-[rgba(255,255,255,0.12)]'
}`}
```

And replace the cloud toggle button with the same inactive pill style:
```tsx
className={`px-2.5 py-1 rounded-[2px] font-mono text-[8px] uppercase tracking-[0.1em] border transition-colors touch-manipulation select-none ${
  cloudsVisible
    ? 'border-[rgba(0,212,255,0.4)] text-accent bg-[rgba(0,212,255,0.06)]'
    : 'border-[rgba(255,255,255,0.07)] text-label hover:text-secondary'
}`}
```

- [ ] **Step 5: Verify**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, 75 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/GlobeView.tsx
git commit -m "feat(design): restyle GlobeView overlays — Nothing/Terminal"
```

---

## Task 7: App chrome

**Files:**
- Modify: `apps/web/src/App.tsx`

Changes: chat panel header, chat toggle button, unread dot, selection tray.

- [ ] **Step 1: Update chat panel header (around lines 291–298)**

Replace:
```tsx
          <div
            className="flex-none flex items-center gap-2 px-4 py-3 border-b border-gray-800"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
          >
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm font-medium text-gray-200">AI Assistant</span>
          </div>
```
With:
```tsx
          <div
            className="flex-none flex items-center gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.04)]"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-label">AI · Assistant</span>
          </div>
```

- [ ] **Step 2: Update chat panel container border (line 288)**

Replace:
```tsx
          className="fixed right-0 w-full sm:w-80 border-l border-gray-800 shadow-2xl z-30 flex flex-col bg-gray-950 overflow-hidden"
```
With:
```tsx
          className="fixed right-0 w-full sm:w-80 border-l border-[rgba(255,255,255,0.07)] shadow-2xl z-30 flex flex-col bg-[#080808] overflow-hidden"
```

- [ ] **Step 3: Update chat toggle button (around lines 314–332)**

Replace:
```tsx
            className="absolute right-4 z-30 w-12 h-12 rounded-full bg-blue-600 active:bg-blue-700 hover:bg-blue-500 text-white shadow-lg flex items-center justify-center touch-manipulation"
```
With:
```tsx
            className="absolute right-4 z-30 w-12 h-12 rounded-full bg-[rgba(9,9,9,0.9)] border border-[rgba(0,212,255,0.25)] text-accent shadow-lg flex items-center justify-center touch-manipulation hover:border-[rgba(0,212,255,0.45)] transition-colors"
```

And the message count span inside it:
```tsx
              <span className="font-mono text-[11px] font-medium text-accent">{messages.filter(m => m.role === 'assistant').length}</span>
```

- [ ] **Step 4: Update unread dot (around lines 337–341)**

Replace:
```tsx
          className="absolute right-3 z-40 w-3 h-3 rounded-full bg-blue-400 border-2 border-gray-950"
```
With:
```tsx
          className="absolute right-3 z-40 w-2.5 h-2.5 rounded-full bg-accent border border-[#080808]"
```

- [ ] **Step 5: Update selection tray (around lines 134–196)**

Replace tray toggle button className:
```tsx
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-900/95 border border-gray-700/80 rounded-lg backdrop-blur-sm text-xs text-gray-300 touch-manipulation"
```
With:
```tsx
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] font-mono text-[9px] touch-manipulation"
```

Replace tray list container className:
```tsx
                  className="mt-1 bg-gray-900/95 border border-gray-700/80 rounded-lg backdrop-blur-sm overflow-hidden"
```
With:
```tsx
                  className="mt-1 bg-[rgba(9,9,9,0.95)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] overflow-hidden"
```

Replace selected satellite name and NORAD inside the tray list:
```tsx
                          <div className="text-xs text-gray-200 truncate leading-tight">{sat.name}</div>
                          <div className="text-[10px] text-gray-600 mt-0.5">{sat.noradId}</div>
```
With:
```tsx
                          <div className="font-mono text-[9px] text-secondary truncate leading-tight uppercase tracking-[0.03em]">{sat.name}</div>
                          <div className="font-mono text-[8px] text-label mt-0.5">{sat.noradId}</div>
```

Replace tray row active state and remove button:
```tsx
                          cardSat?.noradId === sat.noradId ? 'bg-blue-900/30' : 'active:bg-gray-800'
```
With:
```tsx
                          cardSat?.noradId === sat.noradId ? 'bg-[rgba(0,212,255,0.06)]' : ''
```

Replace tray remove button className:
```tsx
                          className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-300 active:text-white rounded touch-manipulation"
```
With:
```tsx
                          className="flex-shrink-0 w-7 h-7 flex items-center justify-center font-mono text-label hover:text-secondary rounded-[2px] touch-manipulation transition-colors"
```

Replace tray count label:
```tsx
              <span className="font-medium text-white">{selectedSats.length} Selected</span>
```
With:
```tsx
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-secondary">{selectedSats.length} Selected</span>
```

- [ ] **Step 6: Verify**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, 75 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(design): restyle App chrome — Nothing/Terminal"
```

---

## Task 8: ApiDocs

**Files:**
- Modify: `apps/web/src/pages/ApiDocs.tsx`

- [ ] **Step 1: Replace ApiDocs.tsx**

```tsx
import { Link } from 'react-router-dom'

const BASE = window.location.origin

interface Param {
  name: string
  type: string
  required: boolean
  description: string
}

interface Endpoint {
  method: 'GET' | 'POST'
  path: string
  description: string
  params?: Param[]
  curl: string
  response: string
}

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/catalog',
    description:
      'Full TLE (Two-Line Element) satellite catalog in 3-line text format. Approximately 20,000 active objects. Refreshed every 2 hours from Space-Track.org. Data is subject to Space-Track.org redistribution terms.',
    curl: `curl ${BASE}/api/catalog`,
    response: [
      '0 ISS (ZARYA)',
      '1 25544U 98067A   26141.42361111  .00021328  00000-0  38431-3 0  9993',
      '2 25544  51.6397 132.4788 0003527  84.9201  23.3094 15.50036716513899',
      '0 STARLINK-1234',
      '1 48274U 21...',
      '...(~20,000 objects total)',
    ].join('\n'),
  },
  {
    method: 'GET',
    path: '/api/pass',
    description:
      'Predict upcoming passes of a satellite over a ground location. Returns start/end times (UTC ISO 8601), max elevation in degrees, compass direction, and duration.',
    params: [
      { name: 'norad_id',    type: 'string', required: true,  description: 'NORAD catalog number (e.g. 25544 for ISS)' },
      { name: 'latitude',    type: 'number', required: true,  description: 'Observer latitude in decimal degrees (south = negative)' },
      { name: 'longitude',   type: 'number', required: true,  description: 'Observer longitude in decimal degrees (west = negative)' },
      { name: 'hours_ahead', type: 'number', required: false, description: 'Hours to search ahead. Default: 24' },
    ],
    curl: `curl "${BASE}/api/pass?norad_id=25544&latitude=-37.81&longitude=144.96&hours_ahead=24"`,
    response: JSON.stringify(
      {
        satellite: 'ISS (ZARYA)',
        norad_id: '25544',
        passes: [
          {
            start: '2026-05-21T10:14:00.000Z',
            end: '2026-05-21T10:20:00.000Z',
            max_elevation: 62,
            direction: 'NW',
            duration_seconds: 360,
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    method: 'POST',
    path: '/api/chat',
    description:
      'AI agent powered by Claude. Accepts natural-language satellite questions and returns a streamed text response. Rate-limited to 15 requests per IP per minute. Strip __HIGHLIGHT__: and __SET_FILTER__: control tokens if consuming outside the Satlas frontend.',
    params: [
      { name: 'message', type: 'string', required: true,  description: 'User question, max 500 characters' },
      { name: 'history', type: 'array',  required: false, description: 'Prior turns: [{ role: "user" | "assistant", content: string }]' },
    ],
    curl: [
      `curl -X POST ${BASE}/api/chat \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"message":"Where is the ISS right now?"}'`,
    ].join('\n'),
    response: [
      'The ISS (ZARYA) is currently at:',
      '- Altitude: 423 km',
      '- Latitude: -12.4°, Longitude: 87.2°',
      '- Velocity: 7.66 km/s',
      '',
      '__HIGHLIGHT__:{"norad_id":"25544","satellite_name":"ISS (ZARYA)"}',
    ].join('\n'),
  },
]

function MethodBadge({ method }: { method: 'GET' | 'POST' }) {
  return (
    <span className={`font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-[2px] border ${
      method === 'GET'
        ? 'border-[rgba(0,212,255,0.3)] text-accent'
        : 'border-[rgba(255,170,0,0.3)] text-warn'
    }`}>
      {method}
    </span>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="bg-[#050505] border border-[rgba(255,255,255,0.06)] rounded-[3px] p-4 font-mono text-[11px] font-light text-secondary overflow-x-auto whitespace-pre-wrap leading-relaxed">
      {code}
    </pre>
  )
}

function ParamsTable({ params }: { params: Param[] }) {
  return (
    <div className="border border-[rgba(255,255,255,0.06)] rounded-[3px] overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.06)]">
            <th className="text-left pb-2 pt-2.5 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Parameter</th>
            <th className="text-left pb-2 pt-2.5 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Type</th>
            <th className="text-left pb-2 pt-2.5 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Required</th>
            <th className="text-left pb-2 pt-2.5 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
          {params.map(p => (
            <tr key={p.name}>
              <td className="py-2.5 px-4 font-mono text-[10px] text-accent">{p.name}</td>
              <td className="py-2.5 px-4 font-mono text-[9px] font-light text-label">{p.type}</td>
              <td className="py-2.5 px-4">
                {p.required ? (
                  <span className="font-mono text-[8px] text-accent">required</span>
                ) : (
                  <span className="font-mono text-[8px] text-label">optional</span>
                )}
              </td>
              <td className="py-2.5 px-4 font-mono text-[10px] font-light text-secondary">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EndpointSection({ endpoint }: { endpoint: Endpoint }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <MethodBadge method={endpoint.method} />
        <code className="font-mono text-[12px] text-white">{endpoint.path}</code>
      </div>
      <p className="font-mono text-[11px] font-light text-secondary mb-5 leading-relaxed">{endpoint.description}</p>
      {endpoint.params && (
        <div className="mb-5">
          <h3 className="font-mono text-[7px] uppercase tracking-[0.18em] text-label mb-2">Parameters</h3>
          <ParamsTable params={endpoint.params} />
        </div>
      )}
      <div className="mb-5">
        <h3 className="font-mono text-[7px] uppercase tracking-[0.18em] text-label mb-2">Example</h3>
        <CodeBlock code={endpoint.curl} />
      </div>
      <div>
        <h3 className="font-mono text-[7px] uppercase tracking-[0.18em] text-label mb-2">Response</h3>
        <CodeBlock code={endpoint.response} />
      </div>
    </section>
  )
}

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-[rgba(255,255,255,0.07)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-secondary">Satlas API</span>
        </div>
        <Link to="/" className="font-mono text-[9px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors">
          ← Back to globe
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="font-mono text-[22px] font-bold text-white mb-2 tracking-[-0.01em]">API Reference</h1>
        <p className="font-mono text-[11px] font-light text-secondary mb-1">
          Public HTTP API for satellite tracking. No authentication required.
        </p>
        <p className="font-mono text-[10px] text-label">
          Base URL: <span className="text-secondary">{BASE}</span>
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-16 divide-y divide-[rgba(255,255,255,0.06)]">
        {ENDPOINTS.map(ep => (
          <div key={ep.path} className="py-10 first:pt-0">
            <EndpointSection endpoint={ep} />
          </div>
        ))}
      </div>

      <footer className="border-t border-[rgba(255,255,255,0.07)] px-6 py-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <Link to="/" className="font-mono text-[9px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors">← Globe</Link>
            <a
              href="https://github.com/PremaanshVyas/satlas"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[9px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors"
            >
              GitHub
            </a>
          </div>
          <span className="font-mono text-[9px] text-[#1a1a1a] uppercase tracking-[0.06em]">Satlas · open-source space situational awareness</span>
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: Verify — all 7 ApiDocs tests must pass**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, 75 tests pass. The 7 ApiDocs tests check for 'API Reference', 'Satlas API', '← Back to globe' link, endpoint paths, GET/POST badges, and 'Base URL:' — all preserved.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/ApiDocs.tsx
git commit -m "feat(design): restyle ApiDocs — Nothing/Terminal"
```

---

## Task 9: Integration + push

- [ ] **Step 1: Run full test suite**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 type errors, 75 tests pass.

- [ ] **Step 2: Start dev server and visually verify**

```bash
cd apps/web && npm run dev
```

Open http://localhost:5173. Check:
- [ ] Font is JetBrains Mono everywhere (no Inter/Geist fallback visible)
- [ ] Background is `#080808` (near-black, not `gray-950`)
- [ ] UTC clock and sat count are bare text, no chip backgrounds
- [ ] Category pills use cyan accent when active
- [ ] Search bar has glass panel style
- [ ] Click a satellite → SatInfoCard shows full labels, glass panel, cyan live values
- [ ] Click "Predict Passes" → PassPanel has matching style, compass needle is cyan
- [ ] Open AI chat → bubbles styled correctly, cyan streaming dots
- [ ] Chat toggle button is glass with cyan icon (not blue filled)
- [ ] Navigate to /docs → full monospace style, correct badge colors, footer present

- [ ] **Step 3: Push**

```bash
git push origin main
```
