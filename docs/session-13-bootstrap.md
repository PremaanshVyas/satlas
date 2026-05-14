# Session 13 Bootstrap Prompt

> Copy-paste this at the start of the next session to restore full context instantly.

```
We're working on Aussie Sky — a real-time 3D satellite tracker with an AI agent chat interface.
Portfolio project for landing a SWE internship in Australia. Read CLAUDE.md fully before doing anything.

Where we left off (end of Session 12, including all post-session fixes):

WHAT'S LIVE at https://aussie-sky.vercel.app:
- All Session 11 features remain live (see session-12-bootstrap.md for full list)
- Hover/select dot highlight: hovered and selected catalog satellites turn lime green (0x4ade80).
  SatelliteField.mat is always white; all colouring via instanceColor.
  Globe.refreshInstanceColor(idx) applies HIGHLIGHT_COLOR when idx is hovered or selected.
- Click-when-hovering fix: onCanvasClick short-circuits to hoveredIdx if set — no need to be
  pixel-perfect on the dot if the tooltip is already showing.
- CI/CD now wired up: GitHub Actions .github/workflows/ci.yml with 4 jobs:
  * web: lint (ESLint) + build (tsc + vite) + test (vitest) on Node 20
  * api-typecheck: npx tsc --noEmit at root (checks api/chat.ts via root tsconfig.json)
  * orbital-test: pytest on Python 3.11
  * orbital-docker: docker build apps/orbital
  * Triggers on push to main AND on pull_request to main
- CORS restricted: allow_origins was ['*'], now ['https://aussie-sky.vercel.app', 'http://localhost:5173', 'http://localhost:4173']
- ESLint clean: 3 errors fixed (onSatelliteClickRef moved into useLayoutEffect; 2 intentional
  setState-in-effect patterns got eslint-disable-next-line)
- CelesTrak direct browser fetch: celestrak.ts tries GROUP=active&FORMAT=TLE directly in the
  browser first (user IPs never blocked by CelesTrak). Railway /satellites is a silent fallback
  only. Completely decouples catalog load from Railway cold starts.
- Stale-while-revalidate cache: MAX_CACHE_AGE_MS=24h. Cached data served immediately;
  background refresh fires to keep cache warm. First visit ever still blocks on network;
  every subsequent visit is instant.
- Propagator worker hardened: twoline2satrec in try-catch (null for malformed TLEs); per-satellite
  try-catch in tick handler; position guard is !posVel.position || typeof !== 'object'. One bad
  TLE entry can no longer abort the entire propagation frame.
- Tests: 45 Vitest + 87 pytest — all green; tsc clean; lint clean; vite build clean

KEY TECHNICAL STATE:
- celestrak.ts: parseTleText() + fetchFromCelesTrak() (primary) + fetchFromRailway() (fallback)
  + stale-while-revalidate with 24h MAX_CACHE_AGE_MS
- propagator.worker.ts: satrecs: (SatRec|null)[] — null slots from malformed TLEs, skipped on tick;
  per-satellite try-catch; guard: !posVel.position || typeof posVel.position !== 'object'
- SatelliteField.ts: mat always white, all colouring via instanceColor (DEFAULT_COLOR=0x60a5fa);
  setInstanceColor(idx, color) for per-dot highlight
- Globe.ts: HIGHLIGHT_COLOR=0x4ade80 (lime-400); refreshInstanceColor(idx) applies highlight or
  base color; click short-circuits to hoveredIdx when set

ARCHITECTURE RULE — ENFORCE STRICTLY:
Claude is the presenter, never the calculator. Every value shown to the user must come from a
backend tool result or pre-computed server-side value. Never compute, infer, or guess any data
value (time, position, altitude, pass windows). See CLAUDE.md Decisions log for full rule.

SESSION 13 GOALS (priority order):
1. Local dev setup docs: README should tell a new contributor exactly how to run the app locally
   (npm commands, Python venv, env vars needed). Currently a placeholder.
2. FastAPI /docs: FastAPI serves Swagger UI at /docs by default — it may be disabled; one-line fix
   to expose it. Good for the portfolio and for manual testing.
3. General pass predictor: /passes/{norad_id} endpoint in Python (not just ISS). Mirrors the
   existing predict_iss_passes but accepts any NORAD ID. Agent tool: predict_passes(norad_id).
4. Text search on globe: type a satellite name, matching dot highlights. UI-only, no backend.
5. UptimeRobot: set up external ping to keep Railway warm (zero-code, external service).
6. V1 discussion: public API with docs, rate limiting — see CLAUDE.md roadmap.
```
