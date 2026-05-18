# Frontend Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold `apps/web` as a Vite + React + TypeScript + Tailwind app with a split-panel layout, a Three.js globe with an accurate GLSL day/night terminator, and a glowing ISS dot with orbit arc deployed to Vercel.

**Architecture:** A React shell provides the 65/35 split layout. `Globe.ts` owns the Three.js scene, camera, and `requestAnimationFrame` loop. `EarthMesh.ts` renders Earth with a custom `ShaderMaterial` that blends NASA day/night textures based on a real-time sun direction uniform. `SatelliteMesh.ts` propagates the hardcoded ISS TLE via `satellite.js` each frame and renders a glowing dot plus a `LineLoop` orbit arc.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Tailwind CSS 3, Three.js, satellite.js 4, Vitest

---

### Task 1: Scaffold `apps/web`

**Files:**
- Create: `apps/web/` (Vite project)
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.ts`
- Create: `apps/web/src/index.css`
- Create: `apps/web/src/test-setup.ts`

- [ ] **Step 1: Scaffold the Vite project**

Run from the repo root (`satlas/`):
```bash
npm create vite@latest apps/web -- --template react-ts
```
Expected: `apps/web/` created with React + TypeScript scaffold.

- [ ] **Step 2: Install dependencies**

```bash
cd apps/web && npm install
npm install three satellite.js
npm install -D tailwindcss postcss autoprefixer vitest jsdom @testing-library/react @testing-library/jest-dom @types/three
```
Expected: `node_modules/` populated, no errors. `satellite.js` v4 bundles its own TypeScript types.

- [ ] **Step 3: Initialise Tailwind**

```bash
npx tailwindcss init -p
```
This creates `tailwind.config.js` and `postcss.config.js`. Delete them and create typed versions:

`apps/web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

`apps/web/postcss.config.ts`:
```ts
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 4: Configure Vitest in `vite.config.ts`**

Replace `apps/web/vite.config.ts`:
```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

Create `apps/web/src/test-setup.ts`:
```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Replace `src/index.css`**

Replace `apps/web/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
```

- [ ] **Step 6: Verify the dev server starts**

```bash
npm run dev
```
Expected: Server at `http://localhost:5173`. Default Vite scaffold page loads. Stop with `Ctrl+C`.

- [ ] **Step 7: Commit**

```bash
git add apps/web && git commit -m "chore: scaffold apps/web with Vite, React, TS, Tailwind, Vitest"
```

---

### Task 2: App shell — split layout

**Files:**
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/App.test.tsx`
- Create: `apps/web/src/components/GlobeView.tsx`
- Create: `apps/web/src/components/AgentPanel.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Write the failing smoke test**

Create `apps/web/src/App.test.tsx`:
```tsx
import { render } from '@testing-library/react'
import App from './App'

vi.mock('./hooks/useGlobe', () => ({ useGlobe: vi.fn() }))

test('App renders without crashing', () => {
  const { container } = render(<App />)
  expect(container.firstChild).toBeTruthy()
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/App.test.tsx
```
Expected: FAIL — `Cannot find module './App'`

- [ ] **Step 3: Create the components**

`apps/web/src/components/GlobeView.tsx` (placeholder — wired up in Task 9):
```tsx
export default function GlobeView() {
  return <div className="w-full h-full" />
}
```

`apps/web/src/components/AgentPanel.tsx`:
```tsx
export default function AgentPanel() {
  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <span className="text-sm font-medium text-gray-300">AI agent</span>
        <span className="text-xs text-gray-600">coming soon</span>
      </div>
      <div className="border-t border-gray-800 p-4">
        <div className="bg-gray-900 rounded-lg px-4 py-3 text-xs text-gray-700 cursor-not-allowed select-none">
          Ask anything...
        </div>
      </div>
    </div>
  )
}
```

`apps/web/src/App.tsx`:
```tsx
import GlobeView from './components/GlobeView'
import AgentPanel from './components/AgentPanel'

export default function App() {
  return (
    <div className="flex h-screen w-screen bg-gray-950 overflow-hidden">
      <div className="flex-[65]">
        <GlobeView />
      </div>
      <div className="flex-[35] border-l border-gray-800">
        <AgentPanel />
      </div>
    </div>
  )
}
```

`apps/web/src/main.tsx` (replace the generated file entirely):
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/App.test.tsx
```
Expected: PASS — 1 test passed.

- [ ] **Step 5: Verify the layout in the browser**

```bash
npm run dev
```
Open `http://localhost:5173`. You should see a dark full-viewport screen split into a larger left pane and a right panel showing "AI agent / coming soon" with a greyed-out input area at the bottom. Stop with `Ctrl+C`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ && git commit -m "feat: app shell with 65/35 split layout and agent panel placeholder"
```

---

### Task 3: Sun direction — `solar.ts`

**Files:**
- Create: `apps/web/src/lib/solar.ts`
- Create: `apps/web/src/lib/solar.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/solar.test.ts`:
```ts
import { describe, test, expect } from 'vitest'
import * as THREE from 'three'
import { getSunDirection } from './solar'

describe('getSunDirection', () => {
  test('returns a unit vector', () => {
    const dir = getSunDirection(new Date('2024-06-21T12:00:00Z'))
    expect(dir.length()).toBeCloseTo(1.0, 4)
  })

  test('returns a THREE.Vector3', () => {
    expect(getSunDirection(new Date())).toBeInstanceOf(THREE.Vector3)
  })

  test('Y is positive at June solstice (sun north of equator)', () => {
    // At June solstice declination ≈ +23.4°, so Y (north) component must be positive
    const dir = getSunDirection(new Date('2024-06-21T00:00:00Z'))
    expect(dir.y).toBeGreaterThan(0)
  })

  test('Y is negative at December solstice (sun south of equator)', () => {
    const dir = getSunDirection(new Date('2024-12-21T00:00:00Z'))
    expect(dir.y).toBeLessThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/solar.test.ts
```
Expected: FAIL — `Cannot find module './solar'`

- [ ] **Step 3: Implement `solar.ts`**

Create `apps/web/src/lib/solar.ts`:
```ts
import * as THREE from 'three'

/**
 * Returns a unit vector pointing from Earth's centre toward the sun,
 * in Three.js world space (Y-up, prime meridian at +Z).
 * Accuracy: ~1° — sufficient for a visual day/night terminator.
 * Source: low-precision formulae from Astronomical Algorithms (Meeus).
 */
export function getSunDirection(date: Date): THREE.Vector3 {
  const JD = date.getTime() / 86400000 + 2440587.5
  const n = JD - 2451545.0 // days since J2000.0

  const L = (280.460 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * (Math.PI / 180)

  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * (Math.PI / 180)
  const epsilon = (23.439 - 0.0000004 * n) * (Math.PI / 180)

  // ECI (J2000) direction
  const xECI = Math.cos(lambda)
  const yECI = Math.cos(epsilon) * Math.sin(lambda)
  const zECI = Math.sin(epsilon) * Math.sin(lambda)

  // Rotate ECI → ECEF via Greenwich Mean Sidereal Time
  const GMST =
    ((280.46061837 + 360.98564736629 * (JD - 2451545.0)) % 360) * (Math.PI / 180)
  const cosG = Math.cos(GMST)
  const sinG = Math.sin(GMST)
  const xECEF = xECI * cosG + yECI * sinG
  const yECEF = -xECI * sinG + yECI * cosG
  const zECEF = zECI

  // ECEF → Three.js world space for a default SphereGeometry (Y-up):
  //   ECEF X (equator, 0°E)  → Three.js +Z
  //   ECEF Y (equator, 90°E) → Three.js -X
  //   ECEF Z (north pole)    → Three.js +Y
  return new THREE.Vector3(-yECEF, zECEF, xECEF).normalize()
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/solar.test.ts
```
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ && git commit -m "feat: solar position formula for day/night terminator"
```

---

### Task 4: NASA textures

**Files:**
- Create: `apps/web/public/textures/earth-day.jpg`
- Create: `apps/web/public/textures/earth-night.jpg`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p apps/web/public/textures
```

- [ ] **Step 2: Download the textures**

Visit each page and download the **2048×1024 JPEG** version. Save to the paths below.

- **Blue Marble (day):** https://visibleearth.nasa.gov/images/73909/december-blue-marble-next-generation-w-topography
  Save as: `apps/web/public/textures/earth-day.jpg`

- **Black Marble (night):** https://visibleearth.nasa.gov/images/144898/earth-at-night-black-marble-2016-color-maps
  Save as: `apps/web/public/textures/earth-night.jpg`

Both are NASA public domain — safe to commit.

- [ ] **Step 3: Verify the files are present**

```bash
ls -lh apps/web/public/textures/
```
Expected:
```
-rw-r--r--  earth-day.jpg    1–3M
-rw-r--r--  earth-night.jpg  1–3M
```

- [ ] **Step 4: Commit the textures**

```bash
git add apps/web/public/textures/ && git commit -m "chore: add NASA Blue Marble and Black Marble textures"
```

---

### Task 5: GLSL shaders

**Files:**
- Create: `apps/web/src/globe/shaders/earth.vert.glsl`
- Create: `apps/web/src/globe/shaders/earth.frag.glsl`

- [ ] **Step 1: Create the shaders directory**

```bash
mkdir -p apps/web/src/globe/shaders
```

- [ ] **Step 2: Write the vertex shader**

Create `apps/web/src/globe/shaders/earth.vert.glsl`:
```glsl
varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

- [ ] **Step 3: Write the fragment shader**

Create `apps/web/src/globe/shaders/earth.frag.glsl`:
```glsl
uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec3 sunDirection;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  // 1.0 = full day, -1.0 = full night
  float cosAngle = dot(normalize(vNormal), normalize(sunDirection));

  // Smooth ~10° blend band around the terminator
  float blend = smoothstep(-0.1, 0.1, cosAngle);

  vec4 day = texture2D(dayTexture, vUv);
  // Boost city lights so they're visible against the dark night texture
  vec4 night = texture2D(nightTexture, vUv) * 2.5;

  gl_FragColor = mix(night, day, blend);
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/globe/shaders/ && git commit -m "feat: GLSL shaders for day/night Earth blending"
```

---

### Task 6: EarthMesh

**Files:**
- Create: `apps/web/src/globe/EarthMesh.ts`

Visual correctness is verified in the browser in Task 9; no unit test is practical without a WebGL context.

- [ ] **Step 1: Create `EarthMesh.ts`**

Create `apps/web/src/globe/EarthMesh.ts`:
```ts
import * as THREE from 'three'
import vertexShader from './shaders/earth.vert.glsl?raw'
import fragmentShader from './shaders/earth.frag.glsl?raw'

export class EarthMesh {
  readonly mesh: THREE.Mesh
  private material: THREE.ShaderMaterial

  constructor() {
    const geometry = new THREE.SphereGeometry(1, 64, 64)
    const loader = new THREE.TextureLoader()

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: loader.load('/textures/earth-day.jpg') },
        nightTexture: { value: loader.load('/textures/earth-night.jpg') },
        sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader,
      fragmentShader,
    })

    this.mesh = new THREE.Mesh(geometry, this.material)
  }

  update(sunDirection: THREE.Vector3): void {
    this.material.uniforms.sunDirection.value.copy(sunDirection)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/globe/EarthMesh.ts && git commit -m "feat: EarthMesh with GLSL day/night ShaderMaterial"
```

---

### Task 7: ISS TLE propagation + SatelliteMesh

> **Note on TLE epoch:** The hardcoded TLE is from March 2024. SGP4 propagation degrades meaningfully past a few days of age, so the displayed ISS position will be visibly wrong against reality — it is **symbolic for the scaffold**, not accurate. This is intentional for week 1. A live TLE fetch from CelesTrak is a **V1 requirement**, not an optional nice-to-have.

**Files:**
- Create: `apps/web/src/globe/satellite.test.ts`
- Create: `apps/web/src/globe/SatelliteMesh.ts`

- [ ] **Step 1: Write the TLE propagation tests**

Create `apps/web/src/globe/satellite.test.ts`:
```ts
import { describe, test, expect } from 'vitest'
import * as satellite from 'satellite.js'

const TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
const TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'

describe('ISS TLE propagation', () => {
  test('parses TLE without error', () => {
    const satrec = satellite.twoline2satrec(TLE1, TLE2)
    expect(satrec.error).toBe(0)
  })

  test('propagates to a position within LEO altitude bounds', () => {
    const satrec = satellite.twoline2satrec(TLE1, TLE2)
    // Date close to TLE epoch (2024-03-27) to minimise propagation error
    const posVel = satellite.propagate(satrec, new Date('2024-03-27T13:08:00Z'))
    expect(typeof posVel.position).not.toBe('boolean')

    const pos = posVel.position as { x: number; y: number; z: number }
    // ISS orbits at ~400 km. Earth radius ~6371 km → expect 6500–6900 km
    const radiusKm = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2)
    expect(radiusKm).toBeGreaterThan(6500)
    expect(radiusKm).toBeLessThan(6900)
  })
})
```

- [ ] **Step 2: Run tests — they should pass immediately**

`satellite.js` is already installed; these tests exercise the library.
```bash
npx vitest run src/globe/satellite.test.ts
```
Expected: PASS — 2 tests passed.

- [ ] **Step 3: Create `SatelliteMesh.ts`**

Create `apps/web/src/globe/SatelliteMesh.ts`:
```ts
import * as THREE from 'three'
import * as satellite from 'satellite.js'

export class SatelliteMesh {
  readonly group: THREE.Group
  private dot: THREE.Mesh
  private halo: THREE.Mesh
  private arc: THREE.LineLoop
  private satrec: satellite.SatRec
  private lastArcDate: Date | null = null

  constructor(tle1: string, tle2: string) {
    this.satrec = satellite.twoline2satrec(tle1, tle2)
    this.group = new THREE.Group()

    this.dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
    )

    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.2 }),
    )

    this.arc = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(this.computeArcPoints(new Date())),
      new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.5 }),
    )

    this.group.add(this.dot, this.halo, this.arc)
  }

  private toThreePosition(date: Date): THREE.Vector3 | null {
    const posVel = satellite.propagate(this.satrec, date)
    if (typeof posVel.position === 'boolean') return null

    const gmst = satellite.gstime(date)
    const geo = satellite.eciToGeodetic(
      posVel.position as satellite.EciVec3<number>,
      gmst,
    )

    const lat = geo.latitude  // radians
    const lon = geo.longitude // radians
    const r = 1.06            // slightly above unit sphere surface

    // Geodetic → Three.js world space (Y-up, prime meridian at +Z).
    // Matches the ECEF→Three.js mapping in solar.ts.
    return new THREE.Vector3(
      -r * Math.cos(lat) * Math.sin(lon),
       r * Math.sin(lat),
       r * Math.cos(lat) * Math.cos(lon),
    )
  }

  private computeArcPoints(date: Date): THREE.Vector3[] {
    // satrec.no is mean motion in rad/min; one period = 2π / no
    const periodMs = (2 * Math.PI / this.satrec.no) * 60 * 1000
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= 90; i++) {
      const t = new Date(date.getTime() + (i / 90) * periodMs)
      const pos = this.toThreePosition(t)
      if (pos) points.push(pos)
    }
    return points
  }

  update(date: Date): void {
    const pos = this.toThreePosition(date)
    if (pos) {
      this.dot.position.copy(pos)
      this.halo.position.copy(pos)
    }

    const shouldRecompute =
      this.lastArcDate === null ||
      date.getTime() - this.lastArcDate.getTime() > 60_000
    if (shouldRecompute) {
      this.lastArcDate = date
      this.arc.geometry.setFromPoints(this.computeArcPoints(date))
    }
  }

  dispose(): void {
    this.dot.geometry.dispose()
    this.halo.geometry.dispose()
    this.arc.geometry.dispose()
    ;(this.dot.material as THREE.Material).dispose()
    ;(this.halo.material as THREE.Material).dispose()
    ;(this.arc.material as THREE.Material).dispose()
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/globe/ && git commit -m "feat: SatelliteMesh with glowing ISS dot and orbit arc"
```

---

### Task 8: Globe class

**Files:**
- Create: `apps/web/src/globe/Globe.ts`

The Globe class wires the Three.js scene together. No unit test is practical for WebGL rendering — visual verification happens in Task 9.

- [ ] **Step 1: Create `Globe.ts`**

Create `apps/web/src/globe/Globe.ts`:
```ts
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EarthMesh } from './EarthMesh'
import { SatelliteMesh } from './SatelliteMesh'
import { getSunDirection } from '../lib/solar'

const ISS_TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
const ISS_TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'

export class Globe {
  private renderer!: THREE.WebGLRenderer
  private camera!: THREE.PerspectiveCamera
  private scene!: THREE.Scene
  private controls!: OrbitControls
  private earth!: EarthMesh
  private iss!: SatelliteMesh
  private rafId: number | null = null

  mount(canvas: HTMLCanvasElement): void {
    const { clientWidth: w, clientHeight: h } = canvas

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setSize(w, h, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    this.camera.position.set(0, 0, 2.5)

    this.scene = new THREE.Scene()

    this.earth = new EarthMesh()
    this.scene.add(this.earth.mesh)

    this.iss = new SatelliteMesh(ISS_TLE1, ISS_TLE2)
    this.scene.add(this.iss.group)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 1.3
    this.controls.maxDistance = 8
    this.controls.autoRotate = false

    this.tick()
  }

  private tick(): void {
    this.rafId = requestAnimationFrame(() => this.tick())
    const now = new Date()
    this.earth.update(getSunDirection(now))
    this.iss.update(now)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  unmount(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.controls.dispose()
    this.earth.dispose()
    this.iss.dispose()
    this.renderer.dispose()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/globe/Globe.ts && git commit -m "feat: Globe class with Three.js scene, OrbitControls, and animation loop"
```

---

### Task 9: Wire GlobeView + full integration check

**Files:**
- Create: `apps/web/src/hooks/useGlobe.ts`
- Modify: `apps/web/src/components/GlobeView.tsx`

- [ ] **Step 1: Create `useGlobe.ts`**

Create `apps/web/src/hooks/useGlobe.ts`:
```ts
import { useEffect, RefObject } from 'react'
import { Globe } from '../globe/Globe'

export function useGlobe(containerRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block'
    container.appendChild(canvas)

    const globe = new Globe()
    globe.mount(canvas)

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      globe.resize(width, height)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      globe.unmount()
      canvas.remove()
    }
  }, [])
}
```

- [ ] **Step 2: Update `GlobeView.tsx`**

Replace `apps/web/src/components/GlobeView.tsx`:
```tsx
import { useRef } from 'react'
import { useGlobe } from '../hooks/useGlobe'

export default function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null)
  useGlobe(containerRef)
  return <div ref={containerRef} className="w-full h-full" />
}
```

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```
Expected: All tests pass — App smoke test, 4 solar tests, 2 satellite propagation tests.

- [ ] **Step 4: Verify visually in the browser**

```bash
npm run dev
```
Open `http://localhost:5173`. Confirm all of the following:
1. Earth globe is visible in the left 65% pane
2. Day/night terminator is visible — lit day side, dark night side with glowing city lights
3. ISS appears as a bright yellow dot
4. A semi-transparent yellow orbit arc traces the full ISS orbital path
5. Mouse drag rotates the globe; scroll zooms in/out; no auto-rotation
6. Resizing the browser window keeps the globe filling its pane

Stop with `Ctrl+C`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/ apps/web/src/components/GlobeView.tsx && git commit -m "feat: wire Three.js globe into React via useGlobe hook"
```

---

### Task 10: Vercel deployment

**Files:**
- Create: `vercel.json` (repo root)

- [ ] **Step 1: Create `vercel.json`**

Create `satlas/vercel.json`:
```json
{
  "buildCommand": "cd apps/web && npm install && npm run build",
  "outputDirectory": "apps/web/dist",
  "framework": null
}
```

- [ ] **Step 2: Verify the build passes locally**

```bash
cd apps/web && npm run build
```
Expected: `apps/web/dist/` created with `index.html` and bundled JS/CSS. No TypeScript errors. The `dist/` directory is in `.gitignore` — do not commit it.

- [ ] **Step 3: Commit `vercel.json`**

```bash
cd .. && git add vercel.json && git commit -m "chore: add Vercel deployment config"
```

- [ ] **Step 4: Deploy to Vercel**

If you don't have the Vercel CLI:
```bash
npm install -g vercel
```

From the repo root:
```bash
vercel
```

When prompted:
- Set up and deploy: **Y**
- Link to existing project: **N**
- Project name: `satlas`
- Directory: `./` (repo root — `vercel.json` controls the build)

Vercel runs the build command and prints a preview URL on success.

- [ ] **Step 5: Verify the deployed URL**

Open the Vercel URL. Confirm the globe renders, terminator is visible, and the ISS dot + arc are present. If the textures don't load, verify that `apps/web/public/textures/` was committed (Task 4 Step 4).
