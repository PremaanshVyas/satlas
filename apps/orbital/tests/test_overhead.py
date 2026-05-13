import math

import pytest

from overhead import satellites_overhead, great_circle_distance_km

# A valid LEO TLE for testing — ISS
ISS_TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
ISS_TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'

SAMPLE_CATALOG = [
    {'name': 'ISS (ZARYA)', 'norad_id': '25544', 'tle1': ISS_TLE1, 'tle2': ISS_TLE2},
    {'name': 'STARLINK-1', 'norad_id': '44713',
     'tle1': '1 44713U 19074A   24087.54791667  .00001000  00000-0  10000-3 0  9990',
     'tle2': '2 44713  53.0000 100.0000 0001000  50.0000 310.0000 15.06000000000001'},
]


class TestGreatCircleDistance:
    def test_same_point_is_zero(self):
        assert great_circle_distance_km(0, 0, 0, 0) == pytest.approx(0.0)

    def test_quarter_circumference(self):
        # From equator (0,0) to north pole (90,0) = 90 degrees = π/2 radians × R
        d = great_circle_distance_km(0, 0, 90, 0)
        assert d == pytest.approx(math.pi / 2 * 6371, rel=1e-3)

    def test_known_city_distance(self):
        # Melbourne to Sydney: approx 713 km
        d = great_circle_distance_km(-37.8136, 144.9631, -33.8688, 151.2093)
        assert 700 < d < 730


class TestSatellitesOverhead:
    def test_returns_list(self):
        result = satellites_overhead(SAMPLE_CATALOG, -37.8136, 144.9631, 10000)
        assert isinstance(result, list)

    def test_each_result_has_required_fields(self):
        result = satellites_overhead(SAMPLE_CATALOG, -37.8136, 144.9631, 10000)
        if result:
            sat = result[0]
            assert 'name' in sat
            assert 'norad_id' in sat
            assert 'altitude_km' in sat
            assert 'azimuth_deg' in sat
            assert 'elevation_deg' in sat

    def test_sorted_by_elevation_descending(self):
        result = satellites_overhead(SAMPLE_CATALOG, -37.8136, 144.9631, 10000)
        elevations = [s['elevation_deg'] for s in result]
        assert elevations == sorted(elevations, reverse=True)

    def test_zero_radius_returns_empty(self):
        result = satellites_overhead(SAMPLE_CATALOG, -37.8136, 144.9631, 0)
        assert result == []

    def test_limited_to_20_results(self):
        # Build catalog with 30 identical entries (different names)
        big_catalog = [
            {'name': f'SAT-{i}', 'norad_id': str(i),
             'tle1': ISS_TLE1, 'tle2': ISS_TLE2}
            for i in range(30)
        ]
        result = satellites_overhead(big_catalog, -37.8136, 144.9631, 10000)
        assert len(result) <= 20

    def test_skips_invalid_tles_gracefully(self):
        catalog_with_bad = SAMPLE_CATALOG + [
            {'name': 'BAD', 'norad_id': '99999', 'tle1': 'invalid', 'tle2': 'invalid'}
        ]
        # Should not raise — just skip the bad one
        result = satellites_overhead(catalog_with_bad, -37.8136, 144.9631, 10000)
        assert isinstance(result, list)
