# Session 14 Bootstrap Prompt

> Copy-paste this at the start of the next session to restore full context instantly.

```
We're working on Satlas — a real-time 3D satellite tracker with an AI agent chat interface.
Portfolio project for landing a SWE internship in Australia. Read CLAUDE.md fully before doing anything.

Where we left off (end of Session 13 — reliability fixes only, V1 features not yet started):

WHAT'S LIVE at https://getsatlas.vercel.app:
- Globe tracks ~9k active satellites from CelesTrak GROUP=active (clean, no debris)
- Cache key: satlas-catalog-v3. Stale-serve up to 72h — satellites always instant on reload
- Soft catalog refresh: 30-min background refresh re-inits worker TLEs in place, no InstancedMesh teardown, no satellite gap
- Hover/click occlusion: dot-product check skips satellites on far side of earth — no ghost tooltips
- Hover/click z-ordering: depth-based pick — lower-altitude satellite always wins when two overlap
- Chatbot: system prompt now says "on any tool error, say unavailable only — never use training knowledge"
- SpaceTrack fallback: filtered to PAYLOAD type, 10k limit — no debris even when Railway falls back
- CI/CD: 4 GitHub Actions jobs green (web, api-typecheck, orbital-test, orbital-docker)
- 45 Vitest + 87 pytest — all green; tsc clean; lint clean

KEY TECHNICAL STATE:
- celestrak.ts: CACHE_KEY='satlas-catalog-v3', SERVE_AGE_MS=24h, MAX_CACHE_AGE_MS=72h.
  loadCachedCatalog() returns { data, needsRefresh } | null. fetchSatelliteCatalog always serves
  cached data instantly and always fires a background network refresh.
- Globe.ts / initCatalog(): soft refresh when field+worker exist and |newCount-oldCount|<=200 —
  just re-posts { type:'init', tles } to existing worker. Full rebuild only on first load or big count change.
- Globe.ts / hover + click loops: `if (satX*camX+satY*camY+satZ*camZ <= 0) continue` before project().
  Occlusion check. Pick by depth (bestDepth) not screenDist.
- api/chat.ts: system prompt has explicit "IF ANY TOOL RETURNS AN ERROR: say unavailable only".
  MODEL_DETECT = MODEL_ANSWER = claude-haiku-4-5-20251001. ORBITAL_FETCH_TIMEOUT_MS=5000.
- satellites.py: SpaceTrack query = OBJECT_TYPE/PAYLOAD, limit/10000. CACHE_TTL_SECONDS=1800.

KNOWN ACCEPTED LIMITATION:
- Railway cold start: chatbot first question after ~5 min idle says "unavailable". UptimeRobot (session 14
  goal) fixes this by pinging /health every 5 min from outside the browser. Keepalive ping from Globe
  runs every 4 min while the tab is open and focused, but background tabs don't keep Railway warm.

ARCHITECTURE RULE — ENFORCE STRICTLY:
Claude is the presenter, never the calculator. Every value shown to the user must come from a
backend tool result or pre-computed server-side value. Never compute, infer, or guess any data
value (time, position, altitude, pass windows). If a tool errors, say "unavailable" and nothing else.

SESSION 14 GOALS (priority order):
1. README local dev setup: README.md "Local development" section is still a placeholder. Write
   step-by-step instructions for running the app locally — npm commands, Python venv + pip install,
   env vars needed (.env.example already exists in apps/orbital/). Anyone cloning the repo should
   be able to run it with no prior context. This is a hard blocker before the repo goes public.
2. README honest split: current README claims Postgres/AWS/Terraform/Sentry as the stack.
   None are built yet. Split the tech stack table into "What's running now" vs "Planned
   infrastructure". Remove the false claims from the current section; move them to a clearly
   labelled planned section. Also update satellite count (~10k → ~9k active satellites).
3. FastAPI /docs: FastAPI serves Swagger UI at /docs by default. Verify it's accessible on
   the Railway deployment (should be at the Railway URL + /docs). Add it to the README as
   a live API explorer link. This is free, zero-code — just verify and document.
4. General pass predictor: /passes/{norad_id} endpoint in Python (not just ISS). The current
   /predict-passes endpoint is hardcoded to ISS TLE. New endpoint: accept norad_id path param,
   look up the satellite TLE from the catalog, run the same skyfield pass prediction logic,
   return same schema. New agent tool: predict_passes(norad_id, latitude, longitude, hours_ahead).
   System prompt update to describe the new tool. Tests required.
5. Text search on globe: type a satellite name in a search box → matching dot highlights on globe.
   UI-only (no backend). Input field in the floating overlay or as a new top bar. Filter the
   activeCategoryMask in real time against satellite names. Clear on empty input.
6. UptimeRobot: sign up at uptimerobot.com (free), add an HTTP monitor for the Railway /health
   endpoint, set interval to 5 minutes. Zero code — external service keeps Railway warm so the
   chatbot responds on first question. Document the setup URL in the README.

WHAT STILL NEEDS DOING BEYOND SESSION 14 (per roadmap-v1-to-aws.md):
- Session 15: PostgreSQL on Railway (real schema: subscribers table + pgvector extension),
  alert subscription feature (POST /subscribe, email via SendGrid), subscribe form in UI.
- Session 16: AWS migration — ECS Fargate, RDS, ECR push in CI, ALB.
- Session 17: Terraform + Sentry.
```
