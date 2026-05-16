# CLAUDE.md — Aussie Sky working context

This file is the bootstrap context for any Claude session working on this project.

**If you (Claude) are reading this in a new session:** read this file fully before suggesting code or making changes. It is the source of truth for what we're building, what's been decided, and what's in progress.

**For mickey:** inside Claude Code, this file is auto-read at session start. For new sessions elsewhere, paste it at the start of the chat.

---

## Who I'm working with

Premaansh ("mickey") — international student doing CS at RMIT in Melbourne. Building this as a portfolio project to land a software engineering internship in Australia. Communicates concisely and redirects rather than elaborates when something doesn't resonate. Uses AI for craft and execution help, not idea generation. Has roughly 15 hours per week to put on this. No fixed deadline but wants steady momentum and a live MVP early.

Important: mickey is learning some of this stack as he builds. When you propose code, briefly explain the *why* of unfamiliar patterns. When he asks a "small" question that's actually deep, treat it as worth a real answer. Don't hedge unnecessarily.

---

## What we're building

Aussie Sky — a real-time, open-source space situational awareness platform with an AI agent as the primary interface.

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
aussie-sky/
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

**Current phase:** Post-session-15 reliability sprint — catalog loading overhauled (Space-Track via Vercel edge cache), 20k satellites, correct names and ISS ring. 54 Vitest tests; tsc clean; lint clean.

**Next milestone:** Session 16 — AWS migration: ECS Fargate for Python orbital service; ECR image push in CI; RDS PostgreSQL for alert subscriptions; Terraform for all AWS resources; Sentry error monitoring.

**Session 15 completed tasks:**
- [x] Verified three Session 14 reliability fixes (celestrak legacy fallback, ISS TLE flow, satellite.js in api/chat.ts) — all confirmed correct, no changes needed
- [x] Text search on globe: type to find any satellite by name or NORAD ID — SearchBar component + Globe.searchCatalog() + Globe.selectCatalogSatellite() + 9 new tests
- [x] README local dev setup — complete instructions: clone, install, run frontend, run AI chat locally (Vercel CLI), run tests
- [x] README tech stack accuracy — added Live/Planned status, correct satellite count, accurate infra table

**Post-session-15 reliability fixes (pre-session-16):**
- [x] `api/catalog.ts` — new Vercel serverless function: authenticates to Space-Track, returns ~20k TLEs with `Cache-Control: s-maxage=7200` (Vercel CDN edge cache, sub-100ms globally after first call)
- [x] `celestrak.ts` — `Promise.any()` races /api/catalog and CelesTrak simultaneously; 10s per-source timeout replaces old no-timeout hang; clears legacy v1/v2/v3 localStorage keys on save to eliminate 10k ghost count
- [x] `api/catalog.ts` — `format/tle` → `format/3le` fixes: satellite names (were showing TLE line 2 data), count (~10k → ~20k), ISS ring position (ISS now reliably found in catalog for TLE update)
- [x] `SatelliteMesh.ts` — ISS orbital ring hidden until `updateTle()` delivers a fresh TLE; stale March-2024 fallback TLE can no longer produce a visible wrong ring
- [x] `celestrak.ts` — strips Space-Track's `0 ` line-type prefix from satellite names
- [x] `GlobeView.tsx` — pulsing "Loading catalog…" badge while catalog is in flight; replaced full-screen "Loading satellite catalog…" overlay text with "Initializing…"

**Sessions 1–14 (complete, stable):** See `docs/session-14-bootstrap.md` for full task lists. Key highlights: globe, ISS SGP4, agent + tools, CI/CD, CORS, hover/click, category filters, orbital arcs, agent-driven filter, live satellite info card, Railway eliminated from critical path.

**Blockers:** None.

---

## Decisions log (ADR-lite)

Format: date, decision, rationale, rule to remember.

- **2026-05-10 — Project initialized.** Aussie Sky concept (3D SSA + AI agent), monorepo, AWS. Alternatives rejected: pure Earth Observation (less visually striking), ML-only bushfire pipeline (narrower stack). Bushfire detection folded in as V2 vision-pipeline use case.

- **2026-05-10 — AI agent is the primary interface, not a side feature.** Every user query goes through Claude with tool use. Avoids the "AI bolted on" pattern that dominates current portfolio projects.

- **2026-05-10 — Defer Go gateway until V1.** Frontend talks directly to FastAPI for MVP. Add Go for production hardening later.

- **2026-05-11 — Three deploy fixes to `api/chat.ts`.** (1) Edge runtime incompatible with Anthropic SDK (references node:fs/node:path) — removed `runtime: 'edge'`, use Node default. (2) Root `package.json` missing `"type": "module"` — ES module imports failed. (3) Node runtime needs VercelRequest/VercelResponse (not Web Request API) — `req.json` not a function. Rule: Vercel Node runtime ≠ Edge runtime; check SDK compatibility before choosing runtime.

- **2026-05-12 — CelesTrak IP block → space-track.org fallback.** Railway's cloud IP range blocked by CelesTrak (403, IP-based, not header-based). space-track.org is the authoritative source (CelesTrak mirrors it), no IP restrictions, free account, session-cookie auth. `VITE_ORBITAL_SERVICE_URL` is a Vite build-time variable — set in Vercel env vars before build; cleared build cache required.

- **2026-05-13 — CelesTrak CATNR not blocked; GROUP=active blocked.** Single-satellite CATNR queries (e.g. `?CATNR=25544&FORMAT=TLE`) work from Railway. GROUP=active returns 403. Rule: always use CATNR for guaranteed single-satellite fetches; use GROUP=active for bulk (fallback to space-track if 403); never rely on orbital parameter filters to include specific named satellites.

- **2026-05-13 — Session 6: CelesTrak as primary, space-track as fallback.** SpaceTrack query with `MEAN_MOTION > 11.25 & ECCENTRICITY < 0.25` excluded Hubble (NORAD 20580) and intermittently ISS. Fix: CelesTrak GROUP=active + User-Agent header. ISS extracted from catalog and fed to SatelliteMesh.updateTle() so hardcoded TLE is replaced within seconds of app load. `GET /tle/iss` added for external consumers.

- **2026-05-13 — ISS position accuracy: separate 5-min TLE cache.** `/tle/iss` was calling `get_satellites()` which served the 30-min catalog cache. ISS at 7.66 km/s × 1800 s = 13,788 km drift. Fix: separate `_iss_cache` with 5-min TTL, frontend refreshes every 2 min. Rule: never share cache TTL between real-time position data and bulk catalog — they have different accuracy requirements.

- **2026-05-13 — Coordinate transform bug (Sessions 1-6 were wrong).** `THREE.SphereGeometry` UV places prime meridian at +X. Both propagation formula and solar formula incorrectly placed it at +Z (90° systematic error). Correct: `(r·cos(lat)·cos(lon), r·sin(lat), -r·cos(lat)·sin(lon))`. Solar: `(xECEF, zECEF, -yECEF)`. Fixed in propagator.worker.ts, SatelliteMesh.ts, Globe.ts, solar.ts simultaneously.

- **2026-05-13 — ISS orbit arc: three-attempt debugging journey (portfolio record).** Attempt 1: `THREE.LineLoop` auto-closes the path — drew a diagonal across the 22.9° Earth-rotation gap for a full-period ECEF arc. Fix: switched to `THREE.Line` (open). Attempt 2: `Line` exposed the gap was real — ECEF ground tracks are mathematically open curves (Earth rotates under the satellite). Fix: switched arc to ECI coordinates (fixed to stars). In ECI, ISS orbit is a closed ellipse — `LineLoop` correct again. Apply current GMST rotation to all arc points so the ring sits at the correct longitude. Ring only needs recomputing on TLE update (not every 60 s). The dot/halo remain in ECEF (real geographic position); the ring is in ECI+GMST (orbital plane). Rule: ground tracks in ECEF are open — use ECI for closed orbital rings.

- **2026-05-13 — Architectural rule: Claude is the presenter, never the calculator.** Claude must not compute, infer, or guess any data value shown to the user — not time, not timezone offsets, not satellite positions, not pass windows. Every value must come from a backend tool result or a pre-computed server-side value. If data is missing, say unavailable. Violation that prompted this rule: passed UTC time and let Claude infer the Melbourne offset → got AEST/AEDT wrong. Fix pattern: compute it server-side, hand Claude the answer to format.

- **2026-05-13 — Globe camera highlight: never include tools in the streaming answer turn.** Second Claude call had `tools: TOOLS`. Haiku called `highlight_on_globe` in the streaming turn; the streaming loop only handles `text_delta` events, so the tool call was silently dropped. Fix: remove `tools` from the answer turn entirely. Rule: if the answer turn must produce text, pass no tools — force text output, not a tool call.

- **2026-05-13 — Chatbot reliability: haiku for tool-detection, 5s orbital timeout, Railway keepalive.** Vercel Hobby 10s hard cap (maxDuration: 60 is silently ignored). Sonnet tool-detection consumed 3–5s, leaving no headroom for Railway cold starts (2–8s). Fix: haiku for tool-detection (~1s), haiku for answer streaming. Orbital timeout 5s. Globe pings `/health` every 4 min to prevent Railway free-tier sleep. Rule: use the fastest model capable of the task; tool-detection is routing, not reasoning.

- **2026-05-13 — Session 8: Earth texture upgrade.** NASA Blue Marble 8192×4096 JPEG (5.7MB) + Black Marble 2012 3600×1800 (1.1MB). Working NASA image paths: `/imagerecords/57000/57752/` (day) and `/imagerecords/79000/79765/` (night) — the `/74000/74117/` paths return 404. Three.js: `anisotropy = maxAnisotropy`, `LinearMipmapLinearFilter`, `SRGBColorSpace`. Tessellation 128×64.

- **2026-05-14 — `_fetch_celestrak` silently broken: FORMAT=json never includes TLE lines.** CelesTrak GP JSON returns orbital element fields (MEAN_MOTION, ECCENTRICITY, etc.) but NOT `TLE_LINE1`/`TLE_LINE2`. `_parse_gp()` keyed on TLE_LINE1 → KeyError on every real call. Tests passed because mock fixtures included fabricated TLE keys — textbook mock-divergence bug. In production, CelesTrak always threw → SpaceTrack fallback took over silently. When SpaceTrack also failed, both failed and /satellites returned 503. Fix: `CELESTRAK_ACTIVE_URL` switched to `FORMAT=TLE` (3LE text), added `_parse_tle_text()`. Keep `_parse_gp()` only for SpaceTrack (which does include TLE lines). Rule: fixture data must match the real API response schema — never fabricate keys that differ from the actual response.

- **2026-05-14 — Chatbot timezone bug fixed: Melbourne time server-side.** `buildSystemPrompt` now calls `now.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'full', timeStyle: 'long' })` and injects both UTC and Melbourne strings. System prompt says "do not compute timezone offsets yourself." Rule: see presenter-only architectural rule above.

- **2026-05-14 — Stale cache fallback added to get_satellites().** When both CelesTrak and SpaceTrack fail (deploy cold starts, transient network), `/satellites` previously returned 503 → frontend ran ISS-only silently. Fix: if both sources fail and `_cache['tles']` is populated from a prior fetch, serve stale data. Satellites only disappear on fresh Railway deploys before any successful fetch. Rule: always serve stale data rather than 503 for catalog endpoints.

- **2026-05-14 — Satellite heights corrected: geo.height instead of hardcoded radius.** `propagator.worker.ts` used `r = 1.02`; `SatelliteMesh.ts` used `r = 1.06` — all satellites at the same visual height. satellite.js `eciToGeodetic` returns `geo.height` in km. Fix: `r = (6371 + geo.height) / 6371` in both. LEO (ISS ≈1.066), Starlink ≈1.086, GPS ≈4.17, GEO ≈6.62. Camera maxDistance 8→15, far plane 100→200. Rule: never hardcode orbital radius — derive from propagated altitude.

- **2026-05-14 — Click-to-select: screen-space proximity picking, not geometry raycaster.** `THREE.Raycaster.intersectObject` on InstancedMesh requires clicking inside the actual geometry (sphere radius 0.005 ≈ 3-4 px) — too precise for 10k satellites. Fixed threshold (20px) was too generous — with 10k satellites almost always one within 20px regardless of click location. Final fix: project each satellite position to screen via `Vector3.project(camera)`, compute `dotRadiusPx = (SPHERE_RADIUS / depth) * (height / (2 * tan(fov/2)))`, accept if `screenDist <= dotRadiusPx + 1px`. Stores `satNoradIds[]` parallel to `satNames[]` so click handler passes both. Prefill format: `"Tell me about NORAD <id> (<name>)"` — NORAD ID triggers exact match in Python `satellite_info()`, bypassing fuzzy name search.

- **2026-05-14 — Chatbot "satellite not found" fix: NORAD ID in prefill + hardened system prompt.** Claude sometimes answered from training knowledge without calling the tool, or mangled the satellite name in the query. Fix: (1) prefill includes NORAD ID so system prompt rule triggers exact lookup; (2) system prompt updated: "ALWAYS call this tool; NEVER answer satellite position, altitude, velocity, inclination, or orbital period from your training knowledge." Rule: when Claude is forbidden from using training data for a domain, make the tool call mandatory in the system prompt and structure the input to bypass fuzzy matching.

- **2026-05-14 — Session 10: Globe layout switched to full-screen with floating overlays.** The original 65/35 split (globe left, chat right) consumed 35% of the viewport for the AI panel that most users never interact with. Inspired by satellitetracker3d.com: globe is `absolute inset-0`, AI panel is a 320px right-side overlay toggled by a floating chat button (bottom-right). Satellite info card (top-left, below clock) decouples click-to-select from AI — clicking a satellite shows name + NORAD ID + "Ask AI" button rather than immediately filling the chat. This way the globe is unobstructed when exploring.

- **2026-05-14 — Session 10: Category filtering via Uint8Array mask, not worker re-init.** Initial approach considered re-initing the propagator worker with a filtered TLE array on each toggle. Rejected: worker re-init is ~200ms and rebuilds the InstancedMesh, causing a visual flash. Instead: `classifySatellite()` buckets each TLE name by regex at catalog load time; `rebuildCategoryMask()` produces a `Uint8Array` (`1`=active, `0`=hidden); `SatelliteField.update()` accepts an optional mask and sets hidden instances to scale-0 matrix (renders as nothing). Category mask is also applied in click and hover loops to skip hidden satellites. Rule: prefer a visibility mask over re-init for InstancedMesh filtering — avoids mesh teardown and keeps the frame continuous.

- **2026-05-14 — Session 10: AI chat is a presenter, not an info generator — enforced at the UI level.** The satellite info card (shown on click) deliberately separates exploration from AI. Clicking a satellite shows name + NORAD ID immediately from local data — no AI call. The "Ask AI about this satellite" button then opens the chat panel and prefills "Tell me about NORAD \<id\> (\<name\>)" so the backend does an exact `get_satellite_info` lookup. The AI only speaks when explicitly invoked, and only presents tool results, never generates values itself. This is the presenter-only architectural rule expressed in the UI: the globe is the data source, the AI is the voice.

- **2026-05-14 — Session 10: Ground track computed in Globe.ts using satellite.js directly.** The propagator worker already uses satellite.js. For the selected-satellite arc, importing satellite.js in Globe.ts (main thread) was simpler than adding a 'compute_arc' message round-trip to the worker. Arc computation for 180 points takes ~2ms — negligible on click. Pattern mirrors SatelliteMesh.computeArcPoints(): propagate 180 evenly-spaced points over one orbital period, rotate all by a single GMST snapshot, map ECI→Three.js ECEF. LineLoop recomputes every 60s. Rule: a 2ms main-thread computation on user interaction is preferable to worker message round-trips that add latency and code complexity.

- **2026-05-14 — Session 11: Group-highlight tool uses per-instance colour + white material trick.** `highlight_catalog_group(category)` colours all dots in the selected category with their pill colour (STARLINK=violet-400, GPS=emerald-400, IRIDIUM=sky-400, DEBRIS=red-400, OTHER=amber-400) and dims all others to near-black (`0x1e3a5f`). THREE.js implementation: when highlight is active, set `material.color = white` and call `mesh.setColorAt()` for each instance (instanceColor array). Final dot colour = instanceColor × material = instanceColor × 1.0 = pure instanceColor. Clear: set material back to blue + `mesh.instanceColor = null`. Rule: THREE.InstancedMesh multiplies material colour by instanceColor — material must be white for instanceColor to show through unmodified. The group highlight re-applies after catalog refresh (stored as `activeGroupHighlight` on Globe). The `__GROUP_HIGHLIGHT__` directive is emitted at the end of the response stream, parsed in `useChat.ts` alongside `__HIGHLIGHT__`, and flows to `Globe.setGroupHighlight()` via `useGlobe`. Clearing: reset at the start of each new `sendMessage` call, same as `highlight`.

- **2026-05-14 — Session 11: `get_category_counts` tool calls Python backend, not frontend data.** The frontend already has `Globe.getCategoryCount(cat)` but it's client-side — the agent runs server-side and can't access it. Added `/satellite-categories` endpoint in Python that classifies the cached catalog using `_classify_satellite()` (mirrors `classifySatellite()` in Globe.ts). These two classification functions MUST stay in sync — any regex update in one needs to be applied to the other. Rule: when logic exists in both Python and TypeScript, document the sync requirement explicitly.

- **2026-05-14 — Session 11: SatelliteField group highlight — two failed attempts before the correct fix.** The initial `setGroupHighlight` clear path set `mesh.instanceColor = null`, then recreated the buffer on the next highlight. This worked in isolation but broke after category filter toggles: the filter toggles trigger `instanceMatrix.needsUpdate`, which causes Three.js to rebind the VAO. Going null → non-null on instanceColor during a frame where instanceMatrix was also dirty produced unreliable WebGL state — the highlight simply stopped applying. **First fix attempt (broke rendering):** made material permanently white and set instanceColor to `DEFAULT_COLOR` (blue) on clear — `white × blue = blue` visually. Invisible dots resulted: Three.js caches shader variants; switching from no-instanceColor to always-instanceColor changed the shader path in a way the cache didn't handle cleanly, leaving dots invisible. **Correct fix (current):** keep material as `DEFAULT_COLOR` (blue) permanently on clear; pre-init instanceColor to `WHITE` in constructor so `blue × white = blue` — visually identical to no instanceColor, buffer stays always-live. On highlight: `mat=white`, instanceColor=per-category (highlighted) or DIM_COLOR (others). On clear: `mat=DEFAULT_COLOR`, instanceColor=all-white. Buffer is never null so VAO rebinding is a no-op. Rule: THREE.InstancedMesh `instanceColor` should be kept alive from construction (pre-init to white) — never toggled null/non-null mid-session. The correct clear path is `mat=original, instanceColor=white`, not `instanceColor=null`.

- **2026-05-14 — Session 11: group-highlight replaced with agent-controlled category filter (set_category_filter).** The per-instance colour approach was abandoned (VAO bug unfixable reliably). Replacement: `set_category_filter(categories: string[])` updates the Globe's `activeCategories` via the same code path as clicking filter pills, so pills stay in sync. Agent-called path additionally applies per-category dot colours (`applyAgentFilter` in Globe.ts). Manual toggle path (`setActiveCategories`) clears the colour mode back to blue. Current state is passed to the agent on every message (`shownCategories` in POST body) so the agent knows what's currently shown and can handle additive ("show GPS" = add GPS) vs exclusive ("only show GPS") requests. System prompt tells the agent: always call the tool without arguing, compute the correct final set given the currently-shown list and the user's intent. `GROUP_HIGHLIGHT_COLORS` and `instanceColor` WHITE pre-init live in Globe.ts and SatelliteField.ts respectively. The `__SET_FILTER__:{"categories":[...]}` directive replaces the former `__GROUP_HIGHLIGHT__` wire format.

- **2026-05-14 — ISS click/hover returns wrong module (Unity, Destiny) — fixed by priority check.** ISS docked modules (NORAD 26958 Unity, 27386 Destiny, etc.) share the same orbital position as ISS ZARYA (25544). The catalog InstancedMesh includes these modules as blue dots. Before the fix, clicking near the yellow ISS dot iterated the catalog buffer first and returned whichever docked module was geometrically closest in the buffer — not ISS ZARYA. Fix: both click and hover handlers check the ISS SatelliteMesh position against the cursor before iterating the catalog buffer. If the cursor is within the ISS dot radius (+2px tolerance for click, +6px for hover), the handler fires with `(issName, '25544')` and returns. `issName` is captured from the catalog on load (NORAD 25544 should be 'ISS (ZARYA)') with a hard fallback. Sentinel value `-2` for `hoveredIdx` prevents re-firing while cursor stays over the ISS. Rule: when a special object shares a position with catalog entries, always check it first in the pick loop.

- **2026-05-14 — localStorage catalog cache for instant repeat-visit loads.** `fetchSatelliteCatalog` calls Railway which cold-starts in 40-60s on the free tier. Added `loadCachedCatalog()` / `saveCatalogToCache()` in `celestrak.ts` using localStorage key `aussie-sky-catalog-v1` with 30-min TTL (matching Railway's backend cache TTL). If cache is fresh (< 30 min old, ≥ 100 records), return it immediately and fire a background `fetchCatalogFromNetwork()` void promise to keep the cache fresh for the next visit. First-time visitors still wait on a cold start; every subsequent visit is instant. Rule: for catalog data that rarely changes within 30 minutes, always layer a client-side cache so cold-start latency only affects the very first load.

- **2026-05-14 — Session 12 (post): Hover/select dot highlight + click hit-area fix.** Two UX fixes to satellite picking. (1) Hovered and selected catalog satellites now turn lime green (`0x4ade80`) instead of staying blue. Implementation: `SatelliteField` refactored so `mat` is always white and all colouring is done via `instanceColor` (was: mat=DEFAULT_COLOR, instanceColor=WHITE). Added `setInstanceColor(idx, color)`. In `Globe.ts`, `refreshInstanceColor(idx)` applies HIGHLIGHT_COLOR when idx is hovered or selected, base color otherwise. `clearGroundTrack` and `showGroundTrack` call it on the changed index; hover handler calls it when `hoveredIdx` changes; bulk color resets (`setCategoryColors`, `applyAgentCategoryColors`) re-apply highlights afterward. (2) Click hit-test short-circuits to `hoveredIdx` when set — if the tooltip is visible the click always fires regardless of cursor precision. Previously the click used `dotRadiusPx+1` while hover used `dotRadiusPx+6`, so hovering at 4px didn't translate to a clickable hit. Rule: keep click and hover thresholds consistent, or just use hoveredIdx as the click target when it's set.

- **2026-05-14 — Session 12: CI/CD via GitHub Actions (4 jobs).** `web` job runs lint + `tsc -b && vite build` + vitest; `api-typecheck` runs root `npx tsc --noEmit` targeting `api/chat.ts`; `orbital-test` runs pytest on Python 3.11; `orbital-docker` builds the Dockerfile to verify it compiles. All triggered on push to main and on PRs. The build step in `web` was preferred over just `tsc -b` to also verify the Vite bundle compiles — catching module resolution issues that tsc alone misses.

- **2026-05-14 — Session 12: ESLint errors fixed for CI.** `eslint-plugin-react-hooks` v7 adds two new strict rules that flagged three existing patterns. (1) `react-hooks/refs`: updating `onSatelliteClickRef.current` during render in `useGlobe.ts` — fixed by moving into `useLayoutEffect` (ensures ref is updated before any paint, same timing as the inline assignment). (2) `react-hooks/set-state-in-effect`: two intentional setState-in-effect patterns (prefill sync in `AgentPanel`, agent filter sync in `GlobeView`) — both are correct (triggered by external signals, no cascade risk), disabled with inline `eslint-disable-next-line` and a comment. Rule: when a lint rule flags a pattern that is genuinely correct, add a disable comment with a one-line explanation rather than fighting the linter or restructuring working code.

- **2026-05-14 — Session 12: CORS restricted to Vercel + localhost origins.** Changed `allow_origins=['*']` to explicit list `['https://aussie-sky.vercel.app', 'http://localhost:5173', 'http://localhost:4173']` in FastAPI middleware. The `*` was a temporary MVP shortcut; with the domain stable, open CORS is an unnecessary attack surface.

- **2026-05-14 — Session 12: CelesTrak direct browser fetch replaces Railway as primary catalog source.** Production satellite trackers (satellitetracker3d.com et al.) bypass their own backends for TLE data by fetching directly from CelesTrak in the browser. CelesTrak has CORS enabled and never blocks user IPs; only cloud IPs (Railway, AWS) get 403 on `GROUP=active`. Fix: `celestrak.ts` now attempts `fetchFromCelesTrak()` first (browser fetch, `FORMAT=TLE`), falls back to `fetchFromRailway()` only on error. Result: catalog load is decoupled from Railway cold starts entirely. Rule: for public CDN data that browsers can fetch directly and CORS is enabled, always fetch in the browser — eliminates server cold-start latency on the most important data path.

- **2026-05-14 — Session 12: Propagator worker crash on malformed TLEs from CelesTrak.** After switching to direct CelesTrak TLE text fetch, a malformed TLE entry caused `twoline2satrec` to throw, which propagated uncaught through the `map()` in the `init` handler. On every subsequent `tick`, the forEach hit the bad `satrec` and called `propagate()` on it, which returned `{ position: false }` — but the guard was `typeof posVel.position === 'boolean'` which doesn't catch `null`/`undefined`. `eciToGeodetic` then received a non-object and threw `TypeError: undefined is not an object (evaluating 'n.x')` on every single tick, silently aborting the entire propagation frame (all satellites zeroed). Fix: (1) wrap `twoline2satrec` in try-catch and store `null` for bad TLEs; (2) skip `null` slots in the tick handler; (3) tighten position guard to `!posVel.position || typeof posVel.position !== 'object'`; (4) wrap each satellite's propagation block in try-catch so one bad satellite never aborts the full forEach. Rule: propagation workers must be hardened at two levels — TLE init (return null, not throw) and per-satellite propagation (catch per satellite, never catch at loop level).

- **2026-05-14 — Session 12: `satrecs` typed as `(SatRec | null)[]` — TS2322 in CI.** The propagator worker try-catch returns `null` for malformed TLEs but `satrecs` was declared `SatRec[]`. TypeScript caught this in CI (not locally, because local tsc was run via `tsc -b` which reused a stale incremental cache). Fix: one-character change to the declaration. Rule: always run `tsc --noEmit` clean (no incremental cache) in CI to catch type errors that cached local builds miss.

- **2026-05-14 — Session 12: Python catalog truncated to 10k — chatbot 404s for ~5k satellites.** `satellites.py` had `LIMIT = 10000` and sliced every CelesTrak response with `[:LIMIT]`. CelesTrak `GROUP=active` now returns ~15,432 objects ordered arbitrarily — the truncated ~5,432 were not the "least important" ones, just whatever appeared past slot 10,000. The frontend (browser direct fetch, no limit) showed all 15k; the Python backend only knew 10k; any satellite in the difference returned 404 from `get_satellite_info`. Fix: removed all `[:LIMIT]` slices, raised SpaceTrack URL `limit/10000` to `limit/25000`, updated system prompt count. Bumped localStorage cache key from `v1` → `v2` to force all browsers to discard their old 10k-era cache on next visit. Rule: never apply an arbitrary cap to a catalog that the frontend renders in full — catalog source-of-truth and backend search scope must cover the same set.

- **2026-05-14 — Removed AbortController timeout from catalog fetch — Railway cold starts exceed 35s.** A 35s AbortController timeout was added to `fetchCatalogFromNetwork` to surface Railway failures quickly. Railway free-tier cold starts can take 40-60s — the timeout silently aborted the fetch mid-cold-start, the `catch(() => {})` swallowed the error, and the globe showed zero satellites with no user feedback. Fix: removed the AbortController entirely. The browser's own connection lifecycle handles genuine server-down cases (network error surfaces to the caller). Slow cold starts now complete correctly. Rule: never add a hard fetch timeout shorter than the worst-case cold-start time of the target server. Use the localStorage cache for the common (fast) case; leave the network fetch uncapped for the cold-start case.

- **2026-05-14 — Session 13: 25k satellite / debris problem traced to stale SpaceTrack cache.** Old `v2` localStorage cache held a SpaceTrack snapshot (unfiltered, 25k objects including rocket bodies and debris). CelesTrak `GROUP=active` is user-IP-friendly (~9k active payloads), but the cache was populated before browser-direct fetch was the primary path. Fix: bump key to `v3` (forces fresh CelesTrak fetch on next visit); restrict SpaceTrack fallback query to `OBJECT_TYPE/PAYLOAD` with `limit/10000`. Rule: whenever the catalog source or shape changes, bump the cache key — never assume users will get fresh data without an explicit invalidation.

- **2026-05-14 — Session 13: Soft catalog refresh eliminates 30-min satellite gap.** Every 30 minutes `initCatalog` was disposing the InstancedMesh and recreating it. During the ~1–3s worker initialisation, all satellite dots disappeared. Fix: `initCatalog` checks `this.field && this.worker && |newCount - oldCount| <= 200` and, when true, skips mesh teardown and just re-posts `{ type: 'init', tles }` to the existing worker. The worker atomically replaces its `satrecs` array; positions update on the next tick. Full rebuild (dispose + recreate) only on first load or when count changes significantly. Rule: never tear down an InstancedMesh on a background refresh — re-init the worker in place to avoid a visible rendering gap.

- **2026-05-14 — Session 13: 72h stale-serve cache — satellites always instant on any reload.** Previous hard 24h cutoff returned `null` from `loadCachedCatalog` after expiry, forcing a network wait even on the 30-min background refresh. TLEs are valid for several days. New scheme: `SERVE_AGE_MS = 24h` (always serve from here immediately), `MAX_CACHE_AGE_MS = 72h` (hard reject, true first-visit case). Background refresh fires on every `fetchSatelliteCatalog` call. Satellites are instant for any user who visited within 72h. Rule: for orbital data, separate "when to refresh" from "when to block" — stale TLEs are better than a loading screen.

- **2026-05-14 — Session 13: Hover/click occlusion — satellites on far side of earth were triggering tooltips.** Satellites on the opposite hemisphere project to valid 2D screen coordinates (they are in front of the camera, physically behind the earth mesh). The pick loop had no check for this. Fix: add `if (satX*camX + satY*camY + satZ*camZ <= 0) continue` before `Vector3.project()`. The dot product of the satellite's world position and the camera's world position (both from earth centre) is negative when they are on opposite hemispheres — a necessary condition for earth occlusion. O(1) per satellite. Rule: always apply a hemisphere occlusion check before screen-space picking on a globe — the earth mesh blocks geometry but not screen-space projections.

- **2026-05-14 — Session 13: Z-ordering fix — depth not screen distance determines winning satellite.** When two satellites projected to overlapping screen positions, the loop picked the one with smallest `screenDist` regardless of depth. A GEO satellite at 35,786 km could win over a LEO satellite at 400 km if it happened to project 1px closer to the cursor. Fix: change pick criterion to `depth < bestDepth` among all candidates within `dotRadiusPx + HOVER_EXTRA_PX`. Closest satellite to the camera always wins. Rule: in 3D picking, depth is the correct tiebreaker for overlapping 2D hits — screen distance is a proximity filter, not a priority order.

- **2026-05-14 — Session 13: System prompt hardened against training-data fallback on tool errors.** When Railway timed out (5s ORBITAL_FETCH_TIMEOUT_MS), tool results contained `{ error: '...' }`. Claude would see the error but still generate an answer from training knowledge — violating the presenter-only rule. The system prompt previously only said "if data is missing, say unavailable." Fix: add explicit override: "IF ANY TOOL RETURNS AN ERROR OR TIMEOUT: respond with exactly 'The live data service is temporarily unavailable — please try again in a moment.' Do NOT use training knowledge." Rule: the presenter-only rule must cover the error case explicitly — Claude will infer "well, I have relevant knowledge" unless the prohibition is stated for errors specifically.

- **2026-05-15 — Session 15: Satellite count stays at ~15k (GROUP=active only).** Reference site (satellitetracker3d.com) shows ~24k by fetching debris + rocket body groups in addition to active payloads. Adding extra CelesTrak group fetches would mean multiple download slots consumed per user visit, each a new 403 risk under CelesTrak's 1-download-per-2h rate limit per IP. Reliability beats count for a portfolio project where the loading state is embarrassing. Rule: never add CelesTrak group fetches unless each group has its own localStorage key and per-group rate-limit handling.

- **2026-05-15 — Session 15: AWS migration deferred to Session 16.** Railway is fully off the AI critical path (see Session 14 commit). The Python orbital service still runs on Railway but nothing calls it from the frontend or AI agent. No production reliability is gained by migrating now. ECS Fargate + RDS + Terraform is a full session of work — sharing it with text search + README would mean doing both poorly. Rule: only migrate infra when there is a concrete trigger (reliability problem, feature requirement, or job-application deadline approaching).

- **2026-05-15 — Session 15: searchCatalog() checks ISS separately before catalog arrays.** Globe.initCatalog() extracts ISS (NORAD 25544) into a separate SatelliteMesh and removes it from satNoradIds/satNames. Any public method that traverses the catalog arrays will silently miss ISS. Fix pattern: every catalog-traversal method checks this.issName / ISS_NORAD first, then searches satNoradIds. Rule: whenever a special object is split from the catalog for separate rendering, add an explicit early check in all catalog-traversal public methods.

- **2026-05-15 — Session 15: selectCatalogSatellite() dispatches ISS via issSatrec, not showGroundTrack.** showGroundTrack(idx) requires a valid index in satNoradIds — ISS has none after being stripped. For ISS: clearGroundTrack() + handleSatSelect(ISS_NORAD, issSatrec) + onSatelliteClick(). For catalog: showGroundTrack(idx) + onSatelliteClick(). Globe.onSatelliteClick fires through the useGlobe callback chain to GlobeView.onSatelliteSelect — don't call onSatelliteSelect explicitly in the SearchBar.onSelect handler or it fires twice. Rule: any programmatic satellite selection must replicate the exact two-step click-handler flow; don't add extra callback fires at the UI layer.

- **2026-05-16 — Catalog loading: /api/catalog Vercel function with Space-Track + edge caching.** CelesTrak GROUP=active was fetched browser-direct with no timeout — could hang for minutes for Australian users (far from US servers). Fix: `api/catalog.ts` Vercel function authenticates to Space-Track (no IP restrictions), returns TLEs with `Cache-Control: public, s-maxage=7200`. Vercel CDN caches the 2MB response at each edge node — sub-100ms globally after first call. Browser races /api/catalog and CelesTrak direct simultaneously via `Promise.any()`; each source has a 10s AbortSignal timeout. First responder wins. Rule: always race catalog sources in parallel rather than trying sequentially — effective max wait = single timeout, not N × timeout.

- **2026-05-16 — Space-Track 3LE format required; format/tle (2LE) breaks parseTleText.** `format/tle` returns 2-line elements (no name line). `parseTleText()` expects 3LE. With 2LE, TLE line 2 of satellite N becomes the "name" of satellite N+1, norad_id is always N+1's (not N's), and only ~N/2 records are produced. Symptoms: names showed as "2 54702 59.9976 338.8258...", count was ~10k instead of ~20k, ISS sometimes not found for TLE update. Fix: `format/3le`. Rule: always use `format/3le` with Space-Track's gp endpoint — `format/tle` returns 2LE which is incompatible with 3LE parsers.

- **2026-05-16 — ISS orbital ring showed at wrong position because fallback TLE was from March 2024.** SatelliteMesh constructor uses hardcoded TLE constants (ISS_TLE1, ISS_TLE2) as fallback. These have epoch `24087` (March 2024). SGP4 extrapolation 14+ months past epoch gives completely wrong positions. The AI's `highlight_on_globe` tool uses backend-computed lat/lon (correct); the ring was rendered from the stale satrec → ring appeared in a different hemisphere from the dot. Two fixes: (1) `format/3le` ensures ISS is always found in catalog and `updateTle()` called within seconds; (2) `arc.visible = false` in constructor, set to true only after `updateTle()` — stale fallback TLEs never produce a visible wrong ring. Rule: never render a propagated orbit from a TLE whose epoch is more than a few days old; hide until a fresh TLE arrives.

- **2026-05-16 — Space-Track 3LE name lines prefixed with "0 ".** CelesTrak 3LE has plain name lines (`ISS (ZARYA)`). Space-Track 3LE prefixes with line-type indicator (`0 ISS (ZARYA)`). `parseTleText()` now strips leading `"0 "` before storing name. Rule: when switching TLE sources, check name-line format — different providers use different conventions.

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
3. For the full session context prompt for the next session, see `docs/session-12-bootstrap.md`.

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
| `docs/session-14-bootstrap.md` | Next session full context prompt — paste at start of Session 14. |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | Implementation plans. One file per session/feature. |
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | Design specs produced during brainstorming sessions. |
| `CHANGELOG.md` | User-facing change log. Updated when a session ships something visible. |
| `README.md` | Public-facing project overview. What it does, how to run it locally, deploy notes. |
