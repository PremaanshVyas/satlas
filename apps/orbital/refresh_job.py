"""One-shot catalog refresh, run by the GitHub Actions scheduler.

Replaces the always-on ECS worker after the AWS account was suspended. Everything about
how Space-Track is queried — the delta window, the merge by NORAD id, alpha-5 id handling,
the SATCAT once-per-UTC-day-after-1700 rule — is imported unchanged from satellites.py.
Only the storage target moved, from S3 to Vercel Blob.

Why this is safer than the worker it replaces: the S44 suspension happened because a
crash-looping process re-queried Space-Track on every boot, and the in-process clock reset
to zero each time. A cron entry cannot do that; one invocation issues at most one gp query
and then exits.

The schedule alone is not treated as sufficient, though. workflow_dispatch can fire at any
time, so the once-per-hour gp interval is ALSO enforced here against the store's own
Last-Modified. That is the S45 rule: a rate clock must live in durable storage, never in
the scheduler and never in memory.

The previous catalog is read back from the public Blob URL, and its Last-Modified header
plays exactly the role S3's LastModified used to: it tells us how far back the delta window
must reach, and when SATCAT was last written. That state lives in the store, not in memory,
so a re-run cannot lose track of it.

Reads need no credentials (the store is public). The upload is done by the workflow via
`vercel blob put`, so this script only writes local files.
"""

from __future__ import annotations

import asyncio
import datetime
import email.utils
import json
import os
import sys
import time

import httpx

from satellites import (
    GP_MIN_INTERVAL_SECONDS,
    SPACETRACK_CATALOG_URL,
    SPACETRACK_DELTA_TEMPLATE,
    _delta_window_days,
    _fetch_space_track_satcat,
    _fetch_space_track_tles,
    _merge_tles,
    _parse_tle_text,
    _satcat_due,
    _SATCAT_TYPE_MAP,
)

DEFAULT_BLOB_BASE = 'https://bop9747v4vkycovg.public.blob.vercel-storage.com'

# `or`, not os.environ.get's default argument. A GitHub Actions `${{ vars.X }}` for an
# undefined variable expands to an EMPTY STRING, not an unset var, so the default argument
# never applies and the base URL silently became ''. That made every read fail, every run
# look like a cold start, and every cold start take the full-pull path — which is exempt
# from the once-per-hour guard. An unset variable would have quietly reinstated the exact
# query pattern that got the account suspended.
BLOB_BASE = (os.environ.get('CATALOG_BLOB_BASE') or DEFAULT_BLOB_BASE).rstrip('/')

# Writes go to the API host, not the public read host.
BLOB_API = 'https://blob.vercel-storage.com'

OUT_DIR = os.environ.get('REFRESH_OUT_DIR', '.')

# A catalog smaller than this is treated as a failed read rather than a real catalog.
# The S44 incident included a run that wrote an empty catalog over a good one; never
# let a bad read become a bad write.
MIN_PLAUSIBLE_RECORDS = 1000

# The cron fires on a fixed minute, but the clock is stamped AFTER the query returns, so
# consecutive scheduled runs are always slightly under an hour apart — 16:17:00 then a
# marker at 16:17:30 makes the 17:17:00 run measure 3570s and skip. Without tolerance the
# job would silently refresh every two hours instead of every hour, halving catalog
# freshness while reporting success.
#
# This does not weaken the protection it exists for. Space-Track's concern is a process
# re-querying in a tight loop; a manual trigger still has to wait ~55 minutes. It only
# stops normal execution time from being mistaken for abuse.
SCHEDULE_TOLERANCE_SECONDS = 300


def log(msg: str) -> None:
    print(f'[refresh] {msg}', flush=True)


def _http_date_to_epoch(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return email.utils.parsedate_to_datetime(value).timestamp()
    except (TypeError, ValueError):
        return 0.0


def _read_blob(pathname: str) -> tuple[str | None, float]:
    """Fetch a public blob's CONTENT. The returned timestamp is advisory only — see
    _blob_uploaded_at for why a CDN Last-Modified must never drive the rate clock.
    A few minutes of CDN staleness in the body is harmless: the delta merges by NORAD id."""
    url = f'{BLOB_BASE}/{pathname}'
    try:
        resp = httpx.get(url, timeout=60, follow_redirects=True)
    except httpx.HTTPError as exc:
        log(f'{pathname}: read failed ({exc.__class__.__name__}) — treating as absent')
        return None, 0.0
    if resp.status_code == 404:
        log(f'{pathname}: not present yet')
        return None, 0.0
    if resp.status_code != 200:
        log(f'{pathname}: unexpected status {resp.status_code} — treating as absent')
        return None, 0.0
    return resp.text, _http_date_to_epoch(resp.headers.get('last-modified'))


def _blob_uploaded_at(pathname: str) -> float:
    """Authoritative write time from the Blob API. 0.0 if absent or unreadable.

    Deliberately NOT the public URL's Last-Modified header. That is served from a regional
    CDN cache, and on a cache fill in another region it reports the fill time rather than
    the object's write time. The rate clock read it and every run concluded a query had
    just happened, so the guard skipped indefinitely — the catalog would never have
    refreshed again while every run reported success.

    This endpoint is authenticated and not CDN-cached, so it returns the real upload time.
    """
    token = os.environ.get('BLOB_READ_WRITE_TOKEN')
    if not token:
        log(f'{pathname}: no blob token, cannot read the clock')
        return 0.0
    try:
        resp = httpx.get(
            BLOB_API,
            params={'prefix': pathname, 'limit': 1},
            headers={'authorization': f'Bearer {token}'},
            timeout=30,
        )
        resp.raise_for_status()
        for blob in resp.json().get('blobs', []):
            if blob.get('pathname') == pathname:
                stamp = blob.get('uploadedAt', '')
                return datetime.datetime.fromisoformat(
                    stamp.replace('Z', '+00:00')
                ).timestamp()
    except Exception as exc:  # noqa: BLE001
        log(f'{pathname}: could not read upload time ({exc.__class__.__name__})')
        return 0.0
    return 0.0


def put_blob(pathname: str, body: bytes, content_type: str) -> str:
    """Publish a blob using the read-write token alone.

    Deliberately not `vercel blob put`: the CLI needs account-level credentials on top of
    --rw-token and fails in CI with "No existing credentials found". The HTTP API accepts
    the token by itself, which is the credential actually scoped to this job.

    x-add-random-suffix must be 0. The readers fetch a fixed URL, so a randomised pathname
    would publish successfully and still leave the site empty.
    """
    token = os.environ.get('BLOB_READ_WRITE_TOKEN')
    if not token:
        raise RuntimeError('BLOB_READ_WRITE_TOKEN is not set — cannot publish')

    resp = httpx.put(
        f'{BLOB_API}/{pathname}',
        headers={
            'authorization': f'Bearer {token}',
            'x-content-type': content_type,
            'x-add-random-suffix': '0',
            'x-cache-control-max-age': '7200',
        },
        content=body,
        timeout=120,
    )
    resp.raise_for_status()
    url = resp.json().get('url', '')
    if not url.endswith(f'/{pathname}'):
        raise RuntimeError(f'published to an unexpected pathname: {url}')
    return url


GP_MARKER = '.gp-last-query'


def _gp_clock() -> float:
    """When Space-Track was last QUERIED, not when we last published successfully.

    These differ, and the difference bit us: the bootstrap run queried gp, then failed to
    publish. The store stayed empty, so the next run would have read "no catalog", taken
    the cold-start path (exempt from the interval guard) and queried again minutes later.
    A publishing failure must not hand back a fresh rate budget.

    The marker is written immediately after a successful fetch, so it advances even when
    everything downstream fails. Falls back to the catalog's own timestamp for stores
    written before the marker existed.
    """
    marker = _blob_uploaded_at(GP_MARKER)
    if marker:
        return marker
    return _blob_uploaded_at('catalog.tle')


def _stamp_gp_query() -> None:
    """Advance the durable gp clock. Never fatal: failing to stamp must not discard a
    catalog we already paid a query for."""
    try:
        put_blob(GP_MARKER, str(time.time()).encode(), 'text/plain')
    except Exception as exc:  # noqa: BLE001
        log(f'could not stamp the gp clock ({exc.__class__.__name__}) — continuing')


def _write_catalog(records: list, path: str) -> None:
    lines = []
    for r in records:
        lines.append(r['name'])
        lines.append(r['tle1'])
        lines.append(r['tle2'])
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


def _condense_satcat(rows: list) -> list:
    """Identical shape to the old _s3_put_satcat payload, so the frontend parser is unchanged."""
    return [
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


async def refresh_catalog() -> bool:
    """One gp query: a full pull when the store is empty, otherwise an hourly delta merged
    into what is already there. Returns True if a catalog file was written."""
    existing_text, _ = _read_blob('catalog.tle')
    existing = _parse_tle_text(existing_text) if existing_text else []

    # The clock is the last QUERY, not the last successful publish.
    last_query = _gp_clock()
    gap = max(time.time() - last_query, 0.0) if last_query else float('inf')

    if gap < GP_MIN_INTERVAL_SECONDS - SCHEDULE_TOLERANCE_SECONDS:
        log(
            f'last gp query was {gap / 60:.1f} min ago; the class allows one per hour '
            f'({GP_MIN_INTERVAL_SECONDS / 60:.0f} min) — skipping to stay compliant'
        )
        return False

    if len(existing) < MIN_PLAUSIBLE_RECORDS:
        if existing:
            log(f'existing catalog only {len(existing)} records — treating as cold start')
        log('cold start: full gp pull')
        url = SPACETRACK_CATALOG_URL
        bootstrap = True
    else:
        days = _delta_window_days(gap)
        log(f'{len(existing)} records on hand, {gap / 3600:.2f}h old — delta window {days:.4f}d')
        url = SPACETRACK_DELTA_TEMPLATE.format(days=f'{days:.4f}')
        bootstrap = False

    fetched = await _fetch_space_track_tles(url)
    log(f'Space-Track returned {len(fetched)} records')
    _stamp_gp_query()  # before anything that can fail — a query is spent either way

    merged = fetched if bootstrap else _merge_tles(existing, fetched)

    # Never overwrite a good catalog with a bad one. This is the S44 rule: an empty or
    # implausibly small result is a failed fetch, not a real catalog.
    if len(merged) < MIN_PLAUSIBLE_RECORDS:
        log(f'refusing to write {len(merged)} records — keeping the existing catalog')
        return False

    out = os.path.join(OUT_DIR, 'catalog.tle')
    _write_catalog(merged, out)
    log(f'wrote {out}: {len(merged)} records')

    with open(out, 'rb') as f:
        url = put_blob('catalog.tle', f.read(), 'text/plain; charset=utf-8')
    log(f'published {url}')
    return True


async def refresh_satcat() -> bool:
    """SATCAT metadata, at most once per UTC day and only at/after 1700 UTC. Returns True
    if a file was written."""
    last_refresh = _blob_uploaded_at('satcat.json')
    now = time.time()
    if not _satcat_due(now, last_refresh):
        when = (
            datetime.datetime.fromtimestamp(last_refresh, datetime.timezone.utc).isoformat()
            if last_refresh else 'never'
        )
        log(f'satcat not due (last written {when}) — skipping')
        return False

    rows = await _fetch_space_track_satcat()
    condensed = _condense_satcat(rows)
    if len(condensed) < MIN_PLAUSIBLE_RECORDS:
        log(f'refusing to write {len(condensed)} satcat rows — keeping the existing file')
        return False

    out = os.path.join(OUT_DIR, 'satcat.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(condensed, f, separators=(',', ':'))
    log(f'wrote {out}: {len(condensed)} rows')

    with open(out, 'rb') as f:
        url = put_blob('satcat.json', f.read(), 'application/json')
    log(f'published {url}')
    return True


async def main() -> int:
    wrote_catalog = await refresh_catalog()
    # Deliberately sequential and independent: a satcat failure must not prevent the
    # catalog from being published, and vice versa.
    try:
        wrote_satcat = await refresh_satcat()
    except Exception as exc:  # noqa: BLE001 — satcat is optional metadata
        log(f'satcat refresh failed ({exc.__class__.__name__}) — continuing')
        wrote_satcat = False

    # The workflow reads these to decide what to upload.
    github_output = os.environ.get('GITHUB_OUTPUT')
    if github_output:
        with open(github_output, 'a', encoding='utf-8') as f:
            f.write(f'catalog_written={"true" if wrote_catalog else "false"}\n')
            f.write(f'satcat_written={"true" if wrote_satcat else "false"}\n')

    if not wrote_catalog:
        log('no catalog written this run')
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
