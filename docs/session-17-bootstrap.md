# Session 17 Bootstrap — Aussie Sky Visual Overhaul

Read `CLAUDE.md` fully before doing anything else. That is the source of truth.  
Then read `docs/superpowers/specs/2026-05-15-v1-platform-upgrade-design.md` — the approved V1 design that governs Sessions 16–20.

---

## Who you're working with

Premaansh ("mickey") — CS student at RMIT Melbourne, building this for Australian SWE internship applications. Every decision serves that goal. Communicates concisely; redirects rather than elaborates. Has ~15 hours/week.

---

## Current state (end of Session 16)

- Frontend live at `aussie-sky.vercel.app`
- Python orbital service: running on AWS ECS Fargate (`apps/orbital/`) — always warm, static IP
- Catalog: 25-30k satellites from Space-Track, served by S3+CloudFront; browser races CloudFront + CelesTrak direct
- RDS PostgreSQL: `subscribers` table + pgvector extension (empty, ready for Session 19+)
- CI: `ecr-push` job pushes Docker image to ECR on main branch push
- Sentry: error monitoring live in Python service
- Railway: decommissioned
- 79 orbital Python tests passing; 54 frontend Vitest tests passing; tsc clean; lint clean

---

## Session 17 mission: Visual Overhaul

**Goal:** someone opening Aussie Sky immediately sees a planet, not a diagram.

### 1. Real-time cloud layer (clouds.matteason.co.uk)

- GET `https://clouds.matteason.co.uk/image/4096x2048.jpg` — free, updates every ~3h
- In Three.js: second `SphereGeometry` at radius `1.012` (just above atmosphere layer)
- Cloud texture as `alphaMap`, `transparent: true`, `depthWrite: false`, `blending: THREE.AdditiveBlending`
- Browser cache handles freshness (URL is stable, content changes server-side)
- New file: `apps/web/src/globe/CloudMesh.ts`

### 2. NASA Deep Star Maps 2020 skybox

- Source: public domain from NASA SVS — Gaia DR2 8k star field
- Replace `StarField.ts` vertex approach with a `SphereGeometry` skybox:
  - `side: THREE.BackSide`, radius `100`, star texture mapped to inside
- Zero performance cost vs current procedural star field; dramatically better quality
- Update `apps/web/src/globe/StarField.ts` (or replace with `StarField2.ts`)

### 3. Astronomia sun position

```bash
npm install astronomia
```

In `apps/web`:
- Replace `apps/web/src/globe/solar.ts` GMST-based sun position with Astronomia's `solar.apparentLongitude()`
- More accurate terminator at all times of year (current GMST calc drifts over seasons)

### 4. Satellite trails

- When a satellite is selected: draw its last 10 minutes of propagated ECEF positions as a `THREE.Line`
- Vertex colors fading from `0x4ade80` (lime, bright) at current position to transparent at tail
- Recomputed on selection, updated every 30s
- New method `Globe.showTrail(satrec)`, cleared by `Globe.clearSelection()`

### 5. Dot quality by type

Using the `object_type` from the existing `_classify_satellite()` function:
- GEO satellites (altitude > 30,000 km): dot size `1.5×` base
- Debris: dot size `0.6×` base, slightly dimmer color
- Payloads: base size (current default)

This requires reading altitude from the propagated position, not the TLE directly.

---

## Architecture after Session 17

Unchanged from Session 16 — all changes are frontend visual only. No new backend endpoints needed.

---

## Tech decisions for Session 17

- `clouds.matteason.co.uk` — free cloud imagery service (browser fetch, CORS enabled)
- `astronomia` npm package — pure JS, no Python dependency
- NASA star map — static texture asset (download once, bundle or host on S3)
- `THREE.AdditiveBlending` for clouds — prevents the cloud layer from darkening the globe surface
- Satellite trails use ECEF (not ECI) — trails show where satellite was over Earth's surface

---

## Verification checklist before ending Session 17

- [ ] Cloud layer visible over globe, transparent over oceans/land, updates every ~3h
- [ ] Star field replaced with NASA Gaia DR2 texture — visibly denser and higher quality
- [ ] Terminator line correct for current date/time (test at solstice edge cases)
- [ ] ISS trail visible when selected — fades from lime to transparent over last 10 min
- [ ] Debris dots visibly smaller/dimmer than payload dots
- [ ] GEO satellites visibly larger dots than LEO
- [ ] All existing tests still pass after changes
