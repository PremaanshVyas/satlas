from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from main import app, _classify_satellite

client = TestClient(app)

SAMPLE_CATALOG = [
    {'name': 'ISS (ZARYA)', 'norad_id': '25544', 'tle1': '', 'tle2': ''},
    {'name': 'STARLINK-1', 'norad_id': '44713', 'tle1': '', 'tle2': ''},
    {'name': 'STARLINK-2', 'norad_id': '44714', 'tle1': '', 'tle2': ''},
    {'name': 'GPS BIIF-1', 'norad_id': '36585', 'tle1': '', 'tle2': ''},
    {'name': 'GPS BIII-1', 'norad_id': '43873', 'tle1': '', 'tle2': ''},
    {'name': 'NAVSTAR 81', 'norad_id': '56631', 'tle1': '', 'tle2': ''},
    {'name': 'IRIDIUM 180', 'norad_id': '43249', 'tle1': '', 'tle2': ''},
    {'name': 'ATLAS 5 R/B', 'norad_id': '40334', 'tle1': '', 'tle2': ''},
    {'name': 'FENGYUN 1C DEB', 'norad_id': '29780', 'tle1': '', 'tle2': ''},
    {'name': 'COSMOS 1408 DEBRIS', 'norad_id': '56789', 'tle1': '', 'tle2': ''},
    {'name': 'HUBBLE SPACE TELESCOPE', 'norad_id': '20580', 'tle1': '', 'tle2': ''},
]


class TestClassifySatellite:
    def test_starlink(self):
        assert _classify_satellite('STARLINK-1') == 'STARLINK'
        assert _classify_satellite('STARLINK-4000') == 'STARLINK'

    def test_gps_variants(self):
        assert _classify_satellite('GPS BIIF-1') == 'GPS'
        assert _classify_satellite('GPS BIII-5') == 'GPS'
        assert _classify_satellite('NAVSTAR 81') == 'GPS'

    def test_iridium(self):
        assert _classify_satellite('IRIDIUM 180') == 'IRIDIUM'

    def test_debris_rb(self):
        assert _classify_satellite('ATLAS 5 R/B') == 'DEBRIS'
        assert _classify_satellite('COSMOS 1408 DEBRIS') == 'DEBRIS'
        assert _classify_satellite('FENGYUN 1C DEB') == 'DEBRIS'
        # STARLINK prefix wins over DEB suffix (matches TypeScript classifySatellite order)
        assert _classify_satellite('STARLINK-3 DEB') == 'STARLINK'

    def test_other(self):
        assert _classify_satellite('HUBBLE SPACE TELESCOPE') == 'OTHER'
        assert _classify_satellite('TERRA') == 'OTHER'

    def test_case_insensitive(self):
        assert _classify_satellite('starlink-5') == 'STARLINK'
        assert _classify_satellite('iridium 33 deb') == 'IRIDIUM'


class TestSatelliteCategories:
    def test_returns_all_category_keys(self):
        with patch('main.get_satellites', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = SAMPLE_CATALOG
            response = client.get('/satellite-categories')
        assert response.status_code == 200
        data = response.json()
        assert set(data.keys()) == {'STARLINK', 'GPS', 'IRIDIUM', 'DEBRIS', 'OTHER'}

    def test_counts_are_correct(self):
        with patch('main.get_satellites', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = SAMPLE_CATALOG
            response = client.get('/satellite-categories')
        data = response.json()
        assert data['STARLINK'] == 2   # STARLINK-1, STARLINK-2
        assert data['GPS'] == 3        # GPS BIIF-1, GPS BIII-1, NAVSTAR 81
        assert data['IRIDIUM'] == 1    # IRIDIUM 180
        assert data['DEBRIS'] == 3     # ATLAS 5 R/B, STARLINK-3 DEB, COSMOS 1408 DEBRIS
        assert data['OTHER'] == 1      # HUBBLE SPACE TELESCOPE

    def test_iss_excluded_from_counts(self):
        with patch('main.get_satellites', new_callable=AsyncMock) as mock_get:
            # Catalog with only ISS → all counts should be 0
            mock_get.return_value = [{'name': 'ISS (ZARYA)', 'norad_id': '25544', 'tle1': '', 'tle2': ''}]
            response = client.get('/satellite-categories')
        data = response.json()
        assert sum(data.values()) == 0

    def test_returns_503_on_catalog_failure(self):
        with patch('main.get_satellites', new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = RuntimeError('catalog unavailable')
            response = client.get('/satellite-categories')
        assert response.status_code == 503
