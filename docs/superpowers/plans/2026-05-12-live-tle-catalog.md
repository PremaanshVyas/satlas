# Live TLE Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded ISS with a live catalog of ~1000+ satellites fetched from CelesTrak, propagated in a web worker, and rendered as one Three.js InstancedMesh.

**Architecture:** Python backend fetches CelesTrak GP JSON and caches it in-memory (4h TTL). A new `/satellites` FastAPI endpoint exposes the catalog. The frontend fetches from `/satellites`, spawns a Vite module worker that builds SGP4 satrecs and propagates positions per tick (10fps), and renders the full field in a single InstancedMesh draw call. ISS keeps its existing SatelliteMesh with arc, halo, and pulse. Globe fires an `onReady` callback when the worker is loaded, surfacing a loading overlay in GlobeView.

**Tech Stack:** Python httpx, FastAPI, satellite.js, Three.js InstancedMesh, Vite module workers, pytest + asyncio mock, Vitest

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/orbital/satellites.py` | Create | CelesTrak fetch + 4h in-memory cache |
| `apps/orbital/tests/test_satellites.py` | Create | pytest tests with mocked httpx |
| `apps/orbital/requirements.txt` | Modify | add `httpx==0.27.0` |
| `apps/orbital/main.py` | Modify | add `GET /satellites` endpoint |
| `apps/web/src/lib/celestrak.ts` | Create | `TLERecord` type + `fetchSatelliteCatalog()` |
| `apps/web/src/lib/celestrak.test.ts` | Create | Vitest tests for the fetch function |
| `apps/web/src/workers/propagator.worker.ts` | Create | Web Worker: init satrecs → propagate per tick |
| `apps/web/src/globe/SatelliteField.ts` | Create | InstancedMesh wrapper for the full catalog |
| `apps/web/src/globe/Globe.ts` | Modify | wire catalog fetch, worker, SatelliteField, onReady |
| `apps/web/src/hooks/useGlobe.ts` | Modify | return `{ isLoading }`, pass `onReady` to Globe |
| `apps/web/src/components/GlobeView.tsx` | Modify | loading overlay while catalog initialises |

---

### Task 1: Backend — satellites.py + requirements.txt

**Files:**
- Create: `apps/orbital/satellites.py`
- Create: `apps/orbital/tests/test_satellites.py`
- Modify: `apps/orbital/requirements.txt`

- [ ] **Step 1: Add httpx to requirements.txt**

Open `apps/orbital/requirements.txt`. Replace its contents with:

```
fastapi==0.111.0
uvicorn[standard]==0.30.0
skyfield==1.49
httpx==0.27.0
```

- [ ] **Step 2: Write failing tests**

Create `apps/orbital/tests/test_satellites.py`:

```python
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import satellites


def setup_function():
    satellites._cache['tles'] = []
    satellites._cache['fetched_at'] = 0.0


SAMPLE_API_RESPONSE = [
    {
        'OBJECT_NAME': 'ISS (ZARYA)',
        'NORAD_CAT_ID': '25544',
        'TLE_LINE1': '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993',
        'TLE_LINE2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
    },
    {
        'OBJECT_NAME': 'STARLINK-1',
        'NORAD_CAT_ID': '44713',
        'TLE_LINE1': '1 44713U 19074A   24087.54791667  .00001000  00000-0  10000-3 0  9990',
        'TLE_LINE2': '2 44713  53.0000 100.0000 0001000  50.0000 310.0000 15.06000000000001',
    },
]


def _make_mock_client(response_data):
    mock_resp = MagicMock()
    mock_resp.json.return_value = response_data
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


class TestGetSatellites:
    def test_returns_list_of_tle_records(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_satellites())

        assert isinstance(result, list)
        assert len(result) == 2

    def test_record_has_required_fields(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_satellites())

        rec = result[0]
        assert rec['name'] == 'ISS (ZARYA)'
        assert rec['norad_id'] == '25544'
        assert 'tle1' in rec
        assert 'tle2' in rec

    def test_norad_id_is_string(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_satellites())

        assert isinstance(result[0]['norad_id'], str)

    def test_uses_cache_within_ttl(self):
        cached = [{'name': 'CACHED', 'norad_id': '99999', 'tle1': 'x', 'tle2': 'y'}]
        satellites._cache['tles'] = cached
        satellites._cache['fetched_at'] = time.time()

        with patch('satellites.httpx.AsyncClient') as MockClient:
            result = asyncio.run(satellites.get_satellites())
            MockClient.assert_not_called()

        assert result == cached

    def test_bypasses_cache_when_expired(self):
        satellites._cache['tles'] = [{'name': 'OLD', 'norad_id': '00000', 'tle1': 'x', 'tle2': 'y'}]
        satellites._cache['fetched_at'] = time.time() - (4 * 3600 + 1)

        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_satellites())

        assert result[0]['name'] == 'ISS (ZARYA)'

    def test_limit_applied_to_large_response(self):
        many_sats = [
            {
                'OBJECT_NAME': f'SAT-{i}',
                'NORAD_CAT_ID': str(i),
                'TLE_LINE1': '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993',
                'TLE_LINE2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
            }
            for i in range(satellites.LIMIT + 100)
        ]
        mock_client = _make_mock_client(many_sats)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_satellites())

        assert len(result) == satellites.LIMIT
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd apps/orbital && python -m pytest tests/test_satellites.py -v
```

Expected: `ModuleNotFoundError: No module named 'satellites'` or similar — module doesn't exist yet.

- [ ] **Step 4: Install httpx in the venv**

```bash
cd apps/orbital && pip install httpx==0.27.0
```

- [ ] **Step 5: Implement satellites.py**

Create `apps/orbital/satellites.py`:

```python
import time

import httpx

CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
CACHE_TTL_SECONDS = 4 * 3600
# CelesTrak active group returns ~11k objects. Cap at 1000 for MVP; increase to 2000+
# in the polish session once main-thread frame budget is confirmed acceptable.
LIMIT = 1000

_cache: dict = {'tles': [], 'fetched_at': 0.0}


async def get_satellites() -> list[dict]:
    now = time.time()
    if _cache['tles'] and now - _cache['fetched_at'] < CACHE_TTL_SECONDS:
        return _cache['tles']

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(CELESTRAK_URL)
        response.raise_for_status()
        data = response.json()

    tles = [
        {
            'name': item['OBJECT_NAME'],
            'norad_id': str(item['NORAD_CAT_ID']),
            'tle1': item['TLE_LINE1'],
            'tle2': item['TLE_LINE2'],
        }
        for item in data
    ][:LIMIT]

    _cache['tles'] = tles
    _cache['fetched_at'] = now
    return tles
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd apps/orbital && python -m pytest tests/test_satellites.py -v
```

Expected: 5 tests passing.

- [ ] **Step 7: Commit**

```bash
git add apps/orbital/satellites.py apps/orbital/tests/test_satellites.py apps/orbital/requirements.txt
git commit -m "feat: add satellites.py with CelesTrak fetch and 4h in-memory cache"
```

---

### Task 2: Backend endpoint — GET /satellites

**Files:**
- Modify: `apps/orbital/main.py`

- [ ] **Step 1: Write the endpoint test**

Append to `apps/orbital/tests/test_satellites.py` (add below the `TestGetSatellites` class):

```python
from fastapi.testclient import TestClient
from main import app


class TestSatellitesEndpoint:
    def test_returns_200_with_list(self):
        mock_tles = [{'name': 'ISS', 'norad_id': '25544', 'tle1': 'a', 'tle2': 'b'}]
        with patch('main.get_satellites', AsyncMock(return_value=mock_tles)):
            client = TestClient(app)
            response = client.get('/satellites')
        assert response.status_code == 200
        assert response.json() == mock_tles

    def test_returns_503_on_fetch_failure(self):
        with patch('main.get_satellites', AsyncMock(side_effect=Exception('network error'))):
            client = TestClient(app)
            response = client.get('/satellites')
        assert response.status_code == 503
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd apps/orbital && python -m pytest tests/test_satellites.py::TestSatellitesEndpoint -v
```

Expected: `AttributeError` or `ImportError` — endpoint doesn't exist yet.

- [ ] **Step 3: Add the /satellites endpoint to main.py**

Open `apps/orbital/main.py`. The current file is:

```python
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from passes import predict_passes

app = FastAPI(title='Aussie Sky Orbital Service')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['GET'],
    allow_headers=['*'],
)


@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/predict-passes')
async def get_passes(
    latitude: float = Query(..., ge=-90, le=90, description='Decimal degrees, south negative'),
    longitude: float = Query(..., ge=-180, le=180, description='Decimal degrees, west negative'),
    hours_ahead: int = Query(24, ge=1, le=168, description='Search window in hours (max 7 days)'),
) -> dict[str, list[dict]]:
    try:
        passes = predict_passes(latitude, longitude, hours_ahead)
        return {'passes': passes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

Replace it with:

```python
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from passes import predict_passes
from satellites import get_satellites

app = FastAPI(title='Aussie Sky Orbital Service')

# TODO: tighten allow_origins to the Vercel domain before V1 production
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['GET'],
    allow_headers=['*'],
)


@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/predict-passes')
async def get_passes(
    latitude: float = Query(..., ge=-90, le=90, description='Decimal degrees, south negative'),
    longitude: float = Query(..., ge=-180, le=180, description='Decimal degrees, west negative'),
    hours_ahead: int = Query(24, ge=1, le=168, description='Search window in hours (max 7 days)'),
) -> dict[str, list[dict]]:
    try:
        passes = predict_passes(latitude, longitude, hours_ahead)
        return {'passes': passes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/satellites')
async def get_satellite_catalog() -> list[dict]:
    try:
        return await get_satellites()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'CelesTrak fetch failed: {e}')
```

- [ ] **Step 4: Run all backend tests**

```bash
cd apps/orbital && python -m pytest tests/ -v
```

Expected: all tests passing (the new TestSatellitesEndpoint tests + original TestPredictPasses + TestAzToDirection).

- [ ] **Step 5: Commit**

```bash
git add apps/orbital/main.py apps/orbital/tests/test_satellites.py
git commit -m "feat: add GET /satellites endpoint that proxies CelesTrak GP catalog"
```

---

### Task 3: Frontend fetch — celestrak.ts + test

**Files:**
- Create: `apps/web/src/lib/celestrak.ts`
- Create: `apps/web/src/lib/celestrak.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/celestrak.test.ts`:

```typescript
import { describe, test, expect, vi, afterEach } from 'vitest'
import { fetchSatelliteCatalog } from './celestrak'
import type { TLERecord } from './celestrak'

describe('fetchSatelliteCatalog', () => {
  afterEach(() => vi.restoreAllMocks())

  test('fetches from baseUrl/satellites and returns TLERecord array', async () => {
    const mockData: TLERecord[] = [
      { name: 'ISS (ZARYA)', norad_id: '25544', tle1: '1 25544U ...', tle2: '2 25544 ...' },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      }),
    )

    const result = await fetchSatelliteCatalog('http://localhost:8000')

    expect(result).toEqual(mockData)
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/satellites')
  })

  test('throws when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    )

    await expect(fetchSatelliteCatalog('http://localhost:8000')).rejects.toThrow('503')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/web && npm run test:run -- src/lib/celestrak.test.ts
```

Expected: `Error: Failed to resolve import "./celestrak"` or similar.

- [ ] **Step 3: Implement celestrak.ts**

Create `apps/web/src/lib/celestrak.ts`:

```typescript
export interface TLERecord {
  name: string
  norad_id: string
  tle1: string
  tle2: string
}

export async function fetchSatelliteCatalog(baseUrl: string): Promise<TLERecord[]> {
  const response = await fetch(`${baseUrl}/satellites`)
  if (!response.ok) throw new Error(`Catalog fetch failed: ${response.status}`)
  return response.json() as Promise<TLERecord[]>
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/web && npm run test:run -- src/lib/celestrak.test.ts
```

Expected: 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/celestrak.ts apps/web/src/lib/celestrak.test.ts
git commit -m "feat: add TLERecord type and fetchSatelliteCatalog client"
```

---

### Task 4: Web Worker — propagator.worker.ts

**Files:**
- Create: `apps/web/src/workers/propagator.worker.ts`

Note: Web Workers cannot be meaningfully unit-tested in jsdom (no SharedArrayBuffer, no transferable). This task is implementation-only; correctness is verified visually in Task 8.

- [ ] **Step 1: Create the workers directory**

```bash
mkdir -p apps/web/src/workers
```

- [ ] **Step 2: Implement propagator.worker.ts**

Create `apps/web/src/workers/propagator.worker.ts`:

```typescript
/// <reference lib="webworker" />
import * as satellite from 'satellite.js'

import type { TLERecord } from '../lib/celestrak'

interface InitMessage {
  type: 'init'
  tles: TLERecord[]
}

interface TickMessage {
  type: 'tick'
  timestamp: number
}

type WorkerMessage = InitMessage | TickMessage

let satrecs: satellite.SatRec[] = []

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data

  if (msg.type === 'init') {
    satrecs = msg.tles.map(t => satellite.twoline2satrec(t.tle1, t.tle2))
    self.postMessage({ type: 'ready', count: satrecs.length })
    return
  }

  if (msg.type === 'tick') {
    const date = new Date(msg.timestamp)
    const gmst = satellite.gstime(date)
    const buffer = new Float32Array(satrecs.length * 3)

    satrecs.forEach((satrec, i) => {
      const posVel = satellite.propagate(satrec, date)
      if (typeof posVel.position === 'boolean') return

      const geo = satellite.eciToGeodetic(
        posVel.position as satellite.EciVec3<number>,
        gmst,
      )
      const lat = geo.latitude
      const lon = geo.longitude
      const r = 1.02

      buffer[i * 3] = -r * Math.cos(lat) * Math.sin(lon)
      buffer[i * 3 + 1] = r * Math.sin(lat)
      buffer[i * 3 + 2] = r * Math.cos(lat) * Math.cos(lon)
    })

    self.postMessage({ type: 'positions', buffer }, [buffer.buffer])
  }
}
```

Float32Array layout: `[x0, y0, z0, x1, y1, z1, ...]`. Positions where propagation fails remain `(0, 0, 0)` — hidden inside Earth's mesh. Positions are sent as a transferable (zero-copy transfer to main thread).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/workers/propagator.worker.ts
git commit -m "feat: add propagator web worker for SGP4 propagation at 10fps"
```

---

### Task 5: InstancedMesh wrapper — SatelliteField.ts

**Files:**
- Create: `apps/web/src/globe/SatelliteField.ts`

Note: Three.js requires WebGL; this class has no unit tests. Verified visually in Task 8.

- [ ] **Step 1: Implement SatelliteField.ts**

Create `apps/web/src/globe/SatelliteField.ts`:

Color note: the plan uses blue-400 (`0x60a5fa`) as a starting point. If the dots are hard to see against dark ocean during visual testing, bump to blue-300 (`0x93c5fd`) or pure white (`0xffffff`). Make the call based on what looks best — document your choice in a brief inline comment.

```typescript
import * as THREE from 'three'

export class SatelliteField {
  readonly mesh: THREE.InstancedMesh
  private dummy = new THREE.Object3D()

  constructor(count: number) {
    const geo = new THREE.SphereGeometry(0.005, 6, 6)
    // Radius 0.005 vs ISS dot at 0.008 — intentionally smaller so the field
    // reads as background catalog and ISS stays visually dominant.
    const mat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.7 })
    this.mesh = new THREE.InstancedMesh(geo, mat, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }

  update(buffer: Float32Array): void {
    const count = buffer.length / 3
    for (let i = 0; i < count; i++) {
      this.dummy.position.set(buffer[i * 3], buffer[i * 3 + 1], buffer[i * 3 + 2])
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
```

`THREE.DynamicDrawUsage` tells the GPU this buffer updates frequently (hint for driver optimisation). The `dummy` Object3D is a Three.js idiom for building instance matrices without allocating per-frame. Color `0x60a5fa` is Tailwind blue-400 — visually distinct from the ISS yellow.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/globe/SatelliteField.ts
git commit -m "feat: add SatelliteField InstancedMesh wrapper"
```

---

### Task 6: Globe wiring — fetch catalog, init worker, render field

**Files:**
- Modify: `apps/web/src/globe/Globe.ts`

- [ ] **Step 1: Rewrite Globe.ts**

Replace the entire contents of `apps/web/src/globe/Globe.ts` with:

```typescript
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EarthMesh } from './EarthMesh'
import { SatelliteMesh } from './SatelliteMesh'
import { SatelliteField } from './SatelliteField'
import { getSunDirection } from '../lib/solar'
import { fetchSatelliteCatalog } from '../lib/celestrak'

const ISS_TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
const ISS_TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'
const ISS_NORAD = '25544'
const FLY_DURATION_MS = 1500
const CAMERA_DISTANCE = 2.5
const FIELD_TICK_MS = 100

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export class Globe {
  private renderer!: THREE.WebGLRenderer
  private camera!: THREE.PerspectiveCamera
  private scene!: THREE.Scene
  private controls!: OrbitControls
  private earth!: EarthMesh
  private iss!: SatelliteMesh
  private field: SatelliteField | null = null
  private worker: Worker | null = null
  private lastFieldTickMs = 0
  private rafId: number | null = null

  private flyFromPos: THREE.Vector3 | null = null
  private flyToPos: THREE.Vector3 | null = null
  private flyStartTime: number | null = null

  mount(canvas: HTMLCanvasElement, onReady?: () => void): void {
    const w = canvas.clientWidth || canvas.width || 800
    const h = canvas.clientHeight || canvas.height || 600

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setSize(w, h, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    this.camera.position.set(0, 0, CAMERA_DISTANCE)

    this.scene = new THREE.Scene()

    this.earth = new EarthMesh()
    this.scene.add(this.earth.mesh)

    // ISS always initialised with hardcoded TLE so tick() never crashes
    // before the catalog arrives.
    this.iss = new SatelliteMesh(ISS_TLE1, ISS_TLE2)
    this.scene.add(this.iss.group)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 1.3
    this.controls.maxDistance = 8
    this.controls.autoRotate = false

    this.tick()
    void this.initCatalog(onReady)
  }

  private async initCatalog(onReady?: () => void): Promise<void> {
    const baseUrl = import.meta.env.VITE_ORBITAL_SERVICE_URL ?? 'http://localhost:8000'
    try {
      const tles = await fetchSatelliteCatalog(baseUrl)
      const others = tles.filter(t => t.norad_id !== ISS_NORAD)

      this.field = new SatelliteField(others.length)
      this.scene.add(this.field.mesh)

      this.worker = new Worker(
        new URL('../workers/propagator.worker.ts', import.meta.url),
        { type: 'module' },
      )
      this.worker.onmessage = (e: MessageEvent) => {
        const msg = e.data as { type: string; buffer?: Float32Array }
        if (msg.type === 'ready') {
          onReady?.()
        } else if (msg.type === 'positions' && msg.buffer && this.field) {
          this.field.update(msg.buffer)
        }
      }
      this.worker.postMessage({ type: 'init', tles: others })
    } catch {
      // Catalog unavailable — globe still works with ISS only.
      onReady?.()
    }
  }

  highlightSatellite(noradId: string): void {
    if (noradId !== ISS_NORAD) return

    const issPos = this.iss.getCurrentPosition()
    if (!issPos) return

    const dir = issPos.clone().normalize()
    this.flyFromPos = this.camera.position.clone()
    this.flyToPos = dir.multiplyScalar(CAMERA_DISTANCE)
    this.flyStartTime = performance.now()

    this.iss.startPulse()
  }

  private tick(): void {
    this.rafId = requestAnimationFrame(() => this.tick())
    const now = new Date()
    const nowMs = now.getTime()

    this.earth.update(getSunDirection(now))
    this.iss.update(now)

    if (this.worker && nowMs - this.lastFieldTickMs >= FIELD_TICK_MS) {
      this.lastFieldTickMs = nowMs
      this.worker.postMessage({ type: 'tick', timestamp: nowMs })
    }

    if (this.flyFromPos && this.flyToPos && this.flyStartTime !== null) {
      const elapsed = performance.now() - this.flyStartTime
      const t = Math.min(elapsed / FLY_DURATION_MS, 1)
      const eased = easeInOutCubic(t)
      this.camera.position.lerpVectors(this.flyFromPos, this.flyToPos, eased)
      if (t >= 1) {
        this.flyFromPos = null
        this.flyToPos = null
        this.flyStartTime = null
      }
    }

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
    this.worker?.terminate()
    this.worker = null
    this.controls.dispose()
    this.earth.dispose()
    this.iss.dispose()
    this.field?.dispose()
    this.renderer.dispose()
  }
}
```

Key design choices:
- `FIELD_TICK_MS = 100`: worker gets a tick message at 10fps, decoupled from the 60fps render loop. The worker runs off-main-thread, so slow propagation doesn't block rendering.
- `void this.initCatalog(onReady)`: the `void` operator suppresses the floating promise lint warning without needing a `.catch()` (errors are caught inside `initCatalog`).
- The fallback in `catch {}` calls `onReady?.()` so the loading overlay always clears even when the backend is down.

- [ ] **Step 2: Run TypeScript check**

```bash
cd apps/web && npm run build 2>&1 | head -30
```

Expected: build succeeds (no TypeScript errors). Fix any errors before proceeding.

- [ ] **Step 3: Run existing tests to confirm no regression**

```bash
cd apps/web && npm run test:run
```

Expected: all existing tests still pass (Globe mock in useGlobe.test.ts mocks `mount: vi.fn()` which accepts any arguments, so the new `onReady` parameter doesn't break it).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/globe/Globe.ts
git commit -m "feat: wire live TLE catalog, propagator worker, and SatelliteField into Globe"
```

---

### Task 7: Loading overlay — useGlobe.ts + GlobeView.tsx

**Files:**
- Modify: `apps/web/src/hooks/useGlobe.ts`
- Modify: `apps/web/src/components/GlobeView.tsx`

- [ ] **Step 1: Update useGlobe.ts**

Replace the entire contents of `apps/web/src/hooks/useGlobe.ts` with:

```typescript
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Globe } from '../globe/Globe'
import type { HighlightDirective } from '../types/chat'

export function useGlobe(
  containerRef: RefObject<HTMLDivElement | null>,
  highlight: HighlightDirective | null,
): { isLoading: boolean } {
  const [isLoading, setIsLoading] = useState(true)
  const globeRef = useRef<Globe | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block'
    container.appendChild(canvas)

    const globe = new Globe()
    globe.mount(canvas, () => setIsLoading(false))
    globeRef.current = globe

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      globe.resize(width, height)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      globe.unmount()
      globeRef.current = null
      canvas.remove()
    }
  }, [])

  useEffect(() => {
    if (highlight && globeRef.current) {
      globeRef.current.highlightSatellite(highlight.norad_id)
    }
  }, [highlight])

  return { isLoading }
}
```

- [ ] **Step 2: Update GlobeView.tsx**

Replace the entire contents of `apps/web/src/components/GlobeView.tsx` with:

```typescript
import { useRef } from 'react'
import { useGlobe } from '../hooks/useGlobe'
import type { HighlightDirective } from '../types/chat'

interface GlobeViewProps {
  highlight: HighlightDirective | null
}

export default function GlobeView({ highlight }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { isLoading } = useGlobe(containerRef, highlight)
  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 text-gray-400 text-sm tracking-wide">
          Loading satellite catalog…
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
cd apps/web && npm run test:run
```

Expected: all tests pass. The existing `useGlobe.test.ts` tests still work because:
1. `renderHook` wraps the hook in a React tree so `useState` works.
2. The Globe mock (`mount: vi.fn()`) accepts the new `onReady` argument silently — it just doesn't call it. So `isLoading` stays `true` in tests, which is fine since the tests don't assert on `isLoading`.

- [ ] **Step 4: TypeScript check**

```bash
cd apps/web && npm run build 2>&1 | head -30
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useGlobe.ts apps/web/src/components/GlobeView.tsx
git commit -m "feat: expose isLoading from useGlobe and add catalog loading overlay in GlobeView"
```

---

### Task 8: Deploy and verify

**Manual steps — no automated tests. Verify visually.**

- [ ] **Step 1: Add VITE_ORBITAL_SERVICE_URL to Vercel**

In the Vercel dashboard → Project settings → Environment variables, add:

```
VITE_ORBITAL_SERVICE_URL = https://<your-railway-url>
```

This must be set **before** the Vercel build runs, because Vite bakes `import.meta.env.*` at build time (not runtime).

Trigger a redeploy after saving the env var.

- [ ] **Step 2: Verify the Railway backend**

```bash
curl https://<your-railway-url>/health
# Expected: {"status":"ok"}

curl "https://<your-railway-url>/satellites" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} satellites, first: {d[0][\"name\"]}')"
# Expected: something like "6000 satellites, first: ISS (ZARYA)"
```

If Railway needs the updated image (httpx added), push a redeploy from the Railway dashboard or by re-pushing to the branch Railway tracks.

- [ ] **Step 3: Visual verification at aussie-sky.vercel.app**

Open the site. Verify:
1. The loading overlay ("Loading satellite catalog…") appears on first load.
2. Within 3–5 seconds the overlay disappears and the globe shows ~1000 blue dots orbiting.
3. ISS (yellow dot with arc) is still visible and distinct.
4. Chat still works: ask "when does the ISS pass over Melbourne?" → streaming answer.
5. Ask "show me where the ISS is" → camera flies to ISS, it pulses yellow.
6. Resize the browser window → globe resizes correctly.
7. **Performance check:** Open Chrome DevTools → Performance tab → record 3 seconds while the catalog is rendering → confirm main-thread frame times stay below 16ms (60fps budget). The Worker thread will be busy during tick propagation — that is expected and acceptable. Only the main-thread budget matters. If main-thread frames exceed 16ms, reduce `LIMIT` in `satellites.py` from 1000 to 500 and re-verify before declaring session 4 complete.

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`, under "Active scope":

- Tick off every session 4 task.
- Update "Last session ended at" to: `Session 4 complete. Live TLE catalog of ~1000 satellites rendering as InstancedMesh via web worker. Loading overlay clears when worker ready. ISS highlight, pulse, and pass prediction unchanged.`
- Update "Next milestone" to: `More agent tools — find_satellites_overhead and get_satellite_info. Click satellite → details panel.`
- Add to the session 4 decisions log entry: "First request after a Railway cold start blocks for 1–3 seconds while CelesTrak is fetched; the loading overlay absorbs this. Acceptable for MVP. Optimize with a startup pre-fetch or stale-while-revalidate pattern in V1 if traffic justifies it."
- Add to the session 4 decisions log entry: "CelesTrak active group returns ~11k objects; capped at LIMIT=1000 in `satellites.py` for MVP performance. Can increase to 2000+ in the polish session once main-thread frame budget is confirmed acceptable via DevTools."

- [ ] **Step 5: Update README.md**

In `README.md`, under "What's working now", tick:

```
- [x] Live TLE catalog (~1000 satellites, InstancedMesh + web worker propagation)
```

- [ ] **Step 6: Commit docs**

```bash
git add CLAUDE.md README.md
git commit -m "docs: session 4 complete — live catalog of 1000 satellites"
git push
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| CelesTrak GP JSON fetch | Task 1 — `satellites.py` |
| 4h in-memory cache | Task 1 — `_cache` dict with TTL check |
| httpx as async HTTP client | Task 1 — `httpx.AsyncClient` |
| `GET /satellites` endpoint | Task 2 — `main.py` |
| `TLERecord` type | Task 3 — `celestrak.ts` |
| `fetchSatelliteCatalog(baseUrl)` | Task 3 — `celestrak.ts` |
| Web Worker with init/tick protocol | Task 4 — `propagator.worker.ts` |
| Transferable Float32Array | Task 4 — `self.postMessage({...}, [buffer.buffer])` |
| InstancedMesh for field satellites | Task 5 — `SatelliteField.ts` |
| ISS preserved as SatelliteMesh | Task 6 — ISS always added in `mount()` |
| `onReady` loading callback | Task 6 — `initCatalog(onReady)` |
| `isLoading` exposed from useGlobe | Task 7 — `useState(true)`, returns `{ isLoading }` |
| Loading overlay in GlobeView | Task 7 — absolute-positioned overlay |
| Fallback when backend down | Task 6 — `catch {}` calls `onReady?.()` |
| 10fps throttle for field ticks | Task 6 — `FIELD_TICK_MS = 100` |
| `VITE_ORBITAL_SERVICE_URL` env var | Task 8 — manual Vercel step |

### Type consistency check

- `TLERecord` defined in `celestrak.ts`, imported in `propagator.worker.ts` (via `../lib/celestrak`) and `Globe.ts` (via `../lib/celestrak`). ✅
- `SatelliteField.update(buffer: Float32Array)` — called in Globe with `msg.buffer` which is typed `Float32Array | undefined`, guarded by `&& msg.buffer`. ✅
- `Globe.mount(canvas, onReady?)` — called by `useGlobe` with `() => setIsLoading(false)`. ✅
- `useGlobe` return type `{ isLoading: boolean }` — destructured in `GlobeView` as `const { isLoading }`. ✅
- Worker message types: `InitMessage` sends `tles: TLERecord[]`; `Globe` sends `{ type: 'init', tles: others }` where `others` is `TLERecord[]`. ✅
