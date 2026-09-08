"""Pruning stale element sets from the merged catalog.

_merge_tles only adds and updates, so a cache built from hourly deltas grows forever:
decayed objects stop receiving element sets but were never removed, and the displayed count
inflated with things that had already re-entered.

The rule these tests pin down is that pruning is by ELEMENT-SET AGE, mirroring the
EPOCH/>now-90 filter the bootstrap query already applies server-side. Never by a count,
a target size, or a list. That distinction is what makes new launches safe.
"""

import datetime
import time

from satellites import (
    CATALOG_MAX_EPOCH_AGE_DAYS,
    prune_stale_tles,
    tle_epoch_datetime,
)

NOW = time.time()


def _tle1(days_ago: float, norad: str = '25544') -> str:
    """A TLE line 1 whose epoch is `days_ago` days before NOW."""
    dt = datetime.datetime.fromtimestamp(NOW, datetime.timezone.utc) - datetime.timedelta(days=days_ago)
    start = datetime.datetime(dt.year, 1, 1, tzinfo=datetime.timezone.utc)
    doy = (dt - start).total_seconds() / 86400.0 + 1
    return f'1 {norad}U 98067A   {dt.year % 100:02d}{doy:012.8f}  .00011071  00000-0  20501-3 0  9990'


def _rec(days_ago: float, norad: str = '25544') -> dict:
    return {'name': f'SAT-{norad}', 'norad_id': norad, 'tle1': _tle1(days_ago, norad), 'tle2': '2 ...'}


class TestNewSatellitesAreNeverPruned:
    """The whole point: launches must keep appearing. A newly launched object is actively
    tracked and therefore carries a fresh epoch, so it cannot be caught by an age filter."""

    def test_a_satellite_launched_today_survives(self):
        out = prune_stale_tles([_rec(0.01, '99001')], now=NOW)
        assert len(out) == 1

    def test_a_satellite_launched_last_week_survives(self):
        out = prune_stale_tles([_rec(7, '99002')], now=NOW)
        assert len(out) == 1

    def test_new_objects_are_kept_while_dead_ones_go(self):
        records = [_rec(0.5, '90001'), _rec(3, '90002'), _rec(200, '90003'), _rec(400, '90004')]
        kept = {r['norad_id'] for r in prune_stale_tles(records, now=NOW)}
        assert kept == {'90001', '90002'}

    def test_the_catalog_can_grow_without_limit(self):
        """No cap, no target size. 60k fresh objects in, 60k out."""
        records = [_rec(1, str(100000 + i)) for i in range(60000)]
        assert len(prune_stale_tles(records, now=NOW)) == 60000


class TestStaleObjectsArePruned:
    def test_drops_element_sets_past_the_window(self):
        assert prune_stale_tles([_rec(CATALOG_MAX_EPOCH_AGE_DAYS + 5)], now=NOW) == []

    def test_keeps_element_sets_inside_the_window(self):
        assert len(prune_stale_tles([_rec(CATALOG_MAX_EPOCH_AGE_DAYS - 5)], now=NOW)) == 1

    def test_matches_the_bootstrap_query_window(self):
        """Local pruning and the server-side EPOCH/>now-90 filter must agree, or a delta-fed
        cache would drift away from what a fresh bootstrap returns."""
        assert CATALOG_MAX_EPOCH_AGE_DAYS == 90


class TestFailureDirection:
    """A parsing failure must never silently delete real satellites — the alpha-5 lesson,
    where a bare int() on a NORAD id froze the whole catalog."""

    def test_unparseable_epoch_is_kept(self):
        bad = {'name': 'ODD', 'norad_id': '1', 'tle1': '1 GARBAGE', 'tle2': '2 ...'}
        assert prune_stale_tles([bad], now=NOW) == [bad]

    def test_missing_tle1_is_kept(self):
        bad = {'name': 'ODD', 'norad_id': '1', 'tle2': '2 ...'}
        assert len(prune_stale_tles([bad], now=NOW)) == 1

    def test_one_bad_record_does_not_discard_the_rest(self):
        records = [_rec(1, '1'), {'norad_id': '2', 'tle1': 'junk'}, _rec(500, '3')]
        kept = {r['norad_id'] for r in prune_stale_tles(records, now=NOW)}
        assert kept == {'1', '2'}

    def test_empty_input_is_empty_output(self):
        assert prune_stale_tles([], now=NOW) == []


class TestEpochParsing:
    def test_parses_a_real_iss_line(self):
        dt = tle_epoch_datetime(
            '1 25544U 98067A   26231.53387315  .00011071  00000-0  20501-3 0  9990'
        )
        assert dt is not None and dt.year == 2026

    def test_two_digit_year_rolls_to_1900_above_56(self):
        """TLE spec: 57-99 means 19xx, 00-56 means 20xx."""
        dt = tle_epoch_datetime(
            '1 00005U 58002B   58002.50000000  .00000318  00000-0  40970-3 0  9998'
        )
        assert dt is not None and dt.year == 1958

    def test_garbage_returns_none(self):
        assert tle_epoch_datetime('nonsense') is None
        assert tle_epoch_datetime('') is None
