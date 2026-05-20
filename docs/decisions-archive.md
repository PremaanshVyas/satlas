# Satlas — Decisions Archive (Sessions 1–17)

These ADR-lite entries were migrated from CLAUDE.md to keep the main file under the 40k character limit.
Rules that are still active are summarised in the relevant sections below.

---

- **2026-05-10 — Project initialized.** Satlas concept (3D SSA + AI agent), monorepo, AWS. Alternatives rejected: pure Earth Observation (less visually striking), ML-only bushfire pipeline (narrower stack). Bushfire detection folded in as V2 vision-pipeline use case.

- **2026-05-10 — AI agent is the primary interface, not a side feature.** Every user query goes through Claude with tool use. Avoids the "AI bolted on" pattern that dominates current portfolio projects.

- **2026-05-10 — Defer Go gateway until V1.** Frontend talks directly to FastAPI for MVP. Add Go for production hardening later.

- **2026-05-11 — Three deploy fixes to `api/chat.ts`.** (1) Edge runtime incompatible with Anthropic SDK (references node:fs/node:path) — removed `runtime: 'edge'`, use Node default. (2) Root `package.json` missing `"type": "module"` — ES module imports failed. (3) Node runtime needs VercelRequest/VercelResponse (not Web Request API) — `req.json` not a function. Rule: Vercel Node runtime ≠ Edge runtime; check SDK compatibility before choosing runtime.

- **2026-05-12 — CelesTrak IP block → space-track.org fallback.** Railway's cloud IP range blocked by CelesTrak (403, IP-based, not header-based). space-track.org is the authoritative source (CelesTrak mirrors it), no IP restrictions, free account, session-cookie auth. `VITE_ORBITAL_SERVICE_URL` is a Vite build-time variable — set in Vercel env vars before build; cleared build cache required.

- **2026-05-12 — VITE build-time env vars must be present before the build runs.** `VITE_*` variables are literally inlined into the JS bundle at build time — not read at runtime. Adding them to Vercel dashboard after a build has no effect until a fresh build with cleared cache. Rule: add env vars to deployment environment before first build.

- **2026-05-13 — CelesTrak CATNR not blocked; GROUP=active blocked.** Single-satellite CATNR queries (e.g. `?CATNR=25544&FORMAT=TLE`) work from Railway. GROUP=active returns 403. Rule: always use CATNR for guaranteed single-satellite fetches; use GROUP=active for bulk (fallback to space-track if 403).

- **2026-05-13 — Session 6: CelesTrak as primary, space-track as fallback.** SpaceTrack query with `MEAN_MOTION > 11.25 & ECCENTRICITY < 0.25` excluded Hubble and intermittently ISS. Fix: CelesTrak GROUP=active + User-Agent header. ISS extracted from catalog and fed to SatelliteMesh.updateTle() so hardcoded TLE is replaced within seconds of app load.

- **2026-05-13 — ISS position accuracy: separate 5-min TLE cache.** `/tle/iss` was calling `get_satellites()` which served the 30-min catalog cache. ISS at 7.66 km/s × 1800 s = 13,788 km drift. Fix: separate `_iss_cache` with 5-min TTL, frontend refreshes every 2 min. Rule: never share cache TTL between real-time position data and bulk catalog.

- **2026-05-13 — Session 8: Earth texture upgrade.** NASA Blue Marble 8192×4096 JPEG + Black Marble 2012. Working paths: `/imagerecords/57000/57752/` (day) and `/imagerecords/79000/79765/` (night). Superseded in Session 17 by colour-graded Earth shader. Three.js: `anisotropy = maxAnisotropy`, `LinearMipmapLinearFilter`, `SRGBColorSpace`.

- **2026-05-14 — Stale cache fallback added to get_satellites().** When both CelesTrak and SpaceTrack fail, serve stale `_cache['tles']` rather than 503. Superseded: Railway is gone, catalog now comes from S3+CloudFront (ECS writes) or browser-direct CelesTrak.

- **2026-05-14 — Session 11: Group-highlight tool uses per-instance colour + white material trick.** Abandoned: per-instance colour via `setColorAt` broke after category filter toggles (VAO rebinding bug). See session 11 replacement with `set_category_filter` tool which is the current approach.

- **2026-05-14 — Session 11: SatelliteField group highlight — two failed attempts before the correct fix.** Attempt 1: `mesh.instanceColor = null` on clear + null→non-null during dirty instanceMatrix → unreliable WebGL state, highlight stopped applying. Attempt 2: permanently white material + blue instanceColor on clear → shader variant cache mismatch → invisible dots. Correct: pre-init instanceColor to WHITE in constructor, never toggle null/non-null. See current SatelliteField.ts for implementation.

- **2026-05-14 — Session 11: group-highlight replaced with agent-controlled category filter.** `set_category_filter(categories: string[])` updates `activeCategories` via the same code path as pill clicks. Agent-called path applies per-category dot colours (`applyAgentFilter`); manual toggle clears to blue. `shownCategories` sent to agent on every message for additive logic. See current Globe.ts.

- **2026-05-14 — Session 11: `get_category_counts` tool called Python backend.** Added `/satellite-categories` Python endpoint. Superseded in Session 17: counts are now computed client-side via `Globe.getAllCategoryCounts()` and injected into the system prompt — no backend tool call needed.

---

## Sessions 12–17

- **2026-05-14 — Session 12: CI/CD via GitHub Actions (4 jobs).** `web`: lint + `tsc -b && vite build` + vitest; `api-typecheck`: root `npx tsc --noEmit`; `orbital-test`: pytest on Python 3.11; `orbital-docker`: Dockerfile build. Build step preferred over tsc-only — catches Vite module resolution issues that tsc alone misses.

- **2026-05-14 — Session 12: ESLint errors fixed for CI.** `react-hooks/refs`: `onSatelliteClickRef.current` update moved to `useLayoutEffect`. `react-hooks/set-state-in-effect`: two correct patterns (prefill sync, agent filter sync) disabled with inline comments explaining why. Rule: when a lint rule flags a correct pattern, disable with a one-line comment rather than restructuring.

- **2026-05-14 — Session 12: CORS restricted to Vercel + localhost origins.** Changed `allow_origins=['*']` to explicit list. Rule: open CORS is an unnecessary attack surface once the domain is stable.

- **2026-05-14 — Session 12: CelesTrak direct browser fetch replaces server-side fetch as primary catalog source.** CelesTrak has CORS enabled and never blocks user IPs; only cloud IPs get 403 on `GROUP=active`. Browser fetches directly; server/cloud always uses Space-Track or the CloudFront CDN. Rule: for public CDN data that browsers can fetch directly with CORS enabled, always fetch in the browser.

- **2026-05-14 — Session 12: Propagator worker hardened at two levels.** (1) `twoline2satrec` in try-catch — returns `null` for bad TLEs, never throws. (2) Per-satellite try-catch in the tick handler so one bad satellite never aborts the whole forEach. Position guard tightened to `!posVel.position || typeof posVel.position !== 'object'`. Rule: propagation workers must be hardened at both TLE init and per-satellite propagation levels.

- **2026-05-14 — Session 12: Never cap catalog below what the frontend renders.** `satellites.py` had `LIMIT = 10000`; frontend showed ~15k. Any satellite in the difference returned 404. Fix: removed all `[:LIMIT]` slices. Rule: catalog source-of-truth and backend search scope must cover the same set.

- **2026-05-14 — Session 12: Hover/select colour + click hit-area.** Hovered/selected satellites turn lime green (`0x4ade80`) via `instanceColor`. Click short-circuits to `hoveredIdx` when set. Rule: use `hoveredIdx` as the click target when set; don't maintain separate inconsistent click thresholds.

- **2026-05-14 — Session 13: 25k satellite/debris problem traced to stale SpaceTrack cache.** Old `v2` localStorage cache held an unfiltered 25k snapshot. Fix: bump key to `v3`; restrict SpaceTrack fallback to `OBJECT_TYPE/PAYLOAD`. Rule: whenever catalog source or shape changes, bump the cache key.

- **2026-05-14 — Session 13: Soft catalog refresh eliminates satellite gap during refresh.** `initCatalog` skips mesh teardown when `|newCount - oldCount| <= 200` — re-inits the worker in place. Full rebuild only on first load or significant count change. Rule: never tear down an InstancedMesh on a background refresh.

- **2026-05-14 — Session 13: 72h stale-serve cache.** `SERVE_AGE_MS = 24h` (serve immediately), `MAX_CACHE_AGE_MS = 72h` (hard reject). Background refresh fires on every fetch. Rule: for orbital data, separate "when to refresh" from "when to block."

- **2026-05-14 — Session 13: Hover/click occlusion — hemisphere dot-product check.** Satellites on the far side of earth project to valid 2D screen coords. Fix: `if (satX*camX + satY*camY + satZ*camZ <= 0) continue` before `Vector3.project()`. Rule: always apply a hemisphere occlusion check before screen-space picking on a globe.

- **2026-05-14 — Session 13: Z-ordering — depth not screen distance determines winner.** Fix: `depth < bestDepth` among candidates within `dotRadiusPx + HOVER_EXTRA_PX`. Rule: in 3D picking, depth is the correct tiebreaker for overlapping 2D hits.

- **2026-05-14 — Session 13: System prompt hardened against training-data fallback on tool errors.** "IF ANY TOOL RETURNS AN ERROR OR TIMEOUT: respond with exactly 'The live data service is temporarily unavailable — please try again in a moment.' Do NOT use training knowledge." Rule: the presenter-only rule must cover the error case explicitly.

- **2026-05-14 — Satellite heights corrected: geo.height instead of hardcoded radius.** `propagator.worker.ts` used `r = 1.02`; `SatelliteMesh.ts` used `r = 1.06`. Fix: `r = (6371 + geo.height) / 6371`. Rule: never hardcode orbital radius — derive from propagated altitude.

- **2026-05-14 — Click-to-select: screen-space proximity picking, not geometry raycaster.** `THREE.Raycaster.intersectObject` on InstancedMesh requires clicking inside a ~3-4px sphere — too precise. Fix: project to screen, compute `dotRadiusPx` from depth and FOV, accept if `screenDist <= dotRadiusPx + 1px`. Prefill: `"Tell me about NORAD <id> (<name>)"` triggers exact Python match.

- **2026-05-14 — ISS click/hover returns wrong module — fixed by priority check.** ISS docked modules share the same orbital position. Fix: check ISS SatelliteMesh first in pick loop. Rule: when a special object shares a position with catalog entries, always check it first.

- **2026-05-14 — localStorage catalog cache: serve-age vs max-age separation.** `SERVE_AGE_MS = 24h` (always serve), `MAX_CACHE_AGE_MS = 72h` (hard reject). Bump cache key whenever source or format changes.

- **2026-05-14 — Session 10: Globe layout — full-screen with floating overlays.** Globe is `absolute inset-0`; AI panel is a 320px right-side overlay toggled by a floating chat button. Satellite info card decouples click-to-select from AI.

- **2026-05-14 — Session 10: Category filtering via Uint8Array mask, not worker re-init.** `rebuildCategoryMask()` produces a `Uint8Array` (`1`=active, `0`=hidden); hidden instances set to scale-0 matrix. Rule: prefer a visibility mask over re-init to keep the frame continuous.

- **2026-05-14 — Session 10: Ground track computed in Globe.ts using satellite.js (main thread).** 180-point arc takes ~2ms. Rule: a 2ms main-thread computation on user interaction is preferable to worker message round-trips.

- **2026-05-15 — Session 15: searchCatalog() checks ISS separately before catalog arrays.** Globe.initCatalog() strips ISS from catalog. Rule: every catalog-traversal method must check `this.issName / ISS_NORAD` first.

- **2026-05-15 — Session 15: selectCatalogSatellite() dispatches ISS via issSatrec, not showGroundTrack.** Rule: programmatic satellite selection must replicate the exact two-step click-handler flow without extra callback fires.

- **2026-05-16 — Catalog loading: /api/catalog Vercel function with Space-Track + edge caching.** `Cache-Control: public, s-maxage=7200` → sub-100ms globally after first hit. Browser races /api/catalog and CelesTrak direct via `Promise.any()` with 10s AbortSignal. Rule: race catalog sources in parallel rather than sequentially.

- **2026-05-16 — Space-Track 3LE format required; format/tle (2LE) breaks parseTleText.** `format/tle` returns 2-line elements (no name line) — count halves, names show as TLE data. Rule: always use `format/3le` with Space-Track's GP endpoint.

- **2026-05-16 — ISS orbital ring showed at wrong position because fallback TLE was from March 2024.** Fix: `arc.visible = false` in constructor; set to true only after `updateTle()`. Rule: never render a propagated orbit from a TLE whose epoch is more than a few days old.

- **2026-05-16 — Space-Track 3LE name lines prefixed with "0 ".** CelesTrak: plain name lines. Space-Track: `0 ISS (ZARYA)`. `parseTleText()` strips leading `"0 "`. Rule: check name-line format when switching TLE sources.

- **2026-05-17 — Session 16: GitHub OIDC for CI — no long-lived AWS keys in GitHub.** `aws-actions/configure-aws-credentials@v4` with `role-to-assume`. IAM role `satlas-ci` trust policy scoped to `repo:PremaanshVyas/satlas:*`. Rule: for CI/CD to AWS, always use OIDC; never store IAM user keys in GitHub.

- **2026-05-17 — Session 16: S3+CloudFront for catalog — ECS writes every 2h, browser reads from CDN.** ECS fetches Space-Track → writes `catalog.tle` to S3 → CloudFront serves globally with 2h TTL. Rule: for data that updates on a known schedule, prefer a CDN cache write by a trusted server over per-user direct fetches.

- **2026-05-17 — Session 16: HTTP-only ALB, no custom domain yet.** ACM certificate requires a registered domain. ALB serves HTTP on port 80 only. Rule: don't block infra progress on domain registration.

- **2026-05-17 — Session 16: DATABASE_URL generated by Terraform `random_password` resource.** Full connection string written to Secrets Manager. ECS injects it as env var. Rule: never hardcode database credentials — always Terraform random_password + Secrets Manager + env var injection.

- **2026-05-17 — Session 16: CloudFront uses custom_origin_config (not OAI/OAC) for public S3 bucket.** Public bucket + `s3_origin_config` with empty OAI string → Terraform apply error. Rule: use OAI/OAC only for private buckets; for public buckets use `custom_origin_config` pointing at the regional REST API endpoint.

- **2026-05-18 — Session 17: Multi-satellite selection uses NORAD ID string keys, not array indices.** `selectedNoradIds: Set<string>` and `groundTrackLines: Map<string, THREE.LineLoop>` keyed by NORAD ID. Rule: when a special object is split from the catalog, use NORAD ID string keys — array indices don't generalise across mesh boundaries.

- **2026-05-18 — Session 17: `clearAllSelections()` fires `onSatelliteRemove` per satellite — keeps React state in sync.** Rule: any Globe method that clears selection state must fire the same callbacks that individual removals fire.

- **2026-05-18 — Session 17: Cloud layer uses AdditiveBlending + alphaMap at radius 1.012.** `depthWrite: false` prevents cloud sphere occluding satellites. Rule: for atmospheric overlay layers in Three.js, prefer AdditiveBlending — handles transparency without requiring a separate opacity mask.

- **2026-05-18 — Session 17: AI category counts injected into system prompt — no tool round-trip.** `Globe.getAllCategoryCounts()` returns counts from the in-memory `satCategories` array. Flows: `onCatalogRefresh` → `categoryCounts` state → `buildSystemPrompt`. Rule: when the frontend already has computed data the agent needs, inject it into the system prompt rather than adding a tool call.

- **2026-05-18 — Session 17: Mobile viewport — 100dvh container + env(safe-area-inset-*).** `100dvh` matches the actual visible area. Pattern: `style={{ top: \`max(0.75rem, calc(${safeTop} + 0.25rem))\` }}`. Canvas and overlay wrapper must be siblings. Rule: for full-screen web apps, use `100dvh` and `env(safe-area-inset-*)`.

- **2026-05-18 — Pre-Session 18: Platform renamed from "Aussie Sky" to "Satlas".** Old `aussie-sky` localStorage keys added to `LEGACY_KEYS` in `celestrak.ts` for automatic cleanup. Interim URL: `getsatlas.vercel.app`.

- **2026-05-18 — Pre-Session 18: Env var naming split — SPACE_TRACK_ on Vercel, SPACETRACK_ on ECS.** `api/catalog.ts` reads `SPACE_TRACK_USER`/`SPACE_TRACK_PASS` (Vercel dashboard). `satellites.py` reads `SPACETRACK_USER`/`SPACETRACK_PASS` (mapped by `ecs.tf` from Secrets Manager). Rule: make each file read what its platform actually provides.
