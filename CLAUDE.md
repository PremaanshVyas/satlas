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
│   ├── session-10-bootstrap.md   # next session bootstrap prompt
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

**Current phase:** Session 19 complete — AWS stack fully live. ECS Fargate serving orbital API from Sydney, CloudFront serving catalog from Melbourne edge.

**Next milestone:** Session 20 — pass prediction panel in UI, public API docs page, domain registration + HTTPS on ALB.

**Pre-Session 18 housekeeping completed:**
- [x] Platform renamed from "Aussie Sky" to "Satlas" across all code, infra, and docs
- [x] GitHub repo renamed to `PremaanshVyas/satlas`, git remote updated
- [x] Vercel project renamed to `satlas`; interim domain `getsatlas.vercel.app` (satlas.vercel.app taken globally)
- [x] CORS, User-Agent headers, cache keys, system prompt identity, Terraform resources, CI workflow all updated
- [x] Env var naming standardised: `SPACE_TRACK_USER`/`SPACE_TRACK_PASS` on Vercel; `SPACETRACK_USER`/`SPACETRACK_PASS` in ECS (mapped via ecs.tf from Secrets Manager)
- [x] `.env.example` documents all three required Vercel env vars: `ANTHROPIC_API_KEY`, `SPACE_TRACK_USER`, `SPACE_TRACK_PASS`
- [x] Railway env var remnants removed from Vercel and `.env.example`

**Session 17 completed tasks:**
- [x] Visual overhaul: `CloudMesh.ts` (clouds.matteason.co.uk, AdditiveBlending at radius 1.012), `StarField.ts` texture (NASA Gaia DR2 8k skybox on BackSide sphere), satellite trails (ECEF 10-min fade, lime→transparent), dot sizing by type (GEO 1.5×, debris 0.6×)
- [x] Colour-graded Earth shader: vivid contrast + day/night compositing improvements
- [x] Multi-satellite selection tray: clicking adds satellite to tray + shows orbit ring; multiple satellites selected simultaneously; tray ✕ removes from globe; card ✕ closes info card only, orbit persists; clicking empty space does nothing
- [x] Collapsible tray: list-format chip panel (max-h-44 overflow), chevron header tap to expand/collapse
- [x] Cloud visibility toggle button (top-right globe, below satellite count)
- [x] AI category counts: `Globe.getAllCategoryCounts()` fired at catalog load, flows through `useChat` → `api/chat.ts` → system prompt; AI answers "how many Starlink?" without a tool round-trip
- [x] Mobile viewport fix: container `100dvh` (dynamic viewport) + `env(safe-area-inset-top/bottom)` for all overlay elements; eliminates browser-chrome overlap on iOS/Android
- [x] Chat close button moved to bottom input bar (left of Send); removes unreachable top close button on mobile
- [x] 54 frontend Vitest tests passing; 79 orbital Python tests; tsc clean; lint clean

**Session 16 completed tasks (code only — infra not yet applied):** See `docs/session-17-bootstrap.md`. Key: Terraform (ECR, VPC, ECS, ALB, S3+CloudFront, RDS), CI ECR push job, `/api/catalog` Vercel function.

**Sessions 1–15 (complete, stable):** See `docs/session-14-bootstrap.md`. Key: globe, ISS SGP4, agent + tools, CI/CD, CORS, hover/click, category filters, orbital arcs, agent category filter, search bar, Railway eliminated.

**Session 18 completed so far:**
- [x] `find_satellites_overhead` AI tool: fetches full catalog via `/api/catalog` (Vercel CDN cached), skips debris/rocket bodies, propagates ~5-8k payloads with a single GMST snapshot, returns top 25 by elevation with compass direction. Fixes README gap — "overhead" queries now actually work.
- [x] Country borders feature spec: `docs/superpowers/specs/2026-05-19-country-borders-feature.md` — Natural Earth TopoJSON borders at radius 1.001, click → centroid lookup → overhead panel, `/api/overhead` Vercel function. Added to README V2 roadmap.
- [x] Rate limiting + input validation on `/api/chat`: sliding window 15 req/min per IP, max message 500 chars, 429/400 responses.
- [x] Earth texture swapped to NASA MODIS cloud-free (`land_ocean_ice_8192`); colour shader stripped to raw texture sample + 3.5× night lights boost (no grading). Specular + normal maps downloaded and preloaded for future sun feature.
- [x] Frontend UI polish: Framer Motion animations (tray slide-up, card fade-scale, chat button spring), Vaul bottom sheet for mobile satellite info card, Geist font. `SatInfoCard` extracted as shared component. Chat panel uses plain conditional render (no animation — spring overshoot attempts all failed).
- [x] CI lint fixed: `set-state-in-effect` disable comment on MediaQueryList sync; `matchMedia` mock in test-setup.ts.
- [x] Globe drag vs click: `mousedown` position recorded; `onCanvasClick` ignores moves >5px — no accidental satellite picks during globe rotation.
- [x] Satellite info card metadata: always renders (no conditional hide), `—` for missing fields. `LAUNCH_SITE` col 7 added to satcat parser with 35-entry site map. Retroactive meta fill when satcat loads after click. Cache key bumped to `satlas-satcat-v2`.
- [x] AgentPanel safe-area bottom padding added; flex chain corrected (flex-1 min-h-0 through all levels, inset-y-0 on panel).

**Session 18 cont. — Send button clip fixed (3-attempt journey, see ADR):** Final fix: `position: fixed` panel with `style={{ top: 0, bottom: 0 }}`; AgentPanel renders as `<>` fragment (direct flex children, no height inheritance); `min-w-0` on flex row div + `<input>` to prevent browser-default input min-width from pushing Send off-screen. 54 tests passing. No open layout bugs.

**Session 19 completed tasks:**
- [x] AWS account set up, IAM user `satlas-admin` created
- [x] Terraform HCL syntax fixed (semicolons → multiline blocks in vpc.tf)
- [x] RDS engine version bumped 15.7 → 15.18 (15.7 not available in ap-southeast-2)
- [x] RDS db name/username renamed aussiesky → satlas
- [x] `terraform apply` — all 47 resources created in ap-southeast-2
- [x] Secrets Manager populated: ANTHROPIC_API_KEY, SPACE_TRACK_USER/PASS, SENTRY_DSN
- [x] Docker image built for linux/amd64 (ARM Mac → cross-compile required), pushed to ECR
- [x] Sentry init guarded: only runs when DSN starts with `https://` — placeholder no longer crashes startup
- [x] ECS Fargate task running, health check passing
- [x] S3 catalog.tle written by ECS on startup (4.8MB from Space-Track)
- [x] CloudFront serving from MEL51-P2 (Melbourne edge)
- [x] Vercel `VITE_CATALOG_URL` set to CloudFront URL, redeployed
- [x] GitHub `AWS_ACCOUNT_ID` variable set, CI ECR push job active

**Live endpoints:**
- ALB: `http://satlas-1659207311.ap-southeast-2.elb.amazonaws.com`
- CloudFront catalog: `https://dgsll6twimcwl.cloudfront.net/catalog.tle`
- Frontend: `https://getsatlas.vercel.app`

**No blockers.**

---

## Decisions log (ADR-lite)

Format: date, decision, rationale, rule to remember.

Pre-Session-12 decisions archived in `docs/decisions-archive.md`.

- **2026-05-20 — Session 19: Docker images built on Apple Silicon must use `--platform linux/amd64` for ECS Fargate.** ECS Fargate runs on x86_64. A Docker image built on an M-series Mac without `--platform linux/amd64` is ARM-only. ECS error: "image Manifest does not contain descriptor matching platform 'linux/amd64'". Fix: always pass `--platform linux/amd64` when building images destined for ECS. Rule: add `--platform linux/amd64` to every `docker build` command in CI and local builds for ECS targets; the Dockerfile itself needs no changes.

- **2026-05-20 — Session 19: CelesTrak blocks Vercel IPs for all endpoints, not just GROUP=active.** Prior ADR noted that only `GROUP=active` was blocked on cloud IPs; CATNR/NAME queries were believed to work. In practice, Vercel function IPs also get blocked — `fetchTle` returned null for every query, Claude saw tool errors, and responded with the "live data service unavailable" message for all satellite queries. Fix: (1) `toolGetSatelliteInfo` now calls the ALB `/satellite-info` endpoint directly; (2) `fetchTle` (for pass predictions) now downloads the CloudFront catalog and searches in-process — a 2-minute in-memory cache avoids re-downloading 4.8MB per request within the same warm Vercel instance. Rule: never call CelesTrak from a server/cloud context — always route through the orbital service (ALB) or the CloudFront catalog.

- **2026-05-20 — Session 19: Sentry SDK crashes on invalid DSN at import time, not at first event send.** `sentry_sdk.init(dsn='placeholder')` throws during module import — before FastAPI can even start, before the `/health` route is registered. ECS health check fails → ALB deregisters target → 503. Fix: guard init with `if dsn and dsn.startswith('https://')`. Rule: any SDK that validates config at init time will crash the process before the HTTP server starts — always guard optional integrations so the app boots without them.

- **2026-05-13 — Architectural rule: Claude is the presenter, never the calculator.** Claude must not compute, infer, or guess any data value shown to the user — not time, not timezone offsets, not satellite positions, not pass windows. Every value must come from a backend tool result or a pre-computed server-side value. If data is missing, say unavailable. Violation that prompted this rule: passed UTC time and let Claude infer the Melbourne offset → got AEST/AEDT wrong. Fix pattern: compute it server-side, hand Claude the answer to format.

- **2026-05-13 — Globe camera highlight: never include tools in the streaming answer turn.** Second Claude call had `tools: TOOLS`. Haiku called `highlight_on_globe` in the streaming turn; the streaming loop only handles `text_delta` events, so the tool call was silently dropped. Fix: remove `tools` from the answer turn entirely. Rule: if the answer turn must produce text, pass no tools — force text output, not a tool call.

- **2026-05-13 — Chatbot reliability: haiku for tool-detection, Vercel Hobby 10s hard cap.** `maxDuration: 60` is silently ignored on Hobby tier — 10s is the real limit. Sonnet tool-detection consumed 3–5s. Fix: `claude-haiku-4-5-20251001` for the tool-detection turn (~1s), Sonnet for streaming answer. Rule: use the fastest model capable of the task; tool-detection is routing, not reasoning. Always budget total latency (detect + execute + stream) against the hard platform limit.

- **2026-05-13 — Session 8: Earth texture upgrade.** NASA Blue Marble 8192×4096 JPEG (5.7MB) + Black Marble 2012 3600×1800 (1.1MB). Working NASA image paths: `/imagerecords/57000/57752/` (day) and `/imagerecords/79000/79765/` (night) — the `/74000/74117/` paths return 404. Three.js: `anisotropy = maxAnisotropy`, `LinearMipmapLinearFilter`, `SRGBColorSpace`. Tessellation 128×64.

- **2026-05-14 — `_fetch_celestrak` silently broken: FORMAT=json never includes TLE lines.** CelesTrak GP JSON returns orbital element fields (MEAN_MOTION, ECCENTRICITY, etc.) but NOT `TLE_LINE1`/`TLE_LINE2`. `_parse_gp()` keyed on TLE_LINE1 → KeyError on every real call. Tests passed because mock fixtures included fabricated TLE keys — textbook mock-divergence bug. In production, CelesTrak always threw → SpaceTrack fallback took over silently. When SpaceTrack also failed, both failed and /satellites returned 503. Fix: `CELESTRAK_ACTIVE_URL` switched to `FORMAT=TLE` (3LE text), added `_parse_tle_text()`. Keep `_parse_gp()` only for SpaceTrack (which does include TLE lines). Rule: fixture data must match the real API response schema — never fabricate keys that differ from the actual response.

- **2026-05-14 — Chatbot timezone bug fixed: Melbourne time server-side.** `buildSystemPrompt` now calls `now.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'full', timeStyle: 'long' })` and injects both UTC and Melbourne strings. System prompt says "do not compute timezone offsets yourself." Rule: see presenter-only architectural rule above.

- **2026-05-14 — Satellite heights corrected: geo.height instead of hardcoded radius.** `propagator.worker.ts` used `r = 1.02`; `SatelliteMesh.ts` used `r = 1.06` — all satellites at the same visual height. satellite.js `eciToGeodetic` returns `geo.height` in km. Fix: `r = (6371 + geo.height) / 6371` in both. LEO (ISS ≈1.066), Starlink ≈1.086, GPS ≈4.17, GEO ≈6.62. Camera maxDistance 8→15, far plane 100→200. Rule: never hardcode orbital radius — derive from propagated altitude.

- **2026-05-14 — Click-to-select: screen-space proximity picking, not geometry raycaster.** `THREE.Raycaster.intersectObject` on InstancedMesh requires clicking inside the actual geometry (sphere radius 0.005 ≈ 3-4 px) — too precise for 10k satellites. Fixed threshold (20px) was too generous — with 10k satellites almost always one within 20px regardless of click location. Final fix: project each satellite position to screen via `Vector3.project(camera)`, compute `dotRadiusPx = (SPHERE_RADIUS / depth) * (height / (2 * tan(fov/2)))`, accept if `screenDist <= dotRadiusPx + 1px`. Stores `satNoradIds[]` parallel to `satNames[]` so click handler passes both. Prefill format: `"Tell me about NORAD <id> (<name>)"` — NORAD ID triggers exact match in Python `satellite_info()`, bypassing fuzzy name search.

- **2026-05-14 — Chatbot "satellite not found" fix: NORAD ID in prefill + hardened system prompt.** Claude sometimes answered from training knowledge without calling the tool, or mangled the satellite name in the query. Fix: (1) prefill includes NORAD ID so system prompt rule triggers exact lookup; (2) system prompt updated: "ALWAYS call this tool; NEVER answer satellite position, altitude, velocity, inclination, or orbital period from your training knowledge." Rule: when Claude is forbidden from using training data for a domain, make the tool call mandatory in the system prompt and structure the input to bypass fuzzy matching.

- **2026-05-14 — Session 10: Globe layout switched to full-screen with floating overlays.** The original 65/35 split (globe left, chat right) consumed 35% of the viewport for the AI panel that most users never interact with. Inspired by satellitetracker3d.com: globe is `absolute inset-0`, AI panel is a 320px right-side overlay toggled by a floating chat button (bottom-right). Satellite info card (top-left, below clock) decouples click-to-select from AI — clicking a satellite shows name + NORAD ID + "Ask AI" button rather than immediately filling the chat. This way the globe is unobstructed when exploring.

- **2026-05-14 — Session 10: Category filtering via Uint8Array mask, not worker re-init.** Initial approach considered re-initing the propagator worker with a filtered TLE array on each toggle. Rejected: worker re-init is ~200ms and rebuilds the InstancedMesh, causing a visual flash. Instead: `classifySatellite()` buckets each TLE name by regex at catalog load time; `rebuildCategoryMask()` produces a `Uint8Array` (`1`=active, `0`=hidden); `SatelliteField.update()` accepts an optional mask and sets hidden instances to scale-0 matrix (renders as nothing). Category mask is also applied in click and hover loops to skip hidden satellites. Rule: prefer a visibility mask over re-init for InstancedMesh filtering — avoids mesh teardown and keeps the frame continuous.

- **2026-05-14 — Session 10: AI chat is a presenter, not an info generator — enforced at the UI level.** The satellite info card (shown on click) deliberately separates exploration from AI. Clicking a satellite shows name + NORAD ID immediately from local data — no AI call. The "Ask AI about this satellite" button then opens the chat panel and prefills "Tell me about NORAD \<id\> (\<name\>)" so the backend does an exact `get_satellite_info` lookup. The AI only speaks when explicitly invoked, and only presents tool results, never generates values itself. This is the presenter-only architectural rule expressed in the UI: the globe is the data source, the AI is the voice.

- **2026-05-14 — Session 10: Ground track computed in Globe.ts using satellite.js directly.** The propagator worker already uses satellite.js. For the selected-satellite arc, importing satellite.js in Globe.ts (main thread) was simpler than adding a 'compute_arc' message round-trip to the worker. Arc computation for 180 points takes ~2ms — negligible on click. Pattern mirrors SatelliteMesh.computeArcPoints(): propagate 180 evenly-spaced points over one orbital period, rotate all by a single GMST snapshot, map ECI→Three.js ECEF. LineLoop recomputes every 60s. Rule: a 2ms main-thread computation on user interaction is preferable to worker message round-trips that add latency and code complexity.

- **2026-05-14 — ISS click/hover returns wrong module (Unity, Destiny) — fixed by priority check.** ISS docked modules (NORAD 26958 Unity, 27386 Destiny, etc.) share the same orbital position as ISS ZARYA (25544). The catalog InstancedMesh includes these modules as blue dots. Before the fix, clicking near the yellow ISS dot iterated the catalog buffer first and returned whichever docked module was geometrically closest in the buffer — not ISS ZARYA. Fix: both click and hover handlers check the ISS SatelliteMesh position against the cursor before iterating the catalog buffer. If the cursor is within the ISS dot radius (+2px tolerance for click, +6px for hover), the handler fires with `(issName, '25544')` and returns. `issName` is captured from the catalog on load (NORAD 25544 should be 'ISS (ZARYA)') with a hard fallback. Sentinel value `-2` for `hoveredIdx` prevents re-firing while cursor stays over the ISS. Rule: when a special object shares a position with catalog entries, always check it first in the pick loop.

- **2026-05-14 — localStorage catalog cache: serve-age vs max-age separation.** `loadCachedCatalog()` / `saveCatalogToCache()` in `celestrak.ts`. `SERVE_AGE_MS = 24h` (always serve immediately if within this age), `MAX_CACHE_AGE_MS = 72h` (hard reject). Background refresh fires on every call. Result: satellites instant for any user within 72h; cache key bumped (`v4` current) whenever source or format changes to force fresh fetch. Rule: for orbital data separate "when to refresh" from "when to block" — stale TLEs are better than a loading screen. Bump the key whenever catalog source/format changes.

- **2026-05-14 — Session 12 (post): Hover/select colour + click hit-area.** (1) Hovered/selected satellites turn lime green (`0x4ade80`). `SatelliteField.mat` is always white; all colour done via `instanceColor`. `refreshInstanceColor(idx)` applies HIGHLIGHT_COLOR when hovered or selected. (2) Click short-circuits to `hoveredIdx` when set — if tooltip is visible, click always fires at that satellite. Rule: use `hoveredIdx` as the click target when set; don't maintain separate, potentially inconsistent click thresholds.

- **2026-05-14 — Session 12: CI/CD via GitHub Actions (4 jobs).** `web` job runs lint + `tsc -b && vite build` + vitest; `api-typecheck` runs root `npx tsc --noEmit` targeting `api/chat.ts`; `orbital-test` runs pytest on Python 3.11; `orbital-docker` builds the Dockerfile to verify it compiles. All triggered on push to main and on PRs. The build step in `web` was preferred over just `tsc -b` to also verify the Vite bundle compiles — catching module resolution issues that tsc alone misses.

- **2026-05-14 — Session 12: ESLint errors fixed for CI.** `eslint-plugin-react-hooks` v7 adds two new strict rules that flagged three existing patterns. (1) `react-hooks/refs`: updating `onSatelliteClickRef.current` during render in `useGlobe.ts` — fixed by moving into `useLayoutEffect` (ensures ref is updated before any paint, same timing as the inline assignment). (2) `react-hooks/set-state-in-effect`: two intentional setState-in-effect patterns (prefill sync in `AgentPanel`, agent filter sync in `GlobeView`) — both are correct (triggered by external signals, no cascade risk), disabled with inline `eslint-disable-next-line` and a comment. Rule: when a lint rule flags a pattern that is genuinely correct, add a disable comment with a one-line explanation rather than fighting the linter or restructuring working code.

- **2026-05-14 — Session 12: CORS restricted to Vercel + localhost origins.** Changed `allow_origins=['*']` to explicit list `['https://getsatlas.vercel.app', 'http://localhost:5173', 'http://localhost:4173']` in FastAPI middleware. The `*` was a temporary MVP shortcut; with the domain stable, open CORS is an unnecessary attack surface.

- **2026-05-14 — Session 12: CelesTrak direct browser fetch replaces Railway as primary catalog source.** Production satellite trackers (satellitetracker3d.com et al.) bypass their own backends for TLE data by fetching directly from CelesTrak in the browser. CelesTrak has CORS enabled and never blocks user IPs; only cloud IPs (Railway, AWS) get 403 on `GROUP=active`. Fix: `celestrak.ts` now attempts `fetchFromCelesTrak()` first (browser fetch, `FORMAT=TLE`), falls back to `fetchFromRailway()` only on error. Result: catalog load is decoupled from Railway cold starts entirely. Rule: for public CDN data that browsers can fetch directly and CORS is enabled, always fetch in the browser — eliminates server cold-start latency on the most important data path.

- **2026-05-14 — Session 12: Propagator worker crash on malformed TLEs from CelesTrak.** After switching to direct CelesTrak TLE text fetch, a malformed TLE entry caused `twoline2satrec` to throw, which propagated uncaught through the `map()` in the `init` handler. On every subsequent `tick`, the forEach hit the bad `satrec` and called `propagate()` on it, which returned `{ position: false }` — but the guard was `typeof posVel.position === 'boolean'` which doesn't catch `null`/`undefined`. `eciToGeodetic` then received a non-object and threw `TypeError: undefined is not an object (evaluating 'n.x')` on every single tick, silently aborting the entire propagation frame (all satellites zeroed). Fix: (1) wrap `twoline2satrec` in try-catch and store `null` for bad TLEs; (2) skip `null` slots in the tick handler; (3) tighten position guard to `!posVel.position || typeof posVel.position !== 'object'`; (4) wrap each satellite's propagation block in try-catch so one bad satellite never aborts the full forEach. Rule: propagation workers must be hardened at two levels — TLE init (return null, not throw) and per-satellite propagation (catch per satellite, never catch at loop level).

- **2026-05-14 — Session 12: Never cap catalog below what the frontend renders.** `satellites.py` had `LIMIT = 10000` — the frontend (browser direct fetch, no limit) showed ~15k; Python backend only knew 10k; any satellite in the difference returned 404. Fix: removed all `[:LIMIT]` slices. Rule: catalog source-of-truth and backend search scope must cover the same set. Bump localStorage cache key whenever catalog source or format changes.

- **2026-05-14 — Session 13: 25k satellite / debris problem traced to stale SpaceTrack cache.** Old `v2` localStorage cache held a SpaceTrack snapshot (unfiltered, 25k objects including rocket bodies and debris). CelesTrak `GROUP=active` is user-IP-friendly (~9k active payloads), but the cache was populated before browser-direct fetch was the primary path. Fix: bump key to `v3` (forces fresh CelesTrak fetch on next visit); restrict SpaceTrack fallback query to `OBJECT_TYPE/PAYLOAD` with `limit/10000`. Rule: whenever the catalog source or shape changes, bump the cache key — never assume users will get fresh data without an explicit invalidation.

- **2026-05-14 — Session 13: Soft catalog refresh eliminates 30-min satellite gap.** Every 30 minutes `initCatalog` was disposing the InstancedMesh and recreating it. During the ~1–3s worker initialisation, all satellite dots disappeared. Fix: `initCatalog` checks `this.field && this.worker && |newCount - oldCount| <= 200` and, when true, skips mesh teardown and just re-posts `{ type: 'init', tles }` to the existing worker. The worker atomically replaces its `satrecs` array; positions update on the next tick. Full rebuild (dispose + recreate) only on first load or when count changes significantly. Rule: never tear down an InstancedMesh on a background refresh — re-init the worker in place to avoid a visible rendering gap.

- **2026-05-14 — Session 13: 72h stale-serve cache — satellites always instant on any reload.** Previous hard 24h cutoff returned `null` from `loadCachedCatalog` after expiry, forcing a network wait even on the 30-min background refresh. TLEs are valid for several days. New scheme: `SERVE_AGE_MS = 24h` (always serve from here immediately), `MAX_CACHE_AGE_MS = 72h` (hard reject, true first-visit case). Background refresh fires on every `fetchSatelliteCatalog` call. Satellites are instant for any user who visited within 72h. Rule: for orbital data, separate "when to refresh" from "when to block" — stale TLEs are better than a loading screen.

- **2026-05-14 — Session 13: Hover/click occlusion — satellites on far side of earth were triggering tooltips.** Satellites on the opposite hemisphere project to valid 2D screen coordinates (they are in front of the camera, physically behind the earth mesh). The pick loop had no check for this. Fix: add `if (satX*camX + satY*camY + satZ*camZ <= 0) continue` before `Vector3.project()`. The dot product of the satellite's world position and the camera's world position (both from earth centre) is negative when they are on opposite hemispheres — a necessary condition for earth occlusion. O(1) per satellite. Rule: always apply a hemisphere occlusion check before screen-space picking on a globe — the earth mesh blocks geometry but not screen-space projections.

- **2026-05-14 — Session 13: Z-ordering fix — depth not screen distance determines winning satellite.** When two satellites projected to overlapping screen positions, the loop picked the one with smallest `screenDist` regardless of depth. A GEO satellite at 35,786 km could win over a LEO satellite at 400 km if it happened to project 1px closer to the cursor. Fix: change pick criterion to `depth < bestDepth` among all candidates within `dotRadiusPx + HOVER_EXTRA_PX`. Closest satellite to the camera always wins. Rule: in 3D picking, depth is the correct tiebreaker for overlapping 2D hits — screen distance is a proximity filter, not a priority order.

- **2026-05-14 — Session 13: System prompt hardened against training-data fallback on tool errors.** When Railway timed out (5s ORBITAL_FETCH_TIMEOUT_MS), tool results contained `{ error: '...' }`. Claude would see the error but still generate an answer from training knowledge — violating the presenter-only rule. The system prompt previously only said "if data is missing, say unavailable." Fix: add explicit override: "IF ANY TOOL RETURNS AN ERROR OR TIMEOUT: respond with exactly 'The live data service is temporarily unavailable — please try again in a moment.' Do NOT use training knowledge." Rule: the presenter-only rule must cover the error case explicitly — Claude will infer "well, I have relevant knowledge" unless the prohibition is stated for errors specifically.

- **2026-05-15 — Session 15: searchCatalog() checks ISS separately before catalog arrays.** Globe.initCatalog() extracts ISS (NORAD 25544) into a separate SatelliteMesh and removes it from satNoradIds/satNames. Any public method that traverses the catalog arrays will silently miss ISS. Fix pattern: every catalog-traversal method checks this.issName / ISS_NORAD first, then searches satNoradIds. Rule: whenever a special object is split from the catalog for separate rendering, add an explicit early check in all catalog-traversal public methods.

- **2026-05-15 — Session 15: selectCatalogSatellite() dispatches ISS via issSatrec, not showGroundTrack.** showGroundTrack(idx) requires a valid index in satNoradIds — ISS has none after being stripped. For ISS: clearGroundTrack() + handleSatSelect(ISS_NORAD, issSatrec) + onSatelliteClick(). For catalog: showGroundTrack(idx) + onSatelliteClick(). Globe.onSatelliteClick fires through the useGlobe callback chain to GlobeView.onSatelliteSelect — don't call onSatelliteSelect explicitly in the SearchBar.onSelect handler or it fires twice. Rule: any programmatic satellite selection must replicate the exact two-step click-handler flow; don't add extra callback fires at the UI layer.

- **2026-05-16 — Catalog loading: /api/catalog Vercel function with Space-Track + edge caching.** CelesTrak GROUP=active was fetched browser-direct with no timeout — could hang for minutes for Australian users (far from US servers). Fix: `api/catalog.ts` Vercel function authenticates to Space-Track (no IP restrictions), returns TLEs with `Cache-Control: public, s-maxage=7200`. Vercel CDN caches the 2MB response at each edge node — sub-100ms globally after first call. Browser races /api/catalog and CelesTrak direct simultaneously via `Promise.any()`; each source has a 10s AbortSignal timeout. First responder wins. Rule: always race catalog sources in parallel rather than trying sequentially — effective max wait = single timeout, not N × timeout.

- **2026-05-16 — Space-Track 3LE format required; format/tle (2LE) breaks parseTleText.** `format/tle` returns 2-line elements (no name line). `parseTleText()` expects 3LE. With 2LE, TLE line 2 of satellite N becomes the "name" of satellite N+1, norad_id is always N+1's (not N's), and only ~N/2 records are produced. Symptoms: names showed as "2 54702 59.9976 338.8258...", count was ~10k instead of ~20k, ISS sometimes not found for TLE update. Fix: `format/3le`. Rule: always use `format/3le` with Space-Track's gp endpoint — `format/tle` returns 2LE which is incompatible with 3LE parsers.

- **2026-05-16 — ISS orbital ring showed at wrong position because fallback TLE was from March 2024.** SatelliteMesh constructor uses hardcoded TLE constants (ISS_TLE1, ISS_TLE2) as fallback. These have epoch `24087` (March 2024). SGP4 extrapolation 14+ months past epoch gives completely wrong positions. The AI's `highlight_on_globe` tool uses backend-computed lat/lon (correct); the ring was rendered from the stale satrec → ring appeared in a different hemisphere from the dot. Two fixes: (1) `format/3le` ensures ISS is always found in catalog and `updateTle()` called within seconds; (2) `arc.visible = false` in constructor, set to true only after `updateTle()` — stale fallback TLEs never produce a visible wrong ring. Rule: never render a propagated orbit from a TLE whose epoch is more than a few days old; hide until a fresh TLE arrives.

- **2026-05-16 — Space-Track 3LE name lines prefixed with "0 ".** CelesTrak 3LE has plain name lines (`ISS (ZARYA)`). Space-Track 3LE prefixes with line-type indicator (`0 ISS (ZARYA)`). `parseTleText()` now strips leading `"0 "` before storing name. Rule: when switching TLE sources, check name-line format — different providers use different conventions.

- **2026-05-17 — Session 16: GitHub OIDC for CI — no long-lived AWS keys in GitHub.** `aws-actions/configure-aws-credentials@v4` with `role-to-assume` via OIDC. IAM role `satlas-ci` trust policy scoped to `repo:PremaanshVyas/satlas:*`. Alternative rejected: storing `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` as GitHub secrets — those rotate on a schedule and can leak. Rule: for CI/CD to AWS, always use OIDC-based role assumption; never store IAM user keys in GitHub.

- **2026-05-17 — Session 16: Space-Track 3LE format — `class/gp/EPOCH/%3Enow-30/format/3le`.** Returns all catalog objects with an epoch in the last 30 days (~25-30k). Previous format/tle (2LE) broke the 3LE parser (name lines absent → count halved, names showed as TLE line data). Rule: always use `format/3le` with the Space-Track GP endpoint; `format/tle` is 2LE and incompatible with 3LE parsers.

- **2026-05-17 — Session 16: S3+CloudFront for catalog — ECS writes every 2h, browser reads from CDN.** CelesTrak's 1-download-per-IP-per-2h rate limit and cloud IP blocks make server-side CelesTrak fetches unreliable. Space-Track has no IP restriction. ECS fetches Space-Track → writes `catalog.tle` to S3 → CloudFront serves globally with 2h TTL. Browser still races CloudFront and CelesTrak direct via `Promise.any()`. Rule: for any data that updates on a known schedule, prefer a CDN cache write by a trusted server over per-user direct fetches.

- **2026-05-17 — Session 16: HTTP-only ALB, no custom domain yet.** ACM certificate requires a registered domain name. No custom domain registered for Satlas. ALB serves HTTP on port 80 only; `VITE_ORBITAL_SERVICE_URL` set to `http://<ALB_DNS>`. HTTPS can be added when a domain is registered. Rule: don't block infra progress on domain registration — HTTP-only ALB is fine for a portfolio project with no user-facing URL on the ALB.

- **2026-05-17 — Session 16: DATABASE_URL generated by Terraform `random_password` resource.** RDS password is a Terraform-managed random string (32 chars, no specials to avoid shell-escaping issues). Full connection string written to Secrets Manager as `satlas/DATABASE_URL`. ECS task injects it as an env var from Secrets Manager. `db.py` reads it at startup; if unset, migration is skipped silently (local dev). Rule: never hardcode database credentials — always use Terraform random_password + Secrets Manager + env var injection.

- **2026-05-17 — Session 16: CloudFront uses custom_origin_config (not OAI/OAC) for public S3 bucket.** The catalog S3 bucket has a public read bucket policy (Principal: "*"). Using `s3_origin_config` with an empty OAI string caused a Terraform apply error. For a public bucket, the correct pattern is `custom_origin_config` with `https-only` and the bucket's regional REST API domain — no OAI or OAC needed because the bucket policy already allows public reads. Rule: use OAI/OAC only for private buckets; for public buckets use custom_origin_config pointing at the regional REST API endpoint.

- **2026-05-18 — Session 17: Multi-satellite selection uses NORAD ID string keys, not array indices.** Single-selection used `selectedSatIdx: number` (the InstancedMesh buffer index). Multi-selection needs to handle both catalog satellites (have an index) and ISS (stripped from catalog, no index). Solution: `selectedNoradIds: Set<string>` and `groundTrackLines: Map<string, THREE.LineLoop>` keyed by NORAD ID — works uniformly for both. `selectedIdxs: Set<number>` maintained in parallel only for `refreshInstanceColor()` performance (avoids iterating all instances on each color update). Rule: when a special object is split from the catalog for separate rendering, use a string key (NORAD ID) rather than a buffer index for any multi-object tracking — indices don't generalise across mesh boundaries.

- **2026-05-18 — Session 17: `clearAllSelections()` fires `onSatelliteRemove` per satellite — keeps React state in sync.** Globe's Three.js multi-select state (Maps + Sets) and App.tsx's React state (`selectedSats` array, `cardSat`) can diverge on catalog rebuild (which calls `clearAllSelections`). Fix: `clearAllSelections` iterates `selectedNoradIds` and fires `onSatelliteRemove` for each, which App.tsx handles via `handleSatelliteRemove` to clean React state. Rule: any Globe method that clears selection state must fire the same callbacks that individual removals fire — otherwise App.tsx React state and Globe Three.js state diverge.

- **2026-05-18 — Session 17: Cloud layer uses AdditiveBlending + alphaMap on a second sphere at radius 1.012.** `THREE.AdditiveBlending` means the cloud texture adds light — clouds appear bright over dark ocean, subtly bright over lit land, and invisible (adds zero) in fully transparent areas. `depthWrite: false` prevents the cloud sphere from occluding satellites behind it. Texture from `clouds.matteason.co.uk` (free, CORS enabled, updates every ~3h, stable URL). Browser cache handles freshness. Rule: for atmospheric overlay layers in Three.js, prefer AdditiveBlending over AlphaBlending — AdditiveBlending naturally handles transparency without requiring a separate opacity mask and doesn't darken the globe surface.

- **2026-05-18 — Session 17: AI category counts injected into system prompt — no tool round-trip.** Original approach (`get_category_counts` tool) called the Python backend, which classified its own cached catalog. Problem: Python catalog and browser catalog can diverge (different sources, different caches). Better: `Globe.getAllCategoryCounts()` returns counts from the in-memory `satCategories` array — the same data the globe renders. Fired on `onCatalogRefresh`, flows through `useGlobe` → `onCategoryCounts` prop → `App.tsx` `categoryCounts` state → `handleSendMessage` → `api/chat.ts` `buildSystemPrompt`. System prompt includes a "Live catalog counts" block the AI reads directly. Rule: when the frontend already has computed data that the agent needs, inject it into the system prompt rather than adding a tool call — eliminates network latency and source-of-truth divergence.

- **2026-05-18 — Pre-Session 18: Platform renamed from "Aussie Sky" to "Satlas".** Name was geographically misleading — platform tracks global orbital objects, not just Australian sky. Renamed across all code, infra, docs, GitHub repo, Vercel project. Interim deployment URL: `getsatlas.vercel.app` (`satlas.vercel.app` was already claimed by another Vercel user globally). Plan to move to `satlas.app` once domain is registered. Rule: all cache keys (`satlas-catalog-v4`), old aussie-sky keys added to `LEGACY_KEYS` in `celestrak.ts` so users' browsers clean them up automatically on next load.

- **2026-05-18 — Pre-Session 18: Env var naming split — SPACE_TRACK_ on Vercel, SPACETRACK_ on ECS.** `api/catalog.ts` (Vercel serverless) reads `SPACE_TRACK_USER`/`SPACE_TRACK_PASS` — named that way in the Vercel dashboard. `apps/orbital/satellites.py` (ECS) reads `SPACETRACK_USER`/`SPACETRACK_PASS` — the Secrets Manager secrets are named `SPACE_TRACK_USER`/`SPACE_TRACK_PASS` but `ecs.tf` maps them to `SPACETRACK_USER`/`SPACETRACK_PASS` when injecting into the container. Rule: when env var names differ between platforms, make each file read what its platform actually provides — don't try to force a single name everywhere if one side's naming is already set in a dashboard you don't control.

- **2026-05-19 — Session 18: Chat panel uses easeOut tween, not spring, to prevent overshoot glitch.** Framer Motion spring animations (`type: 'spring'`) can overshoot the target value before settling. On the full-height chat panel (`x: '100%' → 0`), the overshoot moved the panel slightly past the left viewport edge, making it appear to "flash wide" before snapping back. Fix: `transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}` (CSS ease cubic-bezier, no overshoot). The chat button `type: 'spring'` is kept intentionally — small scale animation; subtle bounce is desirable there. Rule: use spring animations for small UI elements (buttons, chips) where bounce adds character; use easeOut tweens for large panel slides where overshoot causes visible layout jank.

- **2026-05-19 — Session 18: Send button clip — 3-attempt debugging journey; root cause was `min-w-0` on input.** The bug was described as "d in Send button clipped" but was actually horizontal (right-side) clipping of "nd" in "Send". Three attempts needed to expose the true cause. **Attempt 1** (wrong diagnosis): Thought it was vertical sub-pixel overflow. Changed panel from `absolute inset-y-0` → `position: fixed`; made AgentPanel `h-full flex flex-col`. In Safari, `h-full` resolves to `auto` when the parent has no *explicit* height — only flex-determined. CSS 2.1 §10.5: percentage heights require a "specified" (non-auto) height on the containing block. Safari strictly enforces this; AgentPanel became content-sized. Still broken. **Attempt 2** (wrong): Made panel `relative`, AgentPanel `absolute inset-0 flex flex-col`. Chrome: mostly worked. Safari: AgentPanel got `height: 0` — same CSS 2.1 spec issue applies to absolutely positioned children of flex items without explicit heights. User reported: "I can't see it in Safari and very tiny in Chrome." **Attempt 3** (correct): (1) Panel: `position: fixed` with `style={{ top: 0, bottom: 0 }}` — inline style avoids Tailwind class quirks, positions against viewport always. (2) AgentPanel renders as `<>` fragment — message list (`flex-1 min-h-0`) and input bar (`flex-none`) become direct flex children of the fixed panel, eliminating all height propagation across component boundaries. No spec ambiguity. (3) `min-w-0` on both the flex row `<div>` AND the `<input>` element. HTML inputs have a browser-default `min-width` derived from the placeholder text ("Ask anything…" ≈ 150-200px). Without `min-w-0`, `flex-1` cannot shrink the input below that minimum, so the Send button is pushed past the panel's right edge and clipped by `overflow-hidden`. Root div: `overflow-x-hidden` (not `overflow-hidden`) — fixed elements aren't clipped by ancestor overflow, but the directional change is semantically correct. Rule: (1) Full-screen overlay panels: use `position: fixed` with `style={{ top: 0, bottom: 0 }}`. (2) For components that must fill a flex item: render as a fragment so children participate directly in the flex context — never rely on `h-full` or `absolute inset-0` across component boundaries. (3) Any `flex-1` on `<input>`: always add `min-w-0` to both the input and its flex container — browser-default input min-width is invisible until it overflows.

- **2026-05-19 — Session 18: `find_satellites_overhead` implemented in Node.js, not Python.** The README and chat UI claimed "find satellites overhead" worked — it didn't. The `api/chat.ts` only had 4 tools; there was no overhead search tool at all. Fix: added a 5th tool to `chat.ts` that (1) fetches the full catalog from `/api/catalog` (Vercel CDN-cached, ~50ms warm), (2) strips debris/rocket bodies by name heuristic reducing ~20k to ~5-8k payloads, (3) propagates all of them to the same `now` instant with a single pre-computed GMST, and (4) returns the top 25 by elevation with compass direction. Key design: computing GMST once before the loop (not inside) is correct — all satellites are evaluated at the same instant. `CATALOG_BASE` env var allows local dev override. Total tool execution: ~1-2s warm, ~5-6s cold — within Vercel Hobby's 10s limit. Rule: for bulk propagation to the same instant, compute GMST once outside the loop; per-satellite GMST computation is wasted work since the time doesn't change between satellites.

- **2026-05-18 — Session 17: Mobile viewport — 100dvh container + env(safe-area-inset-*) for overlays.** `100vh` > visible viewport on mobile (browser chrome takes space but `vh` doesn't account for it). `100dvh` (dynamic viewport height, supported in all modern mobile browsers) matches the actual visible area. Safe-area CSS env variables (`env(safe-area-inset-top, 0px)` etc.) handle notch and home bar insets. Pattern for overlay elements: `style={{ top: \`max(0.75rem, calc(${safeTop} + 0.25rem))\` }}` — guarantees minimum clearance even on devices with no notch. The canvas (full bleed, `absolute inset-0`) and overlay wrapper (separate layer, `pointer-events-none`) must be siblings — not nested — so the canvas occupies the full screen while overlays float above it. Rule: for any full-screen web app, use `100dvh` for the container and `env(safe-area-inset-*)` for UI element positioning; never use `100vh` on mobile.

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
3. For the full session context prompt for the next session, see `docs/session-19-bootstrap.md`.

This file is the contract. If something here is wrong or stale, fix the file before fixing the code.

---

## Notes for the assistant

- Don't propose framework changes (e.g. swap React for Vue) without explicit reason.
- Don't suggest abandoning the AI agent layer — that's the architectural commitment.
- When a problem is genuinely outside scope, say so directly and offer to log it for V3.
- Keep responses concise. Prose over bullets unless listing genuinely parallel things.
- If asked to write code, follow the conventions section above.
- **Document everything, including failures.** Every wrong turn, failed attempt, and multi-step debugging journey gets an ADR entry in the Decisions log. This is a portfolio project — the journey matters as much as the result. Never omit the mistakes.
- **Keep CLAUDE.md under 40,000 characters.** If it grows past that, move the session bootstrap prompt to `docs/session-NN-bootstrap.md` and link to it.
- **Keep docs in sync.** At the end of every session: update Active scope, add ADR entries for any non-obvious decisions, update `docs/session-NN-bootstrap.md` for the next session.

---

## Docs map — what lives where

| File | What it contains |
|------|-----------------|
| `CLAUDE.md` | Master context: project goal, architecture, tech stack, active scope, decisions log. Update every session. |
| `docs/session-19-bootstrap.md` | Session 19 bootstrap (historical). |
| `docs/session-20-bootstrap.md` | Next session full context prompt — paste at start of Session 20. |
| `docs/decisions-archive.md` | ADR entries from Sessions 1–11, migrated to keep CLAUDE.md under 40k. |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | Implementation plans. One file per session/feature. |
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | Design specs produced during brainstorming sessions. |
| `CHANGELOG.md` | User-facing change log. Updated when a session ships something visible. |
| `README.md` | Public-facing project overview. What it does, how to run it locally, deploy notes. |
