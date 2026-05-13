import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import satellites
from main import app


SAMPLE_API_RESPONSE = [
    {
        'OBJECT_NAME': 'ISS (ZARYA)',
        'NORAD_CAT_ID': 25544,
        'TLE_LINE1': '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993',
        'TLE_LINE2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
    },
    {
        'OBJECT_NAME': 'STARLINK-1',
        'NORAD_CAT_ID': 44713,
        'TLE_LINE1': '1 44713U 19074A   24087.54791667  .00001000  00000-0  10000-3 0  9990',
        'TLE_LINE2': '2 44713  53.0000 100.0000 0001000  50.0000 310.0000 15.06000000000001',
    },
]

ENV_VARS = {'SPACETRACK_USER': 'user@example.com', 'SPACETRACK_PASS': 'secret'}


def _make_mock_client(response_data):
    mock_resp = MagicMock()
    mock_resp.json.return_value = response_data
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=MagicMock(raise_for_status=MagicMock()))
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


CELESTRAK_SAMPLE = [
    {
        'OBJECT_NAME': 'ISS (ZARYA)',
        'NORAD_CAT_ID': 25544,
        'TLE_LINE1': '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993',
        'TLE_LINE2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
    },
    {
        'OBJECT_NAME': 'HUBBLE',
        'NORAD_CAT_ID': 20580,
        'TLE_LINE1': '1 20580U 90037B   24087.54791667  .00001000  00000-0  10000-3 0  9990',
        'TLE_LINE2': '2 20580  28.4700 100.0000 0002800  50.0000 310.0000 15.09000000000001',
    },
]

SAMPLE_TLE_LIST = [
    {'name': 'ISS (ZARYA)', 'norad_id': '25544', 'tle1': 'a', 'tle2': 'b'},
]


class TestFetchCelesTrak:
    def test_returns_parsed_tle_list(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = CELESTRAK_SAMPLE
        mock_resp.raise_for_status = MagicMock()
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_celestrak())
        assert len(result) == 2
        assert result[0]['name'] == 'ISS (ZARYA)'
        assert result[0]['norad_id'] == '25544'
        assert 'tle1' in result[0]
        assert 'tle2' in result[0]

    def test_sends_user_agent_header(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = CELESTRAK_SAMPLE
        mock_resp.raise_for_status = MagicMock()
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            asyncio.run(satellites._fetch_celestrak())
        _, call_kwargs = mock_client.get.call_args
        assert 'User-Agent' in call_kwargs.get('headers', {})

    def test_applies_limit(self):
        many = [
            {'OBJECT_NAME': f'SAT-{i}', 'NORAD_CAT_ID': i,
             'TLE_LINE1': CELESTRAK_SAMPLE[0]['TLE_LINE1'],
             'TLE_LINE2': CELESTRAK_SAMPLE[0]['TLE_LINE2']}
            for i in range(satellites.LIMIT + 50)
        ]
        mock_resp = MagicMock()
        mock_resp.json.return_value = many
        mock_resp.raise_for_status = MagicMock()
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_celestrak())
        assert len(result) == satellites.LIMIT


class TestFetchSpacetrack:
    def test_returns_parsed_tle_list(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient, patch.dict('os.environ', ENV_VARS):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_spacetrack())
        assert isinstance(result, list)
        assert len(result) == 2

    def test_record_has_required_fields(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient, patch.dict('os.environ', ENV_VARS):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_spacetrack())
        rec = result[0]
        assert rec['name'] == 'ISS (ZARYA)'
        assert rec['norad_id'] == '25544'
        assert 'tle1' in rec
        assert 'tle2' in rec

    def test_norad_id_is_string(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient, patch.dict('os.environ', ENV_VARS):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_spacetrack())
        assert isinstance(result[0]['norad_id'], str)

    def test_limit_applied_to_large_response(self):
        many_sats = [
            {
                'OBJECT_NAME': f'SAT-{i}', 'NORAD_CAT_ID': i,
                'TLE_LINE1': '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993',
                'TLE_LINE2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
            }
            for i in range(satellites.LIMIT + 100)
        ]
        mock_client = _make_mock_client(many_sats)
        with patch('satellites.httpx.AsyncClient') as MockClient, patch.dict('os.environ', ENV_VARS):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_spacetrack())
        assert len(result) == satellites.LIMIT

    def test_raises_if_credentials_missing(self):
        with patch.dict('os.environ', {}, clear=True):
            with pytest.raises(ValueError, match='SPACETRACK_USER and SPACETRACK_PASS'):
                asyncio.run(satellites._fetch_spacetrack())

    def test_posts_credentials_to_login_url(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient, patch.dict('os.environ', ENV_VARS):
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            asyncio.run(satellites._fetch_spacetrack())
        mock_client.post.assert_called_once_with(
            satellites.SPACETRACK_LOGIN_URL,
            data={'identity': ENV_VARS['SPACETRACK_USER'], 'password': ENV_VARS['SPACETRACK_PASS']},
        )


class TestGetSatellitesFallback:
    def setup_method(self):
        satellites._cache['tles'] = []
        satellites._cache['fetched_at'] = 0.0

    def test_uses_celestrak_when_available(self):
        with patch('satellites._fetch_celestrak', AsyncMock(return_value=SAMPLE_TLE_LIST)), \
             patch('satellites._fetch_spacetrack', AsyncMock(side_effect=AssertionError('should not call spacetrack'))):
            result = asyncio.run(satellites.get_satellites())
        assert result == SAMPLE_TLE_LIST

    def test_falls_back_to_spacetrack_on_celestrak_failure(self):
        with patch('satellites._fetch_celestrak', AsyncMock(side_effect=Exception('blocked'))), \
             patch('satellites._fetch_spacetrack', AsyncMock(return_value=SAMPLE_TLE_LIST)):
            result = asyncio.run(satellites.get_satellites())
        assert result == SAMPLE_TLE_LIST

    def test_raises_if_both_sources_fail(self):
        with patch('satellites._fetch_celestrak', AsyncMock(side_effect=Exception('blocked'))), \
             patch('satellites._fetch_spacetrack', AsyncMock(side_effect=ValueError('no creds'))):
            with pytest.raises((Exception, ValueError)):
                asyncio.run(satellites.get_satellites())

    def test_caches_celestrak_result(self):
        with patch('satellites._fetch_celestrak', AsyncMock(return_value=SAMPLE_TLE_LIST)) as mock_ct:
            asyncio.run(satellites.get_satellites())
            asyncio.run(satellites.get_satellites())
        mock_ct.assert_called_once()


class TestGetSatellitesCache:
    def setup_method(self):
        satellites._cache['tles'] = []
        satellites._cache['fetched_at'] = 0.0

    def test_uses_cache_within_ttl(self):
        cached = [{'name': 'CACHED', 'norad_id': '99999', 'tle1': 'x', 'tle2': 'y'}]
        satellites._cache['tles'] = cached
        satellites._cache['fetched_at'] = time.time()
        with patch('satellites._fetch_celestrak', AsyncMock()) as mock_ct:
            result = asyncio.run(satellites.get_satellites())
            mock_ct.assert_not_called()
        assert result == cached

    def test_bypasses_cache_when_expired(self):
        satellites._cache['tles'] = [{'name': 'OLD', 'norad_id': '00000', 'tle1': 'x', 'tle2': 'y'}]
        satellites._cache['fetched_at'] = time.time() - (4 * 3600 + 1)
        with patch('satellites._fetch_celestrak', AsyncMock(return_value=SAMPLE_TLE_LIST)):
            result = asyncio.run(satellites.get_satellites())
        assert result[0]['name'] == 'ISS (ZARYA)'


class TestSatellitesEndpoint:
    def test_returns_200_with_list(self):
        mock_tles = [{'name': 'ISS', 'norad_id': '25544', 'tle1': 'a', 'tle2': 'b'}]
        with patch('main.get_satellites', AsyncMock(return_value=mock_tles)):
            client = TestClient(app)
            response = client.get('/satellites')
        assert response.status_code == 200
        assert response.json() == mock_tles

    def test_returns_503_on_fetch_failure(self):
        with patch('main.get_satellites', AsyncMock(side_effect=Exception('network error'))):
            client = TestClient(app)
            response = client.get('/satellites')
        assert response.status_code == 503
