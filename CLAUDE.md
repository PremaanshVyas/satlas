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

**Current phase:** Session 11 complete. Group-highlight agent tool (`highlight_catalog_group`) + category-count agent tool (`get_category_counts`) + `/satellite-categories` Python endpoint all live. 39 Vitest + 87 pytest — all green. Ready for deployment.

**Next milestone:** Session 12 — CI/CD setup (GitHub Actions), deployment health check, and V1 polish.

**Session 11 completed tasks:**
- [x] `highlight_catalog_group(category)` agent tool: Claude says "show all Starlink satellites" → all Starlink dots go violet, everything else dims to near-black. Uses THREE.InstancedMesh `setColorAt` + white material; cleared by restoring blue material + null instanceColor.
- [x] `get_category_counts` agent tool: Claude answers "how many GPS satellites?" without guessing. Calls new `/satellite-categories` Python endpoint which classifies the cached catalog.
- [x] `__GROUP_HIGHLIGHT__` wire directive: emitted by `api/chat.ts` after text, parsed by `useChat.ts`, flows to `useGlobe.ts` → `Globe.setGroupHighlight()`.
- [x] 87 pytest (10 new for `/satellite-categories` + `_classify_satellite`) + 39 Vitest (6 new for GROUP_HIGHLIGHT parsing + useGlobe wiring) — all green; tsc clean.
- [x] CHANGELOG, README, CLAUDE.md updated.

**Session 10 completed tasks:**
- [x] Hover tooltip: mousemove handler in Globe.ts (40ms throttle), screen-space proximity, shows name + altitude km
- [x] Category filter pills: classifySatellite() buckets TLEs into STARLINK/GPS/IRIDIUM/DEBRIS/OTHER; Uint8Array mask applied in SatelliteField.update(); bottom-center overlay buttons
- [x] Ground track: click-to-select shows ECI+GMST orbit arc (sky-blue LineLoop) for selected catalog satellite; recomputes every 60s; clears on empty-space click
- [x] Full-screen globe: removed 65/35 split; globe is absolute inset-0
- [x] Collapsible AI chat: floating 320px right overlay, toggle button bottom-right, badge shows reply count
- [x] Satellite info card: top-left card shows name + NORAD ID + "Ask AI" button; decouples globe exploration from AI — "Ask AI" opens chat and prefills query, enforcing presenter-only pattern
- [x] Category mask applied in click + hover loops (no false positives on hidden satellites)
- [x] ISS click/hover fix: Globe checks ISS dot position before catalog buffer — docked modules (Unity, Destiny etc.) no longer hijack the click; always resolves to ZARYA/25544
- [x] 77 pytest + 33 Vitest green; tsc clean

**Session 9 completed tasks (summary):**
- Click-to-select, actual orbital heights, hardened system prompt, CelesTrak FORMAT=TLE fix, stale cache fallback, Melbourne time server-side. 77 pytest + 32 Vitest.

**Sessions 1–8 (shipped, stable):**
- Globe rendering, ISS SGP4, Vercel deploy, agent + tools (predict_iss_passes, highlight_on_globe, find_satellites_overhead, get_satellite_info), live TLE catalog, conversation history, coordinate transform fix, UTC clock, satellite count, Railway keepalive, NASA 8K textures, atmosphere, star field, ISS arc ECI+GMST.

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

- **2026-05-14 — ISS click/hover returns wrong module (Unity, Destiny) — fixed by priority check.** ISS docked modules (NORAD 26958 Unity, 27386 Destiny, etc.) share the same orbital position as ISS ZARYA (25544). The catalog InstancedMesh includes these modules as blue dots. Before the fix, clicking near the yellow ISS dot iterated the catalog buffer first and returned whichever docked module was geometrically closest in the buffer — not ISS ZARYA. Fix: both click and hover handlers check the ISS SatelliteMesh position against the cursor before iterating the catalog buffer. If the cursor is within the ISS dot radius (+2px tolerance for click, +6px for hover), the handler fires with `(issName, '25544')` and returns. `issName` is captured from the catalog on load (NORAD 25544 should be 'ISS (ZARYA)') with a hard fallback. Sentinel value `-2` for `hoveredIdx` prevents re-firing while cursor stays over the ISS. Rule: when a special object shares a position with catalog entries, always check it first in the pick loop.

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
3. For the full session context prompt for the next session, see `docs/session-11-bootstrap.md`.

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
| `docs/session-12-bootstrap.md` | Next session full context prompt — paste at start of Session 12. |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | Implementation plans. One file per session/feature. |
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | Design specs produced during brainstorming sessions. |
| `CHANGELOG.md` | User-facing change log. Updated when a session ships something visible. |
| `README.md` | Public-facing project overview. What it does, how to run it locally, deploy notes. |
