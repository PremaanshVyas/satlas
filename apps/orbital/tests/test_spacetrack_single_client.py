"""Structural guards on the rule that got the Space-Track account suspended.

The runtime guards (interval, durable clock, bad-write, satcat cadence) are covered in
test_refresh_job.py. This file covers the invariant those guards cannot express: that
exactly one process in the whole repository is allowed to talk to Space-Track at all.

The suspension happened because a serverless endpoint queried Space-Track directly. Every
Vercel edge location re-fetched the full gp catalog on a cache miss, so one popular minute
produced dozens of queries against a one-per-hour limit. No amount of rate-limiting inside
the refresh job can prevent that, because the offending code path did not go through it.
A comment is the only thing standing between us and a repeat, so these tests make it fail
loudly instead.
"""
import pathlib
import re
import subprocess

import pytest

REPO = pathlib.Path(__file__).resolve().parents[3]

# Match a real way to REACH Space-Track, not the words "Space-Track".
#
# Two earlier versions of this pattern were wrong in instructive ways. Matching the phrase
# failed on api/catalog.ts, whose comment exists precisely to say it must never query
# Space-Track. Matching the bare hostname then failed on ApiDocs.tsx, which names
# Space-Track.org in the attribution their redistribution terms require us to display.
#
# Neither is a violation. What makes a file a client is holding a URL it can call or the
# credentials to authenticate with, so that is what this matches: a scheme-and-host URL, or
# the secret names. Prose naming the source has neither.
SPACETRACK = re.compile(
    r'https?://[\w.]*space-track\.org|SPACETRACK_USER|SPACETRACK_PASS', re.I)

# The only places allowed to name Space-Track. Adding to this list is a deliberate act and
# should be argued for in review, which is the entire point of pinning it here.
ALLOWED = {
    'apps/orbital/satellites.py',            # the client library
    'apps/orbital/refresh_job.py',           # the one scheduled caller
    'apps/orbital/tests/test_satellites.py',
    'apps/orbital/tests/test_refresh_job.py',
    'apps/orbital/tests/test_spacetrack_single_client.py',
    'apps/orbital/.env.example',
    '.env.example',
    '.github/workflows/refresh-catalog.yml',
    'infra/terraform/ecs.tf',                # dead AWS definition, kept for history
}

SKIP_DIRS = {'docs'}
TEXT_SUFFIXES = {'.py', '.ts', '.tsx', '.js', '.mjs', '.json', '.yml', '.yaml', '.tf',
                 '.example', '.sh', '.glsl'}


def _source_files():
    """Tracked files only.

    An earlier version walked the filesystem and flagged .claude/settings.local.json, a
    gitignored local file. What ships is what git tracks, so ask git.
    """
    listed = subprocess.run(['git', 'ls-files', '-z'], cwd=REPO,
                            capture_output=True, text=True, check=True).stdout
    for rel in filter(None, listed.split('\0')):
        path = REPO / rel
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in pathlib.PurePath(rel).parts):
            continue
        if path.suffix not in TEXT_SUFFIXES and path.name != '.env.example':
            continue
        yield path


def test_no_serverless_function_mentions_space_track():
    """A Vercel function querying Space-Track is the exact shape of the suspension.

    These run per-request, per-edge-location, with no shared rate clock between them, so
    there is no safe way for one to hold a once-per-hour budget.
    """
    offenders = []
    for path in (REPO / 'api').rglob('*'):
        if path.is_file() and path.suffix in TEXT_SUFFIXES:
            if SPACETRACK.search(path.read_text(errors='ignore')):
                offenders.append(str(path.relative_to(REPO)))
    assert offenders == [], (
        f'Serverless functions must never reach Space-Track: {offenders}. '
        'Read the catalog copy in Vercel Blob instead.'
    )


def test_the_frontend_never_mentions_space_track():
    """Browser code fans out per visitor, which is worse than per edge location."""
    offenders = [
        str(p.relative_to(REPO)) for p in (REPO / 'apps/web/src').rglob('*')
        if p.is_file() and p.suffix in TEXT_SUFFIXES
        and SPACETRACK.search(p.read_text(errors='ignore'))
    ]
    assert offenders == []


def test_space_track_callers_stay_on_the_allowlist():
    """Catches a new caller anywhere in the repo, not just the two places we thought of."""
    found = {
        str(p.relative_to(REPO)) for p in _source_files()
        if SPACETRACK.search(p.read_text(errors='ignore'))
    }
    unexpected = found - ALLOWED
    assert unexpected == set(), (
        f'New Space-Track reference(s): {sorted(unexpected)}. Exactly one process may query '
        'Space-Track. If this is deliberate, add it to ALLOWED and say why in review.'
    )


def test_the_catalog_endpoint_reads_the_blob_copy():
    """The positive half: /api/catalog must have a source, and it must not be Space-Track."""
    src = (REPO / 'api/catalog.ts').read_text()
    assert 'blob.vercel-storage.com' in src or 'CATALOG_BLOB_URL' in src
    assert not SPACETRACK.search(src)
    # The comment that records why is load-bearing; keep it from being deleted as noise.
    assert 'NEVER query Space-Track' in src


@pytest.mark.parametrize('name,expected', [
    ('GP_MIN_INTERVAL_SECONDS', 3600),   # gp: at most one query per hour
    ('GP_QUERY_MINUTE', 17),             # off-peak minute, per Space-Track's guidance
])
def test_rate_limit_constants_are_not_quietly_loosened(name, expected):
    """A tripwire, not a re-test of behaviour. Relaxing either of these is how a compliant
    system becomes a non-compliant one without any single change looking wrong."""
    import satellites
    assert getattr(satellites, name) == expected
