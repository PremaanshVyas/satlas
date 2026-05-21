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

**Current phase:** Session 23 complete — NORAD ID leading-zero normalization fix (Cosmos 574 wrong-satellite bug). All hotfixes live. V1 milestone fully shipped.

**Next milestone:** Session 24 — polish backlog: pulsing dot in SatInfoCard, compass rose in PassPanel, /docs footer discoverability.

**Sessions 1–20 (complete, stable):** See `docs/session-21-bootstrap.md` (S21 context) and `docs/decisions-archive.md` (all ADRs through S17). Key phases: globe + ISS (S1-5), AI agent + tools (S6-10), CI/CD + search (S11-15), AWS infra (S16-19), PassPanel + satcat fix (S20).

**Session 22–23 completed tasks:**
- [x] Domain `satlas.app` registered at Namecheap; Route 53 hosted zone created via Terraform
- [x] ACM wildcard cert (`*.satlas.app`) provisioned and validated
- [x] HTTPS listener added to ALB; HTTP port 80 redirects to HTTPS
- [x] `api.satlas.app` A alias record → ALB; `satlas.app` A record → Vercel (216.198.79.1); `www.satlas.app` CNAME → Vercel
- [x] CORS updated: `https://satlas.app` added to `_ALLOWED_ORIGINS`
- [x] Pass prediction boundary fix (skyfield `find_events` boundary edge cases)
- [x] SatInfoCard metadata fixed (hardcoded CloudFront fallback, `VITE_CATALOG_URL` not needed in Vercel)
- [x] AI no longer contradicts tool data on satellite tracking status
- [x] Location search shows "City, Country" for disambiguation
- [x] Pass list scroll fixed (`max-h-[50dvh] overflow-y-auto`)
- [x] NORAD ID normalization: integer comparison in `satinfo.py`, padded keys in `satcat.ts` (cache v5)

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
3. For the full session context prompt for the next session, see `docs/session-23-bootstrap.md`.

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
| `docs/session-23-bootstrap.md` | Session 23 bootstrap — paste at start of Session 24 (contains S24 priorities). |
| `docs/decisions-archive.md` | ADR entries from Sessions 1–17, migrated to keep CLAUDE.md under 40k. |
| `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` | Implementation plans. One file per session/feature. |
| `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | Design specs produced during brainstorming sessions. |
| `CHANGELOG.md` | User-facing change log. Updated when a session ships something visible. |
| `README.md` | Public-facing project overview. What it does, how to run it locally, deploy notes. |
