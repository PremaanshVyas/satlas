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

**Current phase:** Session 31 — V2 direction decision. Globe map mode fully working. Small polish done.

**Next milestone:** Pick V2 direction and scope first milestone. Options in `docs/session-30-bootstrap.md`.

**Sessions 1–20 (complete, stable):** See `docs/session-21-bootstrap.md` (S21 context) and `docs/decisions-archive.md` (all ADRs through S17). Key phases: globe + ISS (S1-5), AI agent + tools (S6-10), CI/CD + search (S11-15), AWS infra (S16-19), PassPanel + satcat fix (S20).

**Session 31 completed tasks (so far):**
- [x] Vercel Analytics (`@vercel/analytics`) added to `apps/web` — page views, visitors, referrers live on Vercel dashboard
- [x] Vercel Speed Insights (`@vercel/speed-insights`) added — Core Web Vitals (LCP, FID, CLS) tracking
- [x] PassPanel scroll clipping fixed: `pb-2` on results container — last pass row no longer cut off
- [x] CountryPanel overhead list scroll clipping fixed: `pb-1` on sat list container

**Session 30 completed tasks:**
- [x] `CountryHighlightMesh` fill re-enabled: `subdivideRing` + `refineTris` in `sphereUtils.ts` — edges subdivided to ≤4° before earcut, large interior triangles recursively split
- [x] `CountryFillMesh` void fixed: same `subdivideRing` + `refineTris` applied via shared `sphereUtils.ts`
- [x] SLERP → flat lon/lat interpolation: SLERP midpoints bulge outward at high latitudes (Russia ~3-5° into Arctic), replaced with flat `[lon0 + (lon1-lon0)*t, lat0 + (lat1-lat0)*t]` in both `subdivideRing` and `refineTris`
- [x] MultiPolygon stacking fix: stencil buffer (`NotEqual/Replace`) prevents transparent fill fragments from accumulating additively across sub-polygons (Russia's islands no longer show bright overlap bands)
- [x] Deselect on panel close: `Globe.clearCountryHighlight()` wired through `useGlobe` → `GlobeView.onClearHighlightReady` → `App.tsx` `dismissCountry()` helper — closing CountryPanel now clears the globe highlight ring

**Session 29 completed tasks:**
- [x] Vercel TS errors fixed: `@types/earcut`, `@types/d3-geo`, `@types/geojson` added as devDependencies
- [x] TS2721 fixed: `this.onSatelliteClick?.(...)` optional chaining at 3 call sites in Globe.ts
- [x] `EarthMesh.setMapMode(on)`: swaps between `photoMaterial` (ShaderMaterial) and `darkMaterial` (0x060d18)
- [x] `CountryFillMesh`: earcut on all countries merged into single dark navy mesh at r=1.001
- [x] `GraticuleMesh`: lat/lon grid every 30° at r=1.0015
- [x] `CountryBorderMesh` color/opacity updated for dark map style
- [x] `Globe.setBordersVisible`: dark map on/off, lazy GeoJSON fetch, race guard, cloud visibility tracking
- [x] CSS2DRenderer label overlay: size-based zoom threshold (sizeProxy from bbox), screen-burn fix (hide domElement when borders off)
- [x] Country hover tooltip: mousemove → raycast → geoContains → `onSatelliteHover(name, null, ...)` when no satellite under cursor
- [x] `HoverInfo.altKm` is now `number | null`; tooltip hides altitude row for country hover
- [x] CountryHighlightMesh fill DISABLED (border-only) — fill deferred to Session 30 (see blocker above)

**Session 28 completed tasks:**
- [x] Natural Earth 50m GeoJSON (`public/data/countries-50m.json`) fetched lazily on first Borders toggle
- [x] `CountryBorderMesh` — all borders as single `THREE.LineSegments` draw call at r=1.002, antimeridian skip
- [x] `CountryHighlightMesh` — earcut triangulation fill at r=1.001 + bright border at r=1.003 for selected country
- [x] `computeOverhead` exported from Globe.ts — `sinElev = (dot(P,O)−1) / |P−O|` formula for altitude-accurate elevation
- [x] `Globe.setBordersVisible` with `_bordersLoading` race condition guard, `finally` reset, throws on failure
- [x] Country hit-test: `THREE.Raycaster` → lat/lon → `d3-geo.geoContains`; `onCountryClick` callback
- [x] `useGlobe` wires `onCountryClick` → `getOverheadSatellites` → upstream; `setBordersVisible` returns `Promise<void>`
- [x] `CountryPanel` component — overhead sat list, primary (>15°) / secondary (≤15°) tiers, Ask AI button
- [x] `GlobeView` Borders toggle button (third toggle, top-right); async `toggleBorders` reverts on failure
- [x] `App.tsx` — `SelectedCountry` state, desktop left column stacking (SatInfoCard + CountryPanel), mobile Vaul sheet; PassPanel maxHeight `calc(50dvh - 2rem)`
- [x] earcut + d3-geo added to package.json; 99 tests passing, 0 TypeScript errors

**Session 27 completed tasks:**
- [x] Globe initial zoom: `CAMERA_DISTANCE` 2.5 → 3.5 (more breathing room on landing)
- [x] Search fly-to: selecting from search bar now flies camera to satellite position
- [x] Altitude-aware camera fly: `flyDistance = max(CAMERA_DISTANCE, satRadius × 1.5)` — GEO sats no longer fly to a point below themselves
- [x] Catalog 20k → 31k+: removed `limit/20000`, widened epoch 60→90 days, fixed `Promise.any` race (sequential fetch now)
- [x] Debris off by default — 12k+ objects hidden on landing, re-enable via toggle
- [x] Cloud + Debris toggles redesigned as labeled controls with sliding pill indicator
- [x] All categories can be toggled off (removed last-category guard)
- [x] ISS owner override: `NORAD_OWNER_OVERRIDES` map → "ISS Partnership (NASA · Roscosmos · ESA · JAXA · CSA)"
- [x] Owner field wrapping: `col-span-2`, removed `truncate` — long owner strings display in full
- [x] `satcat.ts` cache bumped to v6
- [x] `api/catalog.ts` root route added (was returning 404 on `api.satlas.app`)
- [x] GitHub Actions: ECS force-redeploy on every push to main

**Session 25–26 completed tasks:**
- [x] Full frontend redesign — Nothing/Terminal aesthetic, JetBrains Mono, electric cyan design tokens
- [x] Readability overhaul — font sizes bumped, color tokens fixed, UTC clock larger
- [x] Category pills moved to bottom-center with glass background
- [x] PassPanel pass times show date + time stacked
- [x] favicon.svg wired, meta/OG tags added to index.html
- [x] Pre-public cleanup: removed internal docs (42 files, 16k lines)

**Session 22–24 completed tasks:**
- [x] Domain `satlas.app` with HTTPS (ACM cert, ALB HTTPS listener, Route 53)
- [x] Pass prediction boundary fix, location disambiguation, pass list scroll fixed
- [x] NORAD ID normalization (cache v5), AI tracking-status contradiction fixed
- [x] Pulsing cyan dot for active satellites, compass rose in PassPanel, ApiDocs footer

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

Sessions 1–17 decisions archived in `docs/decisions-archive.md`.

- **2026-05-13 — Architectural rule: Claude is the presenter, never the calculator.** Claude must not compute, infer, or guess any data value shown to the user — not time, not timezone offsets, not satellite positions, not pass windows. Every value must come from a backend tool result or a pre-computed server-side value. If data is missing, say unavailable. Violation that prompted this rule: passed UTC time and let Claude infer the Melbourne offset → got AEST/AEDT wrong. Fix pattern: compute it server-side, hand Claude the answer to format.

- **2026-05-13 — Globe camera highlight: never include tools in the streaming answer turn.** Second Claude call had `tools: TOOLS`. Haiku called `highlight_on_globe` in the streaming turn; the streaming loop only handles `text_delta` events, so the tool call was silently dropped. Fix: remove `tools` from the answer turn entirely. Rule: if the answer turn must produce text, pass no tools — force text output, not a tool call.

- **2026-05-13 — Chatbot reliability: haiku for tool-detection, Vercel Hobby 10s hard cap.** `maxDuration: 60` is silently ignored on Hobby tier — 10s is the real limit. Sonnet tool-detection consumed 3–5s. Fix: `claude-haiku-4-5-20251001` for the tool-detection turn (~1s), Sonnet for streaming answer. Rule: use the fastest model capable of the task; tool-detection is routing, not reasoning. Always budget total latency (detect + execute + stream) against the hard platform limit.

- **2026-05-19 — Session 18: Chat panel uses easeOut tween, not spring, to prevent overshoot glitch.** Framer Motion spring animations can overshoot. On the full-height chat panel (`x: '100%' → 0`), overshoot moved the panel past the left viewport edge. Fix: `transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}`. Spring kept on the chat button (small scale — subtle bounce is desirable). Rule: use spring for small UI elements; use easeOut tweens for large panel slides.

- **2026-05-19 — Session 18: Send button clip — 3-attempt journey; root cause was `min-w-0` on input.** Attempt 1 (wrong): vertical sub-pixel overflow — `position: fixed` panel + `h-full` AgentPanel; Safari `h-full` → `auto` (CSS 2.1 §10.5 requires specified height on containing block). Attempt 2 (wrong): `absolute inset-0` — same spec issue, height: 0 in Safari. Attempt 3 (correct): (1) panel `position: fixed` with inline `style={{ top: 0, bottom: 0 }}`; (2) AgentPanel as `<>` fragment — direct flex children, no height propagation; (3) `min-w-0` on both flex row `<div>` AND `<input>` — browser default input min-width pushes Send off-screen without it. Rule: (1) full-screen overlays: `position: fixed` + inline style; (2) fill-flex components: render as fragment; (3) `flex-1` on `<input>`: always `min-w-0` on input and container.

- **2026-05-19 — Session 18: `find_satellites_overhead` implemented in Node.js, not Python.** Fetches CloudFront catalog (~50ms warm), strips debris/rocket bodies by name heuristic (~5-8k remain), propagates with single GMST snapshot, returns top 25 by elevation with compass direction. Total: ~1-2s warm, ~5-6s cold — within Vercel Hobby 10s limit. Rule: for bulk propagation to the same instant, compute GMST once outside the loop.

- **2026-05-20 — Session 19: Docker images built on Apple Silicon must use `--platform linux/amd64` for ECS Fargate.** ECS Fargate runs on x86_64. A Docker image built on an M-series Mac without `--platform linux/amd64` is ARM-only. ECS error: "image Manifest does not contain descriptor matching platform 'linux/amd64'". Rule: always pass `--platform linux/amd64` when building images destined for ECS; the Dockerfile itself needs no changes.

- **2026-05-20 — Session 19: CelesTrak blocks Vercel IPs for all endpoints, not just GROUP=active.** `fetchTle` returned null for every query; Claude responded "live data service unavailable" for all satellite queries. Fix: (1) `toolGetSatelliteInfo` calls ALB `/satellite-info` directly; (2) `fetchTle` downloads CloudFront catalog and searches in-process (2-min in-memory cache). Rule: never call CelesTrak from a server/cloud context — always route through the ALB or the CloudFront catalog.

- **2026-05-20 — Session 19: Sentry SDK crashes on invalid DSN at import time, not at first event send.** `sentry_sdk.init(dsn='placeholder')` throws during module import — before FastAPI starts, before `/health` is registered. ECS health check fails → ALB 503. Fix: `if dsn and dsn.startswith('https://')`. Rule: any SDK that validates config at init time will crash the process — always guard optional integrations so the app boots without them.

- **2026-05-21 — Session 20: Satcat metadata CORS fix — source switched to Space-Track JSON via S3+CloudFront.** CelesTrak's `/pub/satcat.csv` has no CORS headers — browser fetch silently fails (no `Access-Control-Allow-Origin`). All satellite info card metadata always showed "—". Fix: ECS `_s3_refresh()` now also calls `_fetch_space_track_satcat()` and writes `satcat.json` to S3 alongside `catalog.tle`. CloudFront serves it with 2h TTL. Frontend derives URL: `VITE_CATALOG_URL.replace('/catalog.tle', '') + '/satcat.json'` — no new env vars. `SATCAT_CACHE_KEY` bumped to `satlas-satcat-v3`. Rule: never fetch CelesTrak static files in the browser for metadata — they have no CORS headers; route through your own CDN pipeline.

- **2026-05-21 — Session 20: PassPanel location autocomplete — `onMouseDown` fires before `onBlur`.** Dropdown disappears when input loses focus (`onBlur`) before a mouse click on a suggestion can register (`onClick` fires after `onBlur`). Fix: use `onMouseDown` + `e.preventDefault()` on each list item. `onMouseDown` fires before `onBlur`; `e.preventDefault()` prevents the input from losing focus at all. Rule: for suggestion dropdowns, always use `onMouseDown` + `e.preventDefault()` on list items — `onClick` fires after `onBlur`, which hides the dropdown first.

- **2026-05-21 — Session 20: Railway auto-deploy was a GitHub app integration, not CI.** Railway had its own GitHub app installed, triggering deployments on every push independently of GitHub Actions. Removal: delete the Railway project in the Railway dashboard — removes the GitHub integration automatically. No code changes needed. Rule: check GitHub Apps settings (`Settings → Integrations → Applications`) for third-party integrations that auto-deploy — they are invisible in the repo's workflow files.

- **2026-05-21 — Session 21: Global `overflow: hidden` blocks scrollable routes — scope it to the container.** Had `html, body, #root { overflow: hidden }` in `index.css` to lock the globe in place. Adding a `/docs` route made it impossible to scroll the API docs page. Fix: removed `overflow: hidden` from global CSS, added `overflow-hidden` directly to App's root div (the one with `height: 100dvh`). Rule: never put `overflow: hidden` globally when the app has multiple route types; scope it to the container that needs it.

- **2026-05-21 — Session 21: API docs param names wrong in first pass — always read the handler.** Initial `ApiDocs.tsx` documented `/api/pass` with `norad`, `lat`, `lon`, `hours`. The actual handler (`api/pass.ts` line 69) uses `norad_id`, `latitude`, `longitude`, `hours_ahead`. Caught by code quality reviewer before ship. Fix: corrected both the params table and the curl example. Rule: when documenting an API, read the actual handler to verify parameter names — never infer from usage examples or intuition.

- **2026-05-21 — Session 21: Hard-coded origin URL is wrong on preview deployments — use `window.location.origin`.** First pass set `const BASE = 'https://getsatlas.vercel.app'` — curl examples on any preview deployment would point at production. Fix: `const BASE = window.location.origin` (safe since ApiDocs is a client-only component). Test assertion updated to match on the "Base URL:" label text rather than the URL value (jsdom gives `http://localhost`). Rule: never hard-code the production origin in client-rendered content; use `window.location.origin`.

- **2026-05-21 — Session 21: Any `<Link>` in the render tree requires `MemoryRouter` in tests.** Adding `Link` to `GlobeView.tsx` (a child of App) caused `App.test.tsx` to fail with "Cannot destructure property 'basename' of useContext(...) as it is null" — the router context was missing. Fix: wrap the `render(<App />)` call in `<MemoryRouter>`. Rule: whenever `Link` or `useNavigate` appears anywhere in the component tree being tested, the test render must be wrapped in `MemoryRouter`.

- **2026-05-21 — Session 22: Namecheap as registrar + Route 53 as DNS — use `resource` not `data` for the hosted zone.** Route 53 domain registration is blocked on Free Tier AWS accounts. Fix: register at Namecheap, create a `resource "aws_route53_zone"` in Terraform, then paste the 4 output NS records into Namecheap's Custom DNS settings. The `data "aws_route53_zone"` pattern only applies when Route 53 is the registrar. Rule: external registrar = `resource`; Route 53 registrar = `data`.

- **2026-05-21 — Session 22: ACM cert validation takes 25–35 min after nameserver change.** ACM polls DNS on its own schedule after the validation CNAME is resolvable. With a nameserver change (Namecheap → Route 53), even after NS propagation (~15 min) ACM may take another 15–20 min to poll. Rule: budget 45 min total from `terraform apply` to cert `ISSUED` when nameservers are being changed; don't assume fast validation.

- **2026-05-21 — Session 22: Vercel's new recommended apex IP is 216.198.79.1, not 76.76.21.21.** Vercel is expanding IP ranges; the dashboard shows 216.198.79.1 as the recommended A record for apex domains. The old IP (76.76.21.21) still works but use the new one for fresh setups. www subdomain uses a project-specific CNAME (e.g. 899556b0778ed1b3.vercel-dns-017.com) — always get the exact value from the Vercel dashboard, don't hardcode cname.vercel-dns.com.

- **2026-05-21 — Session 22 hotfix: skyfield `find_events` silently drops boundary passes.** If the satellite is already above 10° when the prediction window opens, skyfield omits the rise event — the old state machine dropped those passes because `'start_utc' not in current` at the set event. Same for passes still ongoing at window end (no set event generated). Fix: on set event, synthesize `start_utc = t0.utc_iso()` if missing; after the loop, if `current` has `start_utc` (pass still open), synthesize `end_utc = t1.utc_iso()`. Both edge cases compute alt/az at the boundary time if the peak data is also missing. Rule: any skyfield time-window prediction must handle the two boundary cases: satellite above horizon at t0, and satellite above horizon at t1.

- **2026-05-21 — Session 22 hotfix: wrong Nominatim result → wrong city → wrong pass count.** User searched "Melbourne"; Nominatim returns Melbourne AU first (population ranking), but if the user accidentally picked the second suggestion (Melbourne, FL) passes dropped from 5 to 2. Fix: after search selection, display "City, Country" (e.g. "Melbourne, Australia") instead of just city name — makes disambiguation immediate and obvious. Rule: when displaying a user-selected location, always show country context so they can verify before the prediction runs.

- **2026-05-21 — Session 22 hotfix: AI contradicts tool data on satellite tracking status.** `get_satellite_info` system prompt only prohibited training-knowledge answers for position/altitude/velocity — not for catalog presence or operational status. Claude would call the tool successfully, get back a valid live position, then add from training knowledge "this satellite is no longer tracked" (e.g. Cosmos 574). Fix: extended the prohibition to tracking status and catalog presence; added explicit rule that a successful tool response (contains lat/lon/altitude) means the satellite IS tracked — training knowledge must not contradict a live tool result. Rule: for any field that a tool can authoritatively answer, the system prompt must explicitly forbid training-knowledge overrides.

- **2026-05-21 — Session 23: NORAD ID leading-zero mismatch caused wrong satellite lookup and missing metadata.** TLE catalog pads NORAD IDs to 5 digits (`'06707'`); Space-Track satcat omits leading zeros (`'6707'`); LLM (Haiku) normalizes digits and strips the leading zero. Three compounding bugs: (1) `satinfo.py` used string equality for NORAD ID lookup — `'6707' != '06707'` → miss, then fell through to name search where `'6707'` is a substring of `'STARLINK-36707'` → wrong satellite returned. (2) `satcat.ts` built the Map with raw Space-Track keys (`'6707'`), but SatInfoCard looked up by TLE-derived padded key (`'06707'`) → no metadata. Fix: (1) use integer comparison in `satinfo.py` so `int('6707') == int('06707')`; name-search fallback only runs for non-digit queries. (2) pad NORAD ID to 5 chars in `parseSatcatJson` so map keys match TLE format. Cache bumped to v5. Rule: all NORAD ID comparisons must use integer equality — string equality silently fails on leading-zero format differences.

- **2026-05-21 — Session 22 hotfix: `flex-1 overflow-y-auto` requires bounded parent `height`, not just `maxHeight`.** Desktop PassPanel container had `maxHeight: calc(100dvh - 6rem)` but no `height`. With no explicit height on the flex container, `flex-1` in the child resolves to content height, so `overflow-y-auto` never triggers — tall pass lists are silently clipped by the parent's `overflow: hidden`. Fix: replaced `flex-1 overflow-y-auto min-h-0` on the results div with `overflow-y-auto max-h-[50dvh]` — scroll cap works independently of the parent chain. Rule: for a scrollable region inside an absolutely-positioned card that only has `maxHeight`, do not rely on `flex-1`; set `max-height` directly on the scrollable element.

- **2026-05-21 — Session 25: Frontend redesign used pure CSS token replacement — no logic changes needed.** Nothing/Terminal aesthetic achieved entirely via Tailwind class swaps across 9 files. Key pattern: Tailwind v4 `@theme` block defines named tokens (`--color-accent`, `--color-secondary`, `--color-label` etc.) which become named utilities (`text-accent`, `text-secondary`, `text-label`). These propagate to all components without using arbitrary values. All 75 tests continued to pass because tests assert on content/structure, not CSS classes. Rule: for a pure CSS redesign, define tokens in `@theme` first — it makes every subsequent class replacement consistent and grep-able.

- **2026-05-23 — Session 27: NORAD_OWNER_OVERRIDES for multinational satellites where Space-Track country code is misleading.** Space-Track assigns country codes per the nation that launched or funded the first module — not per the current operating partnership. ISS ZARYA is coded `CIS` (Russia), which resolves to "Russia" — misleading for a 5-nation program. Rather than altering `OWNER_MAP` (which would affect other Russian satellites), added a `NORAD_OWNER_OVERRIDES: Record<string, string>` map keyed by unpadded NORAD ID string. Override wins over `OWNER_MAP`. Cache bumped to v6. Rule: for satellites where the owning-nation code in Space-Track is accurate for the catalog but misleading for users, use per-NORAD overrides rather than modifying the shared OWNER_MAP.

- **2026-05-23 — Session 27: Owner field uses `col-span-2` to allow long strings to wrap.** The 2-column catalog grid constrained the owner cell to roughly half the card width. With `truncate`, long strings like "ISS Partnership (NASA · Roscosmos · ESA · JAXA · CSA)" were silently cut off. Making the owner row `col-span-2` gives it the full card width; removing `truncate` allows wrapping. All other fields remain in the 2-column layout. Rule: for variable-length text fields in a fixed grid, span the full width rather than truncating — silent truncation is worse than a slightly taller card.

- **2026-05-23 — Session 27: Earth day/night terminator used view-space normals — always compute world-space.** `normalMatrix` in GLSL is the transpose-inverse of the model-view matrix, so `normalMatrix * normal` is in camera space. `sunDirection` is passed as a world-space vector. `dot(viewSpaceNormal, worldSpaceDirection)` produces a result that rotates with the camera — the lit face of Earth orbited the viewer instead of tracking the sun. Fix: `normalize(mat3(modelMatrix) * normal)` gives the surface normal in world space. Rule: whenever a GLSL uniform is in world space, the varying it's dotted against must also be in world space — never use `normalMatrix` for lighting against world-space directions.

- **2026-05-23 — Session 27: Sun sprite uses canvas `lighter` compositing for spike accumulation.** Three nested `SphereGeometry` meshes with additive blending showed hard sphere edges visible from any angle. Replaced with a `THREE.Sprite` (always faces camera) + programmatic 512×512 canvas texture. The eight diffraction spikes are drawn with `globalCompositeOperation = 'lighter'` so all eight diamond shapes accumulate brightness at the center — the intersection naturally becomes the bright core without a separate composite step. A tight radial gradient for the core is drawn last with `source-over`. Rule: for star/light source effects, use a Sprite (not a Mesh) so it always faces the camera; use canvas `lighter` compositing to accumulate overlapping glow layers.

- **2026-05-23 — Session 27: Debris off by default; debris toggle is separate from category pills.** Debris is the largest category (12k+ objects) but the least interesting to most users. Showing it on landing overwhelms the globe. Default changed to `ALL_CATEGORIES.filter(c => c !== 'DEBRIS')`. A dedicated Debris toggle sits above the category pills so the choice is visible — users aren't confused about why objects are missing. The toggle and the Debris pill are wired to the same `toggleCategory` handler so they stay in sync. Rule: default-off a category if its presence overwhelms the default view; always make the exclusion obvious with a visible control.

- **2026-05-21 — Session 25: Final reviewer caught legacy `bg-gray-*` classes missed in targeted edits.** The per-file implementer subagents (Tasks 6 and 7) missed: (1) desktop SatInfoCard/PassPanel wrapper divs in App.tsx (still `bg-gray-900/95 border-gray-700/80 rounded-lg`), (2) Vaul mobile drawer backgrounds, (3) globe hover tooltip, (4) loading overlay, (5) tray divider. The holistic final review caught all 6 locations. Rule: targeted edits to large files (App.tsx, GlobeView.tsx) need a grep scan for old-palette classes after the fact — a holistic review after all tasks complete catches what per-task reviews miss.

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
3. For the full session context prompt for the next session, see `docs/session-30-bootstrap.md`.

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
| `docs/session-30-bootstrap.md` | Session 30 bootstrap — paste at start of Session 31. V2 direction options + polish backlog. |
| `docs/decisions-archive.md` | ADR entries from Sessions 1–17, migrated to keep CLAUDE.md under 40k. |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | Implementation plans. One file per session/feature. |
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | Design specs produced during brainstorming sessions. |
| `CHANGELOG.md` | User-facing change log. Updated when a session ships something visible. |
| `README.md` | Public-facing project overview. What it does, how to run it locally, deploy notes. |
