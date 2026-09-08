"""Pass prediction, ported from the ECS orbital service after AWS was suspended.

The algorithm is a verbatim copy of apps/orbital/passes.py. It is duplicated rather than
imported because Vercel bundles each function independently and cross-directory imports
resolve at build time but fail at runtime (see the S32 ADR, which cost two failed attempts
to learn). tests/test_pass_parity.py loads both copies and asserts they agree, so the
duplication cannot drift silently.

Deliberately the same skyfield code rather than a satellite.js reimplementation:
find_events decides pass boundaries, and a different implementation would shift rise/set
times by seconds and change which marginal passes appear at all.

Pure by construction — latitude, longitude, hours and a TLE in; passes out. No catalog, no
database, no credentials. api/pass.ts resolves the TLE from the catalog before calling.
skyfield's builtin timescale is used, so no ephemeris file is downloaded at runtime.
"""

import json
from http.server import BaseHTTPRequestHandler
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

from skyfield.api import EarthSatellite, load, wgs84

# Bootstrap only, for a request that supplies no TLE. api/pass.ts always supplies one.
ISS_TLE1 = '1 25544U 98067A   26231.53387315  .00011071  00000-0  20501-3 0  9990'
ISS_TLE2 = '2 25544  51.6332 346.5707 0007665  63.0282 297.1489 15.49512520581579'

_ts = load.timescale(builtin=True)
_iss = EarthSatellite(ISS_TLE1, ISS_TLE2, 'ISS (ZARYA)', _ts)

MIN_ELEVATION_DEG = 10.0


def az_to_direction(az_deg: float) -> str:
    dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[round(az_deg / 45) % 8]


def predict_passes(
    latitude: float,
    longitude: float,
    hours_ahead: int = 24,
    tle1: Optional[str] = None,
    tle2: Optional[str] = None,
    name: Optional[str] = None,
) -> list[dict[str, Any]]:
    if tle1 and tle2:
        sat = EarthSatellite(tle1, tle2, name or 'UNKNOWN', _ts)
    else:
        sat = _iss

    location = wgs84.latlon(latitude, longitude)
    t0 = _ts.now()
    t1 = _ts.tt_jd(t0.tt + hours_ahead / 24.0)

    times, events = sat.find_events(location, t0, t1, altitude_degrees=MIN_ELEVATION_DEG)

    passes: list[dict[str, Any]] = []
    current: dict[str, Any] = {}

    for t, event in zip(times, events):
        if event == 0:  # rise above 10°
            current = {'start_utc': t.utc_iso()}
        elif event == 1:  # culmination (max elevation)
            diff = sat - location
            alt, az, _ = diff.at(t).altaz()
            current['max_elevation_deg'] = round(float(alt.degrees), 1)
            current['direction'] = az_to_direction(float(az.degrees))
        elif event == 2:  # set below 10°
            if 'start_utc' not in current:
                # Satellite was already above 10° when the window opened
                current['start_utc'] = t0.utc_iso()
            if 'max_elevation_deg' not in current:
                # Peak was before the window; sample altitude at window start
                diff = sat - location
                alt, az, _ = diff.at(t0).altaz()
                current['max_elevation_deg'] = round(float(alt.degrees), 1)
                current['direction'] = az_to_direction(float(az.degrees))
            current['end_utc'] = t.utc_iso()
            passes.append(current)
            current = {}

    # Satellite still above 10° at end of window — include the incomplete pass
    if 'start_utc' in current:
        if 'max_elevation_deg' not in current:
            diff = sat - location
            alt, az, _ = diff.at(t1).altaz()
            current['max_elevation_deg'] = round(float(alt.degrees), 1)
            current['direction'] = az_to_direction(float(az.degrees))
        current['end_utc'] = t1.utc_iso()
        passes.append(current)

    return [p for p in passes if p['start_utc'] < p['end_utc']]


def _one(qs: dict, key: str) -> Optional[str]:
    values = qs.get(key)
    return values[0] if values else None


def parse_request(query: str) -> tuple[Optional[dict], Optional[str]]:
    """Validate query params. Returns (kwargs, error). Ranges match the FastAPI Query
    constraints this replaces, so a request rejected there is still rejected here."""
    qs = parse_qs(query)

    raw_lat, raw_lon = _one(qs, 'latitude'), _one(qs, 'longitude')
    if raw_lat is None or raw_lon is None:
        return None, 'latitude and longitude are required'

    try:
        latitude = float(raw_lat)
        longitude = float(raw_lon)
    except ValueError:
        return None, 'latitude and longitude must be numbers'

    if not -90 <= latitude <= 90:
        return None, 'latitude must be between -90 and 90'
    if not -180 <= longitude <= 180:
        return None, 'longitude must be between -180 and 180'

    raw_hours = _one(qs, 'hours_ahead')
    hours_ahead = 24
    if raw_hours is not None:
        try:
            hours_ahead = int(raw_hours)
        except ValueError:
            return None, 'hours_ahead must be an integer'
        if not 1 <= hours_ahead <= 168:
            return None, 'hours_ahead must be between 1 and 168'

    tle1, tle2 = _one(qs, 'tle1'), _one(qs, 'tle2')
    if bool(tle1) != bool(tle2):
        return None, 'tle1 and tle2 must be supplied together'

    return {
        'latitude': latitude,
        'longitude': longitude,
        'hours_ahead': hours_ahead,
        'tle1': tle1,
        'tle2': tle2,
        'name': _one(qs, 'name'),
    }, None


class handler(BaseHTTPRequestHandler):
    def _respond(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        # Passes shift with the observer's clock, so this must not be cached.
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        kwargs, error = parse_request(urlparse(self.path).query)
        if error:
            self._respond(400, {'error': error})
            return
        try:
            self._respond(200, {'passes': predict_passes(**kwargs)})
        except Exception:
            # Never surface internal detail; the S40 rule about err.message applies here too.
            self._respond(500, {'error': 'Pass prediction temporarily unavailable.'})

    def log_message(self, *args) -> None:  # noqa: D102 — silence per-request stderr noise
        pass
