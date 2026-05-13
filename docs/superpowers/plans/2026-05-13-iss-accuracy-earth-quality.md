# Session 8 — ISS Accuracy Fix + High-Quality Earth Rendering

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the ISS position accuracy (root cause: 30-min stale TLE serves wrong position by up to 13,800 km) and replace blurry 501 KB textures with NASA 8K/4K Blue Marble + Black Marble, and add atmospheric glow and star field for satellitetracker3d-level visual quality.

**Architecture:**
- Backend adds a separate 5-min ISS TLE cache that bypasses the 30-min catalog cache; `/tle/iss` calls the new `get_iss_tle()` function directly.
- Frontend Globe fetches `/tle/iss` on mount and every 2 minutes (independent of 30-min catalog refresh), ensuring the ISS TLE is never more than 5 minutes stale (≤ 2,300 km position error, down from 13,800 km).
- Rendering: Earth sphere tessellation raised to 128 segments, textures replaced with NASA 8K day + 4K night, anisotropic filtering enabled, atmosphere mesh added as a slightly larger transparent sphere using a Fresnel rim shader, star field added as a large inverted sphere.

**Tech Stack:** Python 3.11 / skyfield / httpx (backend); Three.js / TypeScript / GLSL (frontend); NASA Visible Earth + Black Marble 2016 (textures); pytest / Vitest (tests).

---

## Files

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/orbital/satellites.py` | Add `_iss_cache` (5-min TTL) + `get_iss_tle()` |
| Modify | `apps/orbital/main.py` | `/tle/iss` calls `get_iss_tle()` not `get_satellites()` |
| Modify | `apps/orbital/tests/test_satellites.py` | Tests for `get_iss_tle()` + cache isolation |
| Modify | `apps/web/src/lib/celestrak.ts` | Add `fetchIssTle(baseUrl)` → `{tle1, tle2}` |
| Modify | `apps/web/src/globe/Globe.ts` | Fetch fresh ISS TLE on mount + every 2 min |
| Modify | `apps/web/src/globe/EarthMesh.ts` | 8K textures, anisotropy, 128-seg sphere, load atmosphere |
| Modify | `apps/web/src/globe/shaders/earth.frag.glsl` | Improved day/night blend with specular ocean sheen |
| Create | `apps/web/src/globe/AtmosphereMesh.ts` | Atmospheric rim glow (Fresnel) |
| Create | `apps/web/src/globe/shaders/atmosphere.vert.glsl` | Atmosphere vertex shader |
| Create | `apps/web/src/globe/shaders/atmosphere.frag.glsl` | Atmosphere fragment shader |
| Create | `apps/web/src/globe/StarField.ts` | Background stars (inverted sphere) |
| Replace | `apps/web/public/textures/earth-day.jpg` | NASA Blue Marble 8192×4096 |
| Replace | `apps/web/public/textures/earth-night.jpg` | NASA Black Marble 4096×2048 |

---

## Task 1: Backend — Fresh ISS TLE cache

**Root cause:** `/tle/iss` calls `get_satellites()` which returns whatever is in the 30-min catalog cache. The ISS moves 7.66 km/s × 1800 s = 13,788 km in 30 min — nearly 1/3 orbit. Position appears on wrong continent.

**Fix:** Separate `_iss_cache` dict with 5-min TTL; `get_iss_tle()` fetches directly from CelesTrak CATNR=25544 (confirmed not IP-blocked on Railway).

**Files:** `apps/orbital/satellites.py`, `apps/orbital/main.py`

- [ ] **Step 1.1 — Write failing test for `get_iss_tle()`**

Add to `apps/orbital/tests/test_satellites.py`:

```python
import pytest
import time
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_get_iss_tle_returns_tle_lines():
    """get_iss_tle() returns a dict with tle1 and tle2 strings."""
    from satellites import get_iss_tle, _iss_cache

    mock_resp = (
        "ISS (ZARYA)\n"
        "1 25544U 98067A   26133.54791667  .00016717  00000-0  10270-3 0  9993\n"
        "2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522\n"
    )
    with patch('satellites.httpx.AsyncClient') as mock_client_cls:
        mock_resp_obj = AsyncMock()
        mock_resp_obj.text = mock_resp
        mock_resp_obj.raise_for_status = lambda: None
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp_obj)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_cls.return_value = mock_client

        # Reset cache so fetch is triggered
        _iss_cache['tle'] = None
        _iss_cache['fetched_at'] = 0.0

        result = await get_iss_tle()

    assert result['tle1'].startswith('1 25544')
    assert result['tle2'].startswith('2 25544')


@pytest.mark.asyncio
async def test_get_iss_tle_uses_cache_within_ttl():
    """get_iss_tle() does NOT re-fetch if cache is fresh (< 5 min old)."""
    from satellites import get_iss_tle, _iss_cache

    _iss_cache['tle'] = {
        'tle1': '1 25544U 98067A   26133.00000000  .00016717  00000-0  10270-3 0  9993',
        'tle2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
    }
    _iss_cache['fetched_at'] = time.time()  # just now

    with patch('satellites.httpx.AsyncClient') as mock_client_cls:
        result = await get_iss_tle()
        mock_client_cls.assert_not_called()  # must NOT have hit the network

    assert result['tle1'] == _iss_cache['tle']['tle1']


@pytest.mark.asyncio
async def test_get_iss_tle_refetches_after_ttl():
    """get_iss_tle() re-fetches when cache is older than ISS_TLE_TTL_SECONDS."""
    from satellites import get_iss_tle, _iss_cache, ISS_TLE_TTL_SECONDS

    _iss_cache['tle'] = {
        'tle1': '1 25544U 98067A   26133.00000000  .00016717  00000-0  10270-3 0  9993',
        'tle2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
    }
    _iss_cache['fetched_at'] = time.time() - (ISS_TLE_TTL_SECONDS + 1)

    fresh_text = (
        "ISS (ZARYA)\n"
        "1 25544U 98067A   26133.99999999  .00016717  00000-0  10270-3 0  9993\n"
        "2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522\n"
    )
    with patch('satellites.httpx.AsyncClient') as mock_client_cls:
        mock_resp_obj = AsyncMock()
        mock_resp_obj.text = fresh_text
        mock_resp_obj.raise_for_status = lambda: None
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp_obj)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_cls.return_value = mock_client

        result = await get_iss_tle()
        mock_client_cls.assert_called_once()

    assert '99999999' in result['tle1']
```

- [ ] **Step 1.2 — Run tests to confirm they fail**

```bash
cd apps/orbital && python -m pytest tests/test_satellites.py::test_get_iss_tle_returns_tle_lines tests/test_satellites.py::test_get_iss_tle_uses_cache_within_ttl tests/test_satellites.py::test_get_iss_tle_refetches_after_ttl -v
```

Expected: `ImportError` or `AttributeError` — `get_iss_tle` and `_iss_cache` don't exist yet.

- [ ] **Step 1.3 — Implement `get_iss_tle()` + `_iss_cache` in `satellites.py`**

Add after `_cache` definition (around line 21):

```python
ISS_TLE_TTL_SECONDS = 5 * 60   # 5-minute cache for ISS TLE specifically

_iss_cache: dict = {'tle': None, 'fetched_at': 0.0}


async def get_iss_tle() -> dict:
    """Return a fresh ISS TLE, cached for at most ISS_TLE_TTL_SECONDS (5 min)."""
    now = time.time()
    if _iss_cache['tle'] and now - _iss_cache['fetched_at'] < ISS_TLE_TTL_SECONDS:
        return _iss_cache['tle']

    tle = await _fetch_iss_tle()
    _iss_cache['tle'] = {'tle1': tle['tle1'], 'tle2': tle['tle2']}
    _iss_cache['fetched_at'] = now
    return _iss_cache['tle']
```

- [ ] **Step 1.4 — Update `main.py` `/tle/iss` endpoint**

Replace the existing `/tle/iss` handler:

```python
from satellites import get_satellites, get_iss_tle   # add get_iss_tle to import
```

```python
@app.get('/tle/iss')
async def get_iss_tle_endpoint() -> dict[str, str]:
    try:
        return await get_iss_tle()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'ISS TLE fetch failed: {e}')
```

- [ ] **Step 1.5 — Run tests to confirm all pass**

```bash
cd apps/orbital && python -m pytest tests/test_satellites.py -v
```

Expected: All satellite tests pass (including the 3 new ones).

- [ ] **Step 1.6 — Commit**

```bash
git add apps/orbital/satellites.py apps/orbital/main.py apps/orbital/tests/test_satellites.py
git commit -m "fix: separate 5-min ISS TLE cache so /tle/iss bypasses 30-min catalog cache"
```

---

## Task 2: Frontend — Fresh ISS TLE on mount + 2-min refresh

**Files:** `apps/web/src/lib/celestrak.ts`, `apps/web/src/globe/Globe.ts`

- [ ] **Step 2.1 — Add `fetchIssTle` to `celestrak.ts`**

```typescript
export async function fetchIssTle(baseUrl: string): Promise<{ tle1: string; tle2: string }> {
  const response = await fetch(`${baseUrl}/tle/iss`)
  if (!response.ok) throw new Error(`ISS TLE fetch failed: ${response.status}`)
  return response.json() as Promise<{ tle1: string; tle2: string }>
}
```

- [ ] **Step 2.2 — Write test for `fetchIssTle`**

Add to `apps/web/src/lib/celestrak.test.ts`:

```typescript
describe('fetchIssTle', () => {
  it('returns tle1 and tle2 on success', async () => {
    const { fetchIssTle } = await import('./celestrak')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tle1: '1 25544U 98067A   26133.54791667  .00016717  00000-0  10270-3 0  9993',
        tle2: '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
      }),
    } as Response)

    const result = await fetchIssTle('http://localhost:8000')
    expect(result.tle1).toMatch(/^1 25544/)
    expect(result.tle2).toMatch(/^2 25544/)
  })

  it('throws on non-ok response', async () => {
    const { fetchIssTle } = await import('./celestrak')
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response)
    await expect(fetchIssTle('http://localhost:8000')).rejects.toThrow('503')
  })
})
```

- [ ] **Step 2.3 — Run frontend tests to confirm new tests fail**

```bash
cd apps/web && npx vitest run src/lib/celestrak.test.ts
```

Expected: The two new `fetchIssTle` tests fail (import exists, no function yet).

- [ ] **Step 2.4 — Run frontend tests to confirm they pass after Step 2.1**

```bash
cd apps/web && npx vitest run src/lib/celestrak.test.ts
```

Expected: All celestrak tests pass.

- [ ] **Step 2.5 — Update `Globe.ts` to fetch fresh ISS TLE on mount + every 2 min**

Add these fields to the class:
```typescript
private issTleInterval: ReturnType<typeof setInterval> | null = null
```

Add a new private method:
```typescript
private async refreshIssTle(): Promise<void> {
  const baseUrl = import.meta.env.VITE_ORBITAL_SERVICE_URL ?? 'http://localhost:8000'
  try {
    const { tle1, tle2 } = await fetchIssTle(baseUrl)
    if (this.mounted) this.iss.updateTle(tle1, tle2)
  } catch {
    // silent — ISS keeps its current TLE
  }
}
```

In `mount()`, after `void this.initCatalog(onReady)`:
```typescript
void this.refreshIssTle()
this.issTleInterval = setInterval(() => void this.refreshIssTle(), 2 * 60 * 1000)
```

In `unmount()`:
```typescript
if (this.issTleInterval !== null) {
  clearInterval(this.issTleInterval)
  this.issTleInterval = null
}
```

Also add the import at the top:
```typescript
import { fetchSatelliteCatalog, fetchIssTle } from '../lib/celestrak'
```

- [ ] **Step 2.6 — Commit**

```bash
git add apps/web/src/lib/celestrak.ts apps/web/src/globe/Globe.ts
git commit -m "feat: fetch fresh ISS TLE on mount and every 2 min independent of catalog"
```

---

## Task 3: Download high-resolution NASA textures

**Goal:** Replace `earth-day.jpg` (501 KB, blurry) with NASA Blue Marble 8192×4096 (~25 MB) and `earth-night.jpg` (186 KB) with NASA Black Marble 4096×2048. Both are public domain.

**Files:** `apps/web/public/textures/earth-day.jpg`, `apps/web/public/textures/earth-night.jpg`

- [ ] **Step 3.1 — Download NASA Blue Marble 8K day texture**

```bash
curl -L \
  "https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74117/world.200408.3x8192x4096.jpg" \
  -o apps/web/public/textures/earth-day.jpg \
  --progress-bar
```

Expected: File is ~20-25 MB. If NASA CDN is unavailable, use:
```bash
curl -L \
  "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x8192x4096.jpg" \
  -o apps/web/public/textures/earth-day.jpg \
  --progress-bar
```

- [ ] **Step 3.2 — Download NASA Black Marble 4K night texture**

```bash
curl -L \
  "https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144897/BlackMarble_2016_3km_geo_gray.jpg" \
  -o apps/web/public/textures/earth-night.jpg \
  --progress-bar
```

If unavailable, use the 2016 Black Marble composite:
```bash
curl -L \
  "https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg" \
  -o apps/web/public/textures/earth-night.jpg \
  --progress-bar
```

- [ ] **Step 3.3 — Verify files downloaded correctly**

```bash
ls -lh apps/web/public/textures/
```

Expected: `earth-day.jpg` > 10 MB; `earth-night.jpg` > 3 MB.

- [ ] **Step 3.4 — Commit textures**

```bash
git add apps/web/public/textures/earth-day.jpg apps/web/public/textures/earth-night.jpg
git commit -m "feat: replace textures with NASA Blue Marble 8K day and Black Marble 4K night"
```

---

## Task 4: Improve EarthMesh — texture quality settings + higher tessellation

**Root cause of blurriness:** Three.js `TextureLoader` defaults to bilinear filtering and no anisotropy. On a high-DPI display at close zoom, the texture interpolation smears details. Anisotropic filtering (typically 16×) and trilinear mipmapping fix this at near-zero GPU cost.

**Files:** `apps/web/src/globe/EarthMesh.ts`

- [ ] **Step 4.1 — Rewrite `EarthMesh.ts` with high-quality texture settings**

```typescript
import * as THREE from 'three'
import vertexShader from './shaders/earth.vert.glsl?raw'
import fragmentShader from './shaders/earth.frag.glsl?raw'

export class EarthMesh {
  readonly mesh: THREE.Mesh
  private material: THREE.ShaderMaterial
  private dayTex: THREE.Texture
  private nightTex: THREE.Texture

  constructor(renderer: THREE.WebGLRenderer) {
    // 128×64 segments vs 64×64: smoother limb curve visible at close zoom
    const geometry = new THREE.SphereGeometry(1, 128, 64)
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
    const loader = new THREE.TextureLoader()

    this.dayTex = loader.load('/textures/earth-day.jpg')
    this.dayTex.anisotropy = maxAnisotropy
    this.dayTex.minFilter = THREE.LinearMipmapLinearFilter
    this.dayTex.magFilter = THREE.LinearFilter
    this.dayTex.colorSpace = THREE.SRGBColorSpace

    this.nightTex = loader.load('/textures/earth-night.jpg')
    this.nightTex.anisotropy = maxAnisotropy
    this.nightTex.minFilter = THREE.LinearMipmapLinearFilter
    this.nightTex.magFilter = THREE.LinearFilter
    this.nightTex.colorSpace = THREE.SRGBColorSpace

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: this.dayTex },
        nightTexture: { value: this.nightTex },
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
    this.dayTex.dispose()
    this.nightTex.dispose()
  }
}
```

- [ ] **Step 4.2 — Update `Globe.ts` to pass `renderer` to `EarthMesh`**

Change the Earth construction line in `mount()`:
```typescript
this.earth = new EarthMesh(this.renderer)
```

- [ ] **Step 4.3 — Improve earth fragment shader for better visual**

Replace `apps/web/src/globe/shaders/earth.frag.glsl`:

```glsl
uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec3 sunDirection;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  float cosAngle = dot(normalize(vNormal), normalize(sunDirection));

  // Wider twilight band (smoothstep -0.2 → 0.2) for realistic dawn/dusk
  float blend = smoothstep(-0.2, 0.2, cosAngle);

  vec4 day = texture2D(dayTexture, vUv);

  // Night: city lights brightened; slight blue tint for atmosphere scatter
  vec4 night = texture2D(nightTexture, vUv) * 3.0;
  night.rgb = mix(night.rgb, night.rgb * vec3(0.8, 0.85, 1.0), 0.4);

  gl_FragColor = mix(night, day, blend);
}
```

- [ ] **Step 4.4 — Commit**

```bash
git add apps/web/src/globe/EarthMesh.ts apps/web/src/globe/Globe.ts apps/web/src/globe/shaders/earth.frag.glsl
git commit -m "feat: enable anisotropic filtering, 128-seg sphere, improved night shader"
```

---

## Task 5: Atmospheric glow mesh

**Goal:** A slightly larger translucent sphere rendered with additive blending, brightened at the limb using Fresnel (dot(viewDir, normal) ≈ 0 = edge = bright). This creates the blue rim glow visible on real Earth from space.

**Files:** Create `apps/web/src/globe/AtmosphereMesh.ts`, `apps/web/src/globe/shaders/atmosphere.vert.glsl`, `apps/web/src/globe/shaders/atmosphere.frag.glsl`; modify `Globe.ts`.

- [ ] **Step 5.1 — Create `atmosphere.vert.glsl`**

```glsl
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-worldPos.xyz);
  gl_Position = projectionMatrix * worldPos;
}
```

- [ ] **Step 5.2 — Create `atmosphere.frag.glsl`**

```glsl
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  // Fresnel: 1 at edge (normal ⊥ view), 0 at centre (normal ∥ view)
  float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
  float intensity = pow(fresnel, 3.5) * 1.2;

  // Atmospheric blue — matches Earth's Rayleigh scattering colour
  vec3 atmosphereColor = vec3(0.25, 0.55, 1.0);

  gl_FragColor = vec4(atmosphereColor * intensity, intensity * 0.7);
}
```

- [ ] **Step 5.3 — Create `AtmosphereMesh.ts`**

```typescript
import * as THREE from 'three'
import vertexShader from './shaders/atmosphere.vert.glsl?raw'
import fragmentShader from './shaders/atmosphere.frag.glsl?raw'

export class AtmosphereMesh {
  readonly mesh: THREE.Mesh

  constructor() {
    // Slightly larger than the Earth (radius 1.015 vs Earth radius 1.0)
    const geometry = new THREE.SphereGeometry(1.015, 128, 64)
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.FrontSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.mesh = new THREE.Mesh(geometry, material)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
```

- [ ] **Step 5.4 — Add `AtmosphereMesh` to `Globe.ts`**

Add import:
```typescript
import { AtmosphereMesh } from './AtmosphereMesh'
```

Add private field:
```typescript
private atmosphere!: AtmosphereMesh
```

In `mount()` after `this.scene.add(this.earth.mesh)`:
```typescript
this.atmosphere = new AtmosphereMesh()
this.scene.add(this.atmosphere.mesh)
```

In `unmount()` before `this.renderer.dispose()`:
```typescript
this.atmosphere.dispose()
```

- [ ] **Step 5.5 — Commit**

```bash
git add apps/web/src/globe/AtmosphereMesh.ts apps/web/src/globe/shaders/atmosphere.vert.glsl apps/web/src/globe/shaders/atmosphere.frag.glsl apps/web/src/globe/Globe.ts
git commit -m "feat: add atmospheric rim glow via Fresnel shader"
```

---

## Task 6: Star field background

**Goal:** Background stars using `THREE.Points` — a sphere of randomly distributed point stars with slight colour variation. Rendered behind everything (depthWrite false, large radius).

**Files:** Create `apps/web/src/globe/StarField.ts`; modify `Globe.ts`.

- [ ] **Step 6.1 — Create `StarField.ts`**

```typescript
import * as THREE from 'three'

const STAR_COUNT = 8000
const STAR_RADIUS = 50

export class StarField {
  readonly points: THREE.Points

  constructor() {
    const positions = new Float32Array(STAR_COUNT * 3)
    const colors = new Float32Array(STAR_COUNT * 3)

    for (let i = 0; i < STAR_COUNT; i++) {
      // Uniform distribution on sphere surface via rejection sampling
      let x, y, z, len
      do {
        x = Math.random() * 2 - 1
        y = Math.random() * 2 - 1
        z = Math.random() * 2 - 1
        len = Math.sqrt(x * x + y * y + z * z)
      } while (len > 1 || len < 0.001)
      const r = STAR_RADIUS / len
      positions[i * 3]     = x * r
      positions[i * 3 + 1] = y * r
      positions[i * 3 + 2] = z * r

      // Slight colour variation: mostly white, occasional warm/cool tints
      const tint = Math.random()
      if (tint < 0.15) {
        colors[i * 3] = 0.9; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 1.0  // blue-white
      } else if (tint < 0.25) {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.75 // orange-warm
      } else {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 1.0; colors[i * 3 + 2] = 1.0  // pure white
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })

    this.points = new THREE.Points(geometry, material)
  }

  dispose(): void {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
  }
}
```

- [ ] **Step 6.2 — Add `StarField` to `Globe.ts`**

Add import:
```typescript
import { StarField } from './StarField'
```

Add private field:
```typescript
private stars!: StarField
```

In `mount()` before `this.tick()`:
```typescript
this.stars = new StarField()
this.scene.add(this.stars.points)
```

In `unmount()`:
```typescript
this.stars.dispose()
```

- [ ] **Step 6.3 — Run all frontend tests to confirm nothing broke**

```bash
cd apps/web && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6.4 — Commit**

```bash
git add apps/web/src/globe/StarField.ts apps/web/src/globe/Globe.ts
git commit -m "feat: add star field background with colour variation"
```

---

## Task 7: Run full test suite + update CLAUDE.md

- [ ] **Step 7.1 — Run all backend tests**

```bash
cd apps/orbital && python -m pytest -v
```

Expected: All tests pass (count should be ≥ 62).

- [ ] **Step 7.2 — Run all frontend tests**

```bash
cd apps/web && npx vitest run
```

Expected: All tests pass (count should be ≥ 24).

- [ ] **Step 7.3 — Update CLAUDE.md active scope section**

In the "Active scope" section update:
```markdown
**Current phase:** MVP shipped. ISS accuracy fixed (5-min TLE cache), high-quality NASA 8K/4K textures, atmosphere + stars added.

**Next milestone:** Session 9 — click-to-select satellite, category filter toggles.

**Session 8 tasks (ISS accuracy + Earth visual quality):**
- [x] Backend: separate 5-min ISS TLE cache; /tle/iss bypasses 30-min catalog cache
- [x] Frontend: fetch fresh ISS TLE on mount + every 2 min
- [x] Replace 501KB textures with NASA Blue Marble 8K + Black Marble 4K
- [x] Enable anisotropic filtering + trilinear mipmaps on Earth textures
- [x] Raise sphere tessellation to 128×64
- [x] Improve earth fragment shader (wider twilight, bluer night)
- [x] Add atmospheric rim glow (Fresnel shader, additive blend)
- [x] Add star field (8,000 points, colour variation)
- [x] Update CLAUDE.md
```

Also add to Decisions log:
```markdown
- **2026-05-13 — Session 8: ISS accuracy root cause and fix.** Root cause: `/tle/iss` called `get_satellites()` which served data from the 30-min catalog cache. ISS velocity 7.66 km/s × 1800 s = 13,788 km drift = nearly 1/3 orbit error. Fix: `get_iss_tle()` with a separate 5-min cache that calls `_fetch_iss_tle()` (CelesTrak CATNR, confirmed not IP-blocked on Railway). Frontend fetches `/tle/iss` on mount and every 2 min, independent of 30-min catalog refresh. Position error now ≤ 2,300 km (5 min × 7.66 km/s × 60). Rule: never share cache TTL between ISS real-time position and bulk catalog; they have different accuracy requirements.

- **2026-05-13 — Session 8: Texture quality upgrade.** Replaced 501 KB / 186 KB compressed textures with NASA Blue Marble 8192×4096 (day) and NASA Black Marble 4096×2048 (night). Three.js configured with `anisotropy = maxAnisotropy` (typically 16×) and `LinearMipmapLinearFilter` (trilinear filtering). Sphere tessellation raised from 64×32 to 128×64 for smoother limb curve at close zoom. These textures are ~25 MB and ~5 MB respectively; acceptable for a CDN-served portfolio project but would need lazy loading or texture streaming for a production app.

- **2026-05-13 — Session 8: Atmosphere + star field.** Atmosphere: a separate mesh at radius 1.015 using a Fresnel rim shader (additive blending, no depth write). Star field: 8,000 THREE.Points uniformly distributed on a sphere of radius 50, with white/blue-white/warm colour variation. Both are purely visual and have no interaction with satellite propagation or chat.
```

- [ ] **Step 7.4 — Commit CLAUDE.md**

```bash
git add CLAUDE.md
git commit -m "docs: document session 8 ISS accuracy fix and visual quality upgrades"
```

---

## Validation Checklist

Before declaring complete:
- [ ] ISS on our tracker visually matches Heavens-Above (https://heavens-above.com) within one visible segment at our zoom level
- [ ] Earth texture is sharp when zoomed to minimum camera distance (1.3)
- [ ] Blue atmosphere glow visible on the globe limb
- [ ] Stars visible in the background
- [ ] All 62+ backend tests pass
- [ ] All 24+ frontend tests pass
- [ ] No console errors in the browser
