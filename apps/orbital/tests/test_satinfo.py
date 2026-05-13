import math

import pytest

from satinfo import satellite_info

ISS_TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
ISS_TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'

SAMPLE_CATALOG = [
    {'name': 'ISS (ZARYA)', 'norad_id': '25544', 'tle1': ISS_TLE1, 'tle2': ISS_TLE2},
    {'name': 'HUBBLE SPACE TELESCOPE', 'norad_id': '20580',
     'tle1': '1 20580U 90037B   24087.54791667  .00001000  00000-0  50000-4 0  9990',
     'tle2': '2 20580  28.4700 100.0000 0002500  50.0000 310.0000 15.09000000000001'},
    {'name': 'STARLINK-1', 'norad_id': '44713',
     'tle1': '1 44713U 19074A   24087.54791667  .00001000  00000-0  10000-3 0  9990',
     'tle2': '2 44713  53.0000 100.0000 0001000  50.0000 310.0000 15.06000000000001'},
]


class TestSatelliteInfo:
    def test_returns_none_for_unknown_name(self):
        result = satellite_info(SAMPLE_CATALOG, 'NONEXISTENT SATELLITE XYZ')
        assert result is None

    def test_returns_none_for_unknown_norad_id(self):
        result = satellite_info(SAMPLE_CATALOG, '99999')
        assert result is None

    def test_finds_by_exact_norad_id(self):
        result = satellite_info(SAMPLE_CATALOG, '25544')
        assert result is not None
        assert result['norad_id'] == '25544'
        assert result['name'] == 'ISS (ZARYA)'

    def test_finds_by_name_substring_case_insensitive(self):
        result = satellite_info(SAMPLE_CATALOG, 'hubble')
        assert result is not None
        assert result['norad_id'] == '20580'

    def test_finds_by_partial_name(self):
        result = satellite_info(SAMPLE_CATALOG, 'starlink')
        assert result is not None
        assert result['norad_id'] == '44713'

    def test_result_has_required_fields(self):
        result = satellite_info(SAMPLE_CATALOG, '25544')
        assert result is not None
        for field in ('name', 'norad_id', 'latitude', 'longitude',
                      'altitude_km', 'velocity_kmps', 'orbital_period_min', 'inclination_deg'):
            assert field in result, f'Missing field: {field}'

    def test_latitude_in_valid_range(self):
        result = satellite_info(SAMPLE_CATALOG, '25544')
        assert result is not None
        assert -90 <= result['latitude'] <= 90

    def test_longitude_in_valid_range(self):
        result = satellite_info(SAMPLE_CATALOG, '25544')
        assert result is not None
        assert -180 <= result['longitude'] <= 180

    def test_altitude_positive(self):
        result = satellite_info(SAMPLE_CATALOG, '25544')
        assert result is not None
        assert result['altitude_km'] > 0

    def test_velocity_reasonable_for_leo(self):
        # LEO satellites travel ~7-8 km/s
        result = satellite_info(SAMPLE_CATALOG, '25544')
        assert result is not None
        assert 6 < result['velocity_kmps'] < 10

    def test_iss_period_approximately_92_minutes(self):
        result = satellite_info(SAMPLE_CATALOG, '25544')
        assert result is not None
        assert 90 < result['orbital_period_min'] < 96

    def test_iss_inclination_approximately_51_degrees(self):
        result = satellite_info(SAMPLE_CATALOG, '25544')
        assert result is not None
        assert 50 < result['inclination_deg'] < 53

    def test_norad_id_match_takes_priority_over_name(self):
        # If query is all-digits, try NORAD ID first
        result = satellite_info(SAMPLE_CATALOG, '25544')
        assert result is not None
        assert result['norad_id'] == '25544'
