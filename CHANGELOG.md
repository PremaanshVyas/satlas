# Satlas — Engineering Changelog

A record of significant problems encountered during development, how they were diagnosed, and what actually fixed them. Written for two audiences: reviewers who want to understand the depth of engineering involved, and future contributors who need to understand why the code is shaped the way it is.

---

## [Session 27] — UX polish: globe zoom, search fly-to, catalog expansion (2026-05-22)

### What shipped

UX polish pass and catalog expansion, taking the tracked-object count from ~20k to ~31k.

**Globe zoom.** Initial camera distance bumped from 2.5 → 3.5 (Three.js units, Earth radius = 1). The globe no longer fills the viewport on load — there's breathing room, making the satellite density immediately legible.

**Search fly-to.** Selecting a satellite from the search bar or selection tray now flies the camera to the satellite's current position, matching the behaviour already present for AI-agent highlights. Previously, search selection showed the info card but left the camera stationary.

**Altitude-aware camera fly.** Both the search path (`selectCatalogSatellite`) and the AI highlight path (`highlightSatellite`) previously flew the camera to a fixed distance regardless of orbital altitude. GEO satellites (~35,786 km) ended up with the camera closer to Earth than the satellite itself — you'd arrive at the right lat/lon but couldn't see the dot without zooming out. Fix: propagate the satellite's current position, compute `satRadius = altKm / R_EARTH_KM + 1`, set `flyDistance = max(CAMERA_DISTANCE, satRadius × 1.5)`. LEO sats land at the default distance; MEO/GEO sats land at a distance that frames the satellite correctly.

**Catalog expansion — 20k → 31k+ objects.** Three compounding limits were keeping the catalog small:
1. `api/catalog.ts` had a hard `limit/20000` in the Space-Track query — cut off before the full catalog.
2. The epoch filter was 60 days; widened to 90 days to capture satellites with less frequent TLE updates (some deep-space objects, high-altitude sats).
3. `celestrak.ts` raced `/api/catalog` against CelesTrak `GROUP=active` simultaneously — CelesTrak's ~10k "operational" list could win the race and silently populate a much smaller globe. Changed to sequential: try `/api/catalog` first (edge-cached, <100ms when warm), fall back to CelesTrak only on failure.

Result: 31,467 tracked objects — Debris (12,255), Starlink (10,363), Other (8,549), Iridium (220), GPS (80).

**`satellites.py` (ECS).** Matched the Space-Track query to 90-day epoch and added `DECAY_DATE/null-val` filter. Applies to the backend orbital tools (pass prediction, overhead lookup) on next ECS redeploy.

**Debris off by default.** Debris is the largest category (12k+ objects) and visually overwhelming on landing. Changed the initial `activeCategories` state to exclude `DEBRIS`. Users can re-enable it via the new Debris toggle. A mount effect syncs this default into the Globe engine and the category counts callback so everything is coherent from the first render.

**Cloud + Debris toggles redesigned.** The cloud toggle was a bare emoji button; the debris toggle didn't exist. Both are now consistent labeled controls: SVG icon + text label + a sliding pill (`w-7 h-4` container, `w-3 h-3` thumb, 2px symmetric gaps). The "can't turn off the last category" guard was removed — all category pills can now be toggled off simultaneously.

**ISS owner override.** Space-Track stores Zarya (NORAD 25544) under owner code `CIS` (Russia), which resolves to "Russia" — technically the builder of the first module, but misleading for the ISS as a whole. Added a `NORAD_OWNER_OVERRIDES` map in `satcat.ts` keyed by unpadded NORAD ID. ISS now shows "ISS Partnership (NASA · Roscosmos · ESA · JAXA · CSA)". Cache bumped to `satlas-satcat-v6`.

**Owner field wrapping fix.** The owner row in SatInfoCard was constrained to half the card width by the 2-column grid layout and cut off by `truncate`. Fixed with `col-span-2` and removing `truncate` — owner text now spans the full card width and wraps freely. Handles the ISS partnership string and any future long owner names.

---

## [Session 25] — Frontend redesign: Nothing/Terminal aesthetic (2026-05-21)

### What shipped

Full visual restyle of the Satlas frontend across 9 files. No logic changes, no new packages, no routing changes — pure CSS layer.

**Design system.** JetBrains Mono replaces Geist as the single typeface. Electric cyan `#00d4ff` is the accent colour: live satellite data, active status indicators, primary action buttons, category pills when selected. Tailwind v4 `@theme` block defines named tokens (`text-accent`, `text-secondary`, `text-label`, `text-danger`, `text-warn`, `font-mono`) that propagate consistently to all components. Background is near-black `#080808`.

**Glass panels.** Every floating UI surface — SatInfoCard, PassPanel location search, SearchBar, AgentPanel input, selection tray, chat toggle, API Docs link — uses the same glass shell: `bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px]`. Section dividers are even subtler: `border-[rgba(255,255,255,0.04)]`.

**Component highlights.** SatInfoCard: full-word labels (Owner, Launched, Latitude, Longitude — never abbreviations), cyan pulsing dot for active satellites, cyan live lat/lon values, danger/warn badge tints for debris and rocket bodies. PassPanel: CompassRose needle recoloured to `#00d4ff`. AgentPanel: user bubbles get a cyan tint; AI bubbles transparent with hairline border; streaming dots cyan. GlobeView: UTC clock and satellite count become bare text overlays (no chip backgrounds); category pills use cyan active state. ApiDocs: full monospace terminal page, GET badge cyan, POST badge amber.

### No regressions

All 75 tests passed throughout. Tests check semantic content (headings, links, endpoint paths, badge text) not CSS classes, so they were unaffected.

---

## [Session 24] — V1 polish: pulsing dot, compass rose, docs footer (2026-05-21)

### What shipped

Three UI polish items completing the V1 backlog.

**Pulsing green dot in SatInfoCard.** Active satellites (Space-Track `opsStatus` of `+` or `tracked`) now show a pulsing green indicator in the info card header, left of the NORAD ID. Uses Tailwind's `animate-ping` pattern — a larger translucent ring pulses outward from a solid green core. Same condition that was already colouring the "Status" text field green, so no new data dependency.

**Compass rose in PassPanel.** Each pass row previously showed direction as plain monospace text (e.g. `NW`). Replaced with a 34px inline SVG compass rose: grey ring, four cardinal tick marks, `N` label, and a blue triangular needle rotating to the pass direction. Handles all 16 compass points (N through NNW in 22.5° increments). No external library — `CompassRose` component maps direction strings to rotation angles via a lookup table, then uses an SVG `rotate()` transform on the needle `<polygon>`. Direction text is kept as a small label below the dial.

**ApiDocs footer.** The `/docs` page previously had no footer — it just ended at the last endpoint. Added a border-top footer with a ← Globe `<Link>`, a GitHub repo `<a>`, and the project tagline. Keeps the page self-contained for developers who land on it directly.

### No architectural decisions

All three changes were self-contained UI additions with no backend dependencies, no new data requirements, and no new npm packages. 75/75 tests passing, tsc clean.

---

## [Session 23] — NORAD ID leading-zero normalization (2026-05-21)

### What shipped
Fixed wrong satellite being returned for queries like "Cosmos 574" when the LLM stripped the leading zero from NORAD ID `06707` → `6707`. Fixed satellite metadata (owner/launch date) silently missing in the info card for low-NORAD-ID satellites.

### Three compounding bugs from one root cause

**Bug 1 — `satinfo.py` string equality fails on leading zeros.** The catalog stores `'06707'`; Haiku normalises digits and sends `'6707'`; `'6707' != '06707'` → digit lookup misses. No early return on digit query failure, so the code fell through to name-search with `'6707'` — a substring of `'STARLINK-36707'` → wrong satellite returned with plausible-looking data.

**Bug 2 — `satcat.ts` Map keys use raw Space-Track format.** Space-Track omits leading zeros (`'6707'`); the TLE catalog pads to 5 digits (`'06707'`). The satcat Map was keyed by the raw Space-Track string; the SatInfoCard looked up by the TLE-derived string → `get('06707')` returned `undefined` → all metadata showed `—`.

**Bug 3 — AI adding training knowledge despite successful tool call.** System prompt only prohibited training-knowledge overrides for position/altitude, not for tracking status. Claude would get a valid live tool response for Cosmos 574 and then add "this satellite may no longer be tracked" from training data. Extended the prohibition to cover tracking status and catalog presence.

### Fix
`satinfo.py`: convert both sides to `int()` before comparing. `if query_stripped.isdigit(): ... int(item['norad_id']) == int(query_stripped)`. Name-search fallback gated behind `else` so a numeric miss doesn't cascade into substring matching. `satcat.ts`: `r.norad_id.padStart(5, '0')` when building the Map — both key and `noradId` field normalised to 5-digit format. Cache bumped to v5.

### Verification
`curl https://api.satlas.app/satellite-info?query=6707` → `{"name":"COSMOS 574","norad_id":"06707",...}`. Three new unit tests: `query='6707'` finds COSMOS 574, `query='06707'` finds COSMOS 574, `query='6707'` does not match STARLINK-36707.

---

## [Session 22] — Custom domain + HTTPS + pass prediction fixes (2026-05-21)

### What shipped
`satlas.app` live with HTTPS. `api.satlas.app` → ALB with HTTPS listener; HTTP port 80 → 301 redirect. Pass prediction edge cases fixed. SatInfoCard metadata fixed. AI tracking-status contradiction fixed. Location disambiguation improved.

### Domain setup — external registrar + Route 53 + ACM

Route 53 domain registration is blocked on Free Tier AWS accounts. Fix: register at Namecheap, create `resource "aws_route53_zone"` in Terraform (not `data` — that's for Route 53-registered domains), paste the 4 NS records into Namecheap Custom DNS. ACM wildcard cert provisioned via DNS validation; budget 45 min from `terraform apply` to `ISSUED` when nameservers are changing. Apex A record → `216.198.79.1` (Vercel's current recommended IP, not the old `76.76.21.21`). www CNAME from Vercel dashboard (project-specific — don't guess `cname.vercel-dns.com`).

### skyfield `find_events` silently drops boundary passes

`find_events` omits the rise event when the satellite is already above the threshold at `t0`. The event state machine then saw a `set` event with no matching `start_utc` and silently dropped the pass. Same issue at the window end: no `set` event if the satellite is still above threshold at `t1`. Fix: on `set` event, synthesise `start_utc = t0.utc_iso()` if missing; after the loop, if `current` has `start_utc` (open pass), synthesise `end_utc = t1.utc_iso()`. Both edge cases sample alt/az at the boundary time if peak data is also missing.

### SatInfoCard metadata always showing dashes — wrong Vercel env var name

`VITE_CATALOG_URL` was not set in Vercel — mickey had `VITE_ORBITAL_URL` pointing at CloudFront, then renamed it to `ORBITAL_SERVICE_URL = https://api.satlas.app` when updating the orbital service URL. CloudFront URL was gone from Vercel entirely. Fix: hardcode CloudFront origin fallback in `satcat.ts` so the variable is optional. Cache bumped to v4. Rule: `VITE_CATALOG_URL` is not needed in Vercel; code has a hardcoded CloudFront fallback.

### Location disambiguation — "City, Country" after suggestion select

User searched "Melbourne"; accidentally selected Melbourne, FL instead of Melbourne, AU — passes dropped from 5 to 2 with no indication something was wrong. Fix: `handleSuggestionSelect` now displays `"${parts[0]}, ${country}"` using the last segment of `displayName` as country context. Users can immediately verify they picked the right city before the prediction runs.

---

## [Session 21] — API docs page + /docs route (2026-05-21)

### What shipped
`/docs` route with styled API reference — all three endpoints documented with params tables and curl examples. API link added to globe header. Scroll fixed (global `overflow: hidden` was blocking /docs).

### Global `overflow: hidden` blocks scrollable routes

Had `html, body, #root { overflow: hidden }` in `index.css` to lock the globe. Adding `/docs` made scrolling impossible. Fix: removed from global CSS, added `overflow-hidden` to App's root div only. Rule: never put `overflow: hidden` globally when the app has multiple route types.

### API docs param names wrong — always read the handler

Initial docs used `norad`, `lat`, `lon`, `hours` for `/api/pass`. Actual handler uses `norad_id`, `latitude`, `longitude`, `hours_ahead`. Caught by code quality review. Rule: when documenting an API, read the actual handler — never infer param names from memory or usage examples.

### Hard-coded origin URL wrong on preview deployments

First pass set `const BASE = 'https://getsatlas.vercel.app'` — curl examples on any preview URL would point at production. Fix: `const BASE = window.location.origin`. Rule: never hard-code the production origin in client-rendered content.

---

## [Sessions 19–20] — AWS infra live + PassPanel + satcat metadata (2026-05-20–21)

### What shipped
ECS Fargate deployed and serving `api.satlas.app`. Railway decommissioned. S3+CloudFront pipeline live (TLE catalog + satcat.json from Space-Track). RDS PostgreSQL provisioned. PassPanel UI — geolocate or search any location, see next 24h passes. Satellite metadata (owner, launch date, launch site, status) from Space-Track via satcat.json.

### Docker `--platform linux/amd64` required for ECS Fargate

ECS Fargate runs on x86_64. A Docker image built on an M-series Mac without `--platform linux/amd64` is ARM-only. ECS error: "image Manifest does not contain descriptor matching platform 'linux/amd64'". Rule: always pass `--platform linux/amd64` when building images destined for ECS.

### CelesTrak blocks all Vercel IPs

`fetchTle` returned null for every query from Vercel functions — not just `GROUP=active`, all CelesTrak endpoints. Fix: (1) `toolGetSatelliteInfo` calls ALB directly; (2) `fetchTle` downloads CloudFront catalog and searches in-process (2-min in-memory cache). Rule: never call CelesTrak from a server/cloud context — route through the ALB or CloudFront catalog.

### satcat metadata CORS — switched to Space-Track JSON via S3+CloudFront

CelesTrak's `/pub/satcat.csv` has no CORS headers — browser fetch silently fails. All satellite metadata always showed `—`. Fix: ECS `_s3_refresh()` now also calls Space-Track for satcat data and writes `satcat.json` to S3 alongside `catalog.tle`. CloudFront serves it with 2h TTL. Rule: never fetch CelesTrak static files in the browser for metadata — route through your own CDN pipeline.

### PassPanel suggestion dropdown — `onMouseDown` fires before `onBlur`

Dropdown disappears when input loses focus (`onBlur`) before a mouse click on a suggestion registers (`onClick` fires after `onBlur`). Fix: `onMouseDown` + `e.preventDefault()` on each list item — fires before blur, prevents focus loss. Rule: for suggestion dropdowns, always use `onMouseDown` + `e.preventDefault()` on list items.

---

## [Pre-Session 18] — Platform renamed to Satlas (2026-05-18)

### What changed

Platform renamed from "Aussie Sky" to "Satlas" — the name was geographically misleading for a global orbital tracking platform. All references updated across code, infra, and docs in a single commit.

- GitHub repo: `PremaanshVyas/aussie-sky` → `PremaanshVyas/satlas`
- Vercel project: `aussie-sky` → `satlas`; deployment URL: `getsatlas.vercel.app` (satlas.vercel.app was taken)
- Browser title, system prompt identity, User-Agent headers, CORS origins, localStorage cache keys
- Terraform state bucket (`satlas-tfstate`), IAM role (`satlas-ci`), ECR repo (`satlas-orbital`)
- Old cache keys (`aussie-sky-catalog-v4` etc.) added to `LEGACY_KEYS` in `celestrak.ts` — browsers clean them up automatically on next load

### Env var naming standardised

`api/catalog.ts` (Vercel) reads `SPACE_TRACK_USER`/`SPACE_TRACK_PASS` — matching what's set in the Vercel dashboard. `apps/orbital/satellites.py` (ECS) reads `SPACETRACK_USER`/`SPACETRACK_PASS` — `ecs.tf` maps the Secrets Manager secrets to that name on injection. Both are now correct for their respective runtime environments.

Railway env var remnants (`ORBITAL_SERVICE_URL`, `VITE_ORBITAL_SERVICE_URL`) removed from `.env.example` — those were never used in code.

---

## [Session 17] — Visual overhaul + UX improvements (2026-05-18)

### What shipped
Full visual overhaul: real-time cloud layer, NASA star field, satellite trails, dot sizing by type, colour-graded Earth. UX improvements: multi-satellite selection tray, cloud toggle, AI category counts, mobile viewport fix, chat close button moved to bottom.

### Cloud layer iteration — three commits to get opacity right

The cloud layer (`CloudMesh.ts`) uses `clouds.matteason.co.uk` — a free service updated every ~3h with a stable URL. The implementation is a second `SphereGeometry` at radius `1.012` with the cloud texture as an `alphaMap`, `transparent: true`, `depthWrite: false`, and `THREE.AdditiveBlending`.

**Commit 1 (037ba1d):** Initial cloud layer. Too faint — clouds barely visible over the ocean where they should be most prominent. Root cause: initial texture loading parameters didn't account for how the engine handles the alpha channel under `AdditiveBlending`.

**Commit 2 (55c364a):** Added a `SunMesh` (icosahedron + point light) to add dramatic lighting. The sun object looked wrong in the Three.js scene — a bright floating sphere in space. Removed in the next commit. Lesson: a directional light behind the earth is the right approach for solar illumination; a physical sun mesh in scene-space is distracting.

**Commit 3 (e8d4616):** Denser clouds (adjusted texture brightness + colour grade on Earth shader). Removed the sun mesh, kept the directional light approach. Final result: clouds visible, not distracting, transparent over oceans.

### Multi-satellite selection — NORAD ID keyed Maps, not buffer indices

The previous single-selection state used `selectedSatIdx: number` (the InstancedMesh buffer index). Multi-selection needed to handle both catalog satellites (have an index) and ISS (extracted from catalog into a separate SatelliteMesh — no buffer index). Using buffer indices for a Map key doesn't generalize.

Fix: `selectedNoradIds: Set<string>` and `groundTrackLines: Map<string, THREE.LineLoop>` keyed by NORAD ID. Works uniformly for both. `selectedIdxs: Set<number>` maintained in parallel only for `refreshInstanceColor()` performance.

**React/Three.js state sync:** `clearAllSelections()` (called on catalog rebuild) iterates `selectedNoradIds` and fires `onSatelliteRemove` for each, so App.tsx React state (`selectedSats` array, `cardSat`) stays in sync with Globe's Three.js state. Without this, a 30-minute catalog refresh would silently leave the tray showing satellites with no orbit rings.

### Mobile viewport — `100vh` is wrong on mobile browsers

The chat close button was behind the browser tab bar on iOS and some Android browsers. Initial fix: `env(safe-area-inset-top)` on the chat header padding. Still broken. Root cause: `100vh` on mobile browsers equals the *total* viewport including browser chrome (address bar, tab bar), which can be 80–90px more than the actual visible area. The chat panel was taller than the screen before the user could see the close button at the top.

**Fix:** Change container from `h-screen` (which maps to `100vh`) to `style={{ height: '100dvh' }}`. `dvh` (dynamic viewport height) tracks the actual visible area and updates as browser chrome shows/hides. Pair with `env(safe-area-inset-top, 0px)` and `env(safe-area-inset-bottom, 0px)` for notch and home bar clearance on all overlay elements. The close button was also moved from the chat panel header to the bottom input bar (left of Send) — it's now always within reach on any screen height.

### AI category counts — system prompt injection, not a tool call

Original approach: `get_category_counts` tool called the Python backend `/satellite-categories` endpoint. Problem: the Python catalog and the browser's rendered catalog can diverge (different sources, different cache TTLs). A "how many Starlink?" answer from Python might be inconsistent with what the globe is actually showing.

Fix: `Globe.getAllCategoryCounts()` returns counts from the in-memory `satCategories` array — the same data driving the rendered dots. Fired on `onCatalogRefresh`, the counts flow through `useGlobe` → `onCategoryCounts` prop → `App.tsx` `categoryCounts` state → `handleSendMessage` → `api/chat.ts` `buildSystemPrompt`. The system prompt includes a "Live catalog counts" block:

```
Live catalog counts (from the tracking globe — use these directly when asked):
  STARLINK: 6,247
  DEBRIS: 4,891
  OTHER: 5,032
  GPS: 74
  IRIDIUM: 66
```

AI reads it directly from context. No network round-trip, no source-of-truth divergence.

---

## [Session 16] — AWS infrastructure foundation (2026-05-17)

### What shipped
Full Terraform across 3 waves (ECR + IAM OIDC, VPC + ECS Fargate + ALB, S3 + CloudFront + RDS). GitHub Actions `ecr-push` job using OIDC — no long-lived AWS keys in GitHub. `/api/catalog` Vercel function: Space-Track auth + `Cache-Control: s-maxage=7200` for Vercel CDN edge caching. Python orbital service rewritten to fetch Space-Track → write `catalog.tle` to S3 → CloudFront serves globally. Railway decommissioned.

### Space-Track 3LE format bug — `format/tle` vs `format/3le`

`format/tle` returns 2-line elements with no name line. The existing `parseTleText()` parser expects 3LE (name / TLE1 / TLE2 triplets). With 2LE: TLE line 2 of satellite N becomes the "name" of satellite N+1, count halved (~10k instead of ~20k), ISS intermittently missing for TLE update.

Fix: `format/3le`. Rule: always use `format/3le` with the Space-Track GP endpoint.

**Name line prefix:** CelesTrak 3LE has plain name lines (`ISS (ZARYA)`). Space-Track 3LE prefixes with `0 ` (`0 ISS (ZARYA)`). `parseTleText()` strips leading `"0 "` before storing name.

### CloudFront + public S3 bucket — OAI breaks, custom_origin_config works

The catalog S3 bucket uses a public read bucket policy (Principal: `*`). Terraform's `s3_origin_config` requires an OAI string — passing an empty string caused an apply error. For a public bucket no OAI/OAC is needed; the correct Terraform pattern is `custom_origin_config` pointing at the bucket's regional REST API endpoint with `https-only`. Rule: use OAI/OAC only for private buckets.

---

## [Session 13] — Catalog reliability + picking accuracy (2026-05-14)

### What shipped
Soft catalog refresh (no InstancedMesh teardown on background update), 72h stale-serve cache, hemisphere occlusion check for hover/click, Z-ordering fix (depth wins over screen distance), system prompt hardened against training-data fallback on tool errors.

### Hover triggering on satellites behind Earth

Satellites on the far hemisphere project to valid 2D screen coordinates — they are in front of the camera in screen space but physically behind the Earth mesh. Before the fix, hovering the globe surface would frequently show a tooltip for a satellite on the opposite side of the planet.

Fix: `if (satX*camX + satY*camY + satZ*camZ <= 0) continue`. The dot product of the satellite's world position and the camera's world position (both from Earth centre) is negative when they are on opposite hemispheres. O(1) check per satellite.

### Soft catalog refresh — no satellite flash on background update

Every 30 minutes `initCatalog` disposed the InstancedMesh and rebuilt it. During the ~1–3s worker re-init, all dots disappeared. Fix: if the mesh and worker already exist and the new count is within 200 of the old count, skip mesh teardown and just re-post `{ type: 'init', tles }` to the existing worker. The worker atomically replaces `satrecs`; dots update on the next tick. No flash.

---

## [Session 12] — CI/CD setup + ESLint strict-mode fixes (2026-05-14)

### What shipped
Added `.github/workflows/ci.yml` with 4 parallel jobs: web (lint + tsc + vite build + vitest), api-typecheck (root `tsc --noEmit`), orbital-test (pytest on Python 3.11), orbital-docker (Docker build). Triggers on every push to main and every PR.

### ESLint errors blocking CI
`eslint-plugin-react-hooks` v7 added two new strict rules not present in earlier versions:

**`react-hooks/refs`:** `onSatelliteClickRef.current = onSatelliteClick` was written directly in the render body of `useGlobe` — a common "stale closure fix" pattern from React 17/18. In v7, this is an error because refs read or written during render can cause missed updates. Fix: moved into `useLayoutEffect` (no dep array), which fires synchronously after every commit — same effective timing as the render-time assignment, but on the correct lifecycle phase.

**`react-hooks/set-state-in-effect`:** Two effects called `setState` inside their body — `AgentPanel` (syncing `prefill` prop to local input state) and `GlobeView` (syncing an agent filter directive to pill UI state). Both are genuinely correct — they fire on external prop changes and don't cascade. Restructuring them would require lifting state or adding complexity that doesn't serve the codebase. Fixed with `// eslint-disable-next-line react-hooks/set-state-in-effect` + a one-line explanation at each site.

### CORS tightened
Changed `allow_origins=['*']` in FastAPI middleware to `['https://getsatlas.vercel.app', 'http://localhost:5173', 'http://localhost:4173']`. The open wildcard was a temporary MVP shortcut.

---

## [Session 11 post] — Zero satellites after Railway cold start — AbortController timeout too short (2026-05-14)

### Problem
After the Session 11 deploy, users on a cold Railway start (fresh container spin-up, no prior traffic) would see the globe load but with zero satellite dots. The ISS yellow dot appeared, but the full ~9,000-satellite catalog never loaded. No error was shown to the user.

### Root Cause
A 35-second `AbortController` timeout was added to `fetchCatalogFromNetwork` to surface Railway failures quickly. Railway's free tier puts containers to sleep after ~5 minutes of inactivity. A cold start can take 40-60 seconds — longer than the 35s timeout. The `fetch()` call was silently aborted mid-cold-start; the `catch(() => {})` in the background refresh path swallowed the error entirely; the `SatelliteField` was never populated.

The `localStorage` cache was added in the same session to make repeat visits instant, which helped for second+ visits but did nothing for the very first visit (cache empty on first load).

### Fix
Removed the `AbortController` and `FETCH_TIMEOUT_MS` constant from `fetchCatalogFromNetwork` entirely. `fetch()` now runs without a timeout — the browser's own connection lifecycle handles genuine server-down cases (a network error propagates to the caller). Slow cold starts now complete correctly once Railway wakes the container. The `localStorage` cache (30-min TTL) means this wait only ever happens on the first visit or after the cache expires; repeat visitors get instant loads.

### Lesson
Never add a hard fetch timeout shorter than the worst-case cold-start time of the target server. The timeout that was added to "fail fast" had the effect of failing silently on every cold start. Use the cache for the common (fast) case; leave the network fetch uncapped for the slow case.

---

## [Session 11] — Agent-controlled category filter with per-category satellite colours (2026-05-14)

### Problem
The original plan was to highlight a category group using per-instance THREE.js colours (`setColorAt`). This worked on first activation but stopped working after any manual category filter toggle — dots would go invisible or fail to recolour.

### Root Cause
The clear path set `mesh.instanceColor = null`, then recreated the buffer on the next highlight. Category filter toggles call `instanceMatrix.needsUpdate = true`, which causes Three.js to rebind the VAO. The null → non-null transition on `instanceColor` during a frame where `instanceMatrix` was also dirty produced unreliable WebGL state — the highlight stopped applying.

Two further attempts were made:
1. **Permanently white material + blue instanceColor on clear.** Three.js shader variant cache changed when going from no-instanceColor to always-instanceColor, causing invisible dots.
2. **Keep original material colour on clear + pre-init instanceColor to WHITE in constructor.** `blue material × white instanceColor = blue` visually — identical to the original no-instanceColor state. Buffer stays alive permanently. No VAO rebinding issue. This is the correct fix.

### Second architectural problem
Per-instance highlight was abandoned anyway because it solved the wrong problem. The category filter pills already control which satellites are visible. Making the AI highlight a group independently created two separate state machines for the same concern. Replacement: `set_category_filter(categories: string[])` tool. The agent calls this, which activates the same category filter code path as clicking the pills, keeping pills and AI in sync. `applyAgentFilter()` additionally applies per-category dot colours when agent-set; `setActiveCategories()` (manual toggle) clears the colour mode back to default blue.

### Lesson
When an AI agent controls something that already has a manual UI control, wire them both to the same underlying state — don't create a second independent state machine. Document the `instanceColor` always-live pattern: pre-init to WHITE in the constructor; clear by resetting material + all-WHITE, never by setting to null.

---

## [Session 10] — ISS click/hover resolving to docked module NORAD IDs (2026-05-14)

### Problem
Clicking or hovering the ISS yellow dot on the globe would sometimes fire the `onSatelliteClick` callback with the NORAD ID and name of a docked module (Unity / NORAD 26958, Destiny / NORAD 27386, etc.) rather than ISS ZARYA (25544). The satellite info card would say "ISS MODULE" and the "Ask AI" prefill would query the wrong ID — resulting in "satellite not found" responses since the docked modules aren't separately tracked in the orbital service.

### Root Cause
The catalog `InstancedMesh` includes all tracked ISS-related objects: the core ISS (ZARYA), plus docked modules that share the same orbital position. The click handler iterated the catalog buffer sequentially and returned the first instance within the click radius. Because docked modules occupy the exact same position as ZARYA in the propagated buffer (same TLE epoch, same orbit), whichever catalog index came first in the buffer won — and for the modules this was usually before ZARYA's index. The yellow `SatelliteMesh` ISS dot sits above the catalog buffer entirely, but the catalog buffer was checked first.

### Fix
Both the click and hover handlers now check the `SatelliteMesh` ISS position **before** iterating the catalog buffer. If the cursor is within the ISS dot radius (+2px tolerance for click, +6px for hover), the handler returns immediately with the `issName`/`ISS_NORAD` pair captured from the catalog. A sentinel value `hoveredIdx = -2` prevents re-firing while the cursor stays over the ISS. The `issName` is captured from the catalog record for NORAD 25544 at load time, with a hard fallback to `'ISS (ZARYA)'`.

### Lesson
When a special object shares a spatial position with catalog entries, always check it first in the pick loop. The rendering order (yellow dot rendered on top) is irrelevant to the geometry intersection test — the pick loop is sequential over a flat buffer and has no concept of visual layering.

---

## [Session 9d] — Click-to-select triggering on blank space with 10k satellites (2026-05-14)

### Problem
After implementing click-to-select with a 20px fixed threshold, clicking anywhere on the globe — even empty space — would almost always select a satellite and pre-fill the chat panel. The feature was essentially unusable; it felt like random satellite selection.

### Root Cause
With ~10,000 rendered satellites there is always at least one within 20px of any cursor position on the globe face. A fixed pixel threshold is the wrong abstraction: it ignores how large the dot actually appears on screen, which varies by zoom level and satellite depth.

### What We Tried
The initial approach was `THREE.Raycaster.intersectObject()` on the `InstancedMesh`. This requires the click to land inside the actual sphere geometry (radius 0.005 world units ≈ 3–4 px at normal zoom) — too precise to be usable. Replaced it with a 20px fixed screen-space threshold, which solved the precision problem but introduced the false-positive problem.

### Fix
Compute the actual pixel radius of each satellite dot at the time of the click. The formula: `dotRadiusPx = (SPHERE_RADIUS / depth) * fovFactor` where `SPHERE_RADIUS = 0.005`, `depth` is the Euclidean camera–satellite distance, and `fovFactor = canvasHeight / (2 * tan(fov/2))`. Only accept a hit if `screenDist <= dotRadiusPx + 1px` (the +1px accounts for sub-pixel rendering edges). This matches the visual dot size exactly at any zoom level, so clicking outside the dot always misses and clicking on the dot always hits.

### Lesson
Screen-space hit testing for rendered geometry must account for depth and projection — a fixed pixel radius ignores the perspective transform. Any time you're doing manual hit testing, derive the threshold from the same math the renderer uses: `worldRadius / depth * fovFactor` is the correct pixel-radius formula for a perspective camera.

---

## [Session 9c] — "Satellite not found in catalog" when clicking dots on globe (2026-05-14)

### Problem
Clicking a catalog satellite would pre-fill the chat with the satellite name, but the agent would sometimes respond with "I couldn't find that satellite" or answer with stale training-knowledge data (wrong altitude, wrong orbital period) rather than calling the live backend tool.

### Root Cause
Two separate causes:
1. The prefill format was `"Tell me about STARLINK-1234"`. The backend `satellite_info()` function treats this as a substring search — it picks the first match, which may or may not be the intended satellite (many Starlinks have similar names).
2. The system prompt said the agent *should* call `get_satellite_info` but Claude sometimes skipped it for well-known satellites like the ISS, filling in orbital parameters from training data (which is outdated — TLEs change daily).

### Fix
1. **Prefill includes NORAD ID:** `"Tell me about NORAD 44713 (STARLINK-1234)"`. The backend `satellite_info()` checks `query.isdigit()` first and performs an exact NORAD ID match, bypassing fuzzy name search entirely.
2. **System prompt hardened:** `get_satellite_info` rule now says "ALWAYS call this tool; NEVER answer satellite position, altitude, velocity, inclination, or orbital period from your training knowledge — that data changes daily and your training is outdated."

### Lesson
When Claude is forbidden from using training data for a domain, make the tool call mandatory in the system prompt _and_ structure the input to bypass ambiguity. Fuzzy name matching is a bug waiting to happen when thousands of satellites share a naming prefix.

---

## [Session 9b] — All satellites rendering at the same visual height (2026-05-14)

### Problem
The 3D globe showed all ~10,000 catalog satellites at the same altitude — a thin shell just above Earth's surface. LEO satellites (ISS at 420km), GPS (20,200km), and GEO (35,786km) were visually indistinguishable.

### Root Cause
`propagator.worker.ts` used `const r = 1.02` (hardcoded, all satellites placed 2% above Earth's surface). `SatelliteMesh.ts` used `const r = 1.06` for the ISS. Neither used the propagated altitude. The `satellite.js` `eciToGeodetic()` function returns a `GeodeticLocation` with `height` in km — this value was computed but never used for the render position.

### Fix
In both files: `r = (R_EARTH_KM + geo.height) / R_EARTH_KM` where `R_EARTH_KM = 6371.0`. The ISS orbital arc in `computeArcPoints()` was already correct (it used ECI magnitude normalised by `R_EARTH_KM`), so only the dot position needed changing. Also raised `camera.far` from 100 to 200 and `controls.maxDistance` from 8 to 15 so users can zoom out far enough to see MEO and GEO shells.

### Lesson
Never hardcode orbital radius values. Always derive from propagated altitude. The propagation library already computes the correct altitude — it just needs to be wired to the render position.

---

## [Session 9a] — CelesTrak catalog silently broken since Session 6 (mock-divergence bug) (2026-05-14)

### Problem
Satellites disappeared from the globe after a Railway deploy. The globe ran in ISS-only mode with no error shown. The `/satellites` endpoint appeared to work locally (tests green) but was failing in production.

### Root Cause
`CELESTRAK_ACTIVE_URL` used `FORMAT=json` — CelesTrak's GP (General Perturbations) JSON format. This returns orbital element fields (`MEAN_MOTION`, `ECCENTRICITY`, `EPOCH`, etc.) but **does not include `TLE_LINE1` or `TLE_LINE2`**. The `_parse_gp()` function accessed `item['TLE_LINE1']` → `KeyError` on every real CelesTrak call.

The reason this was undetected: the test fixtures included manually-fabricated JSON with `TLE_LINE1`/`TLE_LINE2` keys that don't exist in the real API response. Tests passed; production failed silently. `get_satellites()` always fell back to SpaceTrack, which was working. When SpaceTrack had a cold-start transient failure at a Railway deploy boundary, both sources failed simultaneously and `/satellites` returned 503.

### What We Tried
Initially suspected Railway networking, then CelesTrak IP blocking. Read the actual CelesTrak GP JSON schema documentation — confirmed `TLE_LINE1` is never present in `FORMAT=json` responses.

### Fix
Switched `CELESTRAK_ACTIVE_URL` to `FORMAT=TLE`, which returns the standard 3LE text format (name / line1 / line2 triplets). Added `_parse_tle_text()` to parse it (splitting on newlines, grouping triplets). Kept `_parse_gp()` only for the SpaceTrack fallback, which genuinely does include `TLE_LINE1`/`TLE_LINE2`. Updated test fixtures to use realistic 3LE text instead of fabricated JSON.

Added stale cache fallback: if both CelesTrak and SpaceTrack fail and a previous successful fetch exists in `_cache['tles']`, serve the stale catalog rather than raising a 503.

### Lesson
Test fixtures must match the real API response schema. Never fabricate keys that differ from what the actual endpoint returns — it creates a divergence that masks production failures while giving false confidence. Whenever you change a data source URL or format, fetch the real endpoint and update the fixtures from actual response data.

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
1. Added `User-Agent: satlas/1.0` header — fixed bot detection 403, but not the IP-range block.
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
