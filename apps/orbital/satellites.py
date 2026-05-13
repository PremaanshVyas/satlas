import os
import time

import httpx

CELESTRAK_ACTIVE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
CELESTRAK_ISS_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'
CELESTRAK_HEADERS = {'User-Agent': 'aussie-sky/1.0 (portfolio project; https://aussie-sky.vercel.app)'}

SPACETRACK_LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
# No MEAN_MOTION/ECCENTRICITY filters — those excluded ISS at certain orbital epochs
SPACETRACK_QUERY_URL = (
    'https://www.space-track.org/basicspacedata/query/class/gp'
    '/EPOCH/%3Enow-30/orderby/NORAD_CAT_ID/limit/1000/format/json'
)

CACHE_TTL_SECONDS = 30 * 60
ISS_TLE_TTL_SECONDS = 5 * 60   # ISS moves 7.66 km/s — 5-min cache ≤ 2,300 km error
LIMIT = 1000
ISS_NORAD = '25544'

_cache: dict = {'tles': [], 'fetched_at': 0.0}
_iss_cache: dict = {'tle': None, 'fetched_at': 0.0}


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


async def _fetch_iss_tle() -> dict:
    """Fetch ISS TLE from CelesTrak CATNR endpoint — not IP-blocked on cloud infrastructure."""
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        resp = await client.get(CELESTRAK_ISS_URL, headers=CELESTRAK_HEADERS)
        resp.raise_for_status()
        lines = resp.text.strip().splitlines()
        if len(lines) < 3:
            raise ValueError(f'Unexpected TLE response: {resp.text[:100]}')
        name = lines[0].strip()
        tle1 = lines[1].strip()
        tle2 = lines[2].strip()
        norad_id = tle1[2:7].strip()
        return {'name': name, 'norad_id': norad_id, 'tle1': tle1, 'tle2': tle2}


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

    # Guarantee ISS is in the catalog regardless of source or filter behavior
    if not any(t['norad_id'] == ISS_NORAD for t in tles):
        try:
            iss = await _fetch_iss_tle()
            tles = [iss] + tles[:LIMIT - 1]
        except Exception:
            pass  # best-effort; return catalog without ISS rather than failing entirely

    _cache['tles'] = tles
    _cache['fetched_at'] = now
    return tles


async def get_iss_tle() -> dict:
    """Return a fresh ISS TLE dict {tle1, tle2}, cached for ISS_TLE_TTL_SECONDS (5 min)."""
    now = time.time()
    if _iss_cache['tle'] and now - _iss_cache['fetched_at'] < ISS_TLE_TTL_SECONDS:
        return _iss_cache['tle']
    tle = await _fetch_iss_tle()
    _iss_cache['tle'] = {'tle1': tle['tle1'], 'tle2': tle['tle2']}
    _iss_cache['fetched_at'] = now
    return _iss_cache['tle']
