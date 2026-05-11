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

**Current phase:** Pre-MVP / scaffolding.

**Next milestone:** more tools — find_satellites_overhead(lat, lon, radius_km) and get_satellite_info(name_or_norad_id). The agent can now answer 'what's over me right now' and 'tell me about Hubble', querying the live catalog from session 4.

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
- [ ] Add CelesTrak fetch + cache to apps/orbital (new /satellites endpoint, 4-6 hour cache)
- [ ] Frontend loads the catalog on app start
- [ ] Web worker propagates ~1000 satellite positions per frame off the main thread
- [ ] Render satellites via Three.js InstancedMesh (one draw call, position buffer updated per frame)
- [ ] ISS retains its 'selected' treatment (orbit arc, larger dot, pulse on highlight); other satellites are just dots
- [ ] Verify main thread stays at 60fps with 1000 satellites
- [ ] Manual deploy verify on aussie-sky.vercel.app
- [ ] Update README.md and CLAUDE.md at end of session

**Blockers:** None.

**Last session ended at:** Session 3 complete. highlight_on_globe tool shipped — chat and globe are now one surface. Asking "show me where the ISS is" drives a camera fly-to + 3× halo pulse. 17/17 tests passing. Deployed at https://aussie-sky.vercel.app.

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

- **2026-05-11 — Three deploy fixes to `api/chat.ts` and root `package.json`.** Hit during Railway + Vercel deploy. (1) **Edge runtime incompatible with Anthropic SDK** — the SDK references `node:fs` and `node:path` which don't exist in Vercel Edge runtime. Fix: removed `export const config = { runtime: 'edge' }` entirely; Node is the default and needs no config. (2) **Root `package.json` missing `"type": "module"`** — ES module imports in `chat.ts` failed at runtime with "Failed to load the ES module". Fix: added `"type": "module"` to root `package.json`. (3) **Node runtime uses VercelRequest/VercelResponse, not Web Request** — `req.json is not a function` crashed the handler because the Edge Web Request API isn't available in Node runtime. Fix: rewrote handler to import `VercelRequest`/`VercelResponse` from `@vercel/node`, read body via `req.body` (Vercel pre-parses JSON), stream output with `res.write()` / `res.end()`. Removed `ReadableStream` construction and removed prompt caching (cache_control typing was fragile in this context — add back in V1). Installed `@vercel/node` as a dependency.

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
