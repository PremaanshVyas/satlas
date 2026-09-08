import asyncio
import importlib
import os
import time
from unittest.mock import AsyncMock, patch

import pytest

import refresh_job
from satellites import GP_MIN_INTERVAL_SECONDS


def _catalog_text(count: int) -> str:
    lines = []
    for i in range(count):
        nid = str(i + 1).zfill(5)
        lines.append(f'SAT-{i}')
        lines.append(f'1 {nid}U 20001A   24001.00000000  .00000000  00000-0  00000-0 0  9990')
        lines.append(f'2 {nid}  51.6000 000.0000 0001000  00.0000 000.0000 15.50000000000000')
    return '\n'.join(lines) + '\n'


PLENTY = refresh_job.MIN_PLAUSIBLE_RECORDS + 500


class TestGpIntervalGuard:
    """The gp class allows one query per hour. The cron covers scheduled runs, but
    workflow_dispatch can fire at any time, so the interval is also enforced against a
    durable clock — the S45 rule that a rate clock lives in storage, not the scheduler."""

    def test_skips_query_when_the_last_query_is_too_recent(self, tmp_path):
        with patch.object(refresh_job, '_read_blob', return_value=(_catalog_text(PLENTY), 0.0)), \
             patch.object(refresh_job, '_gp_clock', return_value=time.time() - 60), \
             patch.object(refresh_job, '_fetch_space_track_tles', new=AsyncMock()) as fetch, \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            wrote = asyncio.run(refresh_job.refresh_catalog())

        assert wrote is False
        fetch.assert_not_called()

    def test_a_failed_publish_does_not_hand_back_a_fresh_budget(self, tmp_path):
        """The bootstrap run queried gp then failed to publish, leaving the store empty.
        Without a query clock the retry would read "no catalog", take the cold-start path,
        and query again minutes later. The marker must block that."""
        with patch.object(refresh_job, '_read_blob', return_value=(None, 0.0)), \
             patch.object(refresh_job, '_gp_clock', return_value=time.time() - 120), \
             patch.object(refresh_job, '_fetch_space_track_tles', new=AsyncMock()) as fetch, \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            wrote = asyncio.run(refresh_job.refresh_catalog())

        assert wrote is False
        fetch.assert_not_called()

    def test_a_scheduled_run_is_not_blocked_by_its_own_execution_time(self, tmp_path):
        """The cron fires on a fixed minute but the clock is stamped after the query, so
        consecutive scheduled runs sit just under an hour apart. Without tolerance the job
        would refresh every two hours while still reporting success."""
        just_under = time.time() - (GP_MIN_INTERVAL_SECONDS - 45)
        with patch.object(refresh_job, '_read_blob', return_value=(_catalog_text(PLENTY), 0.0)), \
             patch.object(refresh_job, '_gp_clock', return_value=just_under), \
             patch.object(refresh_job, '_fetch_space_track_tles',
                          new=AsyncMock(return_value=[])) as fetch, \
             patch.object(refresh_job, '_stamp_gp_query'), \
             patch.object(refresh_job, 'put_blob', return_value='https://x/catalog.tle'), \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            wrote = asyncio.run(refresh_job.refresh_catalog())

        fetch.assert_called_once()
        assert wrote is True

    def test_tolerance_does_not_permit_a_rapid_retrigger(self, tmp_path):
        """Tolerance absorbs execution time, not a manual re-run minutes later."""
        with patch.object(refresh_job, '_read_blob', return_value=(_catalog_text(PLENTY), 0.0)), \
             patch.object(refresh_job, '_gp_clock', return_value=time.time() - 600), \
             patch.object(refresh_job, '_fetch_space_track_tles', new=AsyncMock()) as fetch, \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            wrote = asyncio.run(refresh_job.refresh_catalog())

        assert wrote is False
        fetch.assert_not_called()

    def test_queries_once_the_interval_has_elapsed(self, tmp_path):
        stale = time.time() - (GP_MIN_INTERVAL_SECONDS + 60)
        with patch.object(refresh_job, '_read_blob', return_value=(_catalog_text(PLENTY), stale)), \
             patch.object(refresh_job, '_gp_clock', return_value=stale), \
             patch.object(refresh_job, '_fetch_space_track_tles',
                          new=AsyncMock(return_value=[])) as fetch, \
             patch.object(refresh_job, '_stamp_gp_query'), \
             patch.object(refresh_job, 'put_blob', return_value='https://x/catalog.tle'), \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            wrote = asyncio.run(refresh_job.refresh_catalog())

        fetch.assert_called_once()
        assert wrote is True

    def test_genuine_cold_start_queries_immediately(self, tmp_path):
        """No catalog and no marker is a real first run; it must bootstrap without waiting."""
        with patch.object(refresh_job, '_read_blob', return_value=(None, 0.0)), \
             patch.object(refresh_job, '_gp_clock', return_value=0.0), \
             patch.object(refresh_job, '_fetch_space_track_tles',
                          new=AsyncMock(return_value=[
                              {'name': f'S{i}', 'norad_id': str(i), 'tle1': '1', 'tle2': '2'}
                              for i in range(PLENTY)
                          ])) as fetch, \
             patch.object(refresh_job, '_stamp_gp_query'), \
             patch.object(refresh_job, 'put_blob', return_value='https://x/catalog.tle'), \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            wrote = asyncio.run(refresh_job.refresh_catalog())

        fetch.assert_called_once()
        assert wrote is True

    def test_the_clock_is_stamped_immediately_after_the_query(self, tmp_path):
        """Stamping must happen before anything that can fail, so a spent query is recorded
        even when publishing blows up."""
        with patch.object(refresh_job, '_read_blob', return_value=(None, 0.0)), \
             patch.object(refresh_job, '_gp_clock', return_value=0.0), \
             patch.object(refresh_job, '_fetch_space_track_tles',
                          new=AsyncMock(return_value=[
                              {'name': f'S{i}', 'norad_id': str(i), 'tle1': '1', 'tle2': '2'}
                              for i in range(PLENTY)
                          ])), \
             patch.object(refresh_job, '_stamp_gp_query') as stamp, \
             patch.object(refresh_job, 'put_blob', side_effect=RuntimeError('publish down')), \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            with pytest.raises(RuntimeError, match='publish down'):
                asyncio.run(refresh_job.refresh_catalog())

        stamp.assert_called_once()

class TestBadWriteGuard:
    """S44: a run wrote an empty catalog over a good one while the account was suspended.
    An implausibly small result is a failed fetch, not a real catalog."""

    def test_refuses_to_write_an_implausibly_small_catalog(self, tmp_path):
        stale = time.time() - (GP_MIN_INTERVAL_SECONDS + 60)
        with patch.object(refresh_job, '_read_blob', return_value=(_catalog_text(PLENTY), stale)), \
             patch.object(refresh_job, '_gp_clock', return_value=stale), \
             patch.object(refresh_job, '_fetch_space_track_tles', new=AsyncMock(return_value=[])), \
             patch.object(refresh_job, '_stamp_gp_query'), \
             patch.object(refresh_job, '_merge_tles', return_value=[]), \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            wrote = asyncio.run(refresh_job.refresh_catalog())

        assert wrote is False
        assert not (tmp_path / 'catalog.tle').exists()


class TestClockSource:
    """The rate clock must come from the authenticated Blob API, never the public URL's
    Last-Modified. That header is served from a regional CDN cache and was observed
    reporting ~now on a cache fill, which made every run skip and would have frozen the
    catalog permanently while reporting success."""

    def test_reads_uploaded_at_from_the_api(self):
        class _Resp:
            def raise_for_status(self): pass
            @staticmethod
            def json():
                return {'blobs': [{'pathname': '.gp-last-query',
                                   'uploadedAt': '2026-09-08T14:49:49.000Z'}]}
        with patch.dict(os.environ, {'BLOB_READ_WRITE_TOKEN': 't'}), \
             patch.object(refresh_job.httpx, 'get', return_value=_Resp()) as g:
            ts = refresh_job._blob_uploaded_at('.gp-last-query')
        assert ts > 0
        # must hit the authenticated API host, not the public CDN base
        assert g.call_args[0][0] == refresh_job.BLOB_API

    def test_ignores_a_non_matching_pathname(self):
        class _Resp:
            def raise_for_status(self): pass
            @staticmethod
            def json():
                return {'blobs': [{'pathname': 'something-else', 'uploadedAt': '2026-09-08T14:49:49.000Z'}]}
        with patch.dict(os.environ, {'BLOB_READ_WRITE_TOKEN': 't'}), \
             patch.object(refresh_job.httpx, 'get', return_value=_Resp()):
            assert refresh_job._blob_uploaded_at('.gp-last-query') == 0.0

    def test_missing_token_yields_zero_not_a_false_recent_time(self):
        """0.0 means 'unknown', which makes the gap infinite and permits a query. Returning
        a recent-looking time instead would silently freeze refreshes."""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('BLOB_READ_WRITE_TOKEN', None)
            assert refresh_job._blob_uploaded_at('.gp-last-query') == 0.0

    def test_api_failure_yields_zero(self):
        with patch.dict(os.environ, {'BLOB_READ_WRITE_TOKEN': 't'}), \
             patch.object(refresh_job.httpx, 'get', side_effect=RuntimeError('down')):
            assert refresh_job._blob_uploaded_at('.gp-last-query') == 0.0


class TestHttpDateParsing:
    def test_parses_an_http_date(self):
        ts = refresh_job._http_date_to_epoch('Wed, 19 Aug 2026 17:17:12 GMT')
        assert ts > 0

    def test_missing_or_malformed_dates_are_zero(self):
        assert refresh_job._http_date_to_epoch(None) == 0.0
        assert refresh_job._http_date_to_epoch('not a date') == 0.0


class TestBlobBaseFallback:
    """An undefined `${{ vars.X }}` in GitHub Actions expands to an empty string, not an
    unset variable, so os.environ.get's default argument never fires. That blanked the base
    URL, made every read fail, and sent every run down the cold-start full-pull path, which
    is exempt from the once-per-hour guard."""

    def _reload_with(self, value):
        """Returns (base, default) captured DURING the reload.

        importlib.reload mutates the module in place rather than returning a copy, so
        handing back the module object and reading it after the cleanup reload would read
        post-cleanup state — which silently made two of these assertions vacuous.
        """
        if value is None:
            os.environ.pop('CATALOG_BLOB_BASE', None)
        else:
            os.environ['CATALOG_BLOB_BASE'] = value
        try:
            mod = importlib.reload(refresh_job)
            return mod.BLOB_BASE, mod.DEFAULT_BLOB_BASE
        finally:
            os.environ.pop('CATALOG_BLOB_BASE', None)
            importlib.reload(refresh_job)

    def test_empty_string_falls_back_to_the_default(self):
        base, default = self._reload_with('')
        assert base == default
        assert base.startswith('https://')

    def test_unset_falls_back_to_the_default(self):
        base, default = self._reload_with(None)
        assert base == default

    def test_explicit_value_is_honoured_and_stripped(self):
        base, _ = self._reload_with('https://example.test/')
        assert base == 'https://example.test'


class TestPutBlob:
    def test_requires_a_token(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('BLOB_READ_WRITE_TOKEN', None)
            with pytest.raises(RuntimeError, match='BLOB_READ_WRITE_TOKEN'):
                refresh_job.put_blob('catalog.tle', b'x', 'text/plain')

    def test_rejects_a_randomised_pathname(self):
        """A random suffix publishes successfully but leaves readers fetching a URL that
        does not exist, so the mismatch must fail the run rather than pass silently."""
        class _Resp:
            def raise_for_status(self):
                pass

            @staticmethod
            def json():
                return {'url': 'https://store.example/catalog-RANDOM.tle'}

        with patch.dict(os.environ, {'BLOB_READ_WRITE_TOKEN': 't'}), \
             patch.object(refresh_job.httpx, 'put', return_value=_Resp()):
            with pytest.raises(RuntimeError, match='unexpected pathname'):
                refresh_job.put_blob('catalog.tle', b'x', 'text/plain')

    def test_returns_the_published_url(self):
        class _Resp:
            def raise_for_status(self):
                pass

            @staticmethod
            def json():
                return {'url': 'https://store.example/catalog.tle'}

        with patch.dict(os.environ, {'BLOB_READ_WRITE_TOKEN': 't'}), \
             patch.object(refresh_job.httpx, 'put', return_value=_Resp()):
            assert refresh_job.put_blob('catalog.tle', b'x', 'text/plain') == \
                'https://store.example/catalog.tle'
