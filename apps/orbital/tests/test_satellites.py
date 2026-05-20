import asyncio
import os
import sys
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import satellites
from main import app

ENV_VARS = {'SPACETRACK_USER': 'user@example.com', 'SPACETRACK_PASS': 'secret'}

# ── 3LE text fixtures ──────────────────────────────────────────────────────────

SPACETRACK_3LE = (
    '0 ISS (ZARYA)\n'
    '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993\n'
    '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522\n'
    '0 STARLINK-1\n'
    '1 44713U 19074A   24087.54791667  .00001000  00000-0  10000-3 0  9990\n'
    '2 44713  53.0000 100.0000 0001000  50.0000 310.0000 15.06000000000001\n'
)

CELESTRAK_3LE = (
    'ISS (ZARYA)\n'
    '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993\n'
    '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522\n'
)

ISS_TLE_TEXT = (
    'ISS (ZARYA)\n'
    '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993\n'
    '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522\n'
)


def _mock_httpx(text: str):
    """Return a patched httpx.AsyncClient that returns `text` from GET."""
    mock_resp = MagicMock()
    mock_resp.text = text
    mock_resp.raise_for_status = MagicMock()
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=MagicMock(raise_for_status=MagicMock()))
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


# ── _parse_tle_text ────────────────────────────────────────────────────────────

class TestParseTleText:
    def test_parses_two_satellites_from_celestrak(self):
        result = satellites._parse_tle_text(CELESTRAK_3LE)
        assert len(result) == 1
        assert result[0]['name'] == 'ISS (ZARYA)'

    def test_strips_space_track_zero_prefix(self):
        result = satellites._parse_tle_text(SPACETRACK_3LE)
        assert len(result) == 2
        assert result[0]['name'] == 'ISS (ZARYA)'   # not '0 ISS (ZARYA)'
        assert result[1]['name'] == 'STARLINK-1'

    def test_norad_id_extracted(self):
        result = satellites._parse_tle_text(SPACETRACK_3LE)
        assert result[0]['norad_id'] == '25544'

    def test_skips_malformed_lines(self):
        bad = 'GOOD SAT\n1 12345U ...\n2 12345 ...\nJUNK\n'
        assert len(satellites._parse_tle_text(bad)) == 1

    def test_empty_returns_empty(self):
        assert satellites._parse_tle_text('') == []


# ── _fetch_space_track_tles ────────────────────────────────────────────────────

class TestFetchSpaceTrackTles:
    def test_returns_parsed_list(self):
        mock_client = _mock_httpx(SPACETRACK_3LE)
        with patch('satellites.httpx.AsyncClient') as MC, patch.dict('os.environ', ENV_VARS):
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_space_track_tles())
        assert len(result) == 2
        assert result[0]['name'] == 'ISS (ZARYA)'

    def test_strips_zero_prefix_in_names(self):
        mock_client = _mock_httpx(SPACETRACK_3LE)
        with patch('satellites.httpx.AsyncClient') as MC, \
             patch.dict('os.environ', ENV_VARS):
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_space_track_tles())
        assert not any(r['name'].startswith('0 ') for r in result)

    def test_raises_if_credentials_missing(self):
        with patch.dict('os.environ', {}, clear=True):
            with pytest.raises(ValueError, match='SPACETRACK_USER'):
                asyncio.run(satellites._fetch_space_track_tles())

    def test_posts_to_login_url(self):
        mock_client = _mock_httpx(SPACETRACK_3LE)
        with patch('satellites.httpx.AsyncClient') as MC, patch.dict('os.environ', ENV_VARS):
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            asyncio.run(satellites._fetch_space_track_tles())
        mock_client.post.assert_called_once_with(
            satellites.SPACETRACK_LOGIN_URL,
            data={'identity': ENV_VARS['SPACETRACK_USER'], 'password': ENV_VARS['SPACETRACK_PASS']},
        )

    def test_raises_on_login_failure(self):
        mock_failed_resp = MagicMock()
        mock_failed_resp.raise_for_status = MagicMock(side_effect=Exception('401 Unauthorized'))
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_failed_resp)
        mock_client.get = AsyncMock()  # should never be called
        with patch('satellites.httpx.AsyncClient') as MC, patch.dict('os.environ', ENV_VARS):
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            with pytest.raises(Exception, match='401'):
                asyncio.run(satellites._fetch_space_track_tles())
        mock_client.get.assert_not_called()


# ── _fetch_space_track_satcat ─────────────────────────────────────────────────

SAMPLE_SATCAT_RAW = [
    {
        'INTLDES': '1998-067A', 'NORAD_CAT_ID': '25544', 'OBJECT_TYPE': 'PAYLOAD',
        'SATNAME': 'ISS (ZARYA)', 'COUNTRY': 'ISS', 'LAUNCH': '1998-11-20',
        'SITE': 'TTMTR', 'DECAY': None, 'CURRENT': 'Y',
        'OBJECT_ID': '1998-067A', 'OBJECT_NUMBER': '25544',
    }
]


def _mock_httpx_json(payload):
    """Return a patched httpx.AsyncClient that returns `payload` from GET .json()."""
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value=payload)
    mock_resp.raise_for_status = MagicMock()
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=MagicMock(raise_for_status=MagicMock()))
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


class TestFetchSpaceTrackSatcat:
    def test_returns_raw_json_list(self):
        mock_client = _mock_httpx_json(SAMPLE_SATCAT_RAW)
        with patch('satellites.httpx.AsyncClient') as MC, patch.dict('os.environ', ENV_VARS):
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_space_track_satcat())
        assert result == SAMPLE_SATCAT_RAW

    def test_raises_if_credentials_missing(self):
        with patch.dict('os.environ', {}, clear=True):
            with pytest.raises(ValueError, match='SPACETRACK_USER'):
                asyncio.run(satellites._fetch_space_track_satcat())


class TestS3PutSatcat:
    def test_writes_satcat_json_to_s3(self):
        mock_s3 = MagicMock()
        with patch('satellites.boto3.client', return_value=mock_s3), \
             patch.dict('os.environ', {'CATALOG_BUCKET': 'satlas-catalog'}):
            satellites._s3_put_satcat(SAMPLE_SATCAT_RAW)
        mock_s3.put_object.assert_called_once()
        kwargs = mock_s3.put_object.call_args.kwargs
        assert kwargs['Key'] == 'satcat.json'
        assert kwargs['ContentType'] == 'application/json'

    def test_condensed_output_has_required_fields(self):
        import json as _json
        mock_s3 = MagicMock()
        with patch('satellites.boto3.client', return_value=mock_s3), \
             patch.dict('os.environ', {'CATALOG_BUCKET': 'satlas-catalog'}):
            satellites._s3_put_satcat(SAMPLE_SATCAT_RAW)
        body = mock_s3.put_object.call_args.kwargs['Body']
        rows = _json.loads(body)
        assert rows[0]['norad_id'] == '25544'
        assert rows[0]['type'] == 'PAY'   # normalized from PAYLOAD
        assert rows[0]['launch'] == '1998-11-20'

    def test_skips_when_no_bucket(self):
        mock_s3 = MagicMock()
        with patch('satellites.boto3.client', return_value=mock_s3), \
             patch.dict('os.environ', {}, clear=True):
            satellites._s3_put_satcat(SAMPLE_SATCAT_RAW)
        mock_s3.put_object.assert_not_called()


# ── _s3_refresh ────────────────────────────────────────────────────────────────

SAMPLE_TLES = [
    {'name': 'ISS (ZARYA)', 'norad_id': '25544',
     'tle1': '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993',
     'tle2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'},
]


class TestS3Refresh:
    def setup_method(self):
        satellites._cache['tles'] = []
        satellites._cache['fetched_at'] = 0.0

    def test_updates_in_memory_cache(self):
        mock_s3 = MagicMock()
        with patch('satellites._fetch_space_track_tles', AsyncMock(return_value=SAMPLE_TLES)), \
             patch('satellites._fetch_space_track_satcat', AsyncMock(return_value=SAMPLE_SATCAT_RAW)), \
             patch('satellites.boto3.client', return_value=mock_s3), \
             patch.dict('os.environ', {'CATALOG_BUCKET': 'satlas-catalog'}):
            asyncio.run(satellites._s3_refresh())
        assert satellites._cache['tles'] == SAMPLE_TLES
        assert satellites._cache['fetched_at'] > 0

    def test_writes_catalog_to_s3(self):
        mock_s3 = MagicMock()
        with patch('satellites._fetch_space_track_tles', AsyncMock(return_value=SAMPLE_TLES)), \
             patch('satellites._fetch_space_track_satcat', AsyncMock(return_value=SAMPLE_SATCAT_RAW)), \
             patch('satellites.boto3.client', return_value=mock_s3), \
             patch.dict('os.environ', {'CATALOG_BUCKET': 'satlas-catalog'}):
            asyncio.run(satellites._s3_refresh())
        calls_by_key = {c.kwargs['Key']: c.kwargs for c in mock_s3.put_object.call_args_list}
        assert 'catalog.tle' in calls_by_key
        assert calls_by_key['catalog.tle']['Bucket'] == 'satlas-catalog'
        assert calls_by_key['catalog.tle']['ContentType'] == 'text/plain'
        assert 'satcat.json' in calls_by_key

    def test_s3_object_contains_tle_data(self):
        mock_s3 = MagicMock()
        with patch('satellites._fetch_space_track_tles', AsyncMock(return_value=SAMPLE_TLES)), \
             patch('satellites._fetch_space_track_satcat', AsyncMock(return_value=SAMPLE_SATCAT_RAW)), \
             patch('satellites.boto3.client', return_value=mock_s3), \
             patch.dict('os.environ', {'CATALOG_BUCKET': 'satlas-catalog'}):
            asyncio.run(satellites._s3_refresh())
        calls_by_key = {c.kwargs['Key']: c.kwargs for c in mock_s3.put_object.call_args_list}
        assert '25544' in calls_by_key['catalog.tle']['Body']

    def test_skips_s3_write_without_bucket_env(self):
        mock_s3 = MagicMock()
        with patch('satellites._fetch_space_track_tles', AsyncMock(return_value=SAMPLE_TLES)), \
             patch('satellites._fetch_space_track_satcat', AsyncMock(return_value=SAMPLE_SATCAT_RAW)), \
             patch('satellites.boto3.client', return_value=mock_s3), \
             patch.dict('os.environ', {}, clear=True):
            asyncio.run(satellites._s3_refresh())
        mock_s3.put_object.assert_not_called()
        assert satellites._cache['tles'] == SAMPLE_TLES  # cache still updated


# ── get_satellites (reads from cache only) ────────────────────────────────────

class TestGetSatellites:
    def setup_method(self):
        satellites._cache['tles'] = []
        satellites._cache['fetched_at'] = 0.0

    def test_returns_cached_tles(self):
        satellites._cache['tles'] = SAMPLE_TLES
        result = asyncio.run(satellites.get_satellites())
        assert result == SAMPLE_TLES

    def test_raises_when_cache_empty(self):
        with pytest.raises(RuntimeError, match='not yet loaded'):
            asyncio.run(satellites.get_satellites())


# ── _fetch_iss_tle (unchanged) ────────────────────────────────────────────────

class TestFetchIssTle:
    def test_returns_iss_record(self):
        mock_client = _mock_httpx(ISS_TLE_TEXT)
        with patch('satellites.httpx.AsyncClient') as MC:
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_iss_tle())
        assert result['norad_id'] == '25544'
        assert result['tle1'].startswith('1 25544')


# ── get_iss_tle cache ─────────────────────────────────────────────────────────

class TestGetIssTle:
    def setup_method(self):
        satellites._iss_cache['tle'] = None
        satellites._iss_cache['fetched_at'] = 0.0

    def test_returns_tle_lines(self):
        mock_client = _mock_httpx(ISS_TLE_TEXT)
        with patch('satellites.httpx.AsyncClient') as MC:
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_iss_tle())
        assert 'tle1' in result and 'tle2' in result

    def test_uses_cache_within_ttl(self):
        cached = {'tle1': '1 25544U ...', 'tle2': '2 25544 ...'}
        satellites._iss_cache['tle'] = cached
        satellites._iss_cache['fetched_at'] = time.time()
        with patch('satellites.httpx.AsyncClient') as MC:
            asyncio.run(satellites.get_iss_tle())
            MC.assert_not_called()

    def test_refetches_after_ttl(self):
        satellites._iss_cache['tle'] = {'tle1': '1 25544U old', 'tle2': '2 25544 old'}
        satellites._iss_cache['fetched_at'] = time.time() - (satellites.ISS_TLE_TTL_SECONDS + 1)
        fresh_text = (
            'ISS (ZARYA)\n'
            '1 25544U 98067A   26133.99999999  .00016717  00000-0  10270-3 0  9993\n'
            '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522\n'
        )
        mock_client = _mock_httpx(fresh_text)
        with patch('satellites.httpx.AsyncClient') as MC:
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_iss_tle())
        assert '99999999' in result['tle1']


# ── health endpoint ───────────────────────────────────────────────────────────

class TestHealthEndpoint:
    def test_returns_200(self):
        # Mock startup side-effects so tests don't need real AWS/DB credentials
        with patch('main.run_migrations', return_value=None), \
             patch('main.refresh_loop', AsyncMock(return_value=None)):
            client = TestClient(app)
            assert client.get('/health').status_code == 200


# ── cache TTL ─────────────────────────────────────────────────────────────────

class TestCacheTTL:
    def test_iss_cache_ttl_is_five_minutes(self):
        assert satellites.ISS_TLE_TTL_SECONDS == 300


# ── db.run_migrations ─────────────────────────────────────────────────────────

class TestRunMigrations:
    def test_skips_when_no_database_url(self):
        import db
        # Should not raise even with no DATABASE_URL
        with patch.dict(os.environ, {}, clear=True):
            db.run_migrations()  # no exception

    def test_applies_migration_sql(self):
        import db
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = lambda s: mock_cursor
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mock_psycopg2 = MagicMock()
        mock_psycopg2.connect.return_value = mock_conn

        with patch.dict(sys.modules, {'psycopg2': mock_psycopg2}), \
             patch.dict(os.environ, {'DATABASE_URL': 'postgresql://test'}):
            db.run_migrations()

        mock_psycopg2.connect.assert_called_once_with('postgresql://test')
        mock_cursor.execute.assert_called_once()
        sql_arg = mock_cursor.execute.call_args[0][0]
        assert 'CREATE TABLE IF NOT EXISTS subscribers' in sql_arg
        assert 'CREATE EXTENSION IF NOT EXISTS vector' in sql_arg
        mock_conn.commit.assert_called_once()
        mock_conn.close.assert_called_once()

    def test_logs_and_continues_on_connection_error(self):
        import db
        with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://bad'}), \
             patch('psycopg2.connect', side_effect=Exception('connection refused')), \
             patch.object(db.logger, 'error') as mock_log:
            db.run_migrations()  # must not raise

        mock_log.assert_called_once()
        assert 'connection refused' in str(mock_log.call_args)
