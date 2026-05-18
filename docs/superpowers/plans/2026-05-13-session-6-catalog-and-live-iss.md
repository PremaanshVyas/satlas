# Session 6 — Live ISS TLE + CelesTrak Catalog Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two critical bugs: catalog filtering was excluding ISS/Hubble, and the ISS rendered on the globe uses a hardcoded March 2024 TLE.

**Architecture:**
- `satellites.py` switches to CelesTrak GROUP=active as the primary source (no restrictive MEAN_MOTION/ECCENTRICITY filters), with space-track.org as fallback. Both sources return the same GP JSON format — same parsing code applies.
- New `GET /tle/iss` FastAPI endpoint extracts the live ISS TLE from the catalog.
- `SatelliteMesh` gains an `updateTle(tle1, tle2)` method. `Globe.initCatalog` calls it once the catalog arrives, replacing the hardcoded March 2024 TLE.

**Tech Stack:** Python 3.9, FastAPI, httpx, skyfield; TypeScript, Three.js, satellite.js

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `apps/orbital/satellites.py` | New `_fetch_celestrak()`, `_fetch_spacetrack()` helpers; `get_satellites` tries CelesTrak first |
| Modify | `apps/orbital/tests/test_satellites.py` | Tests for new fetch helpers + fallback behaviour + `/tle/iss` endpoint |
| Modify | `apps/orbital/main.py` | New `GET /tle/iss` endpoint |
| Modify | `apps/web/src/globe/SatelliteMesh.ts` | Add `updateTle(tle1, tle2)` method |
| Modify | `apps/web/src/globe/Globe.ts` | Call `this.iss.updateTle()` after catalog arrives |

---

## Task 1: Refactor `satellites.py` — CelesTrak primary, space-track fallback

**Files:**
- Modify: `apps/orbital/satellites.py`
- Modify: `apps/orbital/tests/test_satellites.py`

### Background

Current `get_satellites()` always calls space-track.org. Its query filter (`MEAN_MOTION > 11.25, ECCENTRICITY < 0.25`) combined with `limit/1000/orderby/NORAD_CAT_ID` was producing a slice that excluded Hubble and possibly the ISS depending on catalog state. CelesTrak `GROUP=active` returns all operational satellites with no orbital filters — ISS (25544) and Hubble (20580) are guaranteed to be in it, both with NORAD IDs well within any 1000-record slice. CelesTrak IPs were previously blocked on Railway for the GROUP=active endpoint, but the User-Agent header fix resolves that.

**CelesTrak GP JSON format** (same field names as space-track — no parsing changes needed):
```
OBJECT_NAME, NORAD_CAT_ID (int), TLE_LINE1, TLE_LINE2
```

**New structure in `satellites.py`:**
- `_parse_gp(items: list[dict]) -> list[dict]` — shared parsing helper
- `_fetch_celestrak() -> list[dict]` — GET CelesTrak GROUP=active with User-Agent header
- `_fetch_spacetrack() -> list[dict]` — existing space-track auth + query logic, extracted
- `get_satellites()` — try `_fetch_celestrak`, on any exception fall back to `_fetch_spacetrack`

**Credentials change:** space-track credentials are only needed when CelesTrak fails. `_fetch_spacetrack` raises `ValueError` if they're missing — but `get_satellites` callers only see that error if CelesTrak also failed.

- [ ] **Step 1: Write failing tests for `_fetch_celestrak`**

Add to `apps/orbital/tests/test_satellites.py` (import `asyncio`, `patch`, `AsyncMock` already present):

```python
CELESTRAK_SAMPLE = [
    {
        'OBJECT_NAME': 'ISS (ZARYA)',
        'NORAD_CAT_ID': 25544,
        'TLE_LINE1': '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993',
        'TLE_LINE2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
    },
    {
        'OBJECT_NAME': 'HUBBLE',
        'NORAD_CAT_ID': 20580,
        'TLE_LINE1': '1 20580U 90037B   24087.54791667  .00001000  00000-0  10000-3 0  9990',
        'TLE_LINE2': '2 20580  28.4700 100.0000 0002800  50.0000 310.0000 15.09000000000001',
    },
]


class TestFetchCelesTrak:
    def test_returns_parsed_tle_list(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = CELESTRAK_SAMPLE
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_celestrak())

        assert len(result) == 2
        assert result[0]['name'] == 'ISS (ZARYA)'
        assert result[0]['norad_id'] == '25544'
        assert 'tle1' in result[0]
        assert 'tle2' in result[0]

    def test_sends_user_agent_header(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = CELESTRAK_SAMPLE
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            asyncio.run(satellites._fetch_celestrak())

        call_kwargs = mock_client.get.call_args
        headers = call_kwargs[1].get('headers') or call_kwargs[0][1] if len(call_kwargs[0]) > 1 else {}
        assert 'User-Agent' in headers

    def test_applies_limit(self):
        many = [
            {'OBJECT_NAME': f'SAT-{i}', 'NORAD_CAT_ID': i,
             'TLE_LINE1': CELESTRAK_SAMPLE[0]['TLE_LINE1'],
             'TLE_LINE2': CELESTRAK_SAMPLE[0]['TLE_LINE2']}
            for i in range(satellites.LIMIT + 50)
        ]
        mock_resp = MagicMock()
        mock_resp.json.return_value = many
        mock_resp.raise_for_status = MagicMock()
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)

        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_celestrak())

        assert len(result) == satellites.LIMIT
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
cd apps/orbital && python3 -m pytest tests/test_satellites.py::TestFetchCelesTrak -v
```

Expected: `AttributeError: module 'satellites' has no attribute '_fetch_celestrak'`

- [ ] **Step 3: Write failing tests for `get_satellites` fallback behavior**

Add to `tests/test_satellites.py`:

```python
SAMPLE_TLE_LIST = [
    {'name': 'ISS (ZARYA)', 'norad_id': '25544', 'tle1': 'a', 'tle2': 'b'},
]


class TestGetSatellitesFallback:
    def setup_method(self):
        satellites._cache['tles'] = []
        satellites._cache['fetched_at'] = 0.0

    def test_uses_celestrak_when_available(self):
        with patch('satellites._fetch_celestrak', AsyncMock(return_value=SAMPLE_TLE_LIST)), \
             patch('satellites._fetch_spacetrack', AsyncMock(side_effect=AssertionError('should not call spacetrack'))):
            result = asyncio.run(satellites.get_satellites())
        assert result == SAMPLE_TLE_LIST

    def test_falls_back_to_spacetrack_on_celestrak_failure(self):
        with patch('satellites._fetch_celestrak', AsyncMock(side_effect=Exception('blocked'))), \
             patch('satellites._fetch_spacetrack', AsyncMock(return_value=SAMPLE_TLE_LIST)):
            result = asyncio.run(satellites.get_satellites())
        assert result == SAMPLE_TLE_LIST

    def test_raises_if_both_sources_fail(self):
        with patch('satellites._fetch_celestrak', AsyncMock(side_effect=Exception('blocked'))), \
             patch('satellites._fetch_spacetrack', AsyncMock(side_effect=ValueError('no creds'))):
            with pytest.raises((Exception, ValueError)):
                asyncio.run(satellites.get_satellites())

    def test_caches_celestrak_result(self):
        with patch('satellites._fetch_celestrak', AsyncMock(return_value=SAMPLE_TLE_LIST)) as mock_ct:
            asyncio.run(satellites.get_satellites())
            asyncio.run(satellites.get_satellites())
        mock_ct.assert_called_once()
```

- [ ] **Step 4: Run new fallback tests to verify they fail**

```bash
python3 -m pytest tests/test_satellites.py::TestGetSatellitesFallback -v
```

Expected: `AttributeError: module 'satellites' has no attribute '_fetch_celestrak'` (or similar)

- [ ] **Step 5: Implement new `satellites.py`**

Replace the entire file with:

```python
import os
import time

import httpx

CELESTRAK_ACTIVE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
CELESTRAK_HEADERS = {'User-Agent': 'satlas/1.0 (portfolio project; https://getsatlas.vercel.app)'}

SPACETRACK_LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
SPACETRACK_QUERY_URL = (
    'https://www.space-track.org/basicspacedata/query/class/gp'
    '/EPOCH/%3Enow-30/MEAN_MOTION/%3E11.25/ECCENTRICITY/%3C0.25'
    '/orderby/NORAD_CAT_ID/limit/1000/format/json'
)

CACHE_TTL_SECONDS = 4 * 3600
LIMIT = 1000

_cache: dict = {'tles': [], 'fetched_at': 0.0}


def _parse_gp(items: list) -> list:
    return [
        {
            'name': item['OBJECT_NAME'],
            'norad_id': str(item['NORAD_CAT_ID']),
            'tle1': item['TLE_LINE1'],
            'tle2': item['TLE_LINE2'],
        }
        for item in items
    ]


async def _fetch_celestrak() -> list:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(CELESTRAK_ACTIVE_URL, headers=CELESTRAK_HEADERS)
        resp.raise_for_status()
        return _parse_gp(resp.json())[:LIMIT]


async def _fetch_spacetrack() -> list:
    user = os.environ.get('SPACETRACK_USER')
    password = os.environ.get('SPACETRACK_PASS')
    if not user or not password:
        raise ValueError('SPACETRACK_USER and SPACETRACK_PASS environment variables must be set')

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        login_resp = await client.post(
            SPACETRACK_LOGIN_URL,
            data={'identity': user, 'password': password},
        )
        login_resp.raise_for_status()
        data_resp = await client.get(SPACETRACK_QUERY_URL)
        data_resp.raise_for_status()
        return _parse_gp(data_resp.json())[:LIMIT]


async def get_satellites() -> list:
    now = time.time()
    if _cache['tles'] and now - _cache['fetched_at'] < CACHE_TTL_SECONDS:
        return _cache['tles']

    try:
        tles = await _fetch_celestrak()
    except Exception:
        tles = await _fetch_spacetrack()

    _cache['tles'] = tles
    _cache['fetched_at'] = now
    return tles
```

- [ ] **Step 6: Update existing `TestGetSatellites` tests to use new structure**

The existing `TestGetSatellites` tests mock `httpx.AsyncClient` and check space-track specific behavior (`SPACETRACK_LOGIN_URL`, credentials). Now that behavior lives in `_fetch_spacetrack`. Update the class to test `_fetch_spacetrack` directly:

```python
class TestFetchSpacetrack:
    def test_returns_parsed_tle_list(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient, patch.dict('os.environ', ENV_VARS):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_spacetrack())
        assert isinstance(result, list)
        assert len(result) == 2

    def test_record_has_required_fields(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient, patch.dict('os.environ', ENV_VARS):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_spacetrack())
        rec = result[0]
        assert rec['name'] == 'ISS (ZARYA)'
        assert rec['norad_id'] == '25544'
        assert 'tle1' in rec
        assert 'tle2' in rec

    def test_norad_id_is_string(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient, patch.dict('os.environ', ENV_VARS):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_spacetrack())
        assert isinstance(result[0]['norad_id'], str)

    def test_limit_applied_to_large_response(self):
        many_sats = [
            {
                'OBJECT_NAME': f'SAT-{i}',
                'NORAD_CAT_ID': i,
                'TLE_LINE1': '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993',
                'TLE_LINE2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
            }
            for i in range(satellites.LIMIT + 100)
        ]
        mock_client = _make_mock_client(many_sats)
        with patch('satellites.httpx.AsyncClient') as MockClient, patch.dict('os.environ', ENV_VARS):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_spacetrack())
        assert len(result) == satellites.LIMIT

    def test_raises_if_credentials_missing(self):
        with patch.dict('os.environ', {}, clear=True):
            with pytest.raises(ValueError, match='SPACETRACK_USER and SPACETRACK_PASS'):
                asyncio.run(satellites._fetch_spacetrack())

    def test_posts_credentials_to_login_url(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient, patch.dict('os.environ', ENV_VARS):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            asyncio.run(satellites._fetch_spacetrack())
        mock_client.post.assert_called_once_with(
            satellites.SPACETRACK_LOGIN_URL,
            data={'identity': ENV_VARS['SPACETRACK_USER'], 'password': ENV_VARS['SPACETRACK_PASS']},
        )
```

Also update the two cache tests in the old `TestGetSatellites` to use `_fetch_celestrak` patching:

```python
class TestGetSatellitesCache:
    def setup_method(self):
        satellites._cache['tles'] = []
        satellites._cache['fetched_at'] = 0.0

    def test_uses_cache_within_ttl(self):
        cached = [{'name': 'CACHED', 'norad_id': '99999', 'tle1': 'x', 'tle2': 'y'}]
        satellites._cache['tles'] = cached
        satellites._cache['fetched_at'] = time.time()

        with patch('satellites._fetch_celestrak', AsyncMock()) as mock_ct:
            result = asyncio.run(satellites.get_satellites())
            mock_ct.assert_not_called()
        assert result == cached

    def test_bypasses_cache_when_expired(self):
        satellites._cache['tles'] = [{'name': 'OLD', 'norad_id': '00000', 'tle1': 'x', 'tle2': 'y'}]
        satellites._cache['fetched_at'] = time.time() - (4 * 3600 + 1)

        with patch('satellites._fetch_celestrak', AsyncMock(return_value=SAMPLE_TLE_LIST)):
            result = asyncio.run(satellites.get_satellites())
        assert result[0]['name'] == 'ISS (ZARYA)'
```

Delete the old `TestGetSatellites` class entirely (its tests are now split into `TestFetchSpacetrack`, `TestGetSatellitesCache`, and `TestGetSatellitesFallback`).

- [ ] **Step 7: Run full test suite to verify all tests pass**

```bash
python3 -m pytest tests/test_satellites.py -v
```

Expected: all tests pass. Count should be roughly 20+ (6 old spacetrack + 3 celestrak + 4 fallback + 2 cache + 2 endpoint = 17).

- [ ] **Step 8: Commit**

```bash
git add apps/orbital/satellites.py apps/orbital/tests/test_satellites.py
git commit -m "feat: switch catalog source to CelesTrak primary with space-track fallback"
```

---

## Task 2: Add `GET /tle/iss` endpoint

**Files:**
- Modify: `apps/orbital/main.py`
- Modify: `apps/orbital/tests/test_satellites.py`

The endpoint extracts the ISS entry from the catalog by NORAD ID and returns its two TLE lines. Returns 404 if ISS is missing (shouldn't happen with CelesTrak active, but defensive).

- [ ] **Step 1: Write failing tests for `/tle/iss`**

Add to `TestSatellitesEndpoint` in `tests/test_satellites.py`:

```python
class TestIssTleEndpoint:
    def test_returns_200_with_tle_lines(self):
        mock_catalog = [
            {'name': 'ISS (ZARYA)', 'norad_id': '25544', 'tle1': 'line1', 'tle2': 'line2'},
            {'name': 'OTHER', 'norad_id': '99999', 'tle1': 'a', 'tle2': 'b'},
        ]
        with patch('main.get_satellites', AsyncMock(return_value=mock_catalog)):
            client = TestClient(app)
            resp = client.get('/tle/iss')
        assert resp.status_code == 200
        body = resp.json()
        assert body['tle1'] == 'line1'
        assert body['tle2'] == 'line2'

    def test_returns_404_when_iss_not_in_catalog(self):
        mock_catalog = [{'name': 'OTHER', 'norad_id': '99999', 'tle1': 'a', 'tle2': 'b'}]
        with patch('main.get_satellites', AsyncMock(return_value=mock_catalog)):
            client = TestClient(app)
            resp = client.get('/tle/iss')
        assert resp.status_code == 404

    def test_returns_503_on_catalog_failure(self):
        with patch('main.get_satellites', AsyncMock(side_effect=Exception('network'))):
            client = TestClient(app)
            resp = client.get('/tle/iss')
        assert resp.status_code == 503
```

- [ ] **Step 2: Run failing tests**

```bash
python3 -m pytest tests/test_satellites.py::TestIssTleEndpoint -v
```

Expected: 404 Not Found (no `/tle/iss` route).

- [ ] **Step 3: Implement `/tle/iss` in `main.py`**

Add after the `/satellites` endpoint:

```python
ISS_NORAD_ID = '25544'


@app.get('/tle/iss')
async def get_iss_tle() -> dict[str, str]:
    try:
        catalog = await get_satellites()
        for sat in catalog:
            if sat['norad_id'] == ISS_NORAD_ID:
                return {'tle1': sat['tle1'], 'tle2': sat['tle2']}
        raise HTTPException(status_code=404, detail='ISS not found in catalog')
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'ISS TLE fetch failed: {e}')
```

- [ ] **Step 4: Run tests**

```bash
python3 -m pytest tests/test_satellites.py::TestIssTleEndpoint -v
```

Expected: 3/3 pass.

- [ ] **Step 5: Run full orbital test suite**

```bash
python3 -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/orbital/main.py apps/orbital/tests/test_satellites.py
git commit -m "feat: add GET /tle/iss endpoint returning live ISS TLE from catalog"
```

---

## Task 3: Frontend — live ISS TLE via `SatelliteMesh.updateTle` + `Globe.initCatalog`

**Files:**
- Modify: `apps/web/src/globe/SatelliteMesh.ts`
- Modify: `apps/web/src/globe/Globe.ts`

Currently `Globe.ts:56` initialises `SatelliteMesh` with `ISS_TLE1`/`ISS_TLE2` (March 2024 hardcoded). `initCatalog` at line 73 fetches the live catalog but filters ISS out (`others = tles.filter(t => t.norad_id !== ISS_NORAD)`). We intercept the ISS entry there and update `this.iss` before it's filtered away.

`SatelliteMesh` initialises `this.satrec` in the constructor via `satellite.twoline2satrec(tle1, tle2)`. `updateTle` reinitialises it. Setting `this.lastArcDate = new Date(0)` triggers a full arc recompute on the next `update()` call (the guard is `date.getTime() - this.lastArcDate.getTime() > 60_000` — epoch 0 is >60s ago).

- [ ] **Step 1: Add `updateTle` to `SatelliteMesh.ts`**

Add this method after `getCurrentPosition()` (before `startPulse()`), at approximately line 75:

```typescript
updateTle(tle1: string, tle2: string): void {
  this.satrec = satellite.twoline2satrec(tle1, tle2)
  this.lastArcDate = new Date(0) // force arc recompute on next tick
}
```

- [ ] **Step 2: Update `Globe.initCatalog` to use live ISS TLE**

In `Globe.ts`, replace the block at lines 75–76 (currently `const others = tles.filter(...)`) with:

```typescript
const issTle = tles.find(t => t.norad_id === ISS_NORAD)
if (issTle) this.iss.updateTle(issTle.tle1, issTle.tle2)
const others = tles.filter(t => t.norad_id !== ISS_NORAD)
```

- [ ] **Step 3: Verify TypeScript compiles clean**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v node_modules | head -20
```

Expected: no output (zero errors).

- [ ] **Step 4: Run web test suite**

```bash
npx vitest run
```

Expected: 22/22 pass (no frontend unit tests exercise `Globe`/`SatelliteMesh` directly, but this catches regressions in hooks/components).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/globe/SatelliteMesh.ts apps/web/src/globe/Globe.ts
git commit -m "feat: update ISS mesh with live TLE from catalog on startup"
```

---

## Task 4: CLAUDE.md — log vision + update active scope

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update active scope — mark session 6 tasks complete, update next milestone**

Under "Active scope", replace the next milestone and add session 6 completed tasks block.

Current next milestone line:
```
**Next milestone:** Session 6 — click-to-select on catalog satellites, filter UI stub, mobile performance baseline.
```

Update to:
```
**Next milestone:** Session 7 — click-to-select on catalog satellites (click any dot → agent panel pre-filled with satellite name), filter UI stub (layer toggles: ISS / Starlink / all), mobile performance baseline.
```

Add session 6 completed task list after the session 5 block:

```markdown
**Session 6 tasks (catalog fix + live ISS TLE):**
- [x] Switch catalog source to CelesTrak GROUP=active (no orbital filters) with space-track.org fallback
- [x] Add GET /tle/iss endpoint to FastAPI
- [x] Add SatelliteMesh.updateTle() — reinitialises satrec + forces arc recompute
- [x] Globe.initCatalog extracts live ISS TLE from catalog and calls updateTle before filtering
- [x] All tests passing (orbital + web)
- [x] Update CLAUDE.md
```

- [ ] **Step 2: Add decisions log entry for long-term vision (V2 scope)**

Add this entry to the Decisions log (before the "Out of scope" section):

```markdown
- **2026-05-13 — Long-term vision logged (V2 scope, do not implement yet).** Target state resembles satellitetracker3d.com but with the AI agent as the primary interface. Planned future sessions: (1) Satellite layers — render catalog by category (ISS, Starlink constellation, weather sats, debris) with globe toggles; agent can say "show me all Starlink satellites" and the globe highlights them. (2) Click-to-select — clicking any catalog dot pre-fills the agent chat with the satellite's name so the user can ask about it immediately. (3) Real-time TLE refresh — re-fetch catalog every 10s or on-demand rather than the 4h cache TTL. (4) More agent tools — conjunction analysis, debris proximity alerts, satellite manoeuvre history (where data is public). Do not start any of this until Session 7 scope is shipped.
```

- [ ] **Step 3: Add decisions log entry for catalog fix (session 6 ADR)**

```markdown
- **2026-05-13 — Session 6: switched catalog to CelesTrak primary.** Root cause: space-track.org query filtered by MEAN_MOTION > 11.25 and ECCENTRICITY < 0.25, combined with NORAD_CAT_ID ordering and limit 1000, was producing a slice that excluded Hubble (NORAD 20580) and intermittently the ISS (NORAD 25544) depending on catalog churn. CelesTrak GROUP=active has no such orbital filters and includes all operational satellites. User-Agent header fix from session 4 resolves the Railway IP concern. space-track.org kept as fallback in case CelesTrak is unavailable. ISS now gets live TLE on frontend startup: `Globe.initCatalog` calls `SatelliteMesh.updateTle(tle1, tle2)` with the first ISS entry found in the catalog; the hardcoded March 2024 TLE is only used for the initial render before the catalog loads.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: session 6 complete — catalog fix and live ISS TLE"
```

---

## Task 5: Push and deploy

- [ ] **Step 1: Push to main**

```bash
git push
```

This triggers auto-deploy: Vercel rebuilds the frontend (no env var changes needed). Railway redeploys the orbital service with the new `satellites.py` (no env var changes needed — `SPACETRACK_*` vars remain as fallback credentials).

- [ ] **Step 2: Verify manually at getsatlas.vercel.app**

- Open the site — ISS dot should be near its real current position (compare against a known tracker like heavens-above.com)
- Ask agent: "where is Hubble?" — should return orbital data (catalog now includes Hubble)
- Ask agent: "what satellites are overhead from Melbourne?" — should return current results
