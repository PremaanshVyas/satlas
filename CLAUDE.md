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

**Next milestone:** Highlight satellites on the globe in response to chat — when the user asks "show me X", the agent calls a tool that focuses the camera and pulses the target satellite.

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
- [ ] Deploy orbital service to Railway
- [ ] Add `ANTHROPIC_API_KEY` + `ORBITAL_SERVICE_URL` to Vercel env vars → redeploy

**Blockers:** None.

**Last session ended at:** Agent + first tool code complete and pushed to GitHub. Railway deploy + Vercel env vars pending — once those are done, live chat with real ISS pass prediction works end-to-end.

---

## Decisions log (ADR-lite)

Append entries here as decisions get made. Format: date, decision, rationale, alternatives considered.

- **2026-05-10 — Project initialized.** Decided on Aussie Sky concept (3D SSA + AI agent), monorepo structure, AWS infrastructure. Considered alternatives: pure Earth Observation platform (rejected as less visually striking on first impression), ML-only bushfire pipeline (rejected as narrower in stack). Folded bushfire detection in as the V2 vision-pipeline use case.

- **2026-05-10 — AI agent is the primary interface, not a side feature.** Every user query goes through Claude with tool use. Avoids the "AI bolted on" pattern that dominates current portfolio projects.

- **2026-05-10 — Defer Go gateway until V1.** Frontend talks directly to FastAPI for MVP. Simplifies scaffolding. Add Go for production hardening later.

- **2026-05-11 — Frontend scaffold shipped.** `apps/web` built with Vite 8 + React 19 + TypeScript + Tailwind v4 + Vitest. 65/35 split layout (Three.js globe left, agent panel right). Globe renders with a custom GLSL ShaderMaterial blending NASA Blue Marble (day) and Black Marble (night) textures via a real-time sun direction uniform computed from Meeus low-precision formulae. ISS rendered as a glowing yellow dot with a full-period orbit arc, propagated each frame via satellite.js v4 SGP4. OrbitControls for mouse drag + scroll zoom. 7 passing unit tests. `vercel.json` committed and ready to deploy. Note: ISS position is symbolic (hardcoded March 2024 TLE) — live TLE fetch from CelesTrak is a V1 requirement.

- **2026-05-11 — Deployed to Vercel.** Live at https://aussie-sky.vercel.app. Auto-deploys on push to main. Free tier sufficient for portfolio traffic.

- **2026-05-11 — Agent + first tool shipped.** Wired the full agent-tool loop end-to-end. `apps/orbital/passes.py` uses skyfield `find_events` (altitude_degrees=10°, builtin timescale) to predict ISS passes, returning start/end UTC, max elevation, and compass direction. `apps/orbital/main.py` is a FastAPI service exposing `GET /predict-passes` with lat/lon/hours_ahead query params, containerised in a Dockerfile for Railway. `api/chat.ts` is a Vercel Edge Function that runs a two-turn Claude tool-use loop: first call (non-streaming) detects whether to invoke `predict_iss_passes`, executes the tool against the Railway service, then streams Claude's final answer back to the browser via `ReadableStream`. Prompt caching applied to the system prompt on both turns. `useChat` hook manages message state and streams chunks into the assistant bubble in real time. `AgentPanel` replaces the static placeholder with a full chat UI: scrollable history, animated bouncing dots while streaming, Enter-to-send, disabled input while loading. 11 passing Vitest tests. Railway deploy + Vercel env vars are the only remaining manual steps before the feature is live.

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

**Note on tooling:** From this point forward, sessions are conducted via claude.ai chat rather than Claude Code. Code produced in the session is copy-pasted into the repo manually by mickey. The workflow (brainstorm → plan → implement → review → commit) is the same; the mechanism is paste-not-CLI.

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
