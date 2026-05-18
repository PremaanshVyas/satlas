# Feature Spec: Country Borders + Country-Based Satellite Overhead

**Status:** Planned — V2  
**Proposed:** Session 18 (2026-05-19)  
**Depends on:** `find_satellites_overhead` tool (added Session 18, live)

---

## The idea

Render country borders on the 3D globe as a line overlay. Clicking a country opens a panel showing:

1. **Satellites currently overhead** — which tracked objects are above the horizon from that country's capital/centroid right now.
2. **Major satellites passing through** — upcoming passes of notable satellites (ISS, Starlink, GPS) over the country in the next 12 hours, similar to the existing `predict_passes` AI tool but surface-level UI.

This extends the existing `find_satellites_overhead` tool (which already works) into a direct globe interaction — no need to type a city name, just click the country.

---

## User flow

1. User sees globe with faint country borders rendered over the Earth mesh.
2. Hovering a country highlights it (name tooltip).
3. Clicking a country opens a "Country overhead" side panel:
   - Country name + flag emoji
   - "X satellites overhead right now" list — name, elevation, direction
   - "Upcoming passes" section — next 3 ISS passes + any Starlink train passes
4. "Ask AI about [Country]" button prefills the chat: "What satellites are overhead from [Country] right now?"

---

## Implementation plan

### 1. Border data

Use **Natural Earth 1:110m cultural vectors** — country borders in GeoJSON, ~120KB download.  
URL: `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json` (TopoJSON, converts to GeoJSON).  
Load once on globe init, cache in memory.

### 2. Globe rendering

New file: `apps/web/src/globe/CountryBorders.ts`

```typescript
import * as THREE from 'three'
// Load TopoJSON → convert each country polygon to LineSegments
// Render as a thin LineSegments mesh at radius 1.001 (just above Earth surface)
// Material: LineBasicMaterial, colour #ffffff, opacity 0.15, transparent
```

Key decisions:
- Render borders at radius `1.001` so they sit above the Earth texture but below the cloud layer (`1.012`)
- `depthWrite: false` on the line material so borders don't z-fight with the Earth
- Use `THREE.LineSegments` (not `LineLoop`) — borders are open paths not closed rings
- Country fill (hover highlight): a separate `THREE.Mesh` with `MeshBasicMaterial`, opacity 0.1, renders only on hover

### 3. Country click detection

Countries are convex-ish polygons in lat/lon space. For click detection:
- On globe click, convert camera ray → lat/lon (inverse of the ECI→screen transform we already do for satellites)
- Do a point-in-polygon check against the GeoJSON country features
- This is O(N countries) with a simple ray-casting algorithm — fast enough

Alternatively: render each country as a flat mesh and use THREE raycaster — cleaner but adds more geometry.

### 4. Overhead data

Once a country is selected:
- Look up the country's capital/centroid lat/lon from a small embedded JSON (~10KB for 195 countries)
- Call `find_satellites_overhead(lat, lon)` — this already works in the AI tool
- For the UI, expose this as a `/api/overhead` Vercel function (thin wrapper around the same logic in `chat.ts`) so the frontend can call it directly without going through the AI

### 5. New Vercel function: `/api/overhead`

```
POST /api/overhead
Body: { latitude: number, longitude: number, min_elevation?: number }
Response: { count: number, satellites: [...], location: {...} }
```

Reuses `fetchCatalogTles` + `toolFindSatellitesOverhead` logic, extracted into a shared module.  
Response cached with `Cache-Control: public, s-maxage=60` — satellite positions change meaningfully every minute.

---

## Data assets needed

| Asset | Source | Size | Notes |
|---|---|---|---|
| Country borders (TopoJSON) | jsdelivr/world-atlas | ~120KB | One-time load, cache in memory |
| Country centroids | Build from GeoJSON or embed | ~10KB | Capital city lat/lon per country |

---

## What this unlocks

- Direct globe interaction beyond satellite-level — clicking geography, not dots
- Makes the "what's overhead?" question answerable with zero typing
- Australian-relevant demo: click Australia → see every tracked object overhead right now
- Differentiates the portfolio: most satellite trackers show either the globe OR a country view, not both integrated

---

## Out of scope for V2

- Sub-national borders (states/provinces)
- Country-specific alert subscriptions (that's V3)
- Geopolitical data (launch sites, ground stations by country) — interesting but out of scope
