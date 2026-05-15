# Aussie Sky V1 Platform Upgrade — Design Spec

**Date:** 2026-05-15  
**Author:** Premaansh ("mickey") + Claude  
**Status:** Approved

---

## What we're building

Transform Aussie Sky from a working MVP into a polished, full-featured satellite tracking platform that rivals satellitemap.space visually and surpasses it through the AI agent — which no satellite tracker currently has. The platform stays Australian in identity and builds toward V2 bushfire scar detection as its unique differentiator.

---

## Inspiration: satellitemap.space credits (verbatim)

These are the exact libraries, data sources, and tools used by satellitemap.space. They inform every technical decision in this spec.

### Core Libraries & Frameworks
- **TWGL.js** — WebGL helper library (twgljs.org)
- **Astro** — Astro js framework (astro.build)
- **Tailwind CSS** — Utility-first CSS framework (tailwindcss.com)
- **OpenResty** — High-performance web platform based on Nginx and LuaJIT (openresty.org)
- **Web** — Vite build tooling, Node.js runtime, and Express backend API services (vitejs.dev, nodejs.org, expressjs.com)

### Orbital Mechanics & Satellite Data
- **satellite.js** — SGP4/SDP4 implementation for orbital calculations (github.com/shashwatak/satellite-js)
- **Skyfield** — Astronomical library by Brandon Rhodes for high-precision celestial calculations (rhodesmill.org/skyfield)
- **Astronomia** — Astronomical calculations for sun/moon positioning (github.com/commenthol/astronomia)

### Data Sources
- **Space-Track.org** — Official TLE data source (space-track.org)
- **CelesTrak** — Early TLE data (celestrak.org)
- **JPL Horizons** — NASA ephemeris service for ground-truth testing and validation (JPL Horizons)
- **Gunter's Space Page** — Constellation and spacecraft information (space.skyrocket.de)
- **Jonathan McDowell (planet4589)** — JCAT data and comprehensive space tracking (planet4589.org)

### Geographic & Map Data
- **Google My Maps KML Data** — Comprehensive Starlink ground station locations and information (Google Maps)
- **Natural Earth** — Free vector map data (naturalearthdata.com)
- **Radar.com** — Geocoding services (radar.com)
- **Mapbox** — Elevation and topography data (mapbox.com)

### Visual Assets & Textures
- **NASA Blue Marble** — Earth day/night textures from NASA/Goddard Space Flight Center
- **NASA Deep Star Maps 2020** — High-resolution star field (1.7 billion stars from Gaia DR2)
- **Matt Eason's Cloud Service** — Real-time global cloud imagery (clouds.matteason.co.uk)

### Scientific Computing & Analysis
- **Julia** — High-performance scientific computing language (julialang.org)
- **Rust** — Systems programming for network testing servers (rust-lang.org)
- **Julia Satellite Toolbox** — High-precision orbital mechanics and satellite analysis (juliaspace.github.io)

### AI Tools
- **Claude Code** — AI coding assistant by Anthropic (anthropic.com)
- **DeepSeek** — AI coding and reasoning model (deepseek.com)

---

## What Aussie Sky adopts vs what it skips

### Adopted (fits our stack and goals)
| Credit item | How we use it | Session |
|---|---|---|
| Space-Track.org | Primary TLE source via ECS orbital service — 30k+ objects, no cloud IP block | 16 |
| satellite.js | Already in use ✓ | — |
| Skyfield | Already in Python service ✓ | — |
| NASA Blue Marble | Already in use ✓ | — |
| Astronomia | Replace `solar.ts` sun position with this library — more accurate terminator | 17 |
| NASA Deep Star Maps 2020 | Replace current procedural star field with Gaia DR2 texture skybox | 17 |
| Matt Eason's Cloud Service | Real-time cloud layer draped over globe | 17 |
| Jonathan McDowell JCAT | Full satellite metadata — mass, mission, operator, country, regime | 18 |
| Gunter's Space Page | Constellation descriptions and spacecraft grouping info | 18 |
| JPL Horizons | Validation/testing ground-truth for orbital calculations | 18–19 |
| Radar.com | Geocoding for city-based pass prediction ("Melbourne" → lat/lon) | 19 |
| Natural Earth | 2D map data for ground track projected view | 19 |
| CelesTrak | Browser-direct fallback for catalog (already implemented) ✓ | — |

### Skipped (outside locked stack or not needed)
| Credit item | Why skipped |
|---|---|
| TWGL.js | Locked to Three.js. InstancedMesh handles 30k satellites fine. |
| Astro.js | Locked to React + Vite. |
| OpenResty | Using Vercel + ECS — Nginx/Lua not in scope. |
| Julia / Rust | Python + satellite.js covers all orbital math at this scale. |
| Mapbox | Elevation/topography not needed for V1. |
| Google My Maps KML | Starlink ground stations are a V2 feature. |

---

## Architecture

```
[ React + Three.js Frontend ]           ← Vercel CDN / CloudFront
         |
[ Claude API Agent (api/chat.ts) ]      ← Vercel serverless (unchanged)
         |
[ Python FastAPI Orbital Service ]      ← AWS ECS Fargate (Session 16)
    /satellites  → Space-Track.org TLEs (30k+)
    /satellite-meta/{norad_id} → JCAT metadata
    /passes/{norad_id} → skyfield pass prediction
    /overhead → satellites above observer now
    /subscribe, /unsubscribe → RDS PostgreSQL
         |
[ PostgreSQL RDS ]                      ← AWS RDS t3.micro (Session 16)
    subscribers table
    pgvector extension (ready for V2 RAG)
         |
[ S3 + CloudFront ]                     ← TLE catalog cache, imagery (Session 16)
```

---

## Five-session roadmap

---

### Session 16 — AWS Foundation

**Goal:** eliminate all remaining reliability issues, 30k+ satellites, always-on platform.

**What ships:**
- ECS Fargate: Python orbital service containerised, always warm, stable cloud IP
- Space-Track.org as primary TLE source — fetched server-side from ECS (cloud IPs allowed)
- 30k+ objects (active payloads + debris + rocket bodies) vs current 15k
- S3 bucket + CloudFront distribution: ECS writes TLE cache to S3 every 2h, browser fetches from CloudFront → < 1s first-visit load, zero rate limiting forever
- RDS PostgreSQL: subscribers table + pgvector extension
- Alert subscriptions feature: user enters email + city → gets emailed when ISS passes overhead (SES or SendGrid, 100 emails/day free)
- Subscribe form in the AI chat panel
- Terraform for all AWS resources (ECR, ECS, ALB, RDS, S3, CloudFront, Secrets Manager)
- ECR image push in GitHub Actions CI
- Sentry error monitoring in Python service
- Update CLAUDE.md + docs

**Tech decisions:**
- Space-Track credentials already in ADR — SPACE_TRACK_USER + SPACE_TRACK_PASS in Secrets Manager
- ECS fetches Group=active + supplemental debris groups from Space-Track, merges, writes to S3
- Browser `celestrak.ts` updated: primary URL → CloudFront distribution, CelesTrak as fallback
- `VITE_CATALOG_URL` env var replaces the hardcoded CelesTrak URL
- PostgreSQL schema: `CREATE EXTENSION IF NOT EXISTS vector;` at migration time

---

### Session 17 — Visual Overhaul

**Goal:** someone opening Aussie Sky immediately sees a planet, not a diagram.

**What ships:**

**Real-time cloud layer** (`clouds.matteason.co.uk`)
- GET `https://clouds.matteason.co.uk/image/4096x2048.jpg` — free, updates every ~3h
- In Three.js: second `SphereGeometry` at radius 1.012 (just above atmosphere), cloud texture as `alphaMap`, `transparent: true`, `depthWrite: false`, `blending: THREE.AdditiveBlending`
- Cached in browser (URL doesn't change, browser cache handles freshness)
- New file: `apps/web/src/globe/CloudMesh.ts`

**NASA Deep Star Maps 2020**
- Source: `https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/` — NASA public domain
- Replace `StarField.ts` vertex approach with a `SphereGeometry` skybox (`side: THREE.BackSide`, radius 100)
- Map the Gaia DR2 8k image to the inside — zero performance cost, dramatically better quality

**Astronomia sun position**
- `npm install astronomia` in `apps/web`
- Replace `solar.ts` GMST-based sun position with Astronomia's `solar.apparentLongitude()` — more accurate for terminator line at all times of year

**Satellite trails**
- When a satellite is selected, draw its last 10 minutes of propagated ECEF positions as a `THREE.Line`
- Vertex colors fading from `0x4ade80` (lime, bright) at current position to transparent at tail
- Recomputed on selection, updated every 30s
- New method: `Globe.showTrail(satrec)`, cleared by `clearSelection()`

**Dot quality**
- GEO satellites (altitude > 30,000km): dot size 1.5× base
- Debris: dot size 0.6× base, slightly dimmer color
- Payloads (default): base size

---

### Session 18 — Data Depth

**Goal:** every dot has a story.

**What ships:**

**Jonathan McDowell JCAT integration**
- Source: `https://planet4589.org/space/gcat/tsv/cat/satcat.tsv` — free, public domain
- ECS service fetches and caches this TSV on startup (< 5MB)
- New FastAPI endpoint: `GET /satellite-meta/{norad_id}` → returns JSON with:
  - `name`, `norad_id`, `owner` (country code), `launch_date`, `launch_site`, `launch_vehicle`
  - `mass_kg`, `span_m` (physical size), `shape`
  - `object_type` (PAY/R/B/DEB/UNK)
  - `ops_status` (operational, reentry, etc.)
  - `orbital_regime` (LEO/MEO/GEO/HEO/EEO/DSO)
  - `mission_type` (communications, navigation, earth observation, etc.)
- Satellite info card expanded with this data: country flag emoji, launch vehicle, mass, mission type, orbital regime label
- `api/chat.ts` updated: `get_satellite_info` tool also fetches `/satellite-meta` and includes it in the tool result → agent answers "what does this satellite do?" correctly

**Constellation grouping**
- Using JCAT constellation field + Gunter's data
- New filter pill row: Constellation view (Starlink shell 1/2/3/4/5 by altitude, GPS Block II/IIR/IIF/III, Iridium NEXT, OneWeb, etc.)
- Agent tool: `set_constellation_filter(constellation)` → highlights specific constellation on globe

**Better debris/rocket body icons**
- Use JCAT object_type to distinguish debris (red), rocket bodies (orange), payloads (blue) with different dot shapes where Three.js supports it, or at minimum distinct colors

---

### Session 19 — Feature Expansion

**Goal:** feature parity with satellite tracker sites; every feature also callable by the AI agent.

**What ships:**

**Visual pass predictor**
- User opens pass predictor panel, types a city name → Radar.com geocoding API → lat/lon
- Default cities: Melbourne, Sydney, Brisbane, Perth, Adelaide, Canberra
- Satellite arc drawn on globe: for each pass, propagate the satellite's path from AOS to LOS and draw it as a colored arc over the observer's horizon circle
- Observer horizon circle: a `THREE.RingGeometry` at the observer's lat/lon, showing the ~10° elevation cutoff
- Text list alongside the visual (start time AEST, max elevation, compass direction, duration)
- New agent tool: `predict_passes_visual(norad_id, city)` → triggers both the text result and the globe visualization

**24h ground track**
- For any selected satellite: propagate 24h × 1440 positions (1-minute steps), draw as a `THREE.Line` on the globe surface
- Different from the orbital ring (ECI): this is the true ground track accounting for Earth's rotation
- Toggleable — "Show ground track" button on the info card
- Recomputes if TLE updates

**Coverage footprint**
- For GEO/weather/comms satellites: draw a nadir-angle-based coverage circle (typically 75° half-angle for GEO)
- `THREE.RingGeometry` draped on the globe surface at the satellite's sub-satellite point
- Particularly meaningful for Optus, Intelsat, Inmarsat, weather satellites

**Advanced search filters**
- Extend SearchBar with a filter drawer: country of origin, launch year range, orbital regime, object type, constellation
- All filters powered by JCAT data loaded in Session 18
- Agent can trigger any filter: "show Russian satellites" → JCAT country code lookup → `set_category_filter`

**Permalink**
- `?sat=25544` in URL opens globe focused on NORAD 25544
- `?city=Melbourne` pre-populates pass predictor
- Share button on satellite info card copies URL to clipboard

---

### Session 20 — AI Agent Elevation

**Goal:** the AI becomes the thing no other satellite tracker has — an agent that genuinely reasons, not just looks up.

**What ships:**

**New agent tools:**
- `get_mission_info(norad_id)` — JCAT mission description, purpose, operator. Agent answers "what does this satellite actually do?"
- `get_overhead_satellites(city, min_elevation)` — returns all satellites visible right now with elevation/azimuth. Highlights them on globe.
- `check_conjunction(norad_id)` — ECS queries for close approach events. Agent warns: "in 4 hours, NORAD 25544 passes within 2km of debris object 43921."
- `compare_satellites(norad_id_1, norad_id_2)` — side-by-side comparison of two satellites' altitude, purpose, operator, inclination.
- `set_regime_filter(regime)` — "show all GEO satellites", "show only LEO", etc.

**JCAT-enriched system prompt**
- When a satellite is selected before opening chat, the system prompt is enriched with its JCAT mission data
- Agent uses real data to answer "what does this satellite do?" — not training knowledge

**Natural language constellation/country filters**
- "Show Chinese satellites" → agent resolves to JCAT country code CN → calls `set_category_filter`
- "Show all Starlink" → agent calls `set_constellation_filter('STARLINK')`
- "What's the most interesting satellite overhead right now?" → `get_overhead_satellites` + agent picks based on mission type and explains why

**Australian-specific defaults**
- Agent greets users with what's currently overhead in Australian skies (if no city preference set, defaults to Sydney)
- Pass times always shown in AEST/AEDT (computed server-side)
- The AI knows it's talking to users in Australia unless told otherwise

---

## V2 preview (out of scope for V1, planned)

**Bushfire scar detection** — the unique Australian differentiator:
- Sentinel-2 imagery fetched via Copernicus API for Australian regions
- PyTorch segmentation model (pre-trained on fire scar detection) deployed on ECS
- Burnt area overlaid on the globe as a heatmap layer
- Agent tool: `get_fire_scars(region)` → returns detected burnt areas with dates
- This is what no other satellite tracker has. A space situational awareness platform that also monitors Australian environmental disasters from orbit.

---

## Aussie Sky's identity

**Not a clone — the differences:**
1. The AI is the front door, not a sidebar. You talk to the platform. satellitemap.space has no AI.
2. Australian cities are first-class citizens in the pass predictor.
3. V2 bushfire detection makes this genuinely relevant to Australian current events.
4. The agent can explain, compare, and reason — not just display orbital numbers.
5. Open source. Public API. Designed for Australian developers, students, and amateur astronomers.

---

## What stays the same

- Three.js (not TWGL.js) — Three.js handles 30k satellites fine with InstancedMesh
- React + Vite (not Astro.js)
- Vercel for frontend + AI function
- Claude API (Haiku for tool detection, Haiku for answers)
- Conventional Commits, trunk-based development, GitHub Actions CI
- Every agent tool must have a corresponding test
- Claude is the presenter, never the calculator — tool errors → "service unavailable"
