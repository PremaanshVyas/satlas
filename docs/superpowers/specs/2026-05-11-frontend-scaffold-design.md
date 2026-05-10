# Frontend Scaffold Design — Aussie Sky

**Date:** 2026-05-11
**Status:** Approved
**Scope:** `apps/web` — initial scaffold, 3D globe with ISS, deployed to Vercel

---

## What we're building

The week-1 deliverable: a Vite + React + TypeScript + Tailwind app with a split-panel layout — a live Three.js globe on the left (65% width) and a static agent panel placeholder on the right (35%). The globe renders Earth with an accurate day/night terminator using NASA Blue Marble and Black Marble textures. The ISS appears as a glowing dot with its full orbit arc visible by default; the arc is the visual treatment for the "selected" state that all future satellites will use.

The agent panel is a styled shell only this session. No Claude API wiring.

---

## Layout

Two-column CSS layout occupying the full viewport, no scroll.

```
┌─────────────────────────────────┬──────────────────┐
│                                 │                  │
│           GlobeView             │   AgentPanel     │
│             (65%)               │     (35%)        │
│         Three.js canvas         │  "AI agent —     │
│         fills the pane          │  coming soon"    │
│                                 │                  │
└─────────────────────────────────┴──────────────────┘
```

---

## File structure

```
apps/web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.ts
├── public/
│   └── textures/
│       ├── earth-day.jpg        # NASA Blue Marble (2048×1024 or 4096×2048)
│       └── earth-night.jpg      # NASA Black Marble (city lights)
└── src/
    ├── main.tsx
    ├── App.tsx                  # Split layout shell
    ├── components/
    │   ├── GlobeView.tsx        # Mounts canvas, owns Three.js lifecycle
    │   └── AgentPanel.tsx       # Static placeholder shell
    ├── globe/
    │   ├── Globe.ts             # Renderer, camera, scene, animation loop
    │   ├── EarthMesh.ts         # Sphere + ShaderMaterial + texture loading
    │   ├── SatelliteMesh.ts     # Glowing dot + orbit arc Line geometry
    │   └── shaders/
    │       ├── earth.vert.glsl  # Passes UV + normal to fragment shader
    │       └── earth.frag.glsl  # Blends day/night textures by sun angle
    ├── hooks/
    │   └── useGlobe.ts          # React hook: init Globe, handle resize, cleanup
    └── lib/
        └── solar.ts             # Computes sun direction Vector3 from UTC time
```

---

## Architecture

### `Globe.ts`

Owns the Three.js scene graph and animation loop. On construction:
- Creates `WebGLRenderer`, `PerspectiveCamera`, `Scene`
- Instantiates `EarthMesh` and `SatelliteMesh`, adds both to scene
- Adds no lights — Earth lighting is handled entirely in the custom shader; the satellite dot uses `MeshBasicMaterial` which also ignores Three.js lights

On each `requestAnimationFrame` tick:
1. Compute current UTC time → call `solar.getSunDirection(date)` → update `EarthMesh` sun direction uniform
2. Propagate ISS TLE via `satellite.js` → ECI position → geodetic → 3D Cartesian on unit sphere → update `SatelliteMesh` dot position
3. Render scene

Exposes `mount(canvas: HTMLCanvasElement)`, `unmount()`, `resize(w, h)`.

### `EarthMesh.ts`

Creates a `SphereGeometry` (64×64 segments) with a `ShaderMaterial`. Loads two textures via `THREE.TextureLoader`. The material has three uniforms:

| Uniform | Type | Purpose |
|---|---|---|
| `dayTexture` | `sampler2D` | NASA Blue Marble |
| `nightTexture` | `sampler2D` | NASA Black Marble |
| `sunDirection` | `vec3` | World-space direction toward the sun |

The fragment shader computes `dot(normalize(vNormal), sunDirection)` to get a [-1, 1] day/night value, remaps it to [0, 1] with a smooth transition band (~5° width to avoid a hard edge), and mixes the two textures. Night side gets a brightness boost on the city lights to make them pop.

Exposes `update(sunDirection: THREE.Vector3)`.

### `SatelliteMesh.ts`

Takes a `satelliteRecord` (parsed TLE from `satellite.js`) on construction.

**Dot:** `SphereGeometry(0.008, 8, 8)` with a `MeshBasicMaterial` in bright yellow (`#facc15`). Glow is achieved with a second, slightly larger sphere (`0.014` radius) using a `MeshBasicMaterial` at ~20% opacity in the same colour — a simple halo that doesn't require a custom shader or extra texture. Both spheres are grouped.

**Orbit arc:** On init, propagates the TLE at 90 evenly-spaced intervals across one orbital period (computed from the TLE's mean motion). Each propagated ECI position is converted to a unit-sphere Cartesian point. These 90 points become a `BufferGeometry` drawn as `LineLoop` with a `LineBasicMaterial` in semi-transparent yellow (`#facc1580`). The arc is recalculated every 60 seconds (the ISS orbital period is ~92 min; this keeps the arc accurate without being expensive).

Exposes `update(date: Date)` — propagates current position, moves dot mesh.

### `solar.ts`

Returns a `THREE.Vector3` pointing from Earth's center toward the sun, in the same coordinate system as the globe (ECEF-aligned, Y-up). Uses a simplified solar position formula accurate to within ~1° — sufficient for a visual terminator. No external dependency needed.

```ts
export function getSunDirection(date: Date): THREE.Vector3
```

### `useGlobe.ts`

React hook. Takes a `ref` to a container `<div>`. On mount:
- Creates a `<canvas>`, appends to the div
- Instantiates `Globe`, calls `mount(canvas)`
- Sets up `ResizeObserver` to call `globe.resize()`

On unmount: calls `globe.unmount()`, removes canvas. Returns nothing — the globe is self-contained.

### `GlobeView.tsx`

```tsx
const containerRef = useRef<HTMLDivElement>(null)
useGlobe(containerRef)
return <div ref={containerRef} className="w-full h-full" />
```

### `AgentPanel.tsx`

Static shell. Dark sidebar, vertically centred placeholder text:

```
AI agent
coming soon
```

Styled to match the dark space aesthetic (`bg-gray-950`, muted text). Input area blocked out at the bottom for visual continuity.

### `App.tsx`

```tsx
<div className="flex h-screen w-screen bg-gray-950 overflow-hidden">
  <div className="flex-[65]"><GlobeView /></div>
  <div className="flex-[35] border-l border-gray-800"><AgentPanel /></div>
</div>
```

---

## Key dependencies

| Package | Purpose |
|---|---|
| `three` | 3D engine |
| `@types/three` | TypeScript types |
| `satellite.js` | SGP4 TLE propagation |
| `@types/satellite.js` | TypeScript types |

No `suncalc`, no `three-globe`, no other globe library.

---

## Textures

NASA Blue Marble and Black Marble are public domain (NASA open data). Download the 2048×1024 versions for the scaffold (4K later). Store in `public/textures/` so Vite serves them as static assets. Do not commit the texture files to git — add to `.gitignore` and note the download URLs in the README.

- **Blue Marble (day):** https://visibleearth.nasa.gov/images/73909/december-blue-marble-next-generation-w-topography
- **Black Marble (night):** https://visibleearth.nasa.gov/images/144898/earth-at-night-black-marble-2016-color-maps

For Vercel deployment, use `public/` bundling for MVP (textures ship with the build). Move to S3/CloudFront in V1 to keep the bundle lean.

---

## Hardcoded ISS TLE

```
ISS (ZARYA)
1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993
2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522
```

The TLE epoch doesn't need to be current for the scaffold — SGP4 will still propagate a reasonable position. Replace with a live fetch from CelesTrak in V1.

---

## Testing

| Test | What it covers |
|---|---|
| `solar.test.ts` | `getSunDirection` returns a unit vector; at known dates, sun is in expected hemisphere |
| `satellite.test.ts` | Given the hardcoded TLE, `propagate()` returns a position within LEO altitude bounds |
| `App.test.tsx` | App renders without crashing (smoke test) |

Use Vitest (ships with Vite ecosystem, same config).

---

## Deployment

Vercel, free tier. Project root is `aussie-sky/`, output directory is `apps/web/dist`. Add a `vercel.json` at the repo root:

```json
{
  "buildCommand": "cd apps/web && npm install && npm run build",
  "outputDirectory": "apps/web/dist",
  "framework": null
}
```

---

## Out of scope this session

- Agent panel wired to Claude API (next session)
- Fetching live TLE from CelesTrak
- More than one satellite
- Atmosphere shader / bloom post-processing
- Globe auto-rotation (user controls camera with OrbitControls)
- Mobile layout
