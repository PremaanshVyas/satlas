import math
from typing import Optional

from skyfield.api import EarthSatellite, load, wgs84

_ts = load.timescale(builtin=True)


def satellite_info(catalog: list, query: str) -> Optional[dict]:
    """
    Search catalog by NORAD ID (if query is all digits) or name (case-insensitive substring).
    Returns current orbital snapshot or None if not found.
    """
    query_stripped = query.strip()

    sat_data = None
    if query_stripped.isdigit():
        for item in catalog:
            if item['norad_id'] == query_stripped:
                sat_data = item
                break

    if sat_data is None:
        query_lower = query_stripped.lower()
        for item in catalog:
            if query_lower in item['name'].lower():
                sat_data = item
                break

    if sat_data is None:
        return None

    try:
        sat = EarthSatellite(sat_data['tle1'], sat_data['tle2'], sat_data['name'], _ts)
        t = _ts.now()
        pos = sat.at(t)
        subpoint = wgs84.subpoint(pos)

        vel = pos.velocity.km_per_s
        velocity_kmps = round(math.sqrt(vel[0] ** 2 + vel[1] ** 2 + vel[2] ** 2), 2)

        # no_kozai is mean motion in radians/minute; period = 2π / no_kozai (minutes)
        period_min = round(2 * math.pi / sat.model.no_kozai, 1)

        # inclo is inclination in radians
        inclination_deg = round(sat.model.inclo * 180 / math.pi, 2)
    except Exception:
        return None

    return {
        'name': sat_data['name'],
        'norad_id': sat_data['norad_id'],
        'latitude': round(subpoint.latitude.degrees, 4),
        'longitude': round(subpoint.longitude.degrees, 4),
        'altitude_km': round(subpoint.elevation.km, 1),
        'velocity_kmps': velocity_kmps,
        'orbital_period_min': period_min,
        'inclination_deg': inclination_deg,
    }
