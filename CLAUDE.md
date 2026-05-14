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

**Current phase:** Session 9 complete. Click-to-select live and working. Satellites now render at actual orbital altitude (LEO/MEO/GEO shells visible). CelesTrak catalog fixed (FORMAT=TLE), stale-cache fallback prevents blank globe on source outage. Chatbot timezone fixed (Melbourne time server-side). System prompt hardened: NORAD ID in prefill → exact backend lookup; Claude never answers satellite data from training. 77 pytest + 32 Vitest — all green.

**Next milestone:** Session 10 — hover tooltip + category filter toggles. See `docs/session-10-bootstrap.md` for the full context prompt.

**Session 9 completed tasks:**
- [x] Debug satellites disappeared: CelesTrak FORMAT=json→TLE fix, stale cache fallback
- [x] Chatbot timezone bug: server-side Melbourne time injected into system prompt
- [x] Satellite heights: propagated geo.height replaces hardcoded radius in worker + ISS mesh
- [x] Camera far plane 100→200, maxDistance 8→15 (to show MEO/GEO)
- [x] Click-to-select: screen-space proximity picking (dynamic dot radius from depth + FOV)
- [x] satNoradIds[] parallel array; prefill format "Tell me about NORAD <id> (<name>)"
- [x] System prompt: ALWAYS call get_satellite_info; NORAD ID → exact match; never fill from training
- [x] Test: useGlobe.test.ts updated for two-arg onSatelliteClick signature
- [x] 77 pytest + 32 Vitest green

**Session 8 completed tasks (summary):**
- ISS 5-min TLE cache + frontend 2-min refresh; NASA 8K/3.6K textures; atmosphere + star field; ISS arc ECI+GMST; catalog limit 10k; 67 orbital + 31 web tests green.

**Sessions 1–7 (shipped, stable):**
- Globe rendering, ISS SGP4 propagation, Vercel deploy, agent + predict_iss_passes tool, highlight_on_globe (camera fly-to + pulse), live TLE catalog (InstancedMesh + web worker), conversation history, find_satellites_overhead + get_satellite_info tools, coordinate transform fix, UTC clock + satellite count overlays, Railway keepalive, chatbot reliability (haiku/sonnet split + 5s timeout).

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
3. For the full session context prompt for the next session, see `docs/session-10-bootstrap.md`.

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
| `docs/session-10-bootstrap.md` | Next session full context prompt — paste at start of Session 10. |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | Implementation plans. One file per session/feature. |
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | Design specs produced during brainstorming sessions. |
| `CHANGELOG.md` | User-facing change log. Updated when a session ships something visible. |
| `README.md` | Public-facing project overview. What it does, how to run it locally, deploy notes. |
