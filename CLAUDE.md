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

**Current phase:** Session 41 complete (+ post-session hotfixes). Frontend/UX polish done. V2 direction decision pending.

**Next milestone:** Session 42 = V2 direction decision: (A) alert subscriptions, (B) conjunction analysis, (C) vision pipeline / bushfire scars, (D) vector RAG over space docs. (C) is the strongest portfolio differentiator; (A) is quickest to ship.

**Session 41 completed tasks (frontend/UX polish):**
- [x] `Globe.ts` — adaptive `FIELD_TICK_MS`: at timeScale>1 ticks at up to 60Hz so fast-forward/reverse is smooth instead of jittery; `TOUCH_MIN_RADIUS_PX` raised 18→24 for better mobile satellite tap targets
- [x] `TimeControls.tsx` — fixed button overflow: removed `w-56`/`overflow-hidden`, switched `Btn` from `flex-1 min-w-0` to `flex-none min-w-[28px] px-1.5 text-center`; arrows no longer clip outside their boxes
- [x] `MobileControlsSheet.tsx` — same overflow fix; buttons now `flex-none min-w-[36px] flex-wrap`; `active:scale-[0.96]` on all interactive buttons
- [x] `App.tsx` — desktop panel column moved from `top-10 mt-2` → `top-[76px]` to stop overlapping the TimeControls widget; `sonner` Toaster added; catalog-load toast fires once on first catalog count; `MessageCircle` from lucide-react replaces inline SVG
- [x] `GlobeView.tsx` — loading state replaced with animated SVG spinner + pulse dot; hover tooltip wrapped in framer-motion `AnimatePresence` for smooth fade; toggle buttons use `lucide-react` (Cloud, Layers, LayoutGrid); `active:scale-[0.97]` on all toggle/pill buttons; mobile search bar `w-36`→`w-44`
- [x] `AgentPanel.tsx` — suggested prompts shown on empty state (4 clickable chips); `timestamp` field shown as HH:MM under each bubble; character counter appears when input >80% of 200-char limit; `X`/`Send` from lucide-react replace inline SVGs
- [x] `SatInfoCard.tsx` — orbit type badge (LEO/MEO/GEO/HEO/SSO) computed from inclination + altitude, shown next to NORAD badge; `active:scale-[0.98]` on action buttons
- [x] `SearchBar.tsx` — dropdown animated with framer-motion enter; "No satellites found" empty state with icon + hint text instead of silent collapse; `Search`/`X` from lucide-react; `focus-within` border highlight on input wrapper
- [x] `types/chat.ts` + `useChat.ts` — `timestamp: number` added to `ChatMessage`; set on user and assistant messages at creation time
- [x] `CountryPanel.tsx` — `active:scale-[0.98]` + `touch-manipulation` on all buttons
- [x] `lucide-react` and `sonner` installed as dependencies

**Session 40 completed tasks (security hardening):**
- [x] Rate limiting added to all public API endpoints (`/api/overhead`, `/api/pass`, `/api/satellites`, `/api/satellite-info`) — 60 req/min/IP in-process, same pattern as `/api/chat`
- [x] Chat history capped at 20 messages × 500 chars each to prevent token budget exhaustion
- [x] Query length cap (200 chars) on `api/satellites.ts` `q` param and `api/satellite-info.ts` `query` param
- [x] `api/pass.ts` input validation: lat/lon range check, hours_ahead clamped 1–168, norad_id validated as ≤6-digit numeric
- [x] Error messages sanitized across all API endpoints — internal error strings no longer leak to callers
- [x] XSS: `AgentPanel.tsx` anchor href sanitized — non-http/https schemes render as plain text, not clickable links
- [x] Security headers added to `vercel.json`: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [x] Stale `CATALOG_BASE` fallback (`getsatlas.vercel.app`) fixed in `api/overhead.ts` and `api/satellites.ts`

**Sessions 1–20 (complete, stable):** See `docs/decisions-archive.md` (all ADRs through S30). Key phases: globe + ISS (S1-5), AI agent + tools (S6-10), CI/CD + search (S11-15), AWS infra (S16-19), PassPanel + satcat fix (S20).

**Session 39 completed tasks (V1 cleanup):**
- [x] NORAD integer comparison fixed in `api/satellite-info.ts` and `api/pass.ts` (string equality missed leading-zero IDs; same bug fixed in `api/chat.ts` in S37 but missed in the two public API files)
- [x] Dead props `onSimulatedTime`/`onTimeReady` removed from `GlobeView` interface and effects
- [x] `CATALOG_BASE` fallback updated from `getsatlas.vercel.app` → `satlas.app` in `api/chat.ts` and `api/pass.ts`
- [x] Session bootstrap docs S10–S38 removed; replaced with `docs/v1-synopsis.md` compressed history
- [x] `docs/superpowers/` plans and specs directories removed (historical, no longer needed)
- [x] `.superpowers/brainstorm/` artifacts and `.DS_Store` files removed
- [x] README test count updated (126 → 166); dead `docs/architecture.md` reference removed
- [x] CHANGELOG session 38 entry added; CLAUDE.md docs map updated

**Session 38 completed tasks (search overhaul):**
- [x] `matchSatelliteQuery` hardened — token AND-logic (all tokens must match), delimiter normalization (strip spaces/hyphens/parens/dots/slashes on both sides), leading-zero NORAD prefix comparison; 166 tests passing
- [x] ISS search bug fixed — `Globe.searchCatalog` checked ISS with raw `includes(q)` bypassing all token logic; extracted `matchesSatellite()` from `searchUtils.ts` so ISS uses the same code path as the main catalog
- [x] `satelliteNames.ts` — `DISPLAY_NAMES` (HST → Hubble Space Telescope, JWST → James Webb Space Telescope); `getDisplayName()` applied at every render site (search dropdown, info card, hover tooltip, pass panel, country panel, satellite tray, chat prefill)
- [x] Partial-typing aliases — `NORMALIZED_ALIASES` with token-level prefix matching replaces regex `PHRASE_ALIASES`; "hubbl" finds HST, "jam"/"james w" finds JWST, "tiango" finds Tiangong; joined-token path handles mid-phrase multi-word typing ("hubble sp")
- [x] Slash normalization + category aliases — "/" added to normalize; "rb" finds R/B rocket bodies; "debris"/"debri" finds DEB entries; "rocket body"/"rocket" finds R/B entries

**Session 37 completed tasks:**
- [x] Mobile touch hit-test fix — `TOUCH_MIN_RADIUS_PX = 18`; `_lastInputWasTouch` flag; nearest-screen-distance selection on touch; desktop path unchanged
- [x] `MobileControlsSheet.tsx` — vaul `Drawer` behind `sm:hidden` hamburger; UTC clock, time transport, layer toggles, category pills; 13 tests
- [x] `GlobeView.tsx` integration — desktop controls wrapped `hidden sm:block`/`hidden sm:flex`; mobile sheet alongside

**Session 36 completed tasks:**
- [x] Zoom-aware orbit controls — `rotateSpeed = 0.15 + sqrt(t)*0.35` (close→far), `zoomSpeed = 0.50 + t*0.50`; updated per-frame in `tick()` based on camera distance; fixes mobile scroll sensitivity
- [x] Dynamic dot scaling — attempted and reverted; dense LEO constellation fills Earth at far zoom; scroll speed fix via OrbitControls is sufficient
- [x] Gaussian glow — added and reverted in same session; flat uniform disc looks cleaner and avoids blur at far zoom
- [x] Time controls merged into top-left UTC clock card — `TimeControls` accepts `clock?: string` prop; single widget replaces separate clock + speed bar; no overlap with other UI elements
- [x] Satellite dot shader — flat `fwidth`-AA disc (gaussian glow reverted); uniform alpha across the entire circle
- [x] Hit-test depth — replaced Euclidean `√(dx²+dy²+dz²)` with camera-space z-depth `-(me[2]*x+me[6]*y+me[10]*z+me[14])`; Euclidean > z-depth for off-centre satellites → hit radius was smaller than visual dot
- [x] Hit-test scale — `satScales[i]` factored into `dotRadiusPx`; GPS/GEO/MEO satellites render at 1.5× but hit radius was using bare `SPHERE_RADIUS` → hover only registered in inner 67% of those dots

**Session 35 completed tasks:**
- [x] Time controls engine — `Globe.ts` simulated time accumulator (`_simTimeMs`, `_timeScale`); dt capped at 200ms; `lastFieldTickMs` uses real time so worker rate-limiting survives speed/direction changes; reset to 0 in `setTimeScale()` so satellites respond on the very next frame; `onSimulatedTime` callback fires once per simulated second
- [x] `useGlobe` — exposes `simulatedTime`, `timeScale`, `setTimeScale`; callback ref pattern bubbles `setTimeScale` up to App.tsx
- [x] `TimeControls.tsx` — compact transport card: 4 reverse + ⏸ + LIVE + 4 forward; toggle-to-pause on the active speed button; speed badge only (date row removed — redundant with UTC clock)
- [x] `GlobeView.tsx` — `timeScale` destructured; speed badge (⏸ or Nx►/◄Nx) shown inline with UTC clock when not at 1×
- [x] `App.tsx` — wires `setTimeScale` callback ref; renders TimeControls in the bottom-left cluster (desktop only); `simulatedTime` state removed
- [x] `App.test.tsx` — stable `Date` reference captured in outer mock factory closure to prevent infinite render loop
- [x] `api/chat.ts` — `get_satellite_info` tool now computes in-process via `fetchTle()` + satellite.js; ECS orbital service no longer on the critical path; `ORBITAL_SERVICE_URL` constant removed
- [x] `api/satellite-info.ts` — rewritten to compute locally from CloudFront TLEs; same response shape as the old ECS proxy

**Sessions 31–34 (complete, stable):** Pass visibility scoring + shadow model (S34); billboard shader + fwidth AA + cyan dot colour (S33); Vercel Analytics/Speed Insights, API docs redesign, public overhead/satellites endpoints (S31); catalog error state, uBlock /api/tles alias (S32). See `docs/decisions-archive.md` and session bootstrap files for detail.

**Session 30 completed tasks:**
- [x] `CountryHighlightMesh` fill re-enabled: `subdivideRing` + `refineTris` in `sphereUtils.ts` — edges subdivided to ≤4° before earcut, large interior triangles recursively split
- [x] `CountryFillMesh` void fixed: same `subdivideRing` + `refineTris` applied via shared `sphereUtils.ts`
- [x] SLERP → flat lon/lat interpolation: SLERP midpoints bulge outward at high latitudes (Russia ~3-5° into Arctic), replaced with flat `[lon0 + (lon1-lon0)*t, lat0 + (lat1-lat0)*t]` in both `subdivideRing` and `refineTris`
- [x] MultiPolygon stacking fix: stencil buffer (`NotEqual/Replace`) prevents transparent fill fragments from accumulating additively across sub-polygons (Russia's islands no longer show bright overlap bands)
- [x] Deselect on panel close: `Globe.clearCountryHighlight()` wired through `useGlobe` → `GlobeView.onClearHighlightReady` → `App.tsx` `dismissCountry()` helper — closing CountryPanel now clears the globe highlight ring

**Sessions 21–29 (complete, stable):** Key phases: chat polish + overhead tool (S21–22), NORAD ID fix (S23), frontend redesign (S25–26), catalog scale + search fly-to (S27), country borders + CountryPanel (S28–29). All ADRs in `docs/decisions-archive.md`.

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

Sessions 1–36 decisions archived in `docs/decisions-archive.md`.

- **2026-05-13 — Architectural rule: Claude is the presenter, never the calculator.** Claude must not compute, infer, or guess any data value shown to the user — not time, not timezone offsets, not satellite positions, not pass windows. Every value must come from a backend tool result or a pre-computed server-side value. If data is missing, say unavailable. Violation that prompted this rule: passed UTC time and let Claude infer the Melbourne offset → got AEST/AEDT wrong. Fix pattern: compute it server-side, hand Claude the answer to format.

- **2026-05-13 — Globe camera highlight: never include tools in the streaming answer turn.** Second Claude call had `tools: TOOLS`. Haiku called `highlight_on_globe` in the streaming turn; the streaming loop only handles `text_delta` events, so the tool call was silently dropped. Fix: remove `tools` from the answer turn entirely. Rule: if the answer turn must produce text, pass no tools — force text output, not a tool call.

- **2026-05-13 — Chatbot reliability: haiku for tool-detection, Vercel Hobby 10s hard cap.** `maxDuration: 60` is silently ignored on Hobby tier — 10s is the real limit. Sonnet tool-detection consumed 3–5s. Fix: `claude-haiku-4-5-20251001` for the tool-detection turn (~1s), Sonnet for streaming answer. Rule: use the fastest model capable of the task; tool-detection is routing, not reasoning. Always budget total latency (detect + execute + stream) against the hard platform limit.



- **2026-05-25 — Session 32: `/api/catalog` matches uBlock Origin ad-tracker filter rules — use `/api/tles` for the frontend fetch.** Firefox users with uBlock enabled saw `NS_BINDING_ABORTED` at 0ms on the `/api/catalog` fetch — the request was killed before it hit the network. Root cause: the word "catalog" appears in uBlock's filter lists targeting product-catalog trackers. Fix: `vercel.json` rewrite routes `/api/tles` → `/api/catalog` at the Vercel edge layer; `celestrak.ts` fetches `/api/tles` by default. `/api/catalog` stays live for public API consumers. **Two failed attempts before the working fix:** (1) `api/tles.ts` with `export { default, config } from './catalog'` — re-export didn't surface `config` to Vercel bundler. (2) `api/tles.ts` with explicit `import catalogHandler from './catalog'` — Vercel serverless functions cannot import from sibling function files at runtime (500 error). Correct approach: `vercel.json` rewrite is processed at the edge router before any function code runs, so no import resolution is needed. Rule: to alias a Vercel serverless function URL, use a `vercel.json` rewrite — never import between files in `api/` as cross-function imports fail at runtime.

- **2026-05-27 — Session 38: `matchSatelliteQuery` overhaul — token AND-logic, delimiter normalization, leading-zero NORAD; ISS path bug fixed.** Previous implementation: raw `name.toLowerCase().includes(q)` — failed when query delimiters differed from catalog name (`"starlink 1001"` vs `"STARLINK-1001"`). Fix: normalize both sides (strip spaces, hyphens, parens, dots, slashes), split query into tokens, require ALL tokens present in normalized name (Google AND-logic). NORAD prefix: `stripLeadingZeros` on both sides so `"6707"` finds `"06707"`. Separate bug: `Globe.searchCatalog` checked ISS with the old raw `includes(q)` — ISS is filtered from `satNames` before `matchSatelliteQuery` runs, so it had its own stale code path. Fix: extracted `matchesSatellite(query, name, noradId)` from `searchUtils.ts`; `searchCatalog` calls it for ISS. Rule: every name-matching code path must use the same normalized token logic — parallel implementations diverge silently.

- **2026-05-27 — Session 38: PHRASE_ALIASES regex failed for partial typing — replaced with NORMALIZED_ALIASES token-level prefix matching.** Initial alias implementation used `PHRASE_ALIASES: [RegExp, string][]` with `\bhubble\b` applied before tokenization. Word boundary `\b` only fires on complete words — `"hubbl"` has no boundary after it so nothing triggered. Fix: `NORMALIZED_ALIASES: [string, string][]` with normalized keys. Per-token path: `key.startsWith(token)` — `"hubbl"` is a prefix of `"hubblespacetelescope"` → resolves to `"hst"`. Joined-token path: `normTokens.join('')` checked as a prefix of alias keys — handles mid-phrase typing (`"hubble sp"` → `"hubblesp"` → prefix of `"hubblespacetelescope"`). `satelliteNames.ts` is the single edit point for both display names and aliases. Rule: alias matching for live search must use prefix not word-boundary matching — the word is always incomplete until the user stops typing.

- **2026-05-27 — Session 39: NORAD string equality in public API endpoints never received S23/S37 integer comparison fix.** `api/satellite-info.ts` and `api/pass.ts` both had `r.noradId === query.trim()` for NORAD lookups. The S37 ADR documented the fix for `api/chat.ts` but the two public API files were missed. Satellites with NORAD IDs below 10,000 (leading zero in TLE catalog, e.g. `"06707"`) would silently 404 when queried as bare integers. Fix: `parseInt` both sides in both files, matching the pattern in `api/chat.ts`. Rule: any new NORAD lookup anywhere in the codebase must use integer comparison — grep for `noradId ===` before shipping.

- **2026-05-27 — Session 39: Dead props `onSimulatedTime`/`onTimeReady` on GlobeView interface.** Both props were defined in the interface, wired to refs, and fired in `useEffect` chains — but neither was ever passed from `App.tsx`. The effects ran on every `simulatedTime`/`setTimeScale` change and called `undefined?.()` — harmless but noisy. Removed both props and their associated refs/effects entirely. Rule: when a prop is added in an exploratory session but never connected from the parent, delete it in the same session — partial wiring creates dead paths that rot in silence.

- **2026-05-27 — Session 39: `CATALOG_BASE` fallback pointed to `getsatlas.vercel.app` in three API files.** `api/chat.ts`, `api/pass.ts` all defaulted `CATALOG_BASE` to `https://getsatlas.vercel.app` (the pre-domain Vercel URL). `satlas.app` has been the primary domain since Session 20. The old URL still resolves (same deployment) but is stale in source. Updated to `https://satlas.app`. Rule: update hardcoded fallback URLs when the primary domain changes — stale URLs in source are confusing and will break if the old deployment is ever decommissioned.

- **2026-05-27 — Session 38: "/" not stripped from normalize — "rb" missed rocket bodies; category aliases added for debris and rocket bodies.** `normalize()` stripped spaces, hyphens, parens, dots but not `/`. `normName("ATLAS V R/B")` = `"atlasvr/b"` — `"rb"` not in `"atlasvr/b"` → miss. Fix: add `"/"` to the normalize character class. `"debris"` ≠ `"deb"` (TLE uses abbreviation) and `"rocket body"` has no tokens in `"r/b"` catalog names. Fix: NORMALIZED_ALIASES entries `["debris","deb"]` and `["rocketbody","rb"]`; joined-token path handles `"rocket body"` → `"rocketbody"` → prefix match → `"rb"`. Rule: audit `normName` output against real catalog name formats when adding normalization — string intuition is often wrong about what the catalog contains.

- **2026-05-26 — Session 37: Mobile touch hit-test requires a minimum 18px radius and nearest-screen-distance selection.** A touch finger covers 40–60px on screen; the computed dot radius for a typical LEO satellite (~2–3px) was far below fingertip size. Two changes: (1) `Math.max(TOUCH_MIN_RADIUS_PX=18, dotRadiusPx)` makes any dot hittable with a finger. (2) For touch, selection picks the nearest satellite in screen-distance (not camera-space depth) so the dot closest to where the finger landed wins instead of the dot closest to the camera behind it. Desktop click path: unchanged — radius is unbounded from below, depth is the tiebreaker, drag threshold is 5px². Touch drag threshold raised to 12px² (finger jitter > mouse jitter). Detection: `_lastInputWasTouch` flag set in `touchstart` (passive listener), cleared in `mousedown` (which always precedes `click` on mouse devices). Rule: touch and mouse hit-testing need separate thresholds and selection strategies — a pixel-perfect radius that works for mouse is unusable for touch.

- **2026-05-26 — Session 37: `MobileControlsSheet` uses `sm:hidden` hamburger + vaul Drawer — same pattern as existing sheets.** Desktop controls (TimeControls, toggle cluster, category pills) were invisible on mobile due to `hidden sm:block` / `hidden sm:flex` wrappers. Mobile had no way to reach time speed, clouds, borders, or category filters. Fix: self-contained `MobileControlsSheet` component, `sm:hidden` hamburger in the top-left slot; vaul `Drawer` with all secondary controls. The hamburger sits alongside the (desktop-only) TimeControls wrapper — no z-index fighting. Desktop layout untouched. `SpeedBadge` reproduced inline (not exported from TimeControls) to avoid premature abstraction. Rule: when a desktop-only control cluster becomes inaccessible on mobile, a bottom sheet behind a hamburger is the right abstraction — it leaves the globe clean and surfaces all controls in one place.

- **2026-05-27 — Session 37 hotfix: `fetchTle` in `api/chat.ts` used string equality for NORAD IDs — same leading-zero bug as S23.** TLE format zero-pads NORAD IDs to 5 digits (`"06707"`). Haiku strips leading zeros when extracting a numeric ID from the "Ask AI" prefill (`"06707"` → `"6707"`). String equality missed these — `"06707" !== "6707"` → `not found` → "service unavailable" shown to user. Fix: `parseInt` both sides when the query is all digits, identical to the `satinfo.py` fix in S23. Only affects satellites with NORAD IDs below 10,000 (older objects, some debris). All satellites visible on the globe now resolve correctly in the AI agent. Rule: every NORAD ID lookup anywhere in the codebase must use integer comparison, never string equality.

- **2026-05-27 — Session 40: Four public API endpoints had no rate limiting.** `/api/chat` had 15 req/min/IP; `/api/overhead`, `/api/pass`, `/api/satellites`, `/api/satellite-info` had none. Each endpoint runs orbital mechanics or fetches external services — unbounded request rates are a DoS vector. Fix: in-process rate limiter (60 req/min/IP, same sliding-window pattern as `/api/chat`) added to all four files. No shared module — Vercel's function isolation model prohibits cross-api/ imports (S32 ADR). Rule: every endpoint that performs compute or external fetches needs rate limiting; copy the pattern rather than fighting function isolation.

- **2026-05-27 — Session 40: `api/chat.ts` history array was unbounded — no length or per-message size cap.** A caller could send 1,000 history messages each at 500 chars = 500,000 chars forwarded to the Claude API, exhausting token budget and compute per request. Fix: cap at 20 messages sliced from the tail, each message content capped at `MAX_MSG_LEN` (500 chars). Invalid role values filtered. Rule: any user-supplied array that is forwarded to an external API must have an explicit length and per-element size cap.

- **2026-05-27 — Session 40: Search query params had no length cap — unbounded string matched against 30k catalog entries.** `api/satellites.ts` `q` and `api/satellite-info.ts` `query` had no length validation. A 10,000-char query triggers O(n×m) substring search across the full 30k-entry catalog per request. Fix: 200-char cap with 400 response on violation. Rule: any user-supplied string used in a catalog search must be capped before the search loop.

- **2026-05-27 — Session 40: `api/pass.ts` forwarded raw query params to upstream ECS without validation.** `latitude`, `longitude`, `hours_ahead`, and `norad_id` were put into `URLSearchParams` and forwarded verbatim. Invalid values would hit the ECS service and return opaque 500s. `norad_id` had no format check — arbitrary strings reached the catalog search. Fix: parse lat/lon with `parseFloat` + range check (−90–90, −180–180); clamp `hours_ahead` to 1–168 via `parseInt`; validate `norad_id` against `/^\d{1,6}$/` before resolving. Parsed numerics replace raw strings in the forwarded params. Rule: validate and parse all query params before forwarding to any upstream service.

- **2026-05-27 — Session 40: Internal error messages leaked across all API endpoints.** Every `catch` block included the raw JS `err.message` in the JSON response body (e.g. `Catalog fetch failed: FetchError: ... ECONNREFUSED 10.0.0.5:5432`). This exposes internal service URLs, IP addresses, and error types. Fix: all API error responses now return a fixed generic string. Internal errors are still logged by Vercel's runtime. Rule: never include `err.message` in a JSON API response — return a fixed generic string and let the observability layer surface the detail.

- **2026-05-27 — Session 40: AI-generated Markdown links could carry non-http/https href schemes.** `AgentPanel.tsx` rendered `ReactMarkdown` output with a custom `a` component that passed `href` directly to the DOM. A prompt-injected response with `[text](javascript:alert(1))` would render as a clickable link that executes on click. Fix: check `href.startsWith('https://')` or `http://`; render non-matching hrefs as `<span>` (text only, no link). Rule: any AI-generated URL must be scheme-validated before being set as an href — Claude is trusted but prompt injection is a real attack surface.

- **2026-05-27 — Session 40: `vercel.json` had no security headers.** Frontend served without `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Content-Security-Policy`. Fix: added a `headers` block covering all routes. CSP sources derived from actual runtime requirements: Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), Vercel Analytics (`va.vercel-scripts.com`), Nominatim (`nominatim.openstreetmap.org`), CelesTrak (`celestrak.org`), CloudFront catalog (`dgsll6twimcwl.cloudfront.net`). `worker-src 'self'` covers the Vite-bundled `propagator.worker.ts`. `frame-ancestors 'none'` + `X-Frame-Options: DENY` redundantly protect older browsers. Rule: derive CSP sources from actual fetch/script/font callsites in the codebase — guessing causes breakage; auditing avoids it.

- **2026-05-27 — Session 41: `TimeControls` speed buttons were clipping — `flex-1 min-w-0` + `overflow-hidden` on a `w-56` container.** Ten `flex-1` buttons in a 224px container each got ~22px — not enough for "◄100" (4 monospace chars need ≥24px). The container's `overflow-hidden` then clipped the overflow, making arrows appear outside their borders. Fix: remove `w-56` and `overflow-hidden` from the outer container; change `Btn` from `flex-1 min-w-0` to `flex-none min-w-[28px] px-1.5 text-center`. Container auto-sizes to ~300px. Same pattern applied to `MobileControlsSheet.tsx` buttons. Rule: when transport buttons use `flex-1`, the container must be at least `n_buttons × min_char_width` wide — fixed width + overflow-hidden silently clips text.

- **2026-05-27 — Session 41: Satellite positions updated at fixed 50ms regardless of time scale — visible jitter at high speeds.** `FIELD_TICK_MS = 50` meant the propagator worker received position requests at 20Hz regardless of whether `_timeScale` was 1× or 100×. At 100× speed, 5 real seconds of satellite motion passed between worker ticks, causing discrete jumps visible against the 60fps render loop. Fix: `dynamicTickMs = _timeScale === 1 ? 50 : Math.max(16, floor(50 / min(|_timeScale|, 3)))` — at 2× → 25ms, at 10×+ → 16ms (~60Hz matching RAF). Rule: worker tick rate must scale with time scale or fast-forward will always appear jittery.

- **2026-05-27 — Session 41: SatInfoCard/PassPanel desktop column overlapped TimeControls.** `absolute top-10 left-3 mt-2` (y≈48px) started before the TimeControls widget (y≈12px, ~60px tall) finished. Fix: changed to `top-[76px]` on the left column container. Rule: when two `absolute`-positioned elements share the same `left` coordinate inside a full-screen container, compute the vertical clearance explicitly from the overlapping element's measured height.

- **2026-05-27 — Session 41: `AnimatePresence` exit animation kept dropdown in DOM — SearchBar test broke.** The `exit` prop on `motion.div` causes `AnimatePresence` to hold the element in the DOM until the exit animation completes. In JSDOM (tests), animations never run, so the element stayed mounted indefinitely. Test: `queryByText('ISS (ZARYA)').not.toBeInTheDocument()` failed. Fix: remove the `exit` prop — `AnimatePresence` then unmounts immediately on `open=false`. Enter animation still runs. Rule: only add an `exit` prop if the component will never be tested for DOM absence immediately after hide; otherwise use enter-only animation or mock framer-motion in tests.

- **2026-05-27 — Post-S41 hotfix: speed strip toggle-to-pause caused unexpected stops.** `handleSpeed` in both `TimeControls.tsx` and `MobileControlsSheet.tsx` called `onSetScale(0)` when the active speed button was clicked again. Users hitting the active button to confirm speed, or double-tapping on mobile, would silently pause the simulation. The ⏸ button is already present for explicit pausing. Fix: `handleSpeed` now always calls `onSetScale(scale)` — clicking an active button keeps the same speed. Tests updated to assert the new behaviour. Rule: toggle-to-pause on a speed button is a hidden trap; explicit controls should have explicit affordances.

- **2026-05-27 — Post-S41 hotfix: satellite positions lagged 2-3 seconds behind time-scale changes.** Root cause: the propagator worker processes ~30k satellites per tick synchronously (~100-200ms). When `dynamicTickMs` sent ticks every 16ms but the worker was busy for 200ms, ~12 tick messages queued up. The worker drained them in FIFO order with their original (stale) timestamps — so satellites showed positions from 2-3 seconds ago even though the Earth rotation (computed inline) was already at the new speed. Fix: added `workerBusy` flag. The tick gate changes from `realNow - lastFieldTickMs >= dynamicTickMs` to `!workerBusy && realNow - lastFieldTickMs >= dynamicTickMs`. Each tick sets `workerBusy = true`; the `onmessage` and `onerror` handlers clear it. `setTimeScale()` also clears it so a speed change immediately unblocks a fresh tick on the next frame. Result: at most one tick is ever in-flight; when the worker responds it always gets the current simulated timestamp, never a stale queued one. Rule: any worker that takes variable time to respond must be gated with a busy flag — without it, message queues silently accumulate stale work.

- **2026-05-27 — Post-S41 hotfix: toggle switch dot overflowed the pill container.** Dot was `w-3 h-3` (12px) in a `h-4` (16px) container with a 1px border. Inner usable height = 14px. `top-[2px] + 12px = 14px` — dot filled the entire inner height, touching the bottom border and visually leaking outside the rounded pill. Also, no `overflow-hidden` on the container meant the dot was not clipped to the pill shape. Fix: dot changed to `w-2.5 h-2.5` (10px); on-position shifted from `left-[12px]` to `left-[14px]` to keep 2px margin from each border; `overflow-hidden` added to the pill container so the dot is always clipped. Fixed in `GlobeView.tsx` (all three toggles) and `MobileControlsSheet.tsx`. Rule: toggle dot size should be `container_inner_height - 4px` (2px margin top and bottom); always add `overflow-hidden` to the pill so the dot can never escape the rounded boundary.

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
3. For the full session context prompt for the next session, see `docs/session-41-bootstrap.md`.

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
| `docs/v1-synopsis.md` | Compressed history of Sessions 1–38: what was built, key decisions, bugs fixed. |
| `docs/session-39-bootstrap.md` | Session 39 bootstrap — V1 cleanup complete, V2 direction pending. |
| `docs/session-40-bootstrap.md` | Session 40 bootstrap — security hardening. |
| `docs/session-41-bootstrap.md` | Session 41 bootstrap — frontend/UX polish. |
| `docs/decisions-archive.md` | Full ADR entries from Sessions 1–17. |
| `CHANGELOG.md` | Engineering change log — significant problems, diagnosis, and fixes per session. |
| `README.md` | Public-facing project overview. What it does, how to run it locally, deploy notes. |
