from skyfield.api import load, wgs84, EarthSatellite
from typing import Any, Optional

ISS_TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
ISS_TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'

_ts = load.timescale(builtin=True)
_iss = EarthSatellite(ISS_TLE1, ISS_TLE2, 'ISS (ZARYA)', _ts)


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

    times, events = sat.find_events(location, t0, t1, altitude_degrees=10.0)

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

    return passes
