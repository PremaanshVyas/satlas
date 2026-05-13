# CLAUDE.md — Aussie Sky working context

This file is the bootstrap context for any Claude session working on this project.

**If you (Claude) are reading this in a new session:** read this file fully before suggesting code or making changes. It is the source of truth for what we're building, what's been decided, and what's in progress.

**For mickey:** paste this file (or its current state) at the start of every new chat about this project. Inside Claude Code, this file is auto-read at session start because it sits at the repo root.

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

- **Frontend:** TypeScript + React + Vite + Tailwind. 3D via **Three.js** (start) — re-evaluate Cesium if Three.js gets painful for geospatial. Decision deadline: end of week 2.
- **Agent:** Anthropic Claude API. Tool use is the pattern. Use the latest available Sonnet or Opus model.
- **Orbital service:** Python 3.11, FastAPI, `skyfield` for high-level orbital mechanics, `sgp4` directly when speed matters.
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
│   ├── architecture.md
│   ├── decisions.md         # ADR log
│   └── roadmap.md
├── apps/
│   ├── web/                 # Next.js or Vite + React frontend
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
- **Documentation:** if a non-obvious design decision is made, append it to `docs/decisions.md` in the same PR.

---

## Active scope (update this each session)

**Current phase:** Post-Session-8 (+ arc GMST fix). ISS accuracy fixed (5-min TLE cache), NASA 8K textures, atmosphere + stars live, ISS dot now sits on the orbital ring.

**Next milestone:** Session 9 — click-to-select + category filters + hover tooltip. Goal: interactive globe that rivals satellitetracker3d.com's UX.

**Session 9 plan (brainstormed 2026-05-13):**
- Click-to-select: raycaster on canvas click → find nearest InstancedMesh instance → pre-fill agent chat with satellite name (e.g. "Tell me about STARLINK-1234")
- Category filter toggles: classify catalog by name pattern (STARLINK, GPS, IRIDIUM, ISS, debris) → UI toggle buttons above the globe → show/hide InstancedMesh subsets by updating instance visibility
- Hover tooltip: raycaster on mousemove → show satellite name + altitude in a floating div when cursor is within ~0.01 units of a dot
- Agent tool: `highlight_catalog_group(category)` — agent can say "show me all Starlink satellites" and the globe highlights them with a different colour
- Ground track for selected satellite: when a catalog dot is selected via click, show its orbit arc (same as ISS arc logic, triggered on demand)

**Priority order for Session 9:** click-to-select first (highest UX impact, proves interactivity), then hover tooltip, then category filters, then agent group-highlight tool. Stop if time runs short — each is independently shippable.

**Session 8 tasks (ISS accuracy + Earth visual quality):**
- [x] Backend: separate 5-min ISS TLE cache; /tle/iss bypasses 30-min catalog cache
- [x] Frontend: fetchIssTle() on mount + every 2 min independent of catalog refresh
- [x] Replace 501KB textures with NASA 8192×4096 Blue Marble day + 3600×1800 Black Marble night
- [x] Enable anisotropic filtering + trilinear mipmaps on Earth textures
- [x] Raise sphere tessellation to 128×64
- [x] Improve earth fragment shader (wider twilight, bluer city lights)
- [x] Add atmospheric rim glow (Fresnel shader, additive blend)
- [x] Add star field (8,000 points, colour variation)
- [x] Fix ISS orbit arc: three-attempt journey. Attempt 1: LineLoop → Line (no false closing line). Attempt 2: discovered ECEF ground tracks are open curves (Earth's rotation); Line exposed the 22.9° gap. Final fix: ECI orbital ring — propagate without GMST, closed ellipse, LineLoop correct again.
- [x] Raise satellite catalog limit to 10,000
- [x] Fix arc GMST alignment: ECI ring was correct shape but wrong longitude (rotated by GMST from the dot). Applied GMST rotation to all arc points so dot sits on the ring. Ring recomputes every 60 s as GMST drifts ~15°/hr.
- [x] Update CLAUDE.md + 67 backend + 31 frontend tests all passing

**Session 7 tasks (position accuracy + live tracker foundation + chatbot reliability):**
- [x] Fix coordinate transform bug in propagator.worker.ts and SatelliteMesh.ts
- [x] Fix coordinate transform in Globe.ts highlightSatellite()
- [x] Fix solar direction formula in solar.ts
- [x] Reduce TLE cache from 4h to 30min (backend + frontend periodic refresh)
- [x] Add UTC clock overlay to globe
- [x] Add satellite tracking count overlay
- [x] Fix chatbot "No response" failures: haiku for tool-detection turn + 5s orbital timeout
- [x] Add Railway keepalive: Globe pings /health on mount and every 4 minutes
- [x] Update CHANGELOG.md, CLAUDE.md, README.md

**This week's task (week 1):**
- [x] Create GitHub repo (private to start, public on MVP)
- [x] Drop in `README.md` and `CLAUDE.md`
- [x] Install Claude Code + Superpowers locally
- [x] Scaffold `apps/web` with Vite + React + TypeScript + Tailwind
- [x] Get a basic Three.js globe rendering with a single satellite (the ISS, hardcoded TLE)
- [x] Deploy to Vercel — live at https://aussie-sky.vercel.app

**Agent + first tool (week 2):**
- [x] `apps/orbital/passes.py` — skyfield-based ISS pass prediction + pytest suite
- [x] `apps/orbital/main.py` — FastAPI service with `/health` and `/predict-passes`
- [x] `apps/orbital/Dockerfile` — containerised for Railway deploy
- [x] `api/chat.ts` — Vercel Edge Function: Claude tool-use loop + streaming response
- [x] `apps/web/src/hooks/useChat.ts` — streaming fetch hook, fully tested
- [x] `apps/web/src/components/AgentPanel.tsx` — real streaming chat UI (replaces placeholder)
- [x] Deploy orbital service to Railway
- [x] Add `ANTHROPIC_API_KEY` + `ORBITAL_SERVICE_URL` to Vercel env vars → redeploy

**Session 3 tasks (highlight_on_globe):**
- [x] Define a structured response format so the agent can return both prose and a `highlight` directive in one response
- [x] Update api/chat.ts to handle the new format and stream it correctly
- [x] Add a second tool to the system prompt: highlight_on_globe(norad_id, satellite_name) — describes when to call it
- [x] Wire the frontend to parse highlight directives from the response stream
- [x] Implement camera fly-to and pulse animation in the existing Three.js globe
- [x] Test end-to-end: "show me where the ISS is right now" → text response + globe focuses and pulses
- [x] Manual deploy verify on aussie-sky.vercel.app
- [x] Update README.md and CLAUDE.md at end of session

**Session 4 tasks (live TLE catalog + thousands of satellites):**
- [x] Add CelesTrak fetch + cache to apps/orbital (new /satellites endpoint, 4-6 hour cache)
- [x] Frontend loads the catalog on app start
- [x] Web worker propagates ~1000 satellite positions per frame off the main thread
- [x] Render satellites via Three.js InstancedMesh (one draw call, position buffer updated per frame)
- [x] ISS retains its 'selected' treatment (orbit arc, larger dot, pulse on highlight); other satellites are just dots
- [x] Verify main thread stays at 60fps with 1000 satellites
- [x] Manual deploy verify on aussie-sky.vercel.app
- [x] Update README.md and CLAUDE.md at end of session

**Session 5 tasks (conversation history + two new tools):**
- [x] Fix BUG 1: conversation history — frontend sends full history with each request; backend builds Claude messages array from history + new user message; strip `__HIGHLIGHT__` directives from assistant history before sending to Claude
- [x] Fix BUG 2: Hubble hallucination — update system prompt to state `highlight_on_globe` only works for catalog-confirmed satellites; Claude must not claim the globe highlighted a satellite it can't verify
- [x] New endpoint: `GET /satellites-overhead?latitude=X&longitude=Y&radius_km=Z` — propagates catalog to now, great-circle filter, returns top 20 by elevation
- [x] New endpoint: `GET /satellite-info?query=hubble` — name/NORAD-ID search, propagates to now, returns full orbital snapshot
- [x] Wire `find_satellites_overhead` tool into agent (`api/chat.ts` system prompt + tool loop)
- [x] Wire `get_satellite_info` tool into agent; enrich `highlight_on_globe` with lat/lon from satinfo so globe flies to any catalog satellite
- [x] Highlight state reset to null at start of each new `sendMessage` call
- [x] pytest tests for both new endpoints (49 orbital tests total, 22 web tests total — all green)
- [x] Update README.md and CLAUDE.md at end of session

**Blockers:** None.

**Session 6 tasks (catalog fix + live ISS TLE):**
- [x] Switch catalog source to CelesTrak GROUP=active (no orbital filters) with space-track.org fallback
- [x] Add GET /tle/iss endpoint to FastAPI
- [x] Add SatelliteMesh.updateTle() — reinitialises satrec and forces arc recompute on next tick
- [x] Globe.initCatalog extracts live ISS TLE from catalog and calls updateTle before filtering
- [x] 59 orbital tests + 22 web tests — all green
- [x] Update CLAUDE.md

**Last session ended at:** Session 6 complete. Multi-turn conversation history working (frontend sends full history; backend strips `__HIGHLIGHT__` directives and builds Anthropic messages array). Two new agent tools live: `find_satellites_overhead` and `get_satellite_info`. Globe now flies to any catalog satellite via lat/lon from satinfo enrichment, not just the ISS. 49 orbital + 22 web tests passing.

---

## Decisions log (ADR-lite)

Append entries here as decisions get made. Format: date, decision, rationale, alternatives considered.

- **2026-05-10 — Project initialized.** Decided on Aussie Sky concept (3D SSA + AI agent), monorepo structure, AWS infrastructure. Considered alternatives: pure Earth Observation platform (rejected as less visually striking on first impression), ML-only bushfire pipeline (rejected as narrower in stack). Folded bushfire detection in as the V2 vision-pipeline use case.

- **2026-05-10 — AI agent is the primary interface, not a side feature.** Every user query goes through Claude with tool use. Avoids the "AI bolted on" pattern that dominates current portfolio projects.

- **2026-05-10 — Defer Go gateway until V1.** Frontend talks directly to FastAPI for MVP. Simplifies scaffolding. Add Go for production hardening later.

- **2026-05-11 — Frontend scaffold shipped.** `apps/web` built with Vite 8 + React 19 + TypeScript + Tailwind v4 + Vitest. 65/35 split layout (Three.js globe left, agent panel right). Globe renders with a custom GLSL ShaderMaterial blending NASA Blue Marble (day) and Black Marble (night) textures via a real-time sun direction uniform computed from Meeus low-precision formulae. ISS rendered as a glowing yellow dot with a full-period orbit arc, propagated each frame via satellite.js v4 SGP4. OrbitControls for mouse drag + scroll zoom. 7 passing unit tests. `vercel.json` committed and ready to deploy. Note: ISS position is symbolic (hardcoded March 2024 TLE) — live TLE fetch from CelesTrak is a V1 requirement.

- **2026-05-11 — Deployed to Vercel.** Live at https://aussie-sky.vercel.app. Auto-deploys on push to main. Free tier sufficient for portfolio traffic.

- **2026-05-11 — Agent + first tool shipped.** Wired the full agent-tool loop end-to-end. `apps/orbital/passes.py` uses skyfield `find_events` (altitude_degrees=10°, builtin timescale) to predict ISS passes, returning start/end UTC, max elevation, and compass direction. `apps/orbital/main.py` is a FastAPI service exposing `GET /predict-passes` with lat/lon/hours_ahead query params, containerised in a Dockerfile for Railway. `api/chat.ts` is a Vercel Edge Function that runs a two-turn Claude tool-use loop: first call (non-streaming) detects whether to invoke `predict_iss_passes`, executes the tool against the Railway service, then streams Claude's final answer back to the browser via `ReadableStream`. Prompt caching applied to the system prompt on both turns. `useChat` hook manages message state and streams chunks into the assistant bubble in real time. `AgentPanel` replaces the static placeholder with a full chat UI: scrollable history, animated bouncing dots while streaming, Enter-to-send, disabled input while loading. 11 passing Vitest tests. Railway deploy + Vercel env vars are the only remaining manual steps before the feature is live.

- **2026-05-11 — Session 3 direction set: highlight_on_globe.** Planning decided to prioritize closing the chat-visual gap before adding more tools or more data. The product right now has chat and globe as two unrelated surfaces; this session makes them one. After this ships, ordering is: more satellites (live TLE, ~500-2000 rendered, instanced meshes + web worker for propagation), then more tools (find_satellites_overhead, get_satellite_info), then polish (hero image, demo GIF, blog post, mobile responsive). Total remaining sessions estimated at ~5 to reach portfolio-defining state.

- **2026-05-11 — highlight_on_globe shipped.** Backend: added `HIGHLIGHT_TOOL` alongside `PREDICT_PASSES_TOOL`; both processed in the same first non-streaming turn; `pendingHighlight` recorded when Claude calls it; directive emitted as `\n__HIGHLIGHT__:{"norad_id":"...","satellite_name":"..."}\n` after text stream. Unknown tool names now get a `is_error: true` fallback result to prevent Anthropic API validation errors. Model updated to `claude-sonnet-4-6`. Frontend: `parseChunkForHighlight` accumulates the full raw stream and splits on `\n__HIGHLIGHT__:`; on parse success strips directive from displayed text and sets `highlight` state; on JSON failure returns the full accumulated string so no content is lost. `useChat` lifted to `App` so `highlight` can flow sideways to `GlobeView`. `Globe.ts`: cubic ease-in-out fly-to over 1500ms targeting camera 2.5 units in ISS direction; `SatelliteMesh.ts`: sin-curve halo pulse for 3 × 1000ms cycles. Only NORAD 25544 (ISS) accepted — other IDs silently ignored. No external animation library used. Known limitation: `highlight` state persists across messages (no reset) — invisible now with one satellite, needs `setHighlight(null)` at `sendMessage` start once session 4 adds more satellites. Known limitation: ISS TLE is hardcoded to March 2024, so camera flies to a symbolically correct position not the real current location — live TLE fetch from CelesTrak essential in session 4.

- **2026-05-12 — Session 4 direction set: live TLE catalog + thousands of satellites.** Architectural calls: (A) Backend fetches CelesTrak and caches for 4-6h — frontend never talks to CelesTrak directly. Reasons: own the endpoint, can cache, can rate limit, production-correct pattern. (B) Target ~1000 satellites for the catalog. Reason: large enough to look dramatically different from the single-ISS demo; small enough that mid-tier hardware doesn't choke. (C) Web worker from the start, not main-thread first. Reason: 1000 SGP4 propagations per frame on main thread risks frame drops on weaker hardware; adding a worker later is more work than building it right once. (D) InstancedMesh for rendering — one Three.js draw call for all 1000 satellites, position buffer updated per frame from worker output. (E) ISS keeps its special treatment (orbit arc, larger dot, highlight pulse); other satellites are dots only. Out of scope this session: click-to-select, filter UI beyond a stub, conjunction analysis, tooltips, mobile performance.

- **2026-05-12 — CelesTrak IP block — switched to space-track.org.** After deploying the session 4 live catalog feature, Railway's cloud IP range was blocked by CelesTrak with 403 Forbidden on all domains (celestrak.org, celestrak.com). Residential IPs work fine; the block is IP-based, not header-based, so no workaround exists on Railway. Decision: switch data source to space-track.org (free account, no elevated access needed for public TLE data). Auth pattern: POST credentials to `/ajaxauth/login` → session cookie maintained by `httpx.AsyncClient` context → GET LEO query (MEAN_MOTION > 11.25, ECCENTRICITY < 0.25, EPOCH > now-30, limit 1000). No frontend or worker changes needed — same `/satellites` endpoint, same JSON shape. Credentials injected as `SPACETRACK_USER` / `SPACETRACK_PASS` Railway env vars. Note: "Anything requiring Space-Track.org elevated access" remains out of scope — this uses only the free public data tier.

- **2026-05-12 — CelesTrak IP block resolved by switching to space-track.org.** CelesTrak actively blocks cloud provider IP ranges (Railway uses AWS infrastructure). space-track.org is the authoritative source (CelesTrak mirrors it), has no IP restrictions, free account, session-based auth. Credentials stored as `SPACETRACK_USER` and `SPACETRACK_PASS` in Railway env vars. `VITE_ORBITAL_SERVICE_URL` must be set in Vercel before build — it is a build-time variable baked in by Vite, not a runtime variable. Redeploy with cleared build cache required after adding the env var.

- **2026-05-13 — Session 5 direction set: conversation history fix + two new agent tools.** Two bugs identified in live testing: (1) no conversation history — each user message sent to Claude as a fresh single-turn, breaking any multi-turn flow (e.g. "where is the ISS from me?" → user says "Melbourne" → Claude has no context). Fix: frontend sends full `{message, history}` body; backend builds messages array from history + new turn; strips `__HIGHLIGHT__` directives from assistant history. (2) Hubble hallucination — agent claimed the globe highlighted Hubble even though only NORAD 25544 (ISS) has special treatment. Fix: system prompt explicitly states `highlight_on_globe` only applies to satellites in the catalog (ISS only for now; extended to full catalog once `get_satellite_info` lands). New tools: `find_satellites_overhead(lat, lon, radius_km)` backed by `/satellites-overhead` FastAPI endpoint (great-circle filter on propagated catalog, top 20 by elevation); `get_satellite_info(norad_id_or_name)` backed by `/satellite-info?query=` endpoint (name/NORAD search, full orbital snapshot). Out of scope: click-to-select, filter UI, mobile, conjunction analysis.

- **2026-05-13 — ISS position accuracy and TLE cache tradeoff.** TLEs are cached for 4 hours. SGP4 propagation error grows with TLE age: roughly 1–2 km/hour for LEO satellites under typical drag conditions, so at cache expiry the ISS position error is approximately 4–8 km, with a worst-case around 40 km if solar activity is high. This is sufficient accuracy to show the correct ocean, continent, and regional area — it matches major public tracking sites (heavens-above, Celestrak viewer) within visible margin at the globe's zoom level. Sub-kilometre accuracy would require TLE refresh every few minutes and is out of scope for the portfolio version. Do not change the 4h cache TTL without also implementing incremental TLE refresh logic.

- **2026-05-13 — CelesTrak IP blocking: GROUP=active blocked on cloud, CATNR not blocked.** After session 6 deployed, Railway's cloud IP still blocked for CelesTrak GROUP=active (403), so the code fell back to space-track. The space-track query filtered by MEAN_MOTION > 11.25 and ECCENTRICITY < 0.25 which excluded the ISS at certain orbital epochs. Fix: (1) removed orbital filters from space-track URL; (2) added `_fetch_iss_tle()` that hits the CelesTrak CATNR=25544 endpoint (single-satellite query — NOT IP-blocked on Railway, confirmed); (3) after any primary/fallback fetch, if ISS is missing from result, `_fetch_iss_tle()` is called and ISS is prepended. ISS is now guaranteed in the catalog. Rule: always use CelesTrak CATNR for guaranteed single-satellite fetches; use GROUP=active for bulk (fallback to space-track if 403); never rely on orbital parameter filters to include specific named satellites.

- **2026-05-13 — Session 6: switched catalog to CelesTrak primary.** Root cause of missing ISS/Hubble: space-track.org query filtered by `MEAN_MOTION > 11.25` and `ECCENTRICITY < 0.25` combined with `limit/1000/orderby/NORAD_CAT_ID` was producing a slice that excluded Hubble (NORAD 20580) and intermittently the ISS (NORAD 25544) depending on catalog churn. Fix: CelesTrak `GROUP=active` has no orbital filters and includes all operational satellites. User-Agent header (`aussie-sky/1.0`) resolves the Railway IP concern — confirmed 200 from local and cloud. space-track.org kept as fallback. Refactored `satellites.py` into `_fetch_celestrak()`, `_fetch_spacetrack()`, and `_parse_gp()` helpers. ISS now gets a live TLE on frontend startup: `Globe.initCatalog` finds the ISS entry in the catalog result and calls `SatelliteMesh.updateTle(tle1, tle2)`; hardcoded March 2024 TLE only lasts the few seconds before catalog loads. `updateTle` resets `lastArcDate = new Date(0)` to force arc recompute on next tick. New `GET /tle/iss` endpoint added for external consumers.

- **2026-05-13 — Long-term vision logged (V2 scope, do not implement yet).** Target state resembles satellitetracker3d.com but with the AI agent as the primary interface. Planned future sessions: (1) Satellite layers — render catalog by category (ISS, Starlink constellation, weather sats, debris) with globe toggles; agent can say "show me all Starlink satellites" and the globe highlights them. (2) Click-to-select — clicking any catalog dot pre-fills the agent chat with the satellite's name so the user can ask about it immediately. (3) Real-time TLE refresh — re-fetch catalog every 10s or on-demand rather than the 4h cache TTL. (4) More agent tools — conjunction analysis, debris proximity alerts, satellite manoeuvre history where data is public. Do not start any of this until Session 7 scope is shipped.

- **2026-05-13 — Session 5 shipped.** Conversation history: `useChat` snapshots history before adding new user msg, sends `{message, history}` to `/api/chat`; backend builds `historyMessages` from the array (stripping `__HIGHLIGHT__` directives from assistant entries) and prepends them before the new user turn. Highlight reset: `setHighlight(null)` at `sendMessage` start. `HighlightDirective` type extended with optional `latitude`/`longitude`; `Globe.highlightSatellite` accepts lat/lon directly and converts to Three.js position via geodetic formula (`x = -r*cos(lat)*sin(lon), y = r*sin(lat), z = r*cos(lat)*cos(lon)`); falls back to ISS live TLE if no coords supplied. `overhead.py`: great-circle distance filter + skyfield altaz per observer, elevation > -5° filter, top 20 by elevation. `satinfo.py`: NORAD ID (all-digit) search first, then case-insensitive name substring; returns lat/lon/alt/velocity/period/inclination. Backend highlight enrichment: `satInfoPositions` Map accumulates norad_id → {lat, lon} from `get_satellite_info` results; after tool loop, enriches `pendingHighlight` with position so globe can fly to any catalog satellite. 49 orbital pytest + 22 Vitest — all green.

- **2026-05-11 — Three deploy fixes to `api/chat.ts` and root `package.json`.** Hit during Railway + Vercel deploy. (1) **Edge runtime incompatible with Anthropic SDK** — the SDK references `node:fs` and `node:path` which don't exist in Vercel Edge runtime. Fix: removed `export const config = { runtime: 'edge' }` entirely; Node is the default and needs no config. (2) **Root `package.json` missing `"type": "module"`** — ES module imports in `chat.ts` failed at runtime with "Failed to load the ES module". Fix: added `"type": "module"` to root `package.json`. (3) **Node runtime uses VercelRequest/VercelResponse, not Web Request** — `req.json is not a function` crashed the handler because the Edge Web Request API isn't available in Node runtime. Fix: rewrote handler to import `VercelRequest`/`VercelResponse` from `@vercel/node`, read body via `req.body` (Vercel pre-parses JSON), stream output with `res.write()` / `res.end()`. Removed `ReadableStream` construction and removed prompt caching (cache_control typing was fragile in this context — add back in V1). Installed `@vercel/node` as a dependency.

- **2026-05-13 — Session 7: Coordinate transform bug found and fixed.** Root cause: `THREE.SphereGeometry` UV mapping places prime meridian at +X in world space. Both satellite propagation formula and solar direction formula incorrectly placed it at +Z (a 90° systematic error). Correct formula: `(r·cos(lat)·cos(lon), r·sin(lat), -r·cos(lat)·sin(lon))`. Solar correct: `(xECEF, zECEF, -yECEF)`. Both errors were identical so satellites were coherent with day/night but 90° off from geography. Fixed in propagator.worker.ts, SatelliteMesh.ts, Globe.ts (highlightSatellite), and solar.ts simultaneously.

- **2026-05-13 — TLE cache reduced to 30 minutes.** ISS moves at 7.66 km/s; 4-hour TLE age → 4–40 km position error. 30-minute cache → < 3 km error, matching public tracker accuracy at our globe's zoom level. Frontend also refreshes the worker every 30 min so long-running sessions stay accurate.

- **2026-05-13 — Session 7 long-term vision: toward satellitetracker3d quality.** Next sessions: (1) Click-to-select — click any catalog dot → agent panel pre-fills with satellite name. (2) Category filters — layer toggles (ISS, Starlink, GPS, weather, debris). (3) Hover tooltip — satellite name/altitude on hover. (4) Ground track for selected catalog satellite (not just ISS). (5) Position smoothing — interpolate 5–10 frames when new TLEs arrive to prevent visual "jump". These are Session 8+ work, do not start until current fixes are deployed.

- **2026-05-13 — Session 8: ISS accuracy root cause and fix.** Root cause: `/tle/iss` called `get_satellites()` which served data from the 30-min catalog cache. ISS velocity 7.66 km/s × 1800 s = 13,788 km drift = nearly 1/3 orbit error at worst. Fix: `get_iss_tle()` with a separate `_iss_cache` with 5-min TTL that calls `_fetch_iss_tle()` (CelesTrak CATNR, confirmed not IP-blocked on Railway). Frontend calls `fetchIssTle()` via `/tle/iss` on Globe mount and every 2 minutes, independent of the 30-min catalog refresh cycle. Position error is now ≤ 2,300 km (5 min × 7.66 km/s × 60s). Rule: never share cache TTL between real-time position data and bulk catalog; they have different accuracy requirements.

- **2026-05-13 — Session 8: Earth texture upgrade.** Replaced 501KB / 186KB textures (2048×1024) with NASA Blue Marble `land_shallow_topo_8192.tif` converted to JPEG (8192×4096, 5.7MB) and NASA Black Marble 2012 at 3600×1800 (1.1MB). Downloaded from `eoimages.gsfc.nasa.gov` — the old `/imagerecords/74000/74117/` paths return 404; working paths are `/imagerecords/57000/57752/` for day and `/imagerecords/79000/79765/` for night. Three.js configured with `anisotropy = maxAnisotropy` (typically 16×), `LinearMipmapLinearFilter`, and `SRGBColorSpace`. Sphere tessellation raised to 128×64.

- **2026-05-13 — Session 8: Atmosphere + star field.** Atmosphere: separate `AtmosphereMesh` at radius 1.015 using a Fresnel rim shader (additive blending, depthWrite false). Star field: 8,000 `THREE.Points` uniformly distributed on a sphere of radius 50, white/blue-white/warm colour variation. Both purely visual with no effect on satellite propagation or chat.

- **2026-05-13 — Globe camera highlight broken: tools in streaming turn caused silent drop.** Second streaming Claude call had `tools: TOOLS` in the request. Haiku called `highlight_on_globe` as a tool in the streaming turn; streaming loop only writes `text_delta` events so the tool call was silently dropped and `pendingHighlight` was never set. Fix: removed `tools` from second call (answer turn must produce text only), updated system prompt to say "IN THE SAME TURN (in parallel)" for `highlight_on_globe`, increased first-turn `max_tokens` 512→1024. Rule: never include tools in a streaming-answer turn unless you handle `tool_use` stop reason in the stream.

- **2026-05-13 — Session 7 chatbot reliability fix: haiku/sonnet split + Railway keepalive.** Vercel Hobby hard-caps at 10s; `maxDuration: 60` is silently ignored. Previous approach used `claude-sonnet-4-6` for both turns — tool-detection consumed 3–5s, leaving no headroom for Railway's 2–8s cold-start recovery. Fix: tool-detection turn now uses `claude-haiku-4-5-20251001` (~1s); streaming answer keeps sonnet. Orbital fetch timeout tightened from 8s → 5s. Globe.ts pings `/health` on mount and every 4 minutes to prevent Railway free-tier sleep (cold start: 20–30s). Rule: always use the fastest model capable of the task; tool-detection is a routing decision, not reasoning.

- **2026-05-13 — Session 8 post-ship fixes: arc closing segment + catalog limit.** `THREE.LineLoop` automatically closes the arc by drawing a line from the last point back to the first. Over one ISS orbital period the Earth rotates ~22.5°, so start/end geographic positions differ and the closing segment is visibly wrong. Fix: `THREE.Line` (open path). Also increased arc resolution from 91 to 181 points for a smoother curve. Catalog limit raised from 1,000 to 10,000 in `satellites.py` (`LIMIT = 10000`) and in the SpaceTrack fallback URL (`limit/10000`). CelesTrak GROUP=active returns ~9,000–10,000 active satellites; SpaceTrack fallback now fetches the same count. Worker and InstancedMesh scale to 10k with no code changes — only the buffer size grows.

- **2026-05-13 — On "averaging algorithms" used by major trackers.** Major trackers achieve accuracy through fresh TLEs (< 2h for ISS) and correct coordinate transforms. The "averaging" some sites do is position smoothing across 5–30 seconds when a new TLE epoch arrives — prevents visual discontinuities but does not improve scientific accuracy. Our 30-minute cache and correct coordinate formula are sufficient to match any public tracker at our zoom level.

- **2026-05-13 — ISS orbit arc: three-attempt debugging journey (portfolio record).** This ADR records all three attempts to fix the orbit arc, including the wrong turns — preserved intentionally so viewers can see how real debugging works. Attempt 1 (original bug): `THREE.LineLoop` draws a line from the last point back to the first, auto-closing the path. The arc was computed in ECEF (Earth-fixed) coordinates over one orbital period (~92 min). Over 92 minutes the Earth rotates ~22.9°, so the last geographic point is 22.9° away from the first, and `LineLoop` drew a diagonal closing segment across that gap. Fix: switched `THREE.LineLoop` → `THREE.Line` (open path, no auto-close). Attempt 2 (exposed the real problem): after switching to `Line`, the two arc endpoints were now visibly far apart — same 22.9° gap, just no longer hidden by a fake closing segment. Root cause investigation: ECEF ground tracks are mathematically open curves. The Earth rotating under the satellite means the start and end of any full-period arc are always geographically separated. This is not a bug — it is orbital mechanics. No number of points or filtering would fix an ECEF closed ring. Fix: switch the arc to ECI (Earth-Centered Inertial) coordinates, which are fixed to the stars (no Earth rotation). In ECI space, the ISS orbit is a closed ellipse — start and end of a full-period path are the same point. Implementation: `computeArcPoints()` now calls `satellite.propagate()` over one period, reads raw ECI `{x, y, z}` in km, normalises to Earth-radii units (`r = mag / 6371`), and maps to Three.js axes with `(eciX, eciZ, -eciY)`. GMST rotation (which would move to ECEF) is intentionally skipped. `THREE.LineLoop` is correct again now — ECI orbit is genuinely closed. `lastArcDate` and 60-second periodic recompute removed; the ECI ring is static between TLE updates, so it only needs recomputing when `updateTle()` is called. The dot and halo remain in ECEF (showing real geographic position). The ring and dot are intentionally in different frames: the ring shows the orbital plane, the dot shows where the satellite is right now.

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

**Note on tooling:** Sessions use a two-tool workflow. Planning, strategy, and review happen in claude.ai chat (the user's advisor). Execution happens in Claude Code with Superpowers. CLAUDE.md is the shared brain — both contexts read it at session start and update it at session end. The user is the engineer in charge; both AI contexts implement his judgment.

When mickey opens a new conversation about this project:

1. He pastes this file's current contents.
2. He optionally pastes the latest `README.md` if it's significantly newer.
3. He says where we left off (or asks Claude to figure it out from "Active scope").
4. Claude orients itself, asks at most one clarifying question if needed, then gets to work.

This file is the contract. If something here is wrong or stale, fix the file before fixing the code.

---

## Notes for the assistant

- Don't propose framework changes (e.g. swap React for Vue) without explicit reason.
- Don't suggest abandoning the AI agent layer — that's the architectural commitment.
- When a problem is genuinely outside scope, say so directly and offer to log it for V3.
- Keep responses concise. Prose over bullets unless listing genuinely parallel things.
- If asked to write code, follow the conventions section above.
- **Document everything, including failures.** Every wrong turn, failed attempt, and multi-step debugging journey gets an ADR entry in the Decisions log. This is a portfolio project — the journey matters as much as the result. Never omit the mistakes.
- **Keep docs in sync.** At the end of every session: update Active scope (mark tasks done, update current phase), add ADR entries for any non-obvious decisions made, update the bootstrap prompt to reflect the new session end state.

---

## Docs map — what lives where

| File | What it contains |
|------|-----------------|
| `CLAUDE.md` | Master context: project goal, architecture, tech stack, active scope (current phase + next milestone), completed task history, decisions log (ADR-lite), session bootstrap prompt. Update this every session. |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | Implementation plans generated during brainstorming. One file per session/feature. Contains exact file paths, code, test commands, and step-by-step tasks. Created by the writing-plans skill, executed by executing-plans. |
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | Design specs produced during brainstorming sessions. Covers architecture, component breakdown, data flow, trade-offs. Written before the plan, reviewed by mickey before implementation starts. |
| `CHANGELOG.md` | User-facing change log. Updated when a session ships something visible. Not every internal fix needs an entry — milestone features and breaking changes do. |
| `README.md` | Public-facing project overview. What it does, how to run it locally, deploy notes. Updated when major features ship or setup instructions change. |

**Rule for documenting ups and downs:** Every non-obvious decision, wrong turn, failed attempt, or debugging journey goes into the `## Decisions log` section of `CLAUDE.md` as an ADR entry — including the mistakes and the reasons they were wrong. This is a portfolio project: viewers should see the real engineering process, not just the happy path. If something took three attempts to fix, all three attempts get logged. Format: `- **YYYY-MM-DD — short title.** What happened, what was wrong, what the fix was, and the rule to remember.`

---

## Session 9 bootstrap prompt

> Copy-paste this at the start of the next session to restore full context instantly.

```
We're working on Aussie Sky — a real-time 3D satellite tracker with an AI agent chat interface. Portfolio project for landing a SWE internship in Australia. Read CLAUDE.md fully before doing anything.

Where we left off (end of Session 8 + arc fix):

WHAT'S LIVE at https://aussie-sky.vercel.app:
- 3D Earth globe (Three.js, NASA 8K day + 3.6K night textures, GLSL day/night shader)
- Atmospheric rim glow (Fresnel shader), 8,000-star background
- ~9,000–10,000 live satellites from CelesTrak/space-track (30-min cache)
- ISS: separate 5-min TLE cache via /tle/iss, frontend refreshes every 2 min
- ISS rendered as yellow dot + orbital ring + pulse animation on agent highlight
- ISS dot now sits ON the orbital ring (GMST alignment fixed — this was the last bug)
- Catalog satellites as blue InstancedMesh (propagator web worker, 100ms tick)
- AI agent chat (Claude API, tool use, multi-turn history)
- 4 agent tools: predict_iss_passes, highlight_on_globe, find_satellites_overhead, get_satellite_info
- UTC clock overlay + satellite count overlay
- Backend: Python FastAPI on Railway; frontend: Vite+React on Vercel
- Tests: 31 Vitest + 67 pytest — all green

KEY TECHNICAL STATE:
- Coordinate system: prime meridian → +X, north → +Y, 90°E → −Z (Three.js SphereGeometry UV convention)
- ISS arc: ECI positions rotated by current GMST → closed ring at correct geographic longitude. Recomputes every 60 s.
- SatelliteMesh.ts: dot/halo in ECEF, arc in ECI+GMST. lastArcRecompute tracks 60-s interval.
- Globe.ts: mounts ISS with hardcoded TLE, immediately kicks off refreshIssTle() + 2-min interval
- propagator.worker.ts + SatelliteField.ts: InstancedMesh, positions updated from worker buffer every 100ms

SESSION 9 GOALS (priority order — each is independently shippable, stop if time runs short):
1. Click-to-select: raycaster on canvas click → find nearest InstancedMesh instance → pre-fill agent chat with satellite name ("Tell me about STARLINK-1234")
2. Hover tooltip: raycaster on mousemove → show satellite name + altitude in a floating div when cursor is near a dot
3. Category filter toggles: classify catalog by name pattern (STARLINK, GPS, IRIDIUM, ISS, debris) → UI buttons → show/hide InstancedMesh subsets
4. Agent group-highlight tool: highlight_catalog_group(category) so agent can say "show me all Starlink satellites"

Start with click-to-select. The raycaster needs to hit test against InstancedMesh — use THREE.Raycaster.intersectObject() which supports instanced meshes and returns instanceId. Map instanceId back to the satellite TLE name via the array passed to the worker. Pre-fill the agent chat input (lift state or use a callback prop from GlobeView to AgentPanel).
```
