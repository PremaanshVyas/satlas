import os
import time

import httpx

SPACETRACK_LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
SPACETRACK_QUERY_URL = (
    'https://www.space-track.org/basicspacedata/query/class/gp'
    '/EPOCH/%3Enow-30/MEAN_MOTION/%3E11.25/ECCENTRICITY/%3C0.25'
    '/orderby/NORAD_CAT_ID/limit/1000/format/json'
)
CACHE_TTL_SECONDS = 4 * 3600
# Query already limits to 1000; LIMIT is a safety net
LIMIT = 1000

_cache: dict = {'tles': [], 'fetched_at': 0.0}


async def get_satellites() -> list[dict]:
    now = time.time()
    if _cache['tles'] and now - _cache['fetched_at'] < CACHE_TTL_SECONDS:
        return _cache['tles']

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
        data = data_resp.json()

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
