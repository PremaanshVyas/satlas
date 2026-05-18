# Session 13 Bootstrap Prompt

> Copy-paste this at the start of the next session to restore full context instantly.

```
We're working on Satlas — a real-time 3D satellite tracker with an AI agent chat interface.
Portfolio project for landing a SWE internship in Australia. Read CLAUDE.md fully before doing anything.

Where we left off (end of Session 12, all post-session fixes included):

WHAT'S LIVE at https://satlas.vercel.app:
- Globe tracks ~15,432 active objects (full CelesTrak GROUP=active catalog, no truncation)
- Hover/select dot highlight: hovered and selected satellites turn lime green (0x4ade80)
- Click-when-hovering fix: clicking when tooltip is visible always fires, no precision needed
- CI/CD: GitHub Actions with 4 green jobs (web lint+build+test, api-typecheck, orbital-test, orbital-docker)
- CORS restricted to Vercel + localhost origins
- CelesTrak direct browser fetch: catalog loaded from CelesTrak CDN in the browser (~1s), no Railway dependency for globe rendering
- Stale-while-revalidate cache: key satlas-catalog-v3, 24h TTL. Always serves from cache immediately; background refresh keeps it warm. Satellites never disappear.
- Propagator worker hardened: malformed TLEs return null (never throw); per-satellite try-catch; position guard is !posVel.position || typeof !== 'object'
- Chatbot covers full 15k catalog: removed LIMIT=10000 from satellites.py; chatbot no longer 404s for satellites past slot 10,000
- 45 Vitest + 87 pytest — all green; tsc clean; lint clean; vite build clean

KEY TECHNICAL STATE:
- celestrak.ts: cache key = 'satlas-catalog-v3', MAX_CACHE_AGE_MS = 24h. parseTleText() + fetchFromCelesTrak() (primary, browser) + fetchFromRailway() (silent fallback). Stale-while-revalidate always.
- propagator.worker.ts: satrecs: (SatRec | null)[] — null slots from malformed TLEs, skipped each tick; per-satellite try-catch; !posVel.position || typeof !== 'object' guard
- satellites.py: no LIMIT — serves full CelesTrak response. SpaceTrack URL limit raised to 25000. CACHE_TTL_SECONDS = 1800 (30 min server-side cache).
- SatelliteField.ts: mat always white, all colouring via instanceColor (DEFAULT_COLOR=0x60a5fa blue); setInstanceColor(idx, color) for per-dot highlight
- Globe.ts: HIGHLIGHT_COLOR=0x4ade80 (lime-400); refreshInstanceColor(idx); click short-circuits to hoveredIdx when set
- api/chat.ts: system prompt says ~15,000 satellites. MODEL_DETECT and MODEL_ANSWER both claude-haiku-4-5-20251001. ORBITAL_FETCH_TIMEOUT_MS=5000 (Railway — chatbot only, not globe).

WHAT CAN STILL FAIL (known, accepted):
- Chatbot Railway cold start: first question after the site has been idle for a while times out with "try again in a moment". Second attempt works. This is a free-tier constraint, not a bug.
- Globe rendering never fails: CelesTrak is a CDN, always responds in ~1s from any browser.

ARCHITECTURE RULE — ENFORCE STRICTLY:
Claude is the presenter, never the calculator. Every value shown to the user must come from a
backend tool result or pre-computed server-side value. Never compute, infer, or guess any data
value (time, position, altitude, pass windows). If data is missing, say it is unavailable.

SESSION 13 GOALS (priority order):
1. README local dev setup: README should tell a new contributor exactly how to run the app locally — npm commands, Python venv, env vars needed. Currently a placeholder.
2. FastAPI /docs: FastAPI serves Swagger UI at /docs by default — verify it's accessible on Railway and add it to the README as a live API explorer link.
3. General pass predictor: /passes/{norad_id} endpoint in Python (not just ISS). Mirrors predict_passes but accepts any NORAD ID. New agent tool: predict_passes(norad_id, latitude, longitude, hours_ahead).
4. Text search on globe: type a satellite name, matching dot highlights. UI-only, no backend.
5. UptimeRobot: set up external ping to keep Railway warm (zero-code, external service).
```
