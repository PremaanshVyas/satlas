# Satlas V1 — Session History Synopsis

Compressed record of what was built across Sessions 1–38. For full ADRs see `decisions-archive.md`; for engineering war stories see `CHANGELOG.md`.

---

## Sessions 1–5 — Globe scaffold, ISS, live TLE

Three.js globe with Earth textures, atmosphere shader, star field, and cloud layer. ISS rendered as a distinct yellow dot. Live TLE catalog fetched from CelesTrak. Coordinate system bug discovered and fixed (90° longitude offset — sphere UV maps prime meridian to +X, not +Z). Hardcoded fallback TLE replaced with live catalog fetch.

## Sessions 6–10 — AI agent + tool use

Claude API integrated as the primary interface. Tool-use pattern established: haiku for tool detection (~1s), streaming answer turn without tools (prevents tool calls being silently dropped in streaming). Tools shipped: `get_satellite_info`, `highlight_on_globe`, `predict_passes` (via ECS), `set_category_filter`. Multi-turn conversation history wired. Rate limiting added.

## Sessions 11–15 — CI/CD, search, satellite field scale

GitHub Actions pipeline: lint + typecheck + vitest + pytest + Docker build + ECR push. Text search with fly-to camera. 30k+ satellite InstancedMesh via web worker. `classifySatellite` function for 5 categories (STARLINK/GPS/IRIDIUM/DEBRIS/OTHER). Dot sizing by category (GPS/GEO 1.5×, debris 0.6×).

## Sessions 16–19 — AWS infra

Terraform: ECS Fargate for orbital service, RDS PostgreSQL (pgvector + PostGIS), S3 + CloudFront for TLE catalog, ALB with HTTPS, ACM cert, Route 53, ECR. CI pushes Docker images to ECR. Catalog pipeline: ECS fetches from Space-Track → S3 → CloudFront edge cache.

## Session 20 — PassPanel + satcat fix

Pass prediction panel in the UI. `satcat.json` from Space-Track for satellite metadata (owner, launch date, launch site). NORAD ID leading-zero mismatch fixed in the Python satinfo.py (satcat used bare integer IDs, TLE catalog zero-pads to 5 chars → string equality missed old satellites).

## Sessions 21–22 — Chat polish, overhead tool

`find_satellites_overhead` tool: scans ~30k catalog entries at observer's current epoch, returns top 25 by elevation. Agent system prompt hardened with TOOL USAGE RULES section. `highlight_on_globe` always called in the same turn as `get_satellite_info`.

## Session 23 — NORAD ID leading-zero fix

Second NORAD mismatch: Haiku LLM strips leading zero from prefill string (`"06707"` → `"6707"`). `satinfo.py` used string equality → missed, then fell through to name search where `"6707"` matched `"STARLINK-36707"`. Fix: integer comparison in satinfo.py. Frontend satcat Map padded to 5 chars.

## Sessions 25–26 — Frontend redesign

Dark monochrome palette (`#080808` background, cyan `#00d4ff` accent, mono typography). Panel components redesigned. `AnimatePresence` / `motion.div` for smooth open/close. Safe-area insets for iOS/Android browser chrome.

## Session 27 — Catalog scale + search fly-to

Catalog scaled to 30k+ objects; web worker propagates satellite positions at 50ms tick. Search fly-to: selecting a result from the search dropdown animates the camera to that satellite. Category filter pills toggle groups via Uint8Array mask (no re-render of 30k instances).

## Sessions 28–29 — Country borders, CountryPanel

GeoJSON country borders lazy-loaded. `CountryBorderMesh`, `CountryFillMesh`, `CountryHighlightMesh` added. Spherical triangulation via earcut with subdivision (edges ≤4°) to avoid fill voids at high latitudes. Stencil buffer prevents transparent fill fragments from accumulating across sub-polygons (Russia fix). Country click → `CountryPanel` shows overhead satellites sorted by elevation.

## Session 30 — CountryFillMesh void fix

`refineTris` + `subdivideRing` applied uniformly; SLERP midpoints replaced with flat lat/lon interpolation (SLERP bulges 3–5° into Arctic for Russia). `Globe.clearCountryHighlight()` wired through callback ref so closing CountryPanel clears the ring.

## Sessions 31–32 — API docs, uBlock workaround, catalog error state

Public API docs page at `/docs`. Six public endpoints documented with curl examples. `/api/catalog` blocked by uBlock Origin (matches ad-tracker filter); fix: `vercel.json` rewrite routes `/api/tles` → `/api/catalog` at the edge router. `onCatalogError` callback added — silent failure was leaving the UI showing "Loading catalog…" forever.

## Session 33 — Billboard shader

`SphereGeometry` per satellite (6 segments) replaced with billboard quad + circle shader: `PlaneGeometry(1,1)` (2 triangles) facing the camera, fragment shader discards outside unit circle radius. `fwidth` anti-aliasing: one-pixel-wide AA at any zoom level. 36× fewer triangles. Color via `instanceColor`.

## Session 34 — Pass visibility scoring, DevNotes

Solar position via Meeus simplified equations → sun ECI unit vector. Cylindrical Earth shadow model. Sky condition from sun elevation at observer (Day/Civil/Nautical/Astronomical/Night). Visibility score 0–100 = skyFactor × elevFactor. Evaluated at pass midpoint. DevNotes "i" button replaces static banner; `hidden={chatOpen}` prevents overlap with chat panel.

## Session 35 — Time controls, in-process satellite info

Time transport (2×/10×/50×/100× in both directions, pause, live). `_simTimeMs` accumulator in Globe; `lastFieldTickMs` uses real time to prevent rate-limit inversion on direction changes. `setTimeScale()` resets `lastFieldTickMs = 0` so workers respond instantly. `get_satellite_info` chat tool and `/api/satellite-info` public endpoint moved off ECS to in-process computation via CloudFront TLE cache + satellite.js (eliminates cold-start timeouts).

## Session 36 — Orbit controls, hit-test fixes

Zoom-aware orbit controls: `rotateSpeed` and `zoomSpeed` scale with camera distance. Hit-test depth: Euclidean `√(dx²+dy²+dz²)` replaced with camera-space z-row dot product (Euclidean overestimates for off-centre satellites, making hit radius smaller than visual). `satScales[i]` factored into hit radius (GPS dots were 1.5× visual but 1.0× hit). Gaussian glow and dynamic dot scaling both tried and reverted.

## Session 37 — Mobile touch hit-test, MobileControlsSheet

`TOUCH_MIN_RADIUS_PX = 18` minimum hit radius for touch. Touch selection picks nearest dot in screen distance (not depth). `_lastInputWasTouch` flag distinguishes touch vs mouse in the shared click handler. `MobileControlsSheet`: vaul `Drawer` behind `sm:hidden` hamburger — UTC clock, time transport, layer toggles, category pills. Desktop layout unchanged.

## Session 38 — Search overhaul, display names, aliases

`matchSatelliteQuery` overhauled: token AND-logic, delimiter normalization (strip `/\s\-_()[\]./`), leading-zero NORAD comparison. ISS special-case path extracted to `matchesSatellite()` so both ISS and catalog use the same code. `DISPLAY_NAMES` (HST/JWST friendly names) applied at all render sites. `NORMALIZED_ALIASES` with prefix matching replaces regex `PHRASE_ALIASES` — handles partial typing ("hubbl", "jam") and multi-word joined tokens ("hubble sp"). 166 tests passing.
