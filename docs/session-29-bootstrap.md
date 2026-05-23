# Session 29 bootstrap — for Session 30

Paste this at the start of the next chat alongside CLAUDE.md.

---

## Where we left off

Session 29 polished the border/map mode that was built in Session 28. Most things are working but the **country highlight fill is disabled** — only the bright cyan border line shows for selected countries. The fill had a fundamental WebGL depth-test bug that wasn't resolved this session.

---

## What works right now

- **Border mode toggle** (`Borders` button, top-right): switches globe from photorealistic to dark map style (dark ocean, navy country fills, lat/lon graticule, country border lines).
- **Country click** (in border mode): bright cyan border line appears around selected country. CountryPanel opens on left showing overhead satellites.
- **Country hover** (in border mode, no satellite under cursor): tooltip shows country name (no altitude row).
- **Label visibility**: zoom-based threshold (large countries ~2.5, small ~1.5 camera distance). No labels at default zoom (3.5).
- **Label screen burn fix**: hiding `labelRenderer.domElement` when border mode is off.
- **Photo mode**: restored correctly when toggling borders off (clouds, day/night shader, no fill artifacts).

---

## The open bug: CountryHighlightMesh fill

**File:** `apps/web/src/globe/CountryHighlightMesh.ts`

**Current state:** Fill is completely disabled. Only `BORDER_R = 1.004` line segments are drawn.

**Root cause (documented):** Any flat WebGL triangle with vertices on a sphere at radius r=1.0022 will have its interior chord pass through the sphere (r=1.0) when the triangle spans more than ~7.5° of arc. The interior of such triangles is "below" the Earth surface from the camera's perspective, failing the depth test against the opaque Earth mesh. Result: only the triangle's edges (touching the sphere surface) are visible — producing a ring artifact instead of solid fill.

**Two approaches tried this session, both reverted:**

1. **earcut on flat (lon/lat)** — Large countries (Australia) get interior earcut triangles spanning the full country (30°+). Interior black, edges show as cyan ring.
2. **Centroid fan triangulation** — Radial edges (centroid→coastline vertex) are ~15-20° long, same depth problem. Produces starburst spike artifacts.

**The correct fix for Session 30:**

**Option A (recommended): Edge subdivision before earcut**
```typescript
// In CountryHighlightMesh.update():
function subdivideRing(ring: number[][], maxDeg = 4): number[][] {
  // For each edge, if angular arc length > maxDeg, insert SLERP intermediate points
  // SLERP: convert (lon,lat) → 3D unit vector, interpolate on sphere, convert back
  // Skip edges crossing antimeridian (|Δlon| > 180)
}
```
After subdivision, run earcut on the denser ring. The earcut interior triangles will also be smaller because the ear-clipping algorithm uses nearby vertices more often with dense boundaries.

**BUT CAUTION**: earcut's interior triangles for large countries can still span the full width even with a subdivided boundary (the ear-clipping algorithm can create "long diagonal" triangles connecting non-adjacent boundary vertices). You may also need to add interior Steiner points or use recursive triangle splitting: after earcut, check each output triangle — if any edge > 5°, split at centroid.

**Option B: Fan triangulation with subdivided radial edges**
```typescript
// Fan from centroid, but subdivide each radial edge too
// For each fan triangle (center, v_i, v_{i+1}):
//   Insert intermediate points along center→v_i and center→v_{i+1} (SLERP)
//   This creates many small sub-triangles along the radial direction
```

**Option C (simplest for concave polygons): d3-geo tessellation**
Import `d3-geo`'s `geoTessellate` or use `d3-contour` approaches. d3-geo handles spherical geometry natively and can produce a pre-subdivided polygon.

**Recommended approach:** Start with Option A (subdivide edges to 4°, run earcut). If interior triangles are still too large, add a post-process: for each output triangle, check all 3 edges; if any edge is > 5°, recursively split by inserting the centroid of that triangle as a new vertex. This is bounded (each split creates 3 smaller triangles; recursion stops when all edges < 5°).

**Key formula:**
```
arc_length_deg(p0, p1) = acos(dot(p0_3d, p1_3d)) * 180 / π
chord_midpoint_r = r_highlight * cos(arc_length_rad / 2)
safe_threshold = 2 * acos(r_earth / r_highlight) ≈ 7.5° at r=1.0022
```

---

## Other polish items for Session 30 (lower priority than fill fix)

1. **Country fill opacity** — once the fill works, use opacity ~0.3 (subtle, doesn't overwhelm the border lines)
2. **Label zoom thresholds** — may need tuning after fill works (labels should not show before you can see individual countries)
3. **V2 direction** — vision pipeline, orbit history, Go gateway, or more agent tools. Now that map mode is mostly working, this is the real Session 30 decision.

---

## Files to read at session start

- `apps/web/src/globe/CountryHighlightMesh.ts` — the broken fill file (currently border-only)
- `apps/web/src/globe/Globe.ts` — `setBordersVisible`, `_initCountryLabels`, `_updateLabelVisibility`, mousemove handler
- `apps/web/src/globe/CountryFillMesh.ts` — reference for correct earcut approach (works for background fill because dark navy on dark background hides the depth artifacts)
- `apps/web/src/globe/CountryBorderMesh.ts` — reference for border approach

---

## Current stack state

- Tests: all passing (run `npm test` in `apps/web`)
- TypeScript: clean (`npx tsc --noEmit` passes)
- Deployed: latest commit pushed to main → Vercel auto-deploys frontend
- No infra changes needed for fill fix
