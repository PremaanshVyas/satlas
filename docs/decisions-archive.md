# Aussie Sky — Decisions Archive (Sessions 1–11)

These ADR-lite entries were migrated from CLAUDE.md to keep the main file under the 40k character limit.
Rules that are still active are summarised in the relevant sections below.

---

- **2026-05-10 — Project initialized.** Aussie Sky concept (3D SSA + AI agent), monorepo, AWS. Alternatives rejected: pure Earth Observation (less visually striking), ML-only bushfire pipeline (narrower stack). Bushfire detection folded in as V2 vision-pipeline use case.

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
