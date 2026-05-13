import math
from unittest.mock import AsyncMock, patch

import pytest

from satinfo import satellite_info

ISS_TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
ISS_TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'

# A fresh TLE with a different epoch — simulates the 5-min ISS cache having a newer update
FRESH_ISS_TLE1 = '1 25544U 98067A   24088.00000000  .00016000  00000-0  10000-3 0  9998'
FRESH_ISS_TLE2 = '2 25544  51.6412 190.0000 0001944  60.0000 300.0000 15.50000000443600'

SAMPLE_CATALOG = [
    {'name': 'ISS (ZARYA)', 'norad_id': '25544', 'tle1': ISS_TLE1, 'tle2': ISS_TLE2},
    {'name': 'HUBBLE SPACE TELESCOPE', 'norad_id': '20580',
     'tle1': '1 20580U 90037B   24087.54791667  .00001000  00000-0  50000-4 0  9990',
     'tle2': '2 20580  28.4700 100.0000 0002500  50.0000 310.0000 15.09000000000001'},
    {'name': 'STARLINK-1', 'norad_id': '44713',
     'tle1': '1 44713U 19074A   24087.54791667  .00001000  00000-0  10000-3 0  9990',
     'tle2': '2 44713  53.0000 100.0000 0001000  50.0000 310.0000 15.06000000000001'},
]

_ISS_TLE_MOCK = {'tle1': ISS_TLE1, 'tle2': ISS_TLE2}


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


class TestSatelliteInfoFreshTles:
    """fresh_tles lets the endpoint inject a fresher ISS TLE so chatbot and globe agree."""

    def test_fresh_tle_used_for_matching_norad_id(self):
        result_catalog = satellite_info(SAMPLE_CATALOG, '25544')
        result_fresh = satellite_info(SAMPLE_CATALOG, '25544', {'25544': {'tle1': FRESH_ISS_TLE1, 'tle2': FRESH_ISS_TLE2}})
        assert result_catalog is not None
        assert result_fresh is not None
        assert result_fresh['norad_id'] == '25544'
        assert result_fresh['name'] == 'ISS (ZARYA)'
        # Both TLEs are valid LEO positions
        assert -90 <= result_fresh['latitude'] <= 90
        assert -180 <= result_fresh['longitude'] <= 180
        assert result_fresh['altitude_km'] > 0

    def test_fresh_tle_not_applied_to_different_norad_id(self):
        # ISS override must not affect Hubble queries.
        # Both calls propagate to `now` independently (milliseconds apart), so
        # positions may differ by < 0.001° (~100 m at LEO speed). Use approx.
        result_no_override = satellite_info(SAMPLE_CATALOG, 'hubble')
        result_with_iss_override = satellite_info(
            SAMPLE_CATALOG, 'hubble', {'25544': {'tle1': FRESH_ISS_TLE1, 'tle2': FRESH_ISS_TLE2}}
        )
        assert result_no_override is not None
        assert result_with_iss_override is not None
        assert result_with_iss_override['latitude'] == pytest.approx(result_no_override['latitude'], abs=0.01)
        assert result_with_iss_override['longitude'] == pytest.approx(result_no_override['longitude'], abs=0.01)

    def test_none_fresh_tles_identical_to_no_parameter(self):
        result_default = satellite_info(SAMPLE_CATALOG, '25544')
        result_none = satellite_info(SAMPLE_CATALOG, '25544', None)
        assert result_default is not None
        assert result_none is not None
        assert result_default['latitude'] == pytest.approx(result_none['latitude'], abs=0.01)
        assert result_default['longitude'] == pytest.approx(result_none['longitude'], abs=0.01)

    def test_empty_fresh_tles_dict_behaves_as_no_override(self):
        result_default = satellite_info(SAMPLE_CATALOG, '25544')
        result_empty = satellite_info(SAMPLE_CATALOG, '25544', {})
        assert result_default is not None
        assert result_empty is not None
        assert result_default['latitude'] == pytest.approx(result_empty['latitude'], abs=0.01)


class TestSatelliteInfoEndpoint:
    def test_returns_200_with_result(self):
        mock_result = {
            'name': 'ISS (ZARYA)', 'norad_id': '25544',
            'latitude': -37.5, 'longitude': 145.0, 'altitude_km': 420.0,
            'velocity_kmps': 7.66, 'orbital_period_min': 92.9, 'inclination_deg': 51.64,
        }
        with patch('main.satellite_info', return_value=mock_result), \
             patch('main.get_satellites', AsyncMock(return_value=[])), \
             patch('main.get_iss_tle', AsyncMock(return_value=_ISS_TLE_MOCK)):
            from fastapi.testclient import TestClient
            from main import app
            client = TestClient(app)
            resp = client.get('/satellite-info?query=25544')
        assert resp.status_code == 200
        assert resp.json() == mock_result

    def test_returns_404_when_not_found(self):
        with patch('main.satellite_info', return_value=None), \
             patch('main.get_satellites', AsyncMock(return_value=[])), \
             patch('main.get_iss_tle', AsyncMock(return_value=_ISS_TLE_MOCK)):
            from fastapi.testclient import TestClient
            from main import app
            client = TestClient(app)
            resp = client.get('/satellite-info?query=NONEXISTENT')
        assert resp.status_code == 404

    def test_returns_503_on_catalog_failure(self):
        with patch('main.get_satellites', AsyncMock(side_effect=Exception('fetch failed'))), \
             patch('main.get_iss_tle', AsyncMock(return_value=_ISS_TLE_MOCK)):
            from fastapi.testclient import TestClient
            from main import app
            client = TestClient(app)
            resp = client.get('/satellite-info?query=hubble')
        assert resp.status_code == 503

    def test_iss_tle_failure_does_not_break_endpoint(self):
        # If fresh ISS TLE fetch fails, endpoint falls back to catalog TLE gracefully
        mock_result = {
            'name': 'ISS (ZARYA)', 'norad_id': '25544',
            'latitude': 10.0, 'longitude': 20.0, 'altitude_km': 420.0,
            'velocity_kmps': 7.66, 'orbital_period_min': 92.9, 'inclination_deg': 51.64,
        }
        with patch('main.satellite_info', return_value=mock_result), \
             patch('main.get_satellites', AsyncMock(return_value=[])), \
             patch('main.get_iss_tle', AsyncMock(side_effect=Exception('ISS TLE fetch failed'))):
            from fastapi.testclient import TestClient
            from main import app
            client = TestClient(app)
            resp = client.get('/satellite-info?query=25544')
        assert resp.status_code == 200
        assert resp.json() == mock_result

    def test_query_param_required(self):
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        resp = client.get('/satellite-info')
        assert resp.status_code == 422
