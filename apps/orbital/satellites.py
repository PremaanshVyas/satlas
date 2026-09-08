import asyncio
import datetime
import json
import logging
import os
import time

try:
    import boto3
except ImportError:  # only needed by the legacy AWS path; the scheduled refresh job
    boto3 = None     # writes to Vercel Blob and never imports it
import httpx

CELESTRAK_ISS_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'
CELESTRAK_HEADERS = {'User-Agent': 'satlas/1.0 (portfolio project; https://satlas.app)'}

SPACETRACK_LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
# Full catalog (~30k) — used only for the cold-start bootstrap when no cache exists.
SPACETRACK_CATALOG_URL = (
    'https://www.space-track.org/basicspacedata/query/class/gp'
    '/DECAY_DATE/null-val/EPOCH/%3Enow-90/orderby/NORAD_CAT_ID/format/3le'
)
# Hourly delta — only objects whose TLE was published within the window. {days} is filled
# in per-run so a missed cycle is still caught up by widening the window. This is
# Space-Track's recommended bandwidth-saving query (see their API guidelines / the
# suspension notice that prompted this design).
SPACETRACK_DELTA_TEMPLATE = (
    'https://www.space-track.org/basicspacedata/query/class/gp'
    '/DECAY_DATE/null-val/CREATION_DATE/%3Enow-{days}/orderby/NORAD_CAT_ID/format/3le'
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

# Space-Track gp-class policy: at most ONE query per hour. We query at a fixed minute
# offset (well inside the 5–25 min off-peak window) and a hard interval guard makes a
# second gp query within the hour structurally impossible — even across restarts/retries.
GP_MIN_INTERVAL_SECONDS = 3600
GP_QUERY_MINUTE = 17
DELTA_MIN_DAYS = 0.042       # ~1 hour — Space-Track's example window
DELTA_BUFFER_SECONDS = 900   # 15 min overlap so nothing slips between consecutive windows

# Space-Track SATCAT-class policy: at most once per day, and only after 1700 UTC (the daily
# catalog is published around then). We seed this clock from S3 on boot (below) so a restart
# can never re-query within the same day — the gp-class restart-storm that caused the
# suspension must not be reproducible for the satcat endpoint either.
SATCAT_QUERY_HOUR_UTC = 17

ISS_NORAD = '25544'

_cache: dict = {'tles': [], 'fetched_at': 0.0}
_iss_cache: dict = {'tle': None, 'fetched_at': 0.0}
_last_gp_query_at: float = 0.0
_satcat_last_refresh: float = 0.0


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


# Space-Track 'alpha-5' NORAD ids (for catalog numbers >= 100000) replace the leading two
# digits with a letter: A=10..H=17, J..N=18..22, P..Z=23..33 (I and O are omitted to avoid
# confusion with 1 and 0). E.g. 'T0000' -> 270000. Plain int() raises on these, which is what
# silently froze the hourly delta (the _merge_tles sort crashed on the first alpha-5 id).
_ALPHA5_DIGITS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'


def norad_to_int(norad_id: str) -> int:
    """NORAD id (numeric or alpha-5) -> int, for sorting/comparison. Never raises: an
    unparseable id falls back to 0 so a single bad record can't crash a whole catalog sort."""
    s = (norad_id or '').strip()
    try:
        if s and s[0].isalpha():
            return _ALPHA5_DIGITS.index(s[0].upper()) * 10000 + int(s[1:] or '0')
        return int(s)
    except (ValueError, IndexError):
        return 0


async def _fetch_space_track_tles(query_url: str = SPACETRACK_CATALOG_URL) -> list:
    """Authenticate to Space-Track and fetch TLEs (3LE) for the given gp query URL."""
    user = os.environ.get('SPACETRACK_USER')
    password = os.environ.get('SPACETRACK_PASS')
    if not user or not password:
        raise ValueError('SPACETRACK_USER and SPACETRACK_PASS environment variables must be set')

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        login_resp = await client.post(SPACETRACK_LOGIN_URL, data={'identity': user, 'password': password})
        login_resp.raise_for_status()
        resp = await client.get(query_url)
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


def _merge_tles(existing: list, updates: list) -> list:
    """Overlay delta updates onto the cached catalog, keyed by NORAD id, NORAD-sorted."""
    by_id = {r['norad_id']: r for r in existing}
    for r in updates:
        by_id[r['norad_id']] = r
    return sorted(by_id.values(), key=lambda r: norad_to_int(r['norad_id']))


def _delta_window_days(gap_seconds: float) -> float:
    """How many days back the hourly delta query looks, widened to cover any missed cycle."""
    return max((gap_seconds + DELTA_BUFFER_SECONDS) / 86400.0, DELTA_MIN_DAYS)


def _next_gp_slot(now: float, last_gp: float) -> float:
    """Epoch of the next :GP_QUERY_MINUTE that is also >= GP_MIN_INTERVAL_SECONDS after the
    last gp query. Guarantees at most one gp query per hour — restarts and retries included."""
    dt = datetime.datetime.fromtimestamp(now, datetime.timezone.utc)
    candidate = dt.replace(minute=GP_QUERY_MINUTE, second=0, microsecond=0)
    while candidate.timestamp() <= now or candidate.timestamp() < last_gp + GP_MIN_INTERVAL_SECONDS:
        candidate += datetime.timedelta(hours=1)
    return candidate.timestamp()


def _load_catalog_from_s3() -> tuple:
    """Load the existing catalog.tle from S3 so a restart never re-queries Space-Track.
    Returns (records, last_modified_epoch); ([], 0.0) if unavailable."""
    bucket = os.environ.get('CATALOG_BUCKET')
    if not bucket:
        return [], 0.0
    try:
        s3 = boto3.client('s3')
        obj = s3.get_object(Bucket=bucket, Key='catalog.tle')
        text = obj['Body'].read().decode('utf-8')
        last_mod = obj.get('LastModified')
        ts = last_mod.timestamp() if last_mod else 0.0
        return _parse_tle_text(text), ts
    except Exception:
        return [], 0.0


def _satcat_last_modified_from_s3() -> float:
    """LastModified epoch of satcat.json in S3, or 0.0 if absent/unreadable. Seeds the
    satcat rate clock on boot so a restart never re-queries within the same UTC day."""
    bucket = os.environ.get('CATALOG_BUCKET')
    if not bucket:
        return 0.0
    try:
        s3 = boto3.client('s3')
        head = s3.head_object(Bucket=bucket, Key='satcat.json')
        last_mod = head.get('LastModified')
        return last_mod.timestamp() if last_mod else 0.0
    except Exception:
        return 0.0


async def _refresh_catalog() -> None:
    """Issue exactly ONE gp query — a full pull on cold start, otherwise an hourly delta
    merged into the cache — then write the result to S3. Updates the gp rate-limit clock."""
    global _last_gp_query_at
    is_bootstrap = not _cache['tles']
    if is_bootstrap:
        url = SPACETRACK_CATALOG_URL
    else:
        days = _delta_window_days(time.time() - _cache['fetched_at'])
        url = SPACETRACK_DELTA_TEMPLATE.format(days=f'{days:.4f}')
    fetched = await _fetch_space_track_tles(url)
    _last_gp_query_at = time.time()
    _cache['tles'] = fetched if is_bootstrap else _merge_tles(_cache['tles'], fetched)
    _cache['fetched_at'] = time.time()
    _s3_put(_cache['tles'])


def _satcat_due(now: float, last_refresh: float) -> bool:
    """Whether a satcat query is allowed right now under Space-Track's SATCAT-class rule:
    at most once per UTC day, and only at/after SATCAT_QUERY_HOUR_UTC. A never-fetched
    satcat (last_refresh <= 0, i.e. no satcat.json in S3) is exempt from the time-of-day
    gate so a first-ever cold start can populate metadata immediately."""
    if last_refresh <= 0:
        return True
    now_dt = datetime.datetime.fromtimestamp(now, datetime.timezone.utc)
    last_dt = datetime.datetime.fromtimestamp(last_refresh, datetime.timezone.utc)
    if last_dt.date() >= now_dt.date():
        return False  # already refreshed today (or future clock skew) — once per day
    return now_dt.hour >= SATCAT_QUERY_HOUR_UTC


async def _maybe_refresh_satcat() -> None:
    """Refresh satcat metadata at most once per UTC day, only after 1700 UTC (Space-Track
    SATCAT-class guidance). The rate clock is seeded from S3 on boot so restarts can't
    re-query within the day."""
    global _satcat_last_refresh
    if not _satcat_due(time.time(), _satcat_last_refresh):
        return
    satcat = await _fetch_space_track_satcat()
    _s3_put_satcat(satcat)
    _satcat_last_refresh = time.time()


def _seed_from_s3() -> int:
    """Seed the catalog cache AND both rate clocks from our S3 copies on boot, so a restart
    can never re-query Space-Track inside the compliant window — for gp or satcat. Returns
    the number of catalog records seeded (0 if S3 is empty → caller bootstraps).

    Seeding the gp clock matters as much as seeding the cache: `catalog.tle`'s LastModified
    is the time of the last successful gp write, so feeding it to `_next_gp_slot` enforces
    the once-per-hour gap ACROSS restarts. Without it, an off-schedule bootstrap query by a
    prior process followed by a redeploy that boots before the next `:17` would issue a
    second gp query within the hour — the in-process `_last_gp_query_at` resets to 0 on
    restart and can't see the prior process's query."""
    global _last_gp_query_at, _satcat_last_refresh
    records, last_mod = _load_catalog_from_s3()
    if records:
        _cache['tles'] = records
        _cache['fetched_at'] = last_mod or time.time()
        _last_gp_query_at = last_mod  # last gp write time → cross-restart once/hour guard
    _satcat_last_refresh = _satcat_last_modified_from_s3()
    return len(records)


async def refresh_loop() -> None:
    """The single Space-Track client. Seeds cache + rate clocks from S3 on boot (no query on
    restart), bootstraps the catalog only if S3 is empty, then issues at most one gp query
    per hour at :GP_QUERY_MINUTE — a delta that merges into the cache."""
    logger = logging.getLogger(__name__)

    # Seed from our own S3 copies first. A crash-looping or redeployed task therefore never
    # re-queries Space-Track inside the rate window — the storm that caused the suspension
    # can't recur, and an off-schedule bootstrap can't be doubled by a fast redeploy.
    seeded = _seed_from_s3()
    if seeded:
        logger.info('Seeded %d satellites from S3 (no Space-Track query on boot)', seeded)

    if not _cache['tles']:
        try:
            await _refresh_catalog()
        except Exception as exc:
            logger.error('Catalog bootstrap failed (will retry at next gp slot): %s', exc)
    try:
        await _maybe_refresh_satcat()
    except Exception as exc:
        logger.warning('SATCAT bootstrap failed (non-fatal): %s', exc)

    # Steady state: wake at the next compliant gp slot, issue one delta query, repeat.
    while True:
        await asyncio.sleep(max(0.0, _next_gp_slot(time.time(), _last_gp_query_at) - time.time()))
        try:
            await _refresh_catalog()
        except Exception as exc:
            logger.error('Catalog refresh failed: %s', exc)
        try:
            await _maybe_refresh_satcat()
        except Exception as exc:
            logger.warning('SATCAT refresh failed (non-fatal): %s', exc)


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
