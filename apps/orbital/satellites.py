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
