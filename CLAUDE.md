# CLAUDE.md — Satlas working context

This file is the bootstrap context for any Claude session working on this project.

**If you (Claude) are reading this in a new session:** read this file fully before suggesting code or making changes. It is the source of truth for what we're building, what's been decided, and what's in progress.

**For mickey:** inside Claude Code, this file is auto-read at session start. For new sessions elsewhere, paste it at the start of the chat.

---

## Who I'm working with

Premaansh ("mickey") — international student doing CS at RMIT in Melbourne. Building this as a portfolio project to land a software engineering internship in Australia. Communicates concisely and redirects rather than elaborates when something doesn't resonate. Uses AI for craft and execution help, not idea generation. Has roughly 15 hours per week to put on this. No fixed deadline but wants steady momentum and a live MVP early.

Important: mickey is learning some of this stack as he builds. When you propose code, briefly explain the *why* of unfamiliar patterns. When he asks a "small" question that's actually deep, treat it as worth a real answer. Don't hedge unnecessarily.

---

## What we're building

Satlas — a real-time, open-source space situational awareness platform with an AI agent as the primary interface.

The shape:
- A live 3D Earth showing every tracked object in orbit (TLE-based, ~30k objects).
- A chat / agent interface that orchestrates backend tools to answer plain-English questions.
- A public API.
- Bushfire scar detection on Sentinel-2 imagery, as the first computer-vision use case (Australian-relevant, narratively strong).

The AI agent is the *front door*, not a feature on the side. Every user question goes through it, and it decides which combination of services to call. This is the architectural commitment we don't break.

---

## Why this project (so we don't drift)

The goal is *not* to ship a perfect SSA platform. The goal is a portfolio piece that:
1. Looks visually striking on first scroll (3D globe).
2. Demonstrates technical breadth: full-stack web, scientific Python, ML, agent orchestration, AWS, observability.
3. Has a defensible AI integration (agent with tools, not chatbot wrapper).
4. Is live, runs reliably, and tells a clear story in 30 seconds.

If a feature doesn't serve those goals, it doesn't ship in the portfolio version. We can always add things later.

---

## Architecture (committed)

```
[ Frontend: React + Three.js + Tailwind ]
                |
[ AI Agent: Claude API with tool use ]   ← the orchestrator
                |
   +------------+------------+------------+
   |            |            |            |
[Orbital]   [Vision]    [Knowledge   [Alerts &
 compute     pipeline    RAG]         scheduler]
 FastAPI     PyTorch     pgvector     SQS / cron
 skyfield    Sentinel-2  Postgres
```

All services run on AWS (ECS Fargate). A single Postgres instance handles relational, vector (pgvector), spatial (PostGIS), and time-series (TimescaleDB) needs.

---

## Tech stack — locked-in choices

- **Frontend:** TypeScript + React + Vite + Tailwind. 3D via **Three.js**.
- **Agent:** Anthropic Claude API. Tool use is the pattern. Use latest available Haiku for tool-detection/routing; Haiku or Sonnet for streaming answer turns.
- **Orbital service:** Python 3.11, FastAPI, `skyfield` for high-level orbital mechanics, `sgp4`/`satellite.js` directly when speed matters.
- **API gateway / general backend:** Go with chi or echo. *Defer this until V1* — for MVP, the frontend can call FastAPI directly.
- **Database:** PostgreSQL 15+ with `pgvector` and PostGIS extensions. TimescaleDB for orbit history (V2).
- **Vision:** PyTorch + Hugging Face. Start with a pre-trained Sentinel-2 segmentation model (e.g. for fire scars). Fine-tune later if needed.
- **Infra:** AWS (ECS Fargate for services, S3 for imagery cache, CloudFront for static frontend, RDS for Postgres). Terraform from day 1.
- **CI/CD:** GitHub Actions. Docker images to ECR.
- **Observability:** OpenTelemetry traces, Sentry for errors, basic CloudWatch dashboard.

---

## Repo structure (target)

```
satlas/
├── README.md
├── CLAUDE.md                # this file
├── docs/
│   └── superpowers/
├── apps/
│   ├── web/                 # Vite + React frontend
│   ├── orbital/             # Python FastAPI + skyfield
│   ├── vision/              # Python ML pipeline (V2)
│   └── api/                 # Go gateway (V1+)
├── packages/
│   └── shared/              # Shared types / OpenAPI specs
└── infra/
    └── terraform/
```

---

## Conventions

- **Monorepo** layout (above). Avoid premature splitting into multiple repos.
- **Commit messages:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- **Branching:** trunk-based; feature branches merged via PR with squash merge.
- **Tests:** every new tool the agent can call needs a test of the tool itself + a test of the agent calling it correctly.
- **Code style:** Prettier for TS/JS, Black + Ruff for Python, gofmt for Go. All enforced in CI.
- **Secrets:** AWS Secrets Manager or env vars; `.env.example` checked in. Never commit real keys.
- **Documentation:** if a non-obvious design decision is made, append it to the Decisions log in this file in the same PR.

---

## Active scope (update this each session)

**Current phase:** Session 34 complete. Session 35 — V2 direction decision.

**Next milestone:** V2 direction decision. Options: (A) alert subscriptions, (B) conjunction analysis, (C) vision pipeline / bushfire scars, (D) vector RAG over space docs. r/Starlink post from S33 may surface feedback — check before deciding.

**Sessions 1–20 (complete, stable):** See `docs/decisions-archive.md` (all ADRs through S25). Key phases: globe + ISS (S1-5), AI agent + tools (S6-10), CI/CD + search (S11-15), AWS infra (S16-19), PassPanel + satcat fix (S20).

**Session 34 completed tasks:**
- [x] Pass visibility scoring — sky condition (Day/Civil/Nautical/Astronomical/Night), satellite illumination (cylindrical shadow model), visibility score 0–100%; computed at pass midpoint in both `api/pass.ts` and `api/chat.ts`
- [x] Pass visibility shown in PassPanel — coloured label (Excellent=cyan, Good=green, Fair=amber, Poor/None=dim); "Daytime" / "In shadow" instead of generic "Not visible"
- [x] Pass visibility in AI agent — system prompt updated with per-line format; agent formats sky_condition + visibility_label + score in pass answers
- [x] Overhead list uncapped — removed `.slice(0, 25)` from `getOverheadSatellites`; `Globe.test.ts` updated (30 sats, not 25)
- [x] Search dropdown catalog-name hint — persistent footer note in dropdown: "Some satellites use catalog names — try their NORAD ID if a name search misses"
- [x] DevNotes component — toggleable "i" button (bottom-right, below chat button); `DEV_NOTES` array is the single edit point; `hidden={chatOpen}` prevents overlap; replaces old static banner

**Session 33 completed tasks:**
- [x] README roadmap fixed — country borders moved from V2 TODO to V1 complete; test count 75 → 104; "What's working now" updated with borders/CountryPanel/search fly-to
- [x] API docs — `/api/tles` alias documented in `/api/catalog` section
- [x] Satellite tick rate `FIELD_TICK_MS` 100ms → 50ms — positions update at 20Hz instead of 10Hz
- [x] Camera damping `dampingFactor` 0.05 → 0.07 — globe stops more crisply after a drag
- [x] `getSunDirection` reuses a `_sunDir` Vector3 instead of allocating one per frame at 60fps
- [x] Satellite dots: `SphereGeometry(0.005, 6, 6)` → `PlaneGeometry(1,1)` + billboard ShaderMaterial — perfect circles at 2 triangles per instance vs 72; vertex shader extracts position/scale from instanceMatrix, offsets in camera space; fragment shader discards outside circle
- [x] Dot anti-aliasing: `fwidth(dist)`-based AA — one-pixel soft edge at any zoom level; previous `smoothstep(0.6, 1.0)` was 40% of radius, blurry when zoomed in
- [x] Dot colour: `DEFAULT_COLOR` `0x60a5fa` (blue-400) → `0x00d4ff` (accent cyan)

**Session 32 completed tasks:**
- [x] API docs — GitHub/star CTA buttons added to Overview section; text sizes bumped (table headers 7px→9px, nav items 10px→12px, footer links 9px→12px)
- [x] Vercel domain misconfiguration fixed — `satlas.app` was redirecting to `www` (307); corrected in dashboard: `satlas.app` → Production, `www.satlas.app` → 301 → `satlas.app`
- [x] `Globe.onCatalogError` callback — fires when `fetchSatelliteCatalog` throws; `useGlobe` exposes `catalogError` state
- [x] GlobeView error state — "Catalog unavailable — click to retry" (`window.location.reload`) replaces infinite "Loading catalog…" spinner
- [x] Search overflow indicator — `matchSatelliteQuery` now counts all matches in a single pass and returns `{ results, total }`; SearchBar shows "+N more — refine your search" when total > 8
- [x] Catalog fetch timeout 10s → 25s — Vercel cold start + Space-Track login + 5MB fetch can take 12–15s; 10s was too tight
- [x] `/api/tles` alias — re-exports `/api/catalog` handler; frontend now fetches `/api/tles` to avoid uBlock Origin false-positive (`/api/catalog` matches ad-tracker filter rules, causing NS_BINDING_ABORTED at 0ms for affected users); `/api/catalog` stays live for public API consumers

**Session 31 completed tasks:**
- [x] Vercel Analytics (`@vercel/analytics`) added to `apps/web` — page views, visitors, referrers live on Vercel dashboard
- [x] Vercel Speed Insights (`@vercel/speed-insights`) added — Core Web Vitals (LCP, FID, CLS) tracking
- [x] PassPanel scroll clipping — structural fix: `flex flex-col` on outer wrapper + `flex-1 overflow-y-auto` on results; eliminates `max-h-[50dvh]` vs `calc(50dvh - 2rem)` clip mismatch
- [x] CountryPanel overhead list scroll clipping — `pb-3` + structural fix applied
- [x] Country overhead filter: all categories off → `null` mask in `getOverheadSatellites` → shows all types; some on → filtered to active categories only
- [x] CountryPanel empty state: "No satellites overhead (>10°)" replaces misleading "Loading catalog…"
- [x] `api/satellite-info.ts` Vercel proxy — exposes `GET /api/satellite-info?query=` publicly (proxies to orbital service)
- [x] `api/satellites.ts` — `GET /api/satellites?q=&category=&limit=` searches catalog by name substring or NORAD ID; classifies by category; 2-min cache
- [x] `api/overhead.ts` — `GET /api/overhead?latitude=&longitude=&min_elevation=&category=&limit=` propagates full catalog with satellite.js (GMST once) and returns overhead sats sorted by elevation; 15-sec cache
- [x] API docs page (`/docs`) — full redesign: left nav sidebar, response schema tables, copy buttons, all 6 endpoints documented, pass response fields corrected

**Session 30 completed tasks:**
- [x] `CountryHighlightMesh` fill re-enabled: `subdivideRing` + `refineTris` in `sphereUtils.ts` — edges subdivided to ≤4° before earcut, large interior triangles recursively split
- [x] `CountryFillMesh` void fixed: same `subdivideRing` + `refineTris` applied via shared `sphereUtils.ts`
- [x] SLERP → flat lon/lat interpolation: SLERP midpoints bulge outward at high latitudes (Russia ~3-5° into Arctic), replaced with flat `[lon0 + (lon1-lon0)*t, lat0 + (lat1-lat0)*t]` in both `subdivideRing` and `refineTris`
- [x] MultiPolygon stacking fix: stencil buffer (`NotEqual/Replace`) prevents transparent fill fragments from accumulating additively across sub-polygons (Russia's islands no longer show bright overlap bands)
- [x] Deselect on panel close: `Globe.clearCountryHighlight()` wired through `useGlobe` → `GlobeView.onClearHighlightReady` → `App.tsx` `dismissCountry()` helper — closing CountryPanel now clears the globe highlight ring

**Sessions 21–29 (complete, stable):** Key phases: chat polish + overhead tool (S21–22), NORAD ID fix (S23), frontend redesign (S25–26), catalog scale + search fly-to (S27), country borders + CountryPanel (S28–29). All ADRs in `docs/decisions-archive.md`.

**Live endpoints:**
- Frontend: `https://satlas.app` (also `https://getsatlas.vercel.app`)
- API docs: `https://satlas.app/docs`
- ALB (orbital API): `https://api.satlas.app` (HTTP redirects to HTTPS)
- CloudFront catalog: `https://dgsll6twimcwl.cloudfront.net/catalog.tle`
- CloudFront satcat: `https://dgsll6twimcwl.cloudfront.net/satcat.json`

**No blockers.**

---

## Decisions log (ADR-lite)

Format: date, decision, rationale, rule to remember.

Sessions 1–25 decisions archived in `docs/decisions-archive.md`.

- **2026-05-13 — Architectural rule: Claude is the presenter, never the calculator.** Claude must not compute, infer, or guess any data value shown to the user — not time, not timezone offsets, not satellite positions, not pass windows. Every value must come from a backend tool result or a pre-computed server-side value. If data is missing, say unavailable. Violation that prompted this rule: passed UTC time and let Claude infer the Melbourne offset → got AEST/AEDT wrong. Fix pattern: compute it server-side, hand Claude the answer to format.

- **2026-05-13 — Globe camera highlight: never include tools in the streaming answer turn.** Second Claude call had `tools: TOOLS`. Haiku called `highlight_on_globe` in the streaming turn; the streaming loop only handles `text_delta` events, so the tool call was silently dropped. Fix: remove `tools` from the answer turn entirely. Rule: if the answer turn must produce text, pass no tools — force text output, not a tool call.

- **2026-05-13 — Chatbot reliability: haiku for tool-detection, Vercel Hobby 10s hard cap.** `maxDuration: 60` is silently ignored on Hobby tier — 10s is the real limit. Sonnet tool-detection consumed 3–5s. Fix: `claude-haiku-4-5-20251001` for the tool-detection turn (~1s), Sonnet for streaming answer. Rule: use the fastest model capable of the task; tool-detection is routing, not reasoning. Always budget total latency (detect + execute + stream) against the hard platform limit.


- **2026-05-25 — Session 31: Scroll clip fix — `flex flex-col` on outer wrapper + `flex-1` on scroll container; `max-h-[50dvh]` inside `maxHeight: calc(50dvh - 2rem)` clips the last row.** The S22 fix set `max-h-[50dvh]` on results — correct for `flex-1` not resolving, but created a new bug: the outer wrapper clips at `50dvh - 2rem`, so the bottom `2rem` of the `max-h-[50dvh]` scroll container is always in the clipped zone. When scrolled to bottom, the last row lands exactly there. Fix: add `flex flex-col` to the outer motion.div; PassPanel outer div uses `flex-1` (now resolves because parent is a real flex container); results div uses `flex-1 overflow-y-auto` — scroll area is bounded by the flex chain, not an independent `max-height`. Rule: when a scroll container is nested inside a `maxHeight + overflow-hidden` wrapper, make the wrapper a `flex flex-col` so the child can use `flex-1` to fill exactly the available space.

- **2026-05-25 — Session 31: Country overhead list shows all sats when all categories off — "no filter" is not the same as "empty filter".** `getOverheadSatellites` always passed `activeCategoryMask` to `computeOverhead`. When all category toggles are off, the mask is all-zeros — every satellite is skipped, returning `[]`. The panel showed "Loading catalog…" with no sats. Fix: pass `null` (no mask) when `activeCategories.size === 0`. "All off" maps to "no filter" not "filter to nothing". Rule: a UI "all off" toggle state should be treated as "show everything" — never pass an all-zero mask to a filter function; use null/undefined to signal no filter.

- **2026-05-25 — Session 31: `/api/overhead` computes GMST once outside the loop — same pattern as chat.ts `toolFindSatellitesOverhead`.** Computing `satellite.gstime(now)` inside a 31k-iteration loop re-computes the sidereal time 31k times. Since all satellites are propagated to the same instant, one `gstime` call is enough and the value is passed into `eciToEcf` for every satellite. This was already established in session 18 (`find_satellites_overhead` tool) but bears repeating: any bulk position snapshot must share a single GMST value. The function uses a 2-min in-process TLE cache (same pattern as `pass.ts`) so warm requests skip the CloudFront fetch entirely.

- **2026-05-25 — Session 31: `/api/satellites` uses integer NORAD ID comparison — same fix as the S23 satcat leading-zero bug.** TLE catalog stores NORAD IDs zero-padded to 5 digits (`'06707'`). A query of `q=6707` (no leading zero) would fail a string equality check. Fix: if the query is all digits, parse both sides with `parseInt` before comparing — `parseInt('06707') === parseInt('6707')` is true. Rule: NORAD ID comparisons are always integer equality, never string equality.


- **2026-05-23 — Session 27: NORAD_OWNER_OVERRIDES for multinational satellites where Space-Track country code is misleading.** Space-Track assigns country codes per the nation that launched or funded the first module — not per the current operating partnership. ISS ZARYA is coded `CIS` (Russia), which resolves to "Russia" — misleading for a 5-nation program. Rather than altering `OWNER_MAP` (which would affect other Russian satellites), added a `NORAD_OWNER_OVERRIDES: Record<string, string>` map keyed by unpadded NORAD ID string. Override wins over `OWNER_MAP`. Cache bumped to v6. Rule: for satellites where the owning-nation code in Space-Track is accurate for the catalog but misleading for users, use per-NORAD overrides rather than modifying the shared OWNER_MAP.

- **2026-05-23 — Session 27: Owner field uses `col-span-2` to allow long strings to wrap.** The 2-column catalog grid constrained the owner cell to roughly half the card width. With `truncate`, long strings like "ISS Partnership (NASA · Roscosmos · ESA · JAXA · CSA)" were silently cut off. Making the owner row `col-span-2` gives it the full card width; removing `truncate` allows wrapping. All other fields remain in the 2-column layout. Rule: for variable-length text fields in a fixed grid, span the full width rather than truncating — silent truncation is worse than a slightly taller card.

- **2026-05-23 — Session 27: Earth day/night terminator used view-space normals — always compute world-space.** `normalMatrix` in GLSL is the transpose-inverse of the model-view matrix, so `normalMatrix * normal` is in camera space. `sunDirection` is passed as a world-space vector. `dot(viewSpaceNormal, worldSpaceDirection)` produces a result that rotates with the camera — the lit face of Earth orbited the viewer instead of tracking the sun. Fix: `normalize(mat3(modelMatrix) * normal)` gives the surface normal in world space. Rule: whenever a GLSL uniform is in world space, the varying it's dotted against must also be in world space — never use `normalMatrix` for lighting against world-space directions.

- **2026-05-23 — Session 27: Sun sprite uses canvas `lighter` compositing for spike accumulation.** Three nested `SphereGeometry` meshes with additive blending showed hard sphere edges visible from any angle. Replaced with a `THREE.Sprite` (always faces camera) + programmatic 512×512 canvas texture. The eight diffraction spikes are drawn with `globalCompositeOperation = 'lighter'` so all eight diamond shapes accumulate brightness at the center — the intersection naturally becomes the bright core without a separate composite step. A tight radial gradient for the core is drawn last with `source-over`. Rule: for star/light source effects, use a Sprite (not a Mesh) so it always faces the camera; use canvas `lighter` compositing to accumulate overlapping glow layers.

- **2026-05-23 — Session 27: Debris off by default; debris toggle is separate from category pills.** Debris is the largest category (12k+ objects) but the least interesting to most users. Showing it on landing overwhelms the globe. Default changed to `ALL_CATEGORIES.filter(c => c !== 'DEBRIS')`. A dedicated Debris toggle sits above the category pills so the choice is visible — users aren't confused about why objects are missing. The toggle and the Debris pill are wired to the same `toggleCategory` handler so they stay in sync. Rule: default-off a category if its presence overwhelms the default view; always make the exclusion obvious with a visible control.


- **2026-05-24 — Session 28: `GeoJSONFeature.properties` must be `Record<string, unknown> | null`.** GeoJSON spec (RFC 7946 §3.2) allows `null` properties. Natural Earth 50m data includes features with `null` properties. TypeScript narrowing (`properties?.NAME`) handles it but the type must be declared nullable or the compiler won't accept the access pattern. Rule: always type GeoJSON properties as `Record<string, unknown> | null` — `null` features appear in real datasets.

- **2026-05-24 — Session 28: `_bordersLoading` guard prevents GPU memory leak on rapid toggle.** Without the guard, a second `setBordersVisible(true)` call before the fetch resolves creates a second `CountryBorderMesh` (both added to the scene), and `setBordersVisible(false)` only removes the second one — the first leaks. Fix: early-return if `_bordersLoading` is true; `finally` block resets the flag so a failed load doesn't permanently block re-enable. Rule: any async method that creates GPU resources must be guarded against concurrent invocations; always reset the guard in `finally`.

- **2026-05-24 — Session 28: `onCanvasClick` early-exit must check all click consumers, not just one.** Original code: `if (!this.onSatelliteClick) return` — silently blocked country clicks when only `onCountryClick` was wired (e.g. in tests or standalone country-click mode). Fix: `if (!this.onSatelliteClick && !this.onCountryClick) return`. Rule: early-exit guards in event handlers must account for every registered consumer — a guard checking only one consumer silently swallows events for the others.

- **2026-05-24 — Session 28: Overhead elevation uses `sinElev = (dot(P,O)−1) / |P−O|`, not just `dot(P,O) > 0`.** `dot > 0` checks hemisphere membership but doesn't give elevation angle, and is wrong for the satellite's altitude (the horizon from an elevated point is different from horizon from the surface). The formula `sinElev = (dot(P,O) − 1) / |P − O|` is exact: it computes the angle between the line-of-sight vector and the local horizontal plane at the observer. `Math.asin` requires clamping to `[-1, 1]` to avoid NaN from floating-point rounding. Rule: for elevation from a point on a sphere, use the exact formula — `dot > 0` is only a rough hemisphere check.

- **2026-05-24 — Session 28: CountryHighlightMesh should import `GeoJSONFeature` from CountryBorderMesh, not re-define it.** First pass defined a private `Feature` interface inside CountryHighlightMesh — looser typing that allowed subtle mismatches. Fix: import the shared `GeoJSONFeature` type exported from CountryBorderMesh. Rule: types that describe shared data structures (GeoJSON features, TLE records) should be defined once and imported — parallel private type definitions diverge silently.

- **2026-05-24 — Session 29/30: Flat WebGL triangles dip below sphere surface — fix: subdivide edges to ≤4° using flat lon/lat interpolation before earcut.** For a chord connecting two sphere-surface points at angular separation θ, the midpoint of the chord is at r_mid = r * cos(θ/2). At r=1.0022 (CountryHighlightMesh), the midpoint dips below r=1.0 (Earth surface) when θ > 7.5°. Two approaches tried and reverted in Session 29: (1) earcut on flat (lon/lat) — interior black, edges cyan ring; (2) centroid fan — starburst spike artifacts. Session 30 fix: `subdivideRing` + `refineTris` in `sphereUtils.ts` — insert intermediate points on boundary edges > 4°, then recursively split any earcut triangle whose longest edge still exceeds 4°. **Key correction (Session 30):** Session 29 proposed SLERP for interpolation. SLERP was implemented and found to extend fill outside the geographic boundary at high latitudes (Russia's 80°N coast extended ~3-5° into the Arctic Ocean). Root cause: great-circle arc between two boundary points at 80°N has its midpoint at ~83°N — outside the actual polygon. GeoJSON polygons are defined in flat lon/lat; flat linear interpolation `(lon0 + (lon1-lon0)*t, lat0 + (lat1-lat0)*t)` correctly follows the boundary. Depth test still passes: each subdivided vertex is projected onto the sphere at radius r via `toVec3`. Rule: on a globe at r=1+ε, subdivide edges to max 4° before triangulating; use flat (not great-circle) interpolation so fill follows the geographic polygon boundary.

- **2026-05-24 — Session 29: Country hover in border mode — geoContains on mousemove is fast enough at 40ms throttle.** d3-geo `geoContains` checks all ~250 Natural Earth features per mousemove (throttled 40ms). Each check uses ray-casting on the polygon vertices. Total: ~250 × avg 300 vertices ≈ 75k comparisons per 40ms. Measured as non-blocking on modern browsers. `hoveredCountryName` tracks last name so the callback only fires on name change (no setState churn). Rule: for globe hit-testing on mousemove at 40ms, geoContains over 250 Natural Earth 50m features is fast enough; don't pre-filter or cache.

- **2026-05-24 — Session 29: CSS2DRenderer screen-burn fix — hide domElement, not individual labels.** When `setBordersVisible(false)` is called, setting each `CSS2DObject.visible = false` doesn't flush the DOM — the renderer's DOM elements persist from the last `render()` call, frozen in their last visible state. Setting `labelRenderer.domElement.style.display = 'none'` hides the entire overlay instantly with no additional render pass needed. Rule: to clear a CSS2DRenderer completely, hide its `domElement` — don't rely on per-object visibility flags without a follow-up render call.

- **2026-05-24 — Session 29: Left column panel stacking uses a single shared wrapper `flex flex-col gap-2`.** Two separate `absolute` divs for SatInfoCard/PassPanel and CountryPanel would overlap. Fix: a single wrapper div `absolute top-10 left-3 mt-2 w-64 z-20 flex flex-col gap-2` contains both AnimatePresence blocks — panels stack vertically with a consistent 0.5rem gap. PassPanel maxHeight reduced to `calc(50dvh − 2rem)` so CountryPanel always has visible space when both are open. Rule: for multiple independently-animated panels that should stack, use a single flex column wrapper — two separate absolute divs will overlap.

- **2026-05-24 — Session 30: Stencil buffer prevents transparent highlight fill from stacking on MultiPolygon countries.** Russia, Canada, and other MultiPolygon countries have 10-100+ sub-polygons (mainland + islands). With `opacity: 0.25` and `transparent: true`, each sub-polygon's fill writes to the same screen pixels — fragments accumulate additively → overlapping regions become 0.5, 0.75, 1.0 opacity. Russia's highlight had a bright solid band through the mainland where island polygon fills stacked. Fix: `stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp` on the fill material. Three.js clears stencil to 0 each frame (autoClearStencil defaults to true). First fill fragment at any screen pixel writes stencil=1; all subsequent fragments at that pixel fail NotEqual and are discarded → each screen pixel rendered exactly once. Rule: for any set of transparent fill meshes that could overlap on screen (MultiPolygon countries, feature sets with shared border regions), use stencil NotEqual/Replace to prevent additive blending artifacts.

- **2026-05-24 — Session 30: Closing CountryPanel left the globe highlight ring active — React unmount does not clean up Three.js state.** `setSelectedCountry(null)` dismissed the React panel but `CountryHighlightMesh.clear()` was never called — the cyan border ring persisted on the globe after the panel closed. Fix: added `Globe.clearCountryHighlight()` → `useGlobe` hook return value → `GlobeView` exposes it via `onClearHighlightReady` callback ref pattern → `App.tsx` stores it in `clearCountryHighlightRef`. All dismiss paths (close button, mobile sheet `onOpenChange`, selecting a different country) now call `dismissCountry()` which calls both `setSelectedCountry(null)` and `clearCountryHighlightRef.current?.()`. Rule: whenever a React state controls a Three.js object's lifecycle, the React teardown path must explicitly call the Three.js cleanup method — React does not know about WebGL resources.

- **2026-05-24 — Session 30: `sphereUtils.ts` shared between CountryHighlightMesh and CountryFillMesh — single source of subdivision truth.** CountryFillMesh originally had the same flat-triangle depth problem (background country fills showed voids for large countries). Extracting `subdivideRing`, `refineTris`, `toVec3`, and `arcDeg` into `sphereUtils.ts` meant one fix in one place covers both the highlight fill and the background fill. Previously each mesh had its own partial version of these helpers. Rule: geometry helpers that operate on the same data model (lon/lat → sphere coordinates) belong in a shared module — duplicated helpers diverge silently as fixes are applied to only one copy.

- **2026-05-25 — Session 32: `/api/catalog` matches uBlock Origin ad-tracker filter rules — use `/api/tles` for the frontend fetch.** Firefox users with uBlock enabled saw `NS_BINDING_ABORTED` at 0ms on the `/api/catalog` fetch — the request was killed before it hit the network. Root cause: the word "catalog" appears in uBlock's filter lists targeting product-catalog trackers. Fix: `vercel.json` rewrite routes `/api/tles` → `/api/catalog` at the Vercel edge layer; `celestrak.ts` fetches `/api/tles` by default. `/api/catalog` stays live for public API consumers. **Two failed attempts before the working fix:** (1) `api/tles.ts` with `export { default, config } from './catalog'` — re-export didn't surface `config` to Vercel bundler. (2) `api/tles.ts` with explicit `import catalogHandler from './catalog'` — Vercel serverless functions cannot import from sibling function files at runtime (500 error). Correct approach: `vercel.json` rewrite is processed at the edge router before any function code runs, so no import resolution is needed. Rule: to alias a Vercel serverless function URL, use a `vercel.json` rewrite — never import between files in `api/` as cross-function imports fail at runtime.

- **2026-05-25 — Session 32: Catalog fetch timeout 10s → 25s.** A Vercel cold start for `/api/catalog` requires: Space-Track login (~2–3s) + TLE fetch (~5MB, 3–8s) = up to 12–15s. The 10s `AbortSignal.timeout` was too tight — first-time visitors (no localStorage cache) on slow connections reliably hit it. 25s matches the Vercel `maxDuration: 30` serverless limit. Warm requests are served from Vercel Edge cache in <100ms so the longer timeout has no UX cost for repeat visitors.

- **2026-05-25 — Session 32: `onCatalogError` callback prevents infinite "Loading catalog…" spinner.** When both catalog sources fail (`/api/catalog` and CelesTrak GROUP=active), `fetchSatelliteCatalog` throws and `initCatalog` catches it silently — `onCatalogRefresh` is never called, so `isLoading` stays false and `satelliteCount` stays 0, showing "Loading catalog…" forever. Fix: added `onCatalogError: (() => void) | null` to Globe, wired through `useGlobe` as `catalogError: boolean`. GlobeView shows "Catalog unavailable — click to retry" with `window.location.reload`. Rule: any async data source that can fail must surface the failure to the UI — silent error swallowing produces misleading loading states.

- **2026-05-25 — Session 32: `matchSatelliteQuery` counts all matches in a single pass.** The original implementation broke early at `maxResults` — it had no way to tell callers how many total matches existed. Instead of a second pass (another 31k iterations), we continue the loop after the results array is full, incrementing `total` without pushing to `results`. This gives an exact count at zero extra cost. Return type changed from `SearchResult[]` to `{ results: SearchResult[], total: number }`. Rule: when a search function has a result limit, count all matches in the same loop pass — don't run a separate count query.

- **2026-05-25 — Session 32: `vercel.json` redirect conflicted with Vercel dashboard domain config — dashboard wins.** Added a `redirects` rule in `vercel.json` to redirect `www.satlas.app → satlas.app`. This created a redirect loop: the Vercel dashboard already had `satlas.app → www.satlas.app` (misconfigured from original setup), and the `vercel.json` rule sent `www → satlas.app`. Safari showed "can't open page". Fix: reverted `vercel.json` immediately; fixed the Vercel dashboard to set `satlas.app → Production` and `www.satlas.app → 301 → satlas.app`. Rule: never add redirect rules to `vercel.json` for domains also managed in the Vercel dashboard — dashboard rules and `vercel.json` rules interact unpredictably and can create loops.

- **2026-05-25 — Session 33: Billboard shader replaces SphereGeometry for satellite dots — 36× fewer triangles, perfect circles at any angle.** `SphereGeometry(0.005, 6, 6)` with 6 segments produces a visible hexagon. Increasing segments to 16+ fixes the shape but multiplies triangle count (72 → 512 per instance × 31k = ~16M triangles). Fix: `PlaneGeometry(1, 1)` (2 triangles) + custom ShaderMaterial. Vertex shader extracts world position and scale from `instanceMatrix`, then offsets the quad vertices in camera space — the quad always faces the viewer (billboard). Fragment shader discards pixels outside the unit circle radius. Hit-test radius in Globe.ts unchanged (`SPHERE_RADIUS = 0.005`). Per-instance color via `instanceColor` continues to work through Three.js's `USE_INSTANCING_COLOR` define. Rule: for point-like markers in a 3D scene, prefer a billboard quad + circle shader over a low-poly sphere — same visual, fraction of the geometry.

- **2026-05-25 — Session 33: `fwidth` for AA instead of a fixed smoothstep range.** The initial billboard shader used `smoothstep(0.6, 1.0, dist)` — a fade spanning 40% of the dot's radius. At small screen sizes this anti-aliases well; zoomed in, the fade zone is many pixels wide and the dot looks blurry. Fix: `float fw = fwidth(dist); smoothstep(1.0 - fw, 1.0 + fw, dist)`. `fwidth` returns the screen-space derivative of `dist` — exactly one pixel wide at the current zoom level. Result: crisp edges when zoomed in, still smooth at distance. Rule: for resolution-independent anti-aliasing in a fragment shader, use `fwidth` to measure one pixel's worth of the varying rather than a hardcoded smoothstep range.

- **2026-05-26 — Session 34: Pass visibility uses Meeus solar position + cylindrical shadow model at pass midpoint.** Solar position via Meeus simplified: mean longitude L0, mean anomaly M, equation of center C, ecliptic obliquity eps → sun ECI unit vector; ±0.01° for near-future dates, accurate enough for sky condition bucketing. Shadow check: `proj = dot(satPos, sunHat)`; satellite in shadow if `proj < 0` AND `|satPos|² - proj² < R_earth²`. Sky condition from sun elevation at observer (via GMST rotation): Day >0°, Civil −6–0°, Nautical −12–−6°, Astronomical −18–−12°, Night <−18°. Visibility score: `skyFactor × elevFactor × 100` where skyFactor ∈ {0, 0.08, 0.35, 0.65, 0.90} and elevFactor = 0.5 + 0.5×min(1, maxElev/90). Visibility evaluated at pass midpoint — orbital service returns start/end but not peak time; midpoint is within ~60s of max elevation for a 3–5 min pass. Rule: compute all visibility data server-side; never ask the AI to infer day/night or illumination.

- **2026-05-26 — Session 34: Solar helpers duplicated between `api/pass.ts` and `api/chat.ts` — Vercel function isolation.** Vercel serverless functions cannot import from sibling `api/` files at runtime (established in S32 ADR). The solar helpers (`toJd`, `sunEciUnit`, `sunElevationDeg`, `inEarthShadow`, `skyCondition`, `computeVisibilityScore`) total ~50 lines. Duplicated with `_` prefix in `api/chat.ts`. The correct long-term fix if the logic grows: move helpers into `apps/web/src/lib/` or a shared package that each function bundles independently. Rule: accept the duplication rather than fighting Vercel's isolation model — cross-`api/` imports always fail at runtime.

- **2026-05-26 — Session 34: DevNotes "i" button replaces static banner; `hidden={chatOpen}` prevents overlap.** The old banner used `useState` initialised from `localStorage` — dismissed once, gone forever; no way to resurface. New pattern: stateless toggle (opens each session); `DEV_NOTES: DevNote[]` array in `DevNotes.tsx` is the single edit point for developer messages; adding a new note just requires pushing to the array. Panel positioned `right-20` (80px from right) to clear the 48px button column at `right-4`. `hidden={chatOpen}` passed from App.tsx — hides the entire component when chat is open rather than z-index fighting. Rule: for developer messages that may need to grow over time, use a data-driven component (`DEV_NOTES` array) rather than hardcoded JSX; keep the toggle stateless so notes are always reachable.

- **2026-05-26 — Session 34: Overhead `.slice(0, 25)` cap removed — elevation filter is the right gate, not an arbitrary count.** `computeOverhead` filters by elevation angle (default ≥0°; typically ≥10° in UI) before sorting — only satellites geometrically above the observer are returned. The `.slice(0, 25)` in `getOverheadSatellites` was added as a defensive UI guard but hides real data (Australia can have 60–80+ simultaneous overhead satellites). Removed the cap; `Globe.test.ts` test updated from `toHaveLength(25)` to `toHaveLength(30)`. Rule: let the physics (elevation filter) determine the result set; don't add an arbitrary count cap on top of a correctly-filtered query.

---

## Out of scope (so we don't drift)

- Mobile app (until V3 at earliest)
- Real-time satellite imagery streaming (we cache and serve recent imagery, not live)
- Anything requiring Space-Track.org elevated access
- Defence-related features (visa-incompatible)
- Payment / subscription features
- User accounts beyond simple alert-subscription email capture

---

## How to bootstrap a new chat

When mickey opens a new conversation:

1. He pastes this file's current contents (Claude Code auto-reads it).
2. He says where we left off (or asks Claude to figure it out from "Active scope").
3. For the full session context prompt for the next session, see `docs/session-34-bootstrap.md`.

This file is the contract. If something here is wrong or stale, fix the file before fixing the code.

---

## Notes for the assistant

- Don't propose framework changes (e.g. swap React for Vue) without explicit reason.
- Don't suggest abandoning the AI agent layer — that's the architectural commitment.
- When a problem is genuinely outside scope, say so directly and offer to log it for V3.
- Keep responses concise. Prose over bullets unless listing genuinely parallel things.
- If asked to write code, follow the conventions section above.
- **Document everything, including failures.** Every wrong turn, failed attempt, and multi-step debugging journey gets an ADR entry in the Decisions log. This is a portfolio project — the journey matters as much as the result. Never omit the mistakes.
- **Keep CLAUDE.md under 40,000 characters.** If it grows past that, move session ADR entries to `docs/decisions-archive.md` and link to it.
- **Keep docs in sync.** At the end of every session: update Active scope, add ADR entries for any non-obvious decisions, update `docs/session-NN-bootstrap.md` for the next session.

---

## Docs map — what lives where

| File | What it contains |
|------|-----------------|
| `CLAUDE.md` | Master context: project goal, architecture, tech stack, active scope, decisions log. Update every session. |
| `docs/session-21-bootstrap.md` | Session 21 bootstrap (historical). |
| `docs/session-22-bootstrap.md` | Session 22 bootstrap (historical). |
| `docs/session-23-bootstrap.md` | Session 23 bootstrap (historical). |
| `docs/session-24-bootstrap.md` | Session 24 bootstrap (historical). |
| `docs/session-25-bootstrap.md` | Session 25 bootstrap (historical). |
| `docs/session-29-bootstrap.md` | Session 29 bootstrap (historical) — spherical triangulation blocker analysis. |
| `docs/session-30-bootstrap.md` | Session 30 bootstrap (historical). |
| `docs/session-31-bootstrap.md` | Session 31 bootstrap (historical). |
| `docs/session-32-bootstrap.md` | Session 32 bootstrap (historical). |
| `docs/session-33-bootstrap.md` | Session 33 bootstrap (historical). |
| `docs/session-34-bootstrap.md` | Session 34 bootstrap — pass visibility, DevNotes, overhead uncap. |
| `docs/decisions-archive.md` | ADR entries from Sessions 1–17, migrated to keep CLAUDE.md under 40k. |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | Implementation plans. One file per session/feature. |
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | Design specs produced during brainstorming sessions. |
| `CHANGELOG.md` | User-facing change log. Updated when a session ships something visible. |
| `README.md` | Public-facing project overview. What it does, how to run it locally, deploy notes. |
