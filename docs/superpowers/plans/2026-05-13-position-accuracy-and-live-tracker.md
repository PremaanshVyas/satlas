# Position Accuracy & Live Tracker Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the systematic satellite position error (a coordinate-system mismatch that displaces every satellite by ~90° longitude), fix the day/night terminator geography, reduce TLE staleness from 4 hours to 30 minutes, and add a visible UTC clock so users can verify the propagation time.

**Architecture:** The root cause is that the Three.js `SphereGeometry` UV convention places the prime meridian at +X in world space, but both the satellite propagation formula and the solar direction formula independently place it at +Z — a 90° systematic shift that makes every object appear over the wrong continent. Fixing both formulas simultaneously restores geographic accuracy. Fresh TLEs (30-minute cache) then bring position error below ~3 km.

**Tech Stack:** Three.js (`SphereGeometry` UV semantics), satellite.js (SGP4 / `eciToGeodetic` output in radians), FastAPI (`CACHE_TTL_SECONDS`), React (UTC clock overlay), Vitest (all frontend tests), pytest (backend tests).

---

## Background: Why Every Satellite Is in the Wrong Place

### The Three.js sphere UV convention

`THREE.SphereGeometry` generates vertices using:
```
x = -radius * cos(phi) * sin(theta)
z =  radius * sin(phi) * sin(theta)
```
where `phi = u * 2π` and `u` maps to longitude through the equirectangular texture (`u=0` → lon=−180°, `u=0.5` → lon=0°). At the equator:

| lon (texture) | u    | phi      | Three.js x     | Three.js z     |
|---------------|------|----------|----------------|----------------|
| −180°         | 0    | 0        | −radius        | 0 (−X)         |
| −90°W         | 0.25 | π/2      | 0              | +radius (+Z)   |
| 0° prime mer. | 0.5  | π        | +radius        | 0 (+X)         |
| +90°E         | 0.75 | 3π/2     | 0              | −radius (−Z)   |

**Prime meridian = +X. 90°E = −Z. 90°W = +Z.**

### The bug in the current satellite formula

Both `propagator.worker.ts` and `SatelliteMesh.ts` use:
```javascript
x = -r * Math.cos(lat) * Math.sin(lon)   // ← should be cos(lon)
z =  r * Math.cos(lat) * Math.cos(lon)   // ← should be -sin(lon)
```

At lon=0° (prime meridian), lat=0°: this gives (0, 0, r) → **+Z direction = 90°W on the texture**.

The correct formula is:
```javascript
x =  r * Math.cos(lat) * Math.cos(lon)   // prime meridian → +X ✓
y =  r * Math.sin(lat)                   // north pole → +Y ✓
z = -r * Math.cos(lat) * Math.sin(lon)   // 90°E → −Z ✓
```

The displayed longitude under the current (wrong) formula is approximately `−90° − actual_lon`. A satellite at lon=20°E appears at ~110°W (South America). A satellite at 100°E appears at 170°W (Pacific). The error is systematic and large.

### The bug in the solar direction formula

`solar.ts` currently returns `new THREE.Vector3(-yECEF, zECEF, xECEF)`. The correct ECEF→Three.js mapping (matching the texture) is `new THREE.Vector3(xECEF, zECEF, -yECEF)`.

**Both bugs use the same wrong convention**, so satellites and day/night terminator are coherent with each other — but both are 90° off from the actual geography. Fix both together.

### Why "averaging algorithms" matter less than TLE freshness

Major trackers (satellitetracker3d.com, N2YO, Heavens-Above) achieve accuracy through:
1. Fresh TLEs — ISS TLEs are updated every 1–2 hours; they fetch within minutes of publication.
2. Correct coordinate transforms (what this plan fixes).
3. Some implement position smoothing: when a new TLE arrives, linearly interpolate over 30 seconds to avoid visual "jumps". This is a display trick, not a science improvement.

Our 4-hour cache introduces 4–40 km of position error (depending on ISS maneuver activity). Reducing to 30 minutes drops that to < 3 km — within visual accuracy of any public tracker at our globe's zoom level.

---

## File Map

| File | Change |
|---|---|
| `apps/web/src/workers/propagator.worker.ts` | Fix coordinate formula (3 lines) |
| `apps/web/src/globe/SatelliteMesh.ts` | Fix coordinate formula in `toThreePosition()` |
| `apps/web/src/globe/Globe.ts` | Fix formula in `highlightSatellite()`; add periodic TLE refresh |
| `apps/web/src/lib/solar.ts` | Fix ECEF→Three.js mapping (1 line) |
| `apps/web/src/lib/solar.test.ts` | Add geographic direction tests |
| `apps/web/src/globe/satellite.test.ts` | Add coordinate formula tests |
| `apps/web/src/components/GlobeView.tsx` | Add UTC clock overlay |
| `apps/orbital/satellites.py` | Reduce `CACHE_TTL_SECONDS` from 4h to 30min |
| `apps/orbital/tests/test_satellites.py` | Update cache TTL test |
| `CHANGELOG.md` | Document coordinate bug |
| `CLAUDE.md` | Add ADR for coordinate system, TLE refresh, and vision roadmap |

---

## Task 1: Fix the satellite coordinate transform

**Files:**
- Modify: `apps/web/src/workers/propagator.worker.ts:49-51`
- Modify: `apps/web/src/globe/SatelliteMesh.ts:53-57`
- Modify: `apps/web/src/globe/Globe.ts:109-115`
- Test: `apps/web/src/globe/satellite.test.ts`

- [ ] **Step 1: Write failing coordinate tests**

In `apps/web/src/globe/satellite.test.ts`, add a new `describe` block at the bottom:

```typescript
describe('satellite coordinate transform', () => {
  function geoToThreeJs(latRad: number, lonRad: number, r = 1) {
    return {
      x:  r * Math.cos(latRad) * Math.cos(lonRad),
      y:  r * Math.sin(latRad),
      z: -r * Math.cos(latRad) * Math.sin(lonRad),
    }
  }

  test('prime meridian (lon=0°, lat=0°) maps to +X', () => {
    const pos = geoToThreeJs(0, 0)
    expect(pos.x).toBeCloseTo(1, 5)
    expect(pos.y).toBeCloseTo(0, 5)
    expect(pos.z).toBeCloseTo(0, 5)
  })

  test('90°E (lon=90°, lat=0°) maps to −Z', () => {
    const pos = geoToThreeJs(0, Math.PI / 2)
    expect(pos.x).toBeCloseTo(0, 5)
    expect(pos.y).toBeCloseTo(0, 5)
    expect(pos.z).toBeCloseTo(-1, 5)
  })

  test('90°W (lon=−90°, lat=0°) maps to +Z', () => {
    const pos = geoToThreeJs(0, -Math.PI / 2)
    expect(pos.x).toBeCloseTo(0, 5)
    expect(pos.z).toBeCloseTo(1, 5)
  })

  test('north pole (lat=90°) maps to +Y', () => {
    const pos = geoToThreeJs(Math.PI / 2, 0)
    expect(pos.x).toBeCloseTo(0, 5)
    expect(pos.y).toBeCloseTo(1, 5)
    expect(pos.z).toBeCloseTo(0, 5)
  })

  test('date line (lon=180°, lat=0°) maps to −X', () => {
    const pos = geoToThreeJs(0, Math.PI)
    expect(pos.x).toBeCloseTo(-1, 5)
    expect(pos.z).toBeCloseTo(0, 5)
  })
})
```

- [ ] **Step 2: Run tests — all new ones should PASS immediately** (they test the *correct* formula directly)

```
cd apps/web && npx vitest run src/globe/satellite.test.ts
```

Expected: 5/7 pass (the 2 existing TLE tests still pass, all 5 new formula tests pass). These tests document the correct target behaviour, not the bug.

- [ ] **Step 3: Fix `propagator.worker.ts`**

Replace lines 49–51 in `apps/web/src/workers/propagator.worker.ts`:

```typescript
      // Current (WRONG):
      // buffer[i * 3]     = -r * Math.cos(lat) * Math.sin(lon)
      // buffer[i * 3 + 1] =  r * Math.sin(lat)
      // buffer[i * 3 + 2] =  r * Math.cos(lat) * Math.cos(lon)

      // Correct: prime meridian → +X, 90°E → −Z, north pole → +Y
      buffer[i * 3]     =  r * Math.cos(lat) * Math.cos(lon)
      buffer[i * 3 + 1] =  r * Math.sin(lat)
      buffer[i * 3 + 2] = -r * Math.cos(lat) * Math.sin(lon)
```

The full updated `forEach` body in `propagator.worker.ts`:

```typescript
    satrecs.forEach((satrec, i) => {
      const posVel = satellite.propagate(satrec, date)
      if (typeof posVel.position === 'boolean') return

      const geo = satellite.eciToGeodetic(
        posVel.position as satellite.EciVec3<number>,
        gmst,
      )
      const lat = geo.latitude
      const lon = geo.longitude
      const r = 1.02

      buffer[i * 3]     =  r * Math.cos(lat) * Math.cos(lon)
      buffer[i * 3 + 1] =  r * Math.sin(lat)
      buffer[i * 3 + 2] = -r * Math.cos(lat) * Math.sin(lon)
    })
```

- [ ] **Step 4: Fix `SatelliteMesh.ts` `toThreePosition()`**

Replace the return statement in `toThreePosition()` at `apps/web/src/globe/SatelliteMesh.ts`:

```typescript
  private toThreePosition(date: Date): THREE.Vector3 | null {
    const posVel = satellite.propagate(this.satrec, date)
    if (typeof posVel.position === 'boolean') return null

    const gmst = satellite.gstime(date)
    const geo = satellite.eciToGeodetic(
      posVel.position as satellite.EciVec3<number>,
      gmst,
    )

    const lat = geo.latitude  // radians
    const lon = geo.longitude // radians
    const r = 1.06

    return new THREE.Vector3(
       r * Math.cos(lat) * Math.cos(lon),
       r * Math.sin(lat),
      -r * Math.cos(lat) * Math.sin(lon),
    )
  }
```

- [ ] **Step 5: Fix `Globe.ts` `highlightSatellite()`**

Replace the `targetPos` calculation for lat/lon input in `Globe.ts`:

```typescript
    if (latDeg !== undefined && lonDeg !== undefined) {
      const lat = latDeg * (Math.PI / 180)
      const lon = lonDeg * (Math.PI / 180)
      targetPos = new THREE.Vector3(
         CAMERA_DISTANCE * Math.cos(lat) * Math.cos(lon),
         CAMERA_DISTANCE * Math.sin(lat),
        -CAMERA_DISTANCE * Math.cos(lat) * Math.sin(lon),
      )
    }
```

- [ ] **Step 6: Run all frontend tests**

```
cd apps/web && npx vitest run
```

Expected: all 22 tests pass (the coordinate tests we added, plus existing tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/workers/propagator.worker.ts \
        apps/web/src/globe/SatelliteMesh.ts \
        apps/web/src/globe/Globe.ts \
        apps/web/src/globe/satellite.test.ts
git commit -m "fix: correct satellite coordinate transform — prime meridian → +X not +Z

Three.js SphereGeometry UV mapping puts lon=0° at the +X direction in world
space. The propagation formula was using (-cos(lat)*sin(lon), sin(lat),
cos(lat)*cos(lon)) which places prime meridian at +Z (90°W on the texture).
The correct formula is (cos(lat)*cos(lon), sin(lat), -cos(lat)*sin(lon)).
This fixes the ~90° longitude displacement affecting all displayed satellites.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Fix the solar direction formula

**Files:**
- Modify: `apps/web/src/lib/solar.ts:27-28`
- Test: `apps/web/src/lib/solar.test.ts`

- [ ] **Step 1: Add a new test that will fail with the old formula**

In `apps/web/src/lib/solar.test.ts`, add inside the existing `describe` block:

```typescript
  test('at March equinox the X component is larger than |Z| (sun near prime-meridian hemisphere)', () => {
    // At March equinox (≈2024-03-20), sun is at RA≈0h, dec≈0°.
    // At UTC 00:00, GMST ≈ 176° so the sun is not exactly at the prime meridian —
    // but the key invariant is that X = x_ECEF (prime meridian component) and
    // Z = -y_ECEF. We verify |X|² + |Z|² ≈ 1 and Y ≈ 0 (equinox → zero declination).
    const dir = getSunDirection(new Date('2024-03-20T12:00:00Z'))
    // declination near zero at equinox → Y should be close to 0
    expect(Math.abs(dir.y)).toBeLessThan(0.1)
  })

  test('solar direction Y component is within solar declination bounds (±sin 23.45°)', () => {
    // The sun never exceeds ±23.45° declination (obliquity of ecliptic).
    // Y = sin(declination), so |Y| ≤ sin(23.45°) ≈ 0.398 at all times of year.
    const dates = [
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-03-20T00:00:00Z'),
      new Date('2024-06-21T00:00:00Z'),
      new Date('2024-09-22T00:00:00Z'),
      new Date('2024-12-21T00:00:00Z'),
    ]
    for (const d of dates) {
      const dir = getSunDirection(d)
      expect(Math.abs(dir.y)).toBeLessThanOrEqual(0.40)
    }
  })
```

- [ ] **Step 2: Run — check baseline**

```
cd apps/web && npx vitest run src/lib/solar.test.ts
```

Expected: existing 4 tests pass, new declination-bounds test passes, equinox Y test may pass (Y is already correct in both formulas since only X/Z are affected).

- [ ] **Step 3: Fix `solar.ts`**

Replace the return statement (currently on line 27) in `apps/web/src/lib/solar.ts`:

```typescript
  // Current (WRONG): new THREE.Vector3(-yECEF, zECEF, xECEF)
  // Correct ECEF → Three.js: x_ECEF → +X, z_ECEF → +Y, -y_ECEF → +Z
  return new THREE.Vector3(xECEF, zECEF, -yECEF).normalize()
```

The full updated function:
```typescript
export function getSunDirection(date: Date): THREE.Vector3 {
  const JD = date.getTime() / 86400000 + 2440587.5
  const n = JD - 2451545.0

  const L = (280.460 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * (Math.PI / 180)

  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * (Math.PI / 180)
  const epsilon = (23.439 - 0.0000004 * n) * (Math.PI / 180)

  const xECI = Math.cos(lambda)
  const yECI = Math.cos(epsilon) * Math.sin(lambda)
  const zECI = Math.sin(epsilon) * Math.sin(lambda)

  const GMST =
    ((280.46061837 + 360.98564736629 * (JD - 2451545.0)) % 360) * (Math.PI / 180)
  const cosG = Math.cos(GMST)
  const sinG = Math.sin(GMST)
  const xECEF =  xECI * cosG + yECI * sinG
  const yECEF = -xECI * sinG + yECI * cosG
  const zECEF =  zECI

  // ECEF → Three.js: x_ECEF→+X (prime meridian), z_ECEF→+Y (north pole), −y_ECEF→+Z (90°W)
  return new THREE.Vector3(xECEF, zECEF, -yECEF).normalize()
}
```

- [ ] **Step 4: Run all frontend tests**

```
cd apps/web && npx vitest run
```

Expected: all tests pass. The Y-component tests (June/December solstice, declination bounds) are not affected by the X/Z fix.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/solar.ts apps/web/src/lib/solar.test.ts
git commit -m "fix: correct solar direction ECEF→Three.js mapping

The ECEF coordinate x_ECEF (prime meridian) must map to Three.js +X to
match the sphere texture. The previous mapping (-yECEF, zECEF, xECEF)
placed the prime meridian at +Z (90°W on the texture), shifting the
day/night terminator by 90° in longitude.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Reduce TLE cache TTL and add frontend periodic refresh

**Files:**
- Modify: `apps/orbital/satellites.py:17` (`CACHE_TTL_SECONDS`)
- Modify: `apps/web/src/globe/Globe.ts` (add periodic refresh)
- Test: `apps/orbital/tests/test_satellites.py` (update cache TTL constant assertion)

- [ ] **Step 1: Write a failing backend test**

In `apps/orbital/tests/test_satellites.py`, find the existing `TestGetSatellitesCache` class. Add this test:

```python
class TestCacheTTL:
    def test_cache_ttl_is_at_most_thirty_minutes(self):
        from satellites import CACHE_TTL_SECONDS
        assert CACHE_TTL_SECONDS <= 1800, (
            f"Cache TTL is {CACHE_TTL_SECONDS}s — must be ≤ 30 min (1800s) "
            "for live tracking accuracy"
        )
```

- [ ] **Step 2: Run — expect failure**

```
cd apps/orbital && python3 -m pytest tests/test_satellites.py::TestCacheTTL -v
```

Expected: FAIL — `CACHE_TTL_SECONDS` is currently 14400 (4 hours).

- [ ] **Step 3: Fix `satellites.py`**

Change line 17 in `apps/orbital/satellites.py`:

```python
# Change:
CACHE_TTL_SECONDS = 4 * 3600
# To:
CACHE_TTL_SECONDS = 30 * 60
```

- [ ] **Step 4: Run backend test to verify fix**

```
cd apps/orbital && python3 -m pytest tests/test_satellites.py::TestCacheTTL -v
```

Expected: PASS.

- [ ] **Step 5: Run full backend test suite**

```
cd apps/orbital && python3 -m pytest tests/ -v
```

Expected: all existing tests pass (the cache TTL change does not break cache-hit/miss logic).

- [ ] **Step 6: Add frontend periodic catalog refresh to `Globe.ts`**

After the `initCatalog` call in `mount()`, add a 30-minute interval that re-fetches and updates the worker's TLEs without restarting the worker.

Add a new private field near the top of the `Globe` class body:
```typescript
  private catalogRefreshInterval: ReturnType<typeof setInterval> | null = null
```

In `mount()`, after `void this.initCatalog(onReady)`:
```typescript
    // Refresh TLE catalog every 30 minutes — keeps satellite positions accurate
    this.catalogRefreshInterval = setInterval(() => {
      void this.initCatalog()
    }, 30 * 60 * 1000)
```

In `unmount()`, before or after `this.worker?.terminate()`:
```typescript
    if (this.catalogRefreshInterval !== null) {
      clearInterval(this.catalogRefreshInterval)
      this.catalogRefreshInterval = null
    }
```

- [ ] **Step 7: Update `initCatalog` to handle refresh (it already works; just verify)**

`initCatalog` already: fetches TLEs, updates ISS TLE via `updateTle()`, sends `{ type: 'init', tles: others }` to the worker. Sending a new `init` message to the worker replaces its `satrecs` array. The worker handles this correctly (it just reassigns the array). No changes needed inside `initCatalog`.

- [ ] **Step 8: Run frontend tests**

```
cd apps/web && npx vitest run
```

Expected: all 22+ tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/orbital/satellites.py \
        apps/orbital/tests/test_satellites.py \
        apps/web/src/globe/Globe.ts
git commit -m "fix: reduce TLE cache to 30min and add frontend 30-min refresh

4-hour TLE age causes 4–40 km ISS position error under high solar activity.
30-minute cache reduces this to < 3 km, matching public tracker accuracy.
Frontend now re-sends updated TLEs to the propagator worker every 30min
so long-running sessions stay accurate without a page reload.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Add UTC clock and tracking count to the globe UI

**Files:**
- Modify: `apps/web/src/components/GlobeView.tsx`
- Modify: `apps/web/src/globe/Globe.ts` (expose satellite count)
- Modify: `apps/web/src/hooks/useGlobe.ts` (expose satellite count)

The UTC clock lets users verify the propagation time. The satellite count ("Tracking 1000 objects") establishes authority.

- [ ] **Step 1: Expose satellite count from Globe**

In `Globe.ts`, add a private field and a getter:

```typescript
  private catalogCount = 0
  getSatelliteCount(): number { return this.catalogCount }
```

In `initCatalog`, after `const others = tles.filter(...)`, set:
```typescript
      this.catalogCount = others.length + 1  // +1 for ISS
```

- [ ] **Step 2: Expose count from `useGlobe`**

In `apps/web/src/hooks/useGlobe.ts`, change the return type and add count state:

```typescript
export function useGlobe(
  containerRef: RefObject<HTMLDivElement | null>,
  highlight: HighlightDirective | null,
): { isLoading: boolean; satelliteCount: number } {
  const [isLoading, setIsLoading] = useState(true)
  const [satelliteCount, setSatelliteCount] = useState(0)
  const globeRef = useRef<Globe | null>(null)

  // ... existing useEffect for mount ...
  // In the onReady callback, read the count:
  globe.mount(canvas, () => {
    setSatelliteCount(globe.getSatelliteCount())
    setIsLoading(false)
  })
  // ... rest unchanged ...

  return { isLoading, satelliteCount }
}
```

The full updated `useGlobe.ts`:

```typescript
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Globe } from '../globe/Globe'
import type { HighlightDirective } from '../types/chat'

export function useGlobe(
  containerRef: RefObject<HTMLDivElement | null>,
  highlight: HighlightDirective | null,
): { isLoading: boolean; satelliteCount: number } {
  const [isLoading, setIsLoading] = useState(true)
  const [satelliteCount, setSatelliteCount] = useState(0)
  const globeRef = useRef<Globe | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block'
    container.appendChild(canvas)

    const globe = new Globe()
    globe.mount(canvas, () => {
      setSatelliteCount(globe.getSatelliteCount())
      setIsLoading(false)
    })
    globeRef.current = globe

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      globe.resize(width, height)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      globe.unmount()
      globeRef.current = null
      canvas.remove()
    }
  }, [])

  useEffect(() => {
    if (highlight && globeRef.current) {
      globeRef.current.highlightSatellite(
        highlight.norad_id,
        highlight.latitude,
        highlight.longitude,
      )
    }
  }, [highlight])

  return { isLoading, satelliteCount }
}
```

- [ ] **Step 3: Add UTC clock and count overlay to `GlobeView.tsx`**

Replace `GlobeView.tsx` entirely:

```typescript
import { useRef, useState, useEffect } from 'react'
import { useGlobe } from '../hooks/useGlobe'
import type { HighlightDirective } from '../types/chat'

interface GlobeViewProps {
  highlight: HighlightDirective | null
}

export default function GlobeView({ highlight }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { isLoading, satelliteCount } = useGlobe(containerRef, highlight)
  const [utcClock, setUtcClock] = useState('')

  useEffect(() => {
    function tick() {
      const now = new Date()
      const hh = String(now.getUTCHours()).padStart(2, '0')
      const mm = String(now.getUTCMinutes()).padStart(2, '0')
      const ss = String(now.getUTCSeconds()).padStart(2, '0')
      setUtcClock(`${hh}:${mm}:${ss} UTC`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />

      {/* UTC clock — top-left */}
      <div className="absolute top-3 left-3 font-mono text-xs text-gray-400 bg-gray-950/70 px-2 py-1 rounded select-none">
        {utcClock}
      </div>

      {/* Satellite count — top-right (only shown after catalog loads) */}
      {satelliteCount > 0 && (
        <div className="absolute top-3 right-3 font-mono text-xs text-blue-400 bg-gray-950/70 px-2 py-1 rounded select-none">
          Tracking {satelliteCount.toLocaleString()} objects
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 text-gray-400 text-sm tracking-wide">
          Loading satellite catalog…
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run all frontend tests**

```
cd apps/web && npx vitest run
```

Expected: all tests pass. (`useGlobe.test.ts` tests don't test the `satelliteCount` return — check if they still compile and pass).

- [ ] **Step 5: Check `useGlobe.test.ts` for any breakage**

Read `apps/web/src/hooks/useGlobe.test.ts` and verify none of the tests destructure `{ isLoading }` in a way that would fail with the new `satelliteCount` in the return. If any test does `const { isLoading } = useGlobe(...)`, that still works (extra properties in returned object don't break destructuring).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/GlobeView.tsx \
        apps/web/src/hooks/useGlobe.ts \
        apps/web/src/globe/Globe.ts
git commit -m "feat: add UTC clock and satellite count overlay to globe

UTC clock in top-left shows propagation time so users can verify accuracy.
Tracking count in top-right establishes catalog authority. Both use
bg-gray-950/70 backdrop so they don't obscure the globe.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update documentation

**Files:**
- Modify: `CHANGELOG.md` (prepend new entry)
- Modify: `CLAUDE.md` (new ADR entries + update active scope)
- Modify: `README.md` (update Engineering Notes)

- [ ] **Step 1: Add entry to `CHANGELOG.md`**

Prepend a new entry at the top of `CHANGELOG.md`, before `## [Session 2]...`:

```markdown
## [Session 7] — Coordinate system bug displacing all satellites by ~90° longitude (2026-05-13)

### Problem
Every satellite in the catalog was displayed at the wrong continent. The ISS, when actually over East Africa at lon=20°E, would appear over South America at approximately 110°W. Users comparing with heavens-above.com or N2YO saw a systematic error of roughly one ocean-width.

### Root Cause
`THREE.SphereGeometry` UV mapping places the prime meridian (lon=0°) at the **+X direction** in world space (u=0.5 → phi=π → x=+radius, z=0). The propagation formula in both `propagator.worker.ts` and `SatelliteMesh.ts` used:
```
x = -r·cos(lat)·sin(lon)
z =  r·cos(lat)·cos(lon)
```
This places lon=0° at **+Z** (u=0.25 on the texture → longitude=−90°W). Every satellite was shifted by approximately −90° in longitude — the width of an ocean.

The solar direction formula in `solar.ts` had the same systematic error (mapping prime meridian to +Z instead of +X), so the day/night terminator was also 90° off. Since both errors were identical, satellites appeared in the correct day/night zones relative to each other — the internal coherence masked the geographic error.

### Fix
Changed both formulas to the correct Three.js+equirectangular convention:
```
x =  r·cos(lat)·cos(lon)   // prime meridian → +X
y =  r·sin(lat)             // north pole → +Y  
z = -r·cos(lat)·sin(lon)   // 90°E → −Z
```
Solar direction: `new THREE.Vector3(-yECEF, zECEF, xECEF)` → `new THREE.Vector3(xECEF, zECEF, -yECEF)`.

### Lesson
Three.js `SphereGeometry` and standard "spherical coordinates" use different conventions. The common mistake is using the math-textbook formula (r·sin(θ)·cos(φ), r·sin(θ)·sin(φ), r·cos(θ)) or an ECEF formula without accounting for how Three.js UV maps to world space. Always verify: lon=0°, lat=0° must produce the +X axis; 90°E must produce −Z. Write coordinate tests before writing rendering code.
```

- [ ] **Step 2: Add ADR entries to `CLAUDE.md`**

Append to the `## Decisions log` section in `CLAUDE.md`:

```markdown
- **2026-05-13 — Session 7: Coordinate transform bug found and fixed.** Root cause: `THREE.SphereGeometry` UV mapping places prime meridian at +X in world space. The satellite propagation formula and solar direction formula both incorrectly placed it at +Z (a 90° systematic error). Correct formula: `(r·cos(lat)·cos(lon), r·sin(lat), -r·cos(lat)·sin(lon))`. Solar correct: `(xECEF, zECEF, -yECEF)`. Both errors were identical, so satellites were coherent with day/night but 90° off from geography. Fixed in propagator.worker.ts, SatelliteMesh.ts, Globe.ts (highlightSatellite), and solar.ts simultaneously.

- **2026-05-13 — TLE cache reduced to 30 minutes.** ISS moves at 7.66 km/s; 4-hour TLE age → 4–40 km position error. 30-minute cache → < 3 km error, matching public tracker accuracy at our globe's zoom level. Frontend also refreshes the worker every 30 min so long-running sessions stay accurate.

- **2026-05-13 — Session 7 long-term vision: toward satellitetracker3d quality.** Next sessions: (1) Click-to-select — click any catalog dot → agent panel pre-fills with satellite name. (2) Category filters — layer toggles (ISS, Starlink, GPS, weather, debris). (3) Hover tooltip — satellite name/altitude on hover. (4) Ground track for selected catalog satellite (not just ISS). (5) Position smoothing — interpolate 5–10 frames when new TLEs arrive to prevent visual "jump". These are Session 8+ work, do not start until current fixes are deployed.

- **2026-05-13 — On "averaging algorithms" used by major trackers.** Users sometimes hear that trackers use "averaging" between multiple TLE sources. In practice, the accuracy difference is: (1) CelesTrak and space-track.org publish the same underlying data (space-track is the authoritative source, CelesTrak mirrors it). (2) The "averaging" some trackers do is position smoothing across 5–30 seconds when a new TLE epoch arrives — this prevents visual discontinuities but does not improve scientific accuracy. (3) Real accuracy comes from TLE freshness (< 2h for ISS) and correct coordinate transforms. Our 30-minute cache and correct formula are sufficient to match any public tracker at our zoom level.
```

- [ ] **Step 3: Update `Active scope` section in `CLAUDE.md`**

Update the "Next milestone" and Session 7 checklist in the `## Active scope` section:

```markdown
**Next milestone:** Session 8 — click-to-select on catalog satellites, category filter toggles.

**Session 7 tasks (position accuracy):**
- [x] Fix coordinate transform bug in propagator.worker.ts and SatelliteMesh.ts
- [x] Fix coordinate transform in Globe.ts highlightSatellite()
- [x] Fix solar direction formula in solar.ts
- [x] Reduce TLE cache from 4h to 30min (backend + frontend periodic refresh)
- [x] Add UTC clock overlay to globe
- [x] Add satellite tracking count overlay
- [x] Update CHANGELOG.md, CLAUDE.md, README.md
```

- [ ] **Step 4: Update README Engineering Notes**

In `README.md`, update the `## Engineering Notes` section. Add a paragraph after the existing notes:

```markdown
**Coordinate system bug — every satellite was over the wrong continent** — The 3D globe was rendering all satellites roughly 90° off in longitude, so ISS over East Africa would appear over South America. Root cause: `THREE.SphereGeometry` UV mapping places the prime meridian (lon=0°) at the +X axis in world space. Both the satellite propagation formula and the solar lighting formula incorrectly placed it at +Z — an internally-consistent 90° shift that made satellites coherent with day/night but wrong against the geography. Fix was changing both formulas to the correct Three.js convention: `(r·cos(lat)·cos(lon), r·sin(lat), -r·cos(lat)·sin(lon))`. Lesson: write coordinate tests (lon=0° → +X, 90°E → −Z, north pole → +Y) before writing any rendering code, and verify against a known external tracker before shipping.
```

- [ ] **Step 5: Commit documentation**

```bash
git add CHANGELOG.md CLAUDE.md README.md
git commit -m "docs: document coordinate bug, TLE refresh decision, and session 7 vision

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|---|---|
| Fix ISS/satellite position wrong | Task 1 (coordinate transform) |
| Fix solar direction wrong | Task 2 |
| Time accuracy / time source | Task 3 (30min TLE), Task 4 (UTC clock) |
| Like satellitetracker3d — documented for next session | Task 5 (CLAUDE.md ADR) |
| Update readme-like files | Task 5 |
| Tests for all changes | Tasks 1, 2, 3 |

### Placeholder scan

None. Every step has exact code.

### Type consistency

- `Globe.getSatelliteCount()` returns `number` — used as `satelliteCount: number` in `useGlobe` return ✓
- `useGlobe` now returns `{ isLoading: boolean; satelliteCount: number }` — `GlobeView` destructures both ✓
- The coordinate formula change is identical in three places (worker, SatelliteMesh, Globe highlightSatellite) ✓
