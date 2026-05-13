import os
import time

import httpx

CELESTRAK_ACTIVE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'
CELESTRAK_HEADERS = {'User-Agent': 'aussie-sky/1.0 (portfolio project; https://aussie-sky.vercel.app)'}

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
