import asyncio
import time
from unittest.mock import AsyncMock, patch

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
    workflow_dispatch can fire at any time, so the interval must also be enforced against
    the store's Last-Modified — the S45 rule that a rate clock lives in durable storage."""

    def test_skips_query_when_last_write_is_too_recent(self, tmp_path):
        recent = time.time() - 60  # one minute ago
        with patch.object(refresh_job, '_read_blob', return_value=(_catalog_text(PLENTY), recent)), \
             patch.object(refresh_job, '_fetch_space_track_tles', new=AsyncMock()) as fetch, \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            wrote = asyncio.run(refresh_job.refresh_catalog())

        assert wrote is False
        fetch.assert_not_called()
        assert not (tmp_path / 'catalog.tle').exists()

    def test_queries_once_the_interval_has_elapsed(self, tmp_path):
        stale = time.time() - (GP_MIN_INTERVAL_SECONDS + 60)
        with patch.object(refresh_job, '_read_blob', return_value=(_catalog_text(PLENTY), stale)), \
             patch.object(refresh_job, '_fetch_space_track_tles',
                          new=AsyncMock(return_value=[])) as fetch, \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            wrote = asyncio.run(refresh_job.refresh_catalog())

        fetch.assert_called_once()
        assert wrote is True
        assert (tmp_path / 'catalog.tle').exists()

    def test_cold_start_is_exempt_from_the_interval(self, tmp_path):
        """An empty store must still bootstrap immediately, even though Last-Modified is 0."""
        with patch.object(refresh_job, '_read_blob', return_value=(None, 0.0)), \
             patch.object(refresh_job, '_fetch_space_track_tles',
                          new=AsyncMock(return_value=[
                              {'name': f'S{i}', 'norad_id': str(i), 'tle1': '1', 'tle2': '2'}
                              for i in range(PLENTY)
                          ])) as fetch, \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            wrote = asyncio.run(refresh_job.refresh_catalog())

        fetch.assert_called_once()
        assert wrote is True


class TestBadWriteGuard:
    """S44: a run wrote an empty catalog over a good one while the account was suspended.
    An implausibly small result is a failed fetch, not a real catalog."""

    def test_refuses_to_write_an_implausibly_small_catalog(self, tmp_path):
        stale = time.time() - (GP_MIN_INTERVAL_SECONDS + 60)
        with patch.object(refresh_job, '_read_blob', return_value=(_catalog_text(PLENTY), stale)), \
             patch.object(refresh_job, '_fetch_space_track_tles', new=AsyncMock(return_value=[])), \
             patch.object(refresh_job, '_merge_tles', return_value=[]), \
             patch.object(refresh_job, 'OUT_DIR', str(tmp_path)):
            wrote = asyncio.run(refresh_job.refresh_catalog())

        assert wrote is False
        assert not (tmp_path / 'catalog.tle').exists()


class TestHttpDateParsing:
    def test_parses_an_http_date(self):
        ts = refresh_job._http_date_to_epoch('Wed, 19 Aug 2026 17:17:12 GMT')
        assert ts > 0

    def test_missing_or_malformed_dates_are_zero(self):
        assert refresh_job._http_date_to_epoch(None) == 0.0
        assert refresh_job._http_date_to_epoch('not a date') == 0.0
