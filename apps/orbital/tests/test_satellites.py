import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import satellites


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


def _make_mock_client(response_data):
    mock_resp = MagicMock()
    mock_resp.json.return_value = response_data
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


class TestGetSatellites:
    def setup_method(self):
        satellites._cache['tles'] = []
        satellites._cache['fetched_at'] = 0.0

    def test_returns_list_of_tle_records(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_satellites())

        assert isinstance(result, list)
        assert len(result) == 2

    def test_record_has_required_fields(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_satellites())

        rec = result[0]
        assert rec['name'] == 'ISS (ZARYA)'
        assert rec['norad_id'] == '25544'
        assert 'tle1' in rec
        assert 'tle2' in rec

    def test_norad_id_is_string(self):
        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_satellites())

        assert isinstance(result[0]['norad_id'], str)

    def test_uses_cache_within_ttl(self):
        cached = [{'name': 'CACHED', 'norad_id': '99999', 'tle1': 'x', 'tle2': 'y'}]
        satellites._cache['tles'] = cached
        satellites._cache['fetched_at'] = time.time()

        with patch('satellites.httpx.AsyncClient') as MockClient:
            result = asyncio.run(satellites.get_satellites())
            MockClient.assert_not_called()

        assert result == cached

    def test_bypasses_cache_when_expired(self):
        satellites._cache['tles'] = [{'name': 'OLD', 'norad_id': '00000', 'tle1': 'x', 'tle2': 'y'}]
        satellites._cache['fetched_at'] = time.time() - (4 * 3600 + 1)

        mock_client = _make_mock_client(SAMPLE_API_RESPONSE)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_satellites())

        assert result[0]['name'] == 'ISS (ZARYA)'

    def test_limit_applied_to_large_response(self):
        many_sats = [
            {
                'OBJECT_NAME': f'SAT-{i}',
                'NORAD_CAT_ID': str(i),
                'TLE_LINE1': '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993',
                'TLE_LINE2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522',
            }
            for i in range(satellites.LIMIT + 100)
        ]
        mock_client = _make_mock_client(many_sats)
        with patch('satellites.httpx.AsyncClient') as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_satellites())

        assert len(result) == satellites.LIMIT
