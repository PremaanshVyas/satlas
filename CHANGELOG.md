# Aussie Sky — Engineering Changelog

A record of significant problems encountered during development, how they were diagnosed, and what actually fixed them. Written for two audiences: reviewers who want to understand the depth of engineering involved, and future contributors who need to understand why the code is shaped the way it is.

---

## [Session 7c] — Globe not flying to satellite after agent response (2026-05-13)

### Problem
The agent would respond with correct satellite info (altitude, position, etc.) but the globe camera never flew to the satellite's location.

### Root Cause
The second Claude call (answer-streaming turn) had `tools: TOOLS` included. Haiku, seeing the tools available, chose to call `highlight_on_globe` as a tool call in the streaming turn instead of generating text. The streaming loop only listens for `content_block_delta` events with `text_delta` type — any `tool_use` blocks are silently dropped. `pendingHighlight` was never set (because `highlight_on_globe` wasn't called in the first turn), so no `__HIGHLIGHT__` directive was ever emitted.

The system prompt also said "after calling this, also call highlight_on_globe" — the word "after" implied waiting for `get_satellite_info` to return first, which is turn 2 behaviour. But turn 2 is the text-streaming turn where tool calls are dropped.

### Fix
1. **Removed `tools` from the second streaming call** — forcing haiku to produce only text in the answer turn, eliminating the possibility of silent tool call drops.
2. **Updated system prompt** to say "IN THE SAME TURN (in parallel)" making it explicit that `highlight_on_globe` must be called in turn 1 alongside `get_satellite_info`, not after.
3. **Increased first-turn `max_tokens` 512 → 1024** to give haiku enough room to emit both tool calls in a single response.

### Lesson
When a streaming Claude call has `tools` in the request, the model may call tools instead of streaming text — and the stop reason will be `tool_use`, not `end_turn`. Always remove `tools` from any turn that must produce text output. If you need side-effect tools (like `highlight_on_globe`) that don't feed back into the model, call them all in the non-streaming detection turn, then stream with tools disabled.

---

## [Session 7b] — Chatbot "No response" failures under Vercel 10s timeout (2026-05-13)

### Problem
The AI chat panel would frequently display "No response — please try again" even for simple, non-tool queries like "where is the ISS right now?". The failure was intermittent: sometimes the same question returned a full answer, sometimes an empty stream.

### Root Cause
Two compounding issues:

1. **Vercel Hobby plan hard 10s timeout.** `export const config = { maxDuration: 60 }` is silently ignored on the Hobby tier — the limit is always 10 seconds. The previous handler used `claude-sonnet-4-6` for the first (non-streaming, tool-detection) turn, which takes 3–5 seconds. On top of that, the Railway orbital service can take 2–8 seconds when recovering from sleep. The two added up past 10s, producing an empty HTTP response body which the frontend interpreted as a no-answer stream.

2. **Railway free-tier cold starts.** Railway sleeps containers after ~5 minutes of inactivity. Cold start is 20–30 seconds — far past the Vercel timeout. Even tool-free queries paid this cost because the frontend didn't keep the backend warm.

### Fix
Split the Claude model selection into two constants:
```typescript
const MODEL_DETECT = 'claude-haiku-4-5-20251001'  // tool-detection turn: ~1s
const MODEL_ANSWER  = 'claude-sonnet-4-6'          // streaming answer: full quality
```
First call (non-streaming, decides which tools to call) now uses Haiku — ~1s vs ~4s. Second streaming call keeps Sonnet for answer quality. Orbital fetch timeout tightened from 8s to 5s so Railway cold-start errors surface quickly rather than consuming the entire budget.

`Globe.ts` now pings `/health` immediately on mount and every 4 minutes via `setInterval`, preventing Railway from sleeping during an active session.

### Lesson
Vercel Hobby `maxDuration` is a no-op. Budget for the total latency across all turns: tool-detection + tool execution + streaming answer must fit inside 10s including network round trips. Use the fastest model capable of the task for each turn independently — tool detection is a routing decision, not a reasoning task, so a small fast model is the right choice.

---

## [Session 7] — Coordinate system bug displacing all satellites by ~90° longitude (2026-05-13)

### Problem
Every satellite in the catalog was displayed at the wrong continent. The ISS, when actually over East Africa at lon=20°E, would appear over South America at approximately 110°W. Users comparing with heavens-above.com or N2YO saw a systematic error of roughly one ocean-width.

### Root Cause
`THREE.SphereGeometry` UV mapping places the prime meridian (lon=0°) at the **+X direction** in world space (u=0.5 → phi=π → x=+radius, z=0). The propagation formula in both `propagator.worker.ts` and `SatelliteMesh.ts` used:
```
x = -r·cos(lat)·sin(lon)
z =  r·cos(lat)·cos(lon)
```
This places lon=0° at **+Z** (u=0.25 on the texture → longitude=−90°W). Every satellite was shifted by approximately −90° in longitude — the width of an ocean.

The solar direction formula in `solar.ts` had the same systematic error (mapping prime meridian to +Z instead of +X), so the day/night terminator was also 90° off. Since both errors were identical, satellites appeared in the correct day/night zones relative to each other — the internal coherence masked the geographic error.

### Fix
Changed both formulas to the correct Three.js+equirectangular convention:
```
x =  r·cos(lat)·cos(lon)   // prime meridian → +X
y =  r·sin(lat)             // north pole → +Y  
z = -r·cos(lat)·sin(lon)   // 90°E → −Z
```
Solar direction: `new THREE.Vector3(-yECEF, zECEF, xECEF)` → `new THREE.Vector3(xECEF, zECEF, -yECEF)`.

### Lesson
Three.js `SphereGeometry` and standard "spherical coordinates" use different conventions. The common mistake is using the math-textbook formula without accounting for how Three.js UV maps to world space. Always verify: lon=0°, lat=0° must produce the +X axis; 90°E must produce −Z. Write coordinate tests before writing rendering code.

---

## [Session 2] — Vercel Edge Runtime incompatible with Anthropic SDK (2026-05-11)

### Problem
After deploying the AI agent endpoint (`api/chat.ts`) to Vercel, every request returned a 500 error. Locally it worked fine.

### Root Cause
The Vercel function was configured with `export const config = { runtime: 'edge' }`, which runs the function in Cloudflare Workers-style V8 isolates. The Anthropic Node.js SDK internally references `node:fs` and `node:path` — Node built-ins that don't exist in the Edge runtime. The function crashed at import time, before handling any request.

### What We Tried
Adding polyfills for the missing modules. This failed because the imports were deep inside the SDK bundle and the edge runtime sandbox rejects them at a lower level.

### Fix
Removed the Edge runtime config entirely. Vercel's default runtime is Node.js, which the Anthropic SDK supports without modification. The function became a standard Node.js serverless function using `VercelRequest`/`VercelResponse` from `@vercel/node`, reading the body via `req.body` (Vercel pre-parses JSON) and streaming output with `res.write()` / `res.end()`.

### Lesson
Serverless "edge" runtimes are not Node.js. When a library does anything beyond pure computation — file I/O, native modules, Node-specific APIs — it will not work in edge runtimes. Check runtime compatibility before committing to a deployment target.

---

## [Session 4] — VITE_ORBITAL_SERVICE_URL build-time variable not baking in (2026-05-12)

### Problem
After deploying the live TLE catalog feature, the frontend Globe component couldn't reach the Railway orbital service. `fetchSatelliteCatalog` was hitting `undefined` instead of the Railway URL. The env var was set in Vercel's dashboard.

### Root Cause
Vite treats environment variables differently from Next.js. Variables prefixed with `VITE_` are substituted at **build time** — they are literally inlined into the JavaScript bundle during `vite build`. They are not read at runtime from `process.env`. Setting them in the Vercel dashboard after a build has no effect until the project is rebuilt. The build had run before the env var was added, so the bundle contained `undefined`.

### What We Tried
Checking that the env var name was correct (it was). Checking that the Railway service was reachable (it was). Triggering a regular redeploy without clearing build cache — this reused the old bundle and the problem persisted.

### Fix
Added `VITE_ORBITAL_SERVICE_URL` to Vercel's dashboard, then triggered a fresh deploy with build cache cleared. The new build inlined the correct URL into the bundle.

### Lesson
Vite build-time env vars (`VITE_*`) must be present **before** the build runs. They are not runtime configuration. Always add them to the deployment environment before the first build, and redeploy from scratch (not from cache) if they change.

---

## [Session 4/6] — CelesTrak GROUP=active blocked on Railway cloud IPs (2026-05-12 → 2026-05-13)

### Problem
The orbital service successfully returned satellite data from a residential machine during development. After deploying to Railway, every request to `GET /satellites` returned an empty catalog or an error. Users saw the globe with no satellites.

### Root Cause
CelesTrak actively rate-limits and blocks requests originating from cloud provider IP ranges (AWS, GCP, Railway's infrastructure). The block is at the IP level — not detectable by response headers. `GET https://celestrak.org/NORAD/elements/gp.php?GROUP=active` returned HTTP 403 from Railway's servers while returning 200 from a residential connection.

A previous attempt to add a `User-Agent` header fixed a different CelesTrak block (their bot detection), but had no effect on the IP-range block.

### What We Tried
1. Added `User-Agent: aussie-sky/1.0` header — fixed bot detection 403, but not the IP-range block.
2. Switched to space-track.org as the primary data source — worked, but introduced credential management and strict orbital filters that caused a different bug (see next entry).
3. Switched back to CelesTrak as primary with space-track fallback — 403 still fires from Railway, so fallback always activates.

### Fix
Two-part fix: (1) Keep CelesTrak GROUP=active as primary so residential/dev environments work without credentials. (2) Use space-track.org as fallback for cloud deployments. (3) Add a dedicated `_fetch_iss_tle()` that hits `CATNR=25544&FORMAT=TLE` — a single-satellite endpoint that is NOT IP-blocked on Railway, used to guarantee the ISS is always in the catalog regardless of which bulk source is active.

### Lesson
Cloud provider IP ranges are commonly blocked by public data sources that want to prevent bulk scraping. Design data pipelines with a fallback source from the start, and test the fallback path explicitly from a cloud IP (not just locally).

---

## [Session 6] — Space-track orbital filters excluding ISS from catalog (2026-05-13)

### Problem
After switching to space-track.org as the fallback source, `/tle/iss` returned 404 ("ISS not found in catalog") even though space-track had ISS data. Users asking "show me where the ISS is" got no globe highlight.

### Root Cause
The space-track query included `MEAN_MOTION > 11.25` and `ECCENTRICITY < 0.25` — intended to filter for circular LEO orbits. The query also used `orderby/NORAD_CAT_ID` with `limit/1000`. At certain orbital epochs, the ISS's mean motion or eccentricity values sit right at the filter boundary and it gets excluded. The filter was a premature optimization: it was trying to exclude GEO and highly elliptical satellites, but orbital parameters vary continuously and a static filter is unreliable for specific satellites.

### What We Tried
Widening the MEAN_MOTION threshold. This helped intermittently but the ISS still dropped out at some epochs.

### Fix
Removed the orbital parameter filters entirely from the space-track URL. The query now fetches 1000 satellites by NORAD_CAT_ID ordering with only an EPOCH freshness filter (`EPOCH > now-30`). ISS (NORAD 25544) has a mid-range ID and reliably appears in the result. Added the `_fetch_iss_tle()` CATNR fallback as a belt-and-suspenders guarantee.

### Lesson
Never use continuously-varying orbital parameters as hard inclusion/exclusion filters for specific satellites you need to guarantee. Fetch named satellites directly by NORAD ID.

---

## [Session 6] — CelesTrak CATNR endpoint returns GP elements, not TLE lines (2026-05-13)

### Problem
The `_fetch_iss_tle()` function was written to call `CATNR=25544&FORMAT=json` and read `TLE_LINE1`/`TLE_LINE2` from the JSON response. In production, `_fetch_iss_tle()` silently raised a `KeyError` and the ISS was never added to the catalog. The ISS guarantee logic appeared to work (no exception propagated) but was doing nothing.

### Root Cause
CelesTrak's `FORMAT=json` endpoint returns **GP (General Perturbations) orbital elements**: `MEAN_MOTION`, `ECCENTRICITY`, `INCLINATION`, etc. It does **not** include `TLE_LINE1` or `TLE_LINE2`. The GP format is the underlying mathematical representation; TLE is a serialised encoding of those elements. They are related but different formats. The code assumed JSON would contain TLE lines because the bulk `GROUP=active` JSON response does include them — but that endpoint uses a different schema.

The `KeyError` was caught by the outer `except Exception: pass` in `get_satellites()`, which silently skipped the ISS merge.

### What We Tried
Checked response headers — the content-type was `application/json`, which looked correct. Checked that the URL was reachable from Railway — it was (200 response). The bug was invisible until we logged the actual response body.

### Fix
Changed the CATNR endpoint to `FORMAT=TLE` which returns the classic three-line TLE plain text:
```
ISS (ZARYA)
1 25544U 98067A   ...
2 25544  51.6412  ...
```
Rewrote `_fetch_iss_tle()` to parse `resp.text` by splitting on newlines, extracting the name from line 0, TLE lines from lines 1–2, and the NORAD ID from bytes 2–7 of the first TLE line (standard TLE field position).

### Lesson
Silent `except: pass` blocks hide bugs. The `KeyError` should have propagated or at least been logged. When writing best-effort fallbacks, distinguish between "expected failure" (network error, timeout) and "unexpected failure" (data shape mismatch) — only swallow the former.

---

## [Session 6] — ISS globe position two years stale (2026-05-13)

### Problem
The ISS rendered on the 3D globe was showing the correct general orbit but its position was hundreds of kilometres off compared to real tracking sites like heavens-above.com. Users noticing the discrepancy would lose confidence in the tool.

### Root Cause
`Globe.ts` initialised `SatelliteMesh` with a hardcoded TLE from March 2024 — baked into the source code from the initial ISS prototype. The live TLE catalog was fetched and used for the 1000-satellite `InstancedMesh` field, but the dedicated ISS `SatelliteMesh` was never updated to use the live data. SGP4 propagation error grows with TLE age: a TLE that is 14 months old can produce position errors of hundreds of kilometres.

### What We Tried
Considered fetching the ISS TLE separately from `/tle/iss` before mounting the globe. This would require an extra HTTP round-trip and a more complex mount sequence.

### Fix
`Globe.initCatalog()` already fetches the full satellite catalog. Added a `SatelliteMesh.updateTle(tle1, tle2)` method that reinitialises the internal SGP4 `SatRec` object. In `initCatalog`, before filtering the ISS out of the `others` array, find it by NORAD ID and call `updateTle`. The hardcoded TLE is only used for the ~1–2 seconds before the catalog loads. `lastArcDate` is reset to `new Date(0)` so the orbit arc is recomputed from the live TLE on the next render tick.

### Lesson
Hardcoded TLEs in source code will always drift. Any satellite position that needs to be "correct" must come from the live catalog. Treat hardcoded TLEs as a loading placeholder only, never as a persistent data source.

---

## [Session 5] — Conversation history not persisting between messages (2026-05-13)

### Problem
Every message to the AI agent was answered as if it were the first message in the conversation. Follow-up questions like "what about from Sydney?" after "when does the ISS pass over Melbourne?" produced generic responses because Claude had no context from the previous turn.

### Root Cause
`useChat.ts` sent only `{ message: content }` to `/api/chat`. The backend built the Anthropic `messages` array from just the single new user message. Each request was a fresh single-turn conversation. The chat UI showed message history, but it was purely visual — no history was sent to the model.

### What We Tried
Nothing had been tried — the feature was never implemented. The bug was discovered during manual testing when a user tried a natural follow-up question.

### Fix
Frontend: `useChat.sendMessage` snapshots the message history (excluding any still-streaming message) before adding the new user message, then sends `{ message, history }` to the API. Backend: `handler` maps the `history` array into `Anthropic.MessageParam[]`, stripping `__HIGHLIGHT__` directives from assistant entries (Claude doesn't need to see them), and prepends them before the new user turn. `useCallback` keeps `messages` in its dependency array so the closure always captures the latest state — removing it would mean the history snapshot is always empty.

### Lesson
Multi-turn conversation requires the full message history to be sent on every request. Stateless serverless functions have no memory between invocations. The client must be the source of truth for conversation state and must transmit it explicitly with each request.

---
