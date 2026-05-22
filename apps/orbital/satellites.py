import asyncio
import json
import logging
import os
import time

import boto3
import httpx

CELESTRAK_ISS_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'
CELESTRAK_HEADERS = {'User-Agent': 'satlas/1.0 (portfolio project; https://satlas.app)'}

SPACETRACK_LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
SPACETRACK_CATALOG_URL = (
    'https://www.space-track.org/basicspacedata/query/class/gp'
    '/DECAY_DATE/null-val/EPOCH/%3Enow-90/orderby/NORAD_CAT_ID/format/3le'
)
SPACETRACK_SATCAT_URL = (
    'https://www.space-track.org/basicspacedata/query/class/satcat'
    '/CURRENT/Y/format/json/orderby/NORAD_CAT_ID'
)

_SATCAT_TYPE_MAP = {
    'PAYLOAD': 'PAY', 'ROCKET BODY': 'R/B', 'DEBRIS': 'DEB',
    'UNKNOWN': 'UNK', 'TBA': 'UNK',
}

ISS_TLE_TTL_SECONDS = 300   # 5 min — ISS moves 7.66 km/s
CATALOG_REFRESH_SECONDS = 2 * 60 * 60  # 2 h

ISS_NORAD = '25544'

_cache: dict = {'tles': [], 'fetched_at': 0.0}
_iss_cache: dict = {'tle': None, 'fetched_at': 0.0}


def _parse_tle_text(text: str) -> list:
    """Parse 3LE text into TLE record dicts. Strips Space-Track '0 ' name prefix."""
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    result = []
    i = 0
    while i + 2 < len(lines):
        name, tle1, tle2 = lines[i], lines[i + 1], lines[i + 2]
        if tle1.startswith('1 ') and tle2.startswith('2 '):
            clean_name = name[2:] if name.startswith('0 ') else name
            result.append({
                'name': clean_name,
                'norad_id': tle1[2:7].strip(),
                'tle1': tle1,
                'tle2': tle2,
            })
            i += 3
        else:
            i += 1
    return result


async def _fetch_space_track_tles() -> list:
    """Authenticate to Space-Track and fetch full catalog as 3LE text."""
    user = os.environ.get('SPACETRACK_USER')
    password = os.environ.get('SPACETRACK_PASS')
    if not user or not password:
        raise ValueError('SPACETRACK_USER and SPACETRACK_PASS environment variables must be set')

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        login_resp = await client.post(SPACETRACK_LOGIN_URL, data={'identity': user, 'password': password})
        login_resp.raise_for_status()
        resp = await client.get(SPACETRACK_CATALOG_URL)
        resp.raise_for_status()
        return _parse_tle_text(resp.text)


async def _fetch_space_track_satcat() -> list:
    """Authenticate to Space-Track and fetch current SATCAT metadata as JSON."""
    user = os.environ.get('SPACETRACK_USER')
    password = os.environ.get('SPACETRACK_PASS')
    if not user or not password:
        raise ValueError('SPACETRACK_USER and SPACETRACK_PASS environment variables must be set')

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        login_resp = await client.post(SPACETRACK_LOGIN_URL, data={'identity': user, 'password': password})
        login_resp.raise_for_status()
        resp = await client.get(SPACETRACK_SATCAT_URL)
        resp.raise_for_status()
        return resp.json()


def _s3_put(tle_records: list) -> None:
    """Write TLE records as 3LE text to S3. No-op if CATALOG_BUCKET is not set."""
    bucket = os.environ.get('CATALOG_BUCKET')
    if not bucket:
        return

    lines = []
    for r in tle_records:
        lines.append(r['name'])
        lines.append(r['tle1'])
        lines.append(r['tle2'])
    body = '\n'.join(lines) + '\n'

    s3 = boto3.client('s3')
    s3.put_object(
        Bucket=bucket,
        Key='catalog.tle',
        Body=body,
        ContentType='text/plain',
        CacheControl='public, max-age=7200',
    )


def _s3_put_satcat(rows: list) -> None:
    """Write condensed SATCAT JSON to S3. No-op if CATALOG_BUCKET is not set."""
    bucket = os.environ.get('CATALOG_BUCKET')
    if not bucket:
        return

    condensed = [
        {
            'norad_id': r.get('NORAD_CAT_ID', ''),
            'intl_des': r.get('OBJECT_ID', '') or r.get('INTLDES', ''),
            'type': _SATCAT_TYPE_MAP.get(r.get('OBJECT_TYPE', ''), 'UNK'),
            'owner': r.get('COUNTRY', ''),
            'launch': r.get('LAUNCH', '') or '',
            'site': r.get('SITE', '') or '',
            'decay': r.get('DECAY') or None,
        }
        for r in rows
        if r.get('NORAD_CAT_ID')
    ]

    s3 = boto3.client('s3')
    s3.put_object(
        Bucket=bucket,
        Key='satcat.json',
        Body=json.dumps(condensed, separators=(',', ':')),
        ContentType='application/json',
        CacheControl='public, max-age=7200',
    )


async def _s3_refresh() -> None:
    """Fetch full catalog and SATCAT from Space-Track, update in-memory cache, write to S3."""
    tles = await _fetch_space_track_tles()
    _cache['tles'] = tles
    _cache['fetched_at'] = time.time()
    _s3_put(tles)
    try:
        satcat = await _fetch_space_track_satcat()
        _s3_put_satcat(satcat)
    except Exception as exc:
        logging.getLogger(__name__).warning('SATCAT refresh failed (non-fatal): %s', exc)


async def refresh_loop() -> None:
    """Background task: retry aggressively on startup, then refresh every 2h."""
    logger = logging.getLogger(__name__)
    # Startup: retry every 30s until first successful fetch
    while not _cache['tles']:
        try:
            await _s3_refresh()
        except Exception as exc:
            logger.error('Catalog startup refresh failed: %s', exc)
            await asyncio.sleep(30)
    # Steady state: refresh every 2h
    while True:
        await asyncio.sleep(CATALOG_REFRESH_SECONDS)
        try:
            await _s3_refresh()
        except Exception as exc:
            logger.error('Catalog refresh failed: %s', exc)


async def get_satellites() -> list:
    """Return cached TLE list. Raises if catalog not yet loaded."""
    if _cache['tles']:
        return _cache['tles']
    raise RuntimeError('Catalog not yet loaded — refresh in progress')


async def _fetch_iss_tle() -> dict:
    """Fetch ISS TLE from CelesTrak CATNR — works from cloud IPs (no IP block on CATNR)."""
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        resp = await client.get(CELESTRAK_ISS_URL, headers=CELESTRAK_HEADERS)
        resp.raise_for_status()
        lines = resp.text.strip().splitlines()
        if len(lines) < 3:
            raise ValueError(f'Unexpected ISS TLE response: {resp.text[:100]}')
        tle1, tle2 = lines[1].strip(), lines[2].strip()
        norad_id = tle1[2:7].strip()
        return {'name': lines[0].strip(), 'norad_id': norad_id, 'tle1': tle1, 'tle2': tle2}


async def get_iss_tle() -> dict:
    """Return fresh ISS TLE, cached for ISS_TLE_TTL_SECONDS."""
    now = time.time()
    if _iss_cache['tle'] and now - _iss_cache['fetched_at'] < ISS_TLE_TTL_SECONDS:
        return _iss_cache['tle']
    tle = await _fetch_iss_tle()
    _iss_cache['tle'] = {'tle1': tle['tle1'], 'tle2': tle['tle2']}
    _iss_cache['fetched_at'] = now
    return _iss_cache['tle']
