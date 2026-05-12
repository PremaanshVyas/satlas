import math

from skyfield.api import EarthSatellite, load, wgs84

_ts = load.timescale(builtin=True)
EARTH_RADIUS_KM = 6371.0


def great_circle_distance_km(
    lat1_deg: float, lon1_deg: float, lat2_deg: float, lon2_deg: float
) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1_deg, lon1_deg, lat2_deg, lon2_deg])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def satellites_overhead(
    catalog: list[dict],
    latitude: float,
    longitude: float,
    radius_km: float,
) -> list[dict]:
    """Return up to 20 satellites within radius_km of the observer, sorted by elevation desc.

    Results are filtered to elevation_deg > -5 (near-horizon-or-above) to exclude satellites
    clearly below the horizon while keeping a small buffer for atmospheric refraction.
    """
    t = _ts.now()
    observer = wgs84.latlon(latitude, longitude)
    results = []

    for sat_data in catalog:
        try:
            sat = EarthSatellite(sat_data['tle1'], sat_data['tle2'], sat_data['name'], _ts)
            pos = sat.at(t)
            subpoint = wgs84.subpoint(pos)
            sat_lat = subpoint.latitude.degrees
            sat_lon = subpoint.longitude.degrees
            distance = great_circle_distance_km(latitude, longitude, sat_lat, sat_lon)
            if distance > radius_km:
                continue
            diff = sat - observer
            alt, az, _ = diff.at(t).altaz()
            if alt.degrees <= -5:
                continue
            results.append({
                'name': sat_data['name'],
                'norad_id': sat_data['norad_id'],
                'altitude_km': round(subpoint.elevation.km, 1),
                'azimuth_deg': round(az.degrees, 1),
                'elevation_deg': round(alt.degrees, 1),
            })
        except Exception:
            continue

    results.sort(key=lambda x: x['elevation_deg'], reverse=True)
    return results[:20]
