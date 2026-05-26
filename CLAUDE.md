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

**Current phase:** Session 37 complete. Session 38 — V2 direction decision pending.

**Next milestone:** V2 direction decision. Options: (A) alert subscriptions, (B) conjunction analysis, (C) vision pipeline / bushfire scars, (D) vector RAG over space docs. (C) is the strongest portfolio differentiator; (A) is quickest to ship.

**Sessions 1–20 (complete, stable):** See `docs/decisions-archive.md` (all ADRs through S30). Key phases: globe + ISS (S1-5), AI agent + tools (S6-10), CI/CD + search (S11-15), AWS infra (S16-19), PassPanel + satcat fix (S20).

**Session 37 completed tasks:**
- [x] Mobile touch hit-test fix — `TOUCH_MIN_RADIUS_PX = 18`; `_lastInputWasTouch` flag set in `onCanvasTouchStart` and cleared in `onCanvasMouseDown`; touch clicks use looser drag threshold (12px² vs 5px²) and nearest-screen-distance selection; desktop path provably unchanged
- [x] `MobileControlsSheet.tsx` — new self-contained component; vaul `Drawer` bottom sheet behind `sm:hidden` hamburger button; contains: UTC clock + SpeedBadge row, 10-button time transport, Clouds + Borders layer toggles, 5-category filter pills; 13 vitest tests
- [x] `GlobeView.tsx` integration — `TimeControls` wrapped in `hidden sm:block`; `MobileControlsSheet` placed alongside; toggle cluster and category pills bar changed to `hidden sm:flex` / `hidden sm:block` so desktop is untouched

**Session 36 completed tasks:**
- [x] Zoom-aware orbit controls — `rotateSpeed = 0.15 + sqrt(t)*0.35` (close→far), `zoomSpeed = 0.50 + t*0.50`; updated per-frame in `tick()` based on camera distance; fixes mobile scroll sensitivity
- [x] Dynamic dot scaling — attempted and reverted; dense LEO constellation fills Earth at far zoom; scroll speed fix via OrbitControls is sufficient
- [x] Gaussian glow — added and reverted in same session; flat uniform disc looks cleaner and avoids blur at far zoom
- [x] Time controls merged into top-left UTC clock card — `TimeControls` accepts `clock?: string` prop; single widget replaces separate clock + speed bar; no overlap with other UI elements
- [x] Satellite dot shader — flat `fwidth`-AA disc (gaussian glow reverted); uniform alpha across the entire circle
- [x] Hit-test depth — replaced Euclidean `√(dx²+dy²+dz²)` with camera-space z-depth `-(me[2]*x+me[6]*y+me[10]*z+me[14])`; Euclidean > z-depth for off-centre satellites → hit radius was smaller than visual dot
- [x] Hit-test scale — `satScales[i]` factored into `dotRadiusPx`; GPS/GEO/MEO satellites render at 1.5× but hit radius was using bare `SPHERE_RADIUS` → hover only registered in inner 67% of those dots

**Session 35 completed tasks:**
- [x] Time controls engine — `Globe.ts` simulated time accumulator (`_simTimeMs`, `_timeScale`); dt capped at 200ms; `lastFieldTickMs` uses real time so worker rate-limiting survives speed/direction changes; reset to 0 in `setTimeScale()` so satellites respond on the very next frame; `onSimulatedTime` callback fires once per simulated second
- [x] `useGlobe` — exposes `simulatedTime`, `timeScale`, `setTimeScale`; callback ref pattern bubbles `setTimeScale` up to App.tsx
- [x] `TimeControls.tsx` — compact transport card: 4 reverse + ⏸ + LIVE + 4 forward; toggle-to-pause on the active speed button; speed badge only (date row removed — redundant with UTC clock)
- [x] `GlobeView.tsx` — `timeScale` destructured; speed badge (⏸ or Nx►/◄Nx) shown inline with UTC clock when not at 1×
- [x] `App.tsx` — wires `setTimeScale` callback ref; renders TimeControls in the bottom-left cluster (desktop only); `simulatedTime` state removed
- [x] `App.test.tsx` — stable `Date` reference captured in outer mock factory closure to prevent infinite render loop
- [x] `api/chat.ts` — `get_satellite_info` tool now computes in-process via `fetchTle()` + satellite.js; ECS orbital service no longer on the critical path; `ORBITAL_SERVICE_URL` constant removed
- [x] `api/satellite-info.ts` — rewritten to compute locally from CloudFront TLEs; same response shape as the old ECS proxy

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

Sessions 1–30 decisions archived in `docs/decisions-archive.md`.

- **2026-05-13 — Architectural rule: Claude is the presenter, never the calculator.** Claude must not compute, infer, or guess any data value shown to the user — not time, not timezone offsets, not satellite positions, not pass windows. Every value must come from a backend tool result or a pre-computed server-side value. If data is missing, say unavailable. Violation that prompted this rule: passed UTC time and let Claude infer the Melbourne offset → got AEST/AEDT wrong. Fix pattern: compute it server-side, hand Claude the answer to format.

- **2026-05-13 — Globe camera highlight: never include tools in the streaming answer turn.** Second Claude call had `tools: TOOLS`. Haiku called `highlight_on_globe` in the streaming turn; the streaming loop only handles `text_delta` events, so the tool call was silently dropped. Fix: remove `tools` from the answer turn entirely. Rule: if the answer turn must produce text, pass no tools — force text output, not a tool call.

- **2026-05-13 — Chatbot reliability: haiku for tool-detection, Vercel Hobby 10s hard cap.** `maxDuration: 60` is silently ignored on Hobby tier — 10s is the real limit. Sonnet tool-detection consumed 3–5s. Fix: `claude-haiku-4-5-20251001` for the tool-detection turn (~1s), Sonnet for streaming answer. Rule: use the fastest model capable of the task; tool-detection is routing, not reasoning. Always budget total latency (detect + execute + stream) against the hard platform limit.



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

- **2026-05-26 — Session 35: Worker rate-limiting must use real time, not simulated time.** `lastFieldTickMs` originally stored the simulated timestamp of the last worker tick. When speed changed direction (e.g. 50× forward → 50× reverse), simulated `nowMs` jumped backward past `lastFieldTickMs`, making `realNow - lastFieldTickMs` look enormous — flooding the worker with ticks. Worse, `setTimeScale(1)` resets `_simTimeMs = Date.now()` (real time); if `lastFieldTickMs` was a high simulated-future value, `realNow - lastFieldTickMs < 0 < FIELD_TICK_MS` → the worker never ticked → satellites froze. Fix: `lastFieldTickMs` uses `realNow` in both comparison and update. Simulated timestamp is still passed to the worker as `timestamp: nowMs` (payload), but the rate-limiting gate is real time only. `setTimeScale()` resets `lastFieldTickMs = 0` so the worker ticks on the very next frame after any speed change. Rule: rate-limiting gates must use real time; simulated time is payload, not the clock.

- **2026-05-26 — Session 35: `new Date()` inside a `vi.fn()` inner factory creates a new reference per render → infinite render loop + OOM.** The `useGlobe` mock returned `simulatedTime: new Date('...')` inside `vi.fn(() => ({...}))`. Each `useGlobe()` call returned a new `Date` object — different reference, same value. `GlobeView`'s `useEffect(..., [simulatedTime])` fired every render, calling `setSimulatedTime` in App.tsx → re-render → loop → OOM at 4GB. Fix: `const stableDate = new Date('...')` captured in the outer `vi.mock` factory closure. The outer function runs once per test file; the inner `vi.fn()` closes over the stable reference. Rule: any value used as a `useEffect` dependency must be referentially stable across renders — in mocks, move constant values to the outer factory closure.

- **2026-05-26 — Session 35: `get_satellite_info` and `/api/satellite-info` moved off the ECS orbital service to avoid cold-start timeout.** Both called `https://api.satlas.app/satellite-info` with `AbortSignal.timeout(8000)`. The ECS Fargate service had slow first-request latency (cold start ~10–15s) — the timeout fired before a response arrived, landing in the outer catch block: "Something went wrong." Diagnosis: `curl --max-time 10` timed out; `curl --max-time 15` succeeded. Fix: both now compute in-process — `fetchTle()` pulls from the CloudFront 2-min TLE cache, satellite.js propagates to current epoch: `eciToGeodetic` for lat/lon/alt, velocity norm for speed, `satrec.no` for period, `satrec.inclo` for inclination. Same response shape as before. ECS is no longer on the critical path for any chat query. Rule: if a Vercel function calls an external service for computation that satellite.js can do in-process, prefer in-process — serverless cold starts compound.

- **2026-05-26 — Session 36: Dynamic dot scaling reverted — dense LEO constellation fills Earth at far zoom.** Attempted to scale satellite dots with zoom level so they're visible when zoomed out and not oversized when close. Multiple iterations (linear → sqrt curve → clamped [1.5px, 4.5px]) all produced the same failure: at the camera's max-out distance (15 globe radii), the ~19k LEO satellites are so numerous that even small dots completely fill the globe silhouette and obscure the Earth texture. The fix for the original complaint (dots hard to see when zoomed out and GPS selected) is the GPS dots having scale=1.5 already, not dynamically growing all dots. Final state: `DOT_SIZE=0.010` unchanged. Rule: dot size must be constant; zoom-dependent sizing for dense fields hides geometry rather than revealing it.

- **2026-05-26 — Session 36: Gaussian glow added and reverted in same session.** Added `exp(-dist²×2.5)` glow for a "lit point source" look. User reported dots look non-uniform (bright centre, dim edges) and blurry at far zoom — the glow was visible as a brightness gradient across the disc. Reverted to flat disc: `alpha = uOpacity * (1.0 - smoothstep(1.0-fw, 1.0+fw, dist))`. Rule: a uniform disc with `fwidth` AA is the right default — glow effects that are visible at the scale of these dots become noise, not enhancement.

- **2026-05-26 — Session 36: Hit-test used Euclidean depth, not camera-space z-depth — hover only worked near screen centre.** The formula `dotRadiusPx = SPHERE_RADIUS / depth * fovFactor` was correct, but `depth = √(dx²+dy²+dz²)` (Euclidean) instead of `-(me[2]*x + me[6]*y + me[10]*z + me[14])` (camera-space z). For satellites on the camera axis these are equal; for off-centre satellites, Euclidean > z-depth → computed radius smaller than visual → hover misses the outer portion of the dot. Fix: cache `camera.matrixWorldInverse.elements` before each hit-test loop and use the z-row dot product at all four sites (ISS click, field click, ISS hover, field hover). Rule: hit-test depth must use the same perspective division the shader uses — camera-space z, not Euclidean distance.

- **2026-05-26 — Session 36: `satScales[i]` missing from hit-test — GPS dots had 1.5× visual radius but 1.0× hit radius.** `buildSatScales()` assigns `scale=1.5` to high-altitude satellites (GPS, GLONASS, BeiDou, GEO — motionRevDay < 1.5) and `scale=0.6` to debris. The shader uses this scale via `mv.xy += position.xy * uSize * scale`, making GPS dots visually 50% larger. But the hit-test always used bare `SPHERE_RADIUS = 0.005` (scale=1.0 equivalent), so hover registered only in the inner 67% of GPS dots. Fix: `const scale = this.satScales ? this.satScales[i] : 1.0; dotRadiusPx = SPHERE_RADIUS * scale / depth * fovFactor`. Applied in both click and hover loops. Rule: every per-instance visual property that affects rendered size must be replicated in the JS hit-test — otherwise hit area diverges from visual area.

- **2026-05-26 — Session 37: Mobile touch hit-test requires a minimum 18px radius and nearest-screen-distance selection.** A touch finger covers 40–60px on screen; the computed dot radius for a typical LEO satellite (~2–3px) was far below fingertip size. Two changes: (1) `Math.max(TOUCH_MIN_RADIUS_PX=18, dotRadiusPx)` makes any dot hittable with a finger. (2) For touch, selection picks the nearest satellite in screen-distance (not camera-space depth) so the dot closest to where the finger landed wins instead of the dot closest to the camera behind it. Desktop click path: unchanged — radius is unbounded from below, depth is the tiebreaker, drag threshold is 5px². Touch drag threshold raised to 12px² (finger jitter > mouse jitter). Detection: `_lastInputWasTouch` flag set in `touchstart` (passive listener), cleared in `mousedown` (which always precedes `click` on mouse devices). Rule: touch and mouse hit-testing need separate thresholds and selection strategies — a pixel-perfect radius that works for mouse is unusable for touch.

- **2026-05-26 — Session 37: `MobileControlsSheet` uses `sm:hidden` hamburger + vaul Drawer — same pattern as existing sheets.** Desktop controls (TimeControls, toggle cluster, category pills) were invisible on mobile due to `hidden sm:block` / `hidden sm:flex` wrappers. Mobile had no way to reach time speed, clouds, borders, or category filters. Fix: self-contained `MobileControlsSheet` component, `sm:hidden` hamburger in the top-left slot; vaul `Drawer` with all secondary controls. The hamburger sits alongside the (desktop-only) TimeControls wrapper — no z-index fighting. Desktop layout untouched. `SpeedBadge` reproduced inline (not exported from TimeControls) to avoid premature abstraction. Rule: when a desktop-only control cluster becomes inaccessible on mobile, a bottom sheet behind a hamburger is the right abstraction — it leaves the globe clean and surfaces all controls in one place.

- **2026-05-27 — Session 37 hotfix: `fetchTle` in `api/chat.ts` used string equality for NORAD IDs — same leading-zero bug as S23.** TLE format zero-pads NORAD IDs to 5 digits (`"06707"`). Haiku strips leading zeros when extracting a numeric ID from the "Ask AI" prefill (`"06707"` → `"6707"`). String equality missed these — `"06707" !== "6707"` → `not found` → "service unavailable" shown to user. Fix: `parseInt` both sides when the query is all digits, identical to the `satinfo.py` fix in S23. Only affects satellites with NORAD IDs below 10,000 (older objects, some debris). All satellites visible on the globe now resolve correctly in the AI agent. Rule: every NORAD ID lookup anywhere in the codebase must use integer comparison, never string equality.

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
3. For the full session context prompt for the next session, see `docs/session-38-bootstrap.md`.

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
| `docs/session-34-bootstrap.md` | Session 34 bootstrap (historical) — pass visibility, DevNotes, overhead uncap. |
| `docs/session-35-bootstrap.md` | Session 35 bootstrap — time controls, satellite sync fix, in-process satellite info. |
| `docs/session-37-bootstrap.md` | Session 37 bootstrap (historical) — mobile touch hit-test fix + hamburger bottom sheet. |
| `docs/session-38-bootstrap.md` | Session 38 bootstrap — V2 direction decision pending. |
| `docs/decisions-archive.md` | ADR entries from Sessions 1–17, migrated to keep CLAUDE.md under 40k. |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | Implementation plans. One file per session/feature. |
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | Design specs produced during brainstorming sessions. |
| `CHANGELOG.md` | User-facing change log. Updated when a session ships something visible. |
| `README.md` | Public-facing project overview. What it does, how to run it locally, deploy notes. |
