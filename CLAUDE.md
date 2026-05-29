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

**Current phase:** Session 44 (INCIDENT) — Space-Track suspension remediated and shipped. Traffic stopped (worker at `desired_count=0` + Vercel Space-Track creds pulled), reinstatement email sent, fix merged to `main` (PR #1), maintenance mode live. The Mycelium plugin was fully removed and `main` reset to the pre-plugin commit `daf1f74`. **Recovery (Step 3) is gated on Space-Track reinstatement — see `docs/session-45-bootstrap.md`.**

**Session 44 completed:**
- [x] `api/catalog.ts` — proxies CloudFront `catalog.tle`; never queries Space-Track (was pulling the full `gp` catalog per Vercel edge-cache miss, fanning out across PoPs)
- [x] `apps/orbital/satellites.py` — the single Space-Track client: S3 seed on boot, hourly `gp` delta at `:17` (`CREATION_DATE`), hard once/hour guard (`_next_gp_slot`/`GP_MIN_INTERVAL_SECONDS`), 30s retry storm removed, `satcat` once/day
- [x] `Maintenance.tsx` + `main.tsx` — `VITE_MAINTENANCE` gate on the `/` route only (keeps `/docs` reachable)
- [x] Mycelium removed: MCP server, `.mycelium/`, `api/_mycelium.ts`, CLAUDE.md protocol section; `main` reset to `daf1f74`
- [x] Ops (mickey): worker→0, Vercel creds removed, email sent, PR #1 merged, `VITE_MAINTENANCE=1` set
- [x] Tests: 103/103 orbital, 169/169 web, API typecheck clean

**Next milestone:** Session 45 (gated on Space-Track reply) — see `docs/session-45-bootstrap.md`. After reinstatement: scale worker to 1, confirm CloudFront `catalog.tle` repopulates (currently 1 byte — the suspended worker overwrote it), remove `VITE_MAINTENANCE`, redeploy. Then resume V2 = vision pipeline / bushfire scars.

**Session 42 (complete, stable) — post-S41 hotfixes:** removed toggle-to-pause from speed buttons; fixed toggle-dot overflow; `workerBusy` flag so sat positions update immediately on speed change; Toaster moved to bottom-left (z-index vs DevNotes); zero-duration passes filtered. Detail in the S42 hotfix ADRs below.

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

**Session 40 (complete, stable) — security hardening:** rate limiting on all public API endpoints (60 req/min/IP); chat history capped (20×500); query-length caps; `api/pass.ts` input validation; error-message sanitization; `AgentPanel.tsx` href scheme sanitization; `vercel.json` security headers; stale `CATALOG_BASE` fallbacks fixed. Detail in the eight S40 ADRs below.

**Sessions 1–20 (complete, stable):** See `docs/decisions-archive.md` (all ADRs through S30). Key phases: globe + ISS (S1-5), AI agent + tools (S6-10), CI/CD + search (S11-15), AWS infra (S16-19), PassPanel + satcat fix (S20).

**Session 39 (complete, stable) — V1 cleanup:** NORAD integer comparison fixed in `api/satellite-info.ts` + `api/pass.ts`; dead `onSimulatedTime`/`onTimeReady` props removed; `CATALOG_BASE` fallback → `satlas.app`; bootstrap docs compressed to `docs/v1-synopsis.md`; superpowers/brainstorm artifacts removed. Detail in the S39 ADRs below.

**Session 38 (complete, stable) — search overhaul:** `matchSatelliteQuery` hardened (token AND-logic, delimiter normalization, leading-zero NORAD); ISS search path unified via `matchesSatellite()`; `satelliteNames.ts` display names + `NORMALIZED_ALIASES` prefix matching; slash normalization + debris/rocket-body category aliases. Detail in the five S38 ADRs below and `docs/session-*-bootstrap.md`.

**Sessions 35–37 (complete, stable):** Time-controls engine + in-process `get_satellite_info` (S35); zoom-aware orbit controls, flat `fwidth`-AA dot shader, camera-space z-depth hit-test with `satScales` (S36); mobile touch hit-test + `MobileControlsSheet` vaul drawer (S37). Full task lists in `docs/session-*-bootstrap.md`; ADRs in `docs/decisions-archive.md`.

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

Sessions 1–36 decisions archived in `docs/decisions-archive.md` (the three 2026-05-13 ADRs — presenter-not-calculator, no-tools-in-answer-turn, haiku-for-tool-detection — were moved there to keep this file under budget).

- **2026-05-29 — Session 44 (INCIDENT): Space-Track account suspended for exceeding the gp-class once-per-hour limit. Two redundant clients fixed; single hourly client established.** Root cause: (1) `api/catalog.ts` logged into Space-Track and pulled the full `gp` catalog (`EPOCH/>now-90`, ~30k) on every Vercel edge-cache miss — distributed across global PoPs, traffic-driven (the frontend's `celestrak.ts:117` fires a background refresh on every page load and four `api/*.ts` functions also proxy `/api/catalog`), and `VITE_CATALOG_URL` was unset so the frontend defaulted to it; (2) `apps/orbital/satellites.py refresh_loop` retried `gp` every 30s on startup failure (restart/crash-loop storm) plus a 2h steady cycle. Fix: `api/catalog.ts` now proxies the CloudFront `catalog.tle` (zero Space-Track load); the ECS orbital worker is the single Space-Track client — it seeds from S3 on boot (no query on restart), bootstraps the full catalog only when S3 is empty, then issues at most one `gp` query per hour at minute `:17` using the `CREATION_DATE/>now-{days}` delta (window widened to cover any missed cycle) merged into cache by NORAD id; a hard `GP_MIN_INTERVAL_SECONDS=3600` guard in `_next_gp_slot` makes a second `gp` query within the hour structurally impossible even across restarts; `satcat` class dropped to once/day. Vercel no longer holds Space-Track creds (`.env.example` updated). Tests: 103/103 orbital, 169/169 web, API typecheck clean. Rule: exactly one process may ever touch a rate-limited upstream; every other reader goes through our own cache (S3/CloudFront). A per-edge/per-instance cache TTL is NOT a global rate limit — distributed cache misses fan out to the origin. Any retry/refresh loop against a rate-limited API must enforce the limit with a persistent interval guard, never a fixed short sleep.

- **2026-05-29 — Session 44: CloudFront `catalog.tle` was found empty (1 byte) — the suspended worker overwrote the good catalog with zero satellites.** While the account was suspended the old 2h `refresh_loop` kept running; each cycle the `gp` query returned no usable data, `_parse_tle_text` → `[]`, and `_s3_put([])` wrote a 1-byte file. So deploying the new proxy alone could not restore the globe — the cache itself was corrupt and can only be repopulated after reinstatement (or a manual CelesTrak seed; CelesTrak was unreachable from the dev sandbox). Added a `VITE_MAINTENANCE` gate (`Maintenance.tsx`) as the interim, shown while the cache has no valid data. Rule: a cache-refresh job must never overwrite a good cache with an empty/failed fetch — treat an empty parse as a failure and keep the prior copy.

- **2026-05-29 — Session 44: the maintenance gate first replaced the whole router — `/docs` also showed maintenance.** The initial `VITE_MAINTENANCE` gate rendered `<Maintenance/>` instead of the entire `<BrowserRouter>`, so every path (including `/docs`) showed the maintenance screen and the page's own "View API docs" link did nothing. Fix: gate only the `/` route (`element={MAINTENANCE ? <Maintenance/> : <App/>}`); the static API docs don't depend on the catalog and stay live. Rule: scope a maintenance gate to the routes that are actually broken, not the whole app.

- **2026-05-29 — Session 44: Mycelium plugin removed; `main` reset to `daf1f74` (force-push).** A Mycelium MCP plugin was being tested in this repo (config in the gitignored `.claude/settings.json`, a `.mycelium/` SQLite field, `api/_mycelium.ts`, and a CLAUDE.md "Pheromone Field Protocol" section). The user wanted it gone before merging the fix. Removed: local `.mycelium/` + MCP config; commit `8496455` (field DB) dropped by resetting `main` to `daf1f74`; `efb1892` (`api/_mycelium.ts`) dropped by deleting the local-only `mycelium-runtime-hits` branch; the CLAUDE.md protocol section deleted via PR #1. Resetting to `daf1f74` (the user's chosen target) also dropped two V2 vision-pipeline doc commits — intentional, recoverable from reflog. The Space-Track fix PR was rebased onto the clean `daf1f74` so it carries no Mycelium ancestor; `main` + the PR branch were force-pushed (solo repo, no branch protection). Rule: an experimental plugin tested in a portfolio repo should live on its own branch and config scope so it can be excised without rewriting unrelated history.



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

- **2026-05-27 — Post-S41 hotfix: Sonner toast covered DevNotes panel — both are now bottom-corner separated.** `<Toaster position="bottom-right">` placed the toast at the same screen area as the DevNotes panel (`right-20 w-72`) and "i" button (`right-4`). Sonner renders at `z-index: 2147483647`, so the toast covered the DevNotes panel for its full 3-second lifetime. Users saw the "i" button but not its expanded card, interpreted as the card being "minimized." After the toast dismissed the panel reappeared (open state never changed), but users had already concluded it was hidden. Fix: `position="bottom-left"` — toast appears in the bottom-left corner, DevNotes stays bottom-right, no spatial overlap. Rule: when adding a toast library, ensure its anchor corner is clear of existing permanent UI — pick a corner used by nothing else.

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
3. For the full session context prompt for the next session, see `docs/session-45-bootstrap.md`.

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
| `docs/session-NN-bootstrap.md` *(local-only, gitignored)* | Per-session handoff for the next session. Current: `session-45-bootstrap.md` — Space-Track reinstatement recovery checklist. Recovery essentials are also mirrored in Active scope above so nothing is lost on a fresh clone. |
| `docs/decisions-archive.md` | Full ADR entries from earlier sessions (Sessions 1–17 plus older entries moved here for budget). |
| `CHANGELOG.md` | Engineering change log — significant problems, diagnosis, and fixes per session. |
| `README.md` | Public-facing project overview. What it does, how to run it locally, deploy notes. |
