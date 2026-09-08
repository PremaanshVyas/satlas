"""The pass algorithm exists twice: apps/orbital/passes.py (original) and
api/predict-passes.py (the Vercel function that replaced the ECS service).

It is duplicated because Vercel bundles each function independently and cross-directory
imports fail at runtime rather than at build. That is a real constraint, but duplicated
logic drifts, so these tests load both copies and assert they produce identical output.

Both are pinned to the same fixed epoch: each calls _ts.now() internally, and two calls
milliseconds apart can land a marginal pass on different sides of the window boundary.
"""

import importlib.util
import os

import pytest

import passes as orbital_passes

_VERCEL_FN = os.path.join(
    os.path.dirname(__file__), '..', '..', '..', 'api', 'predict-passes.py'
)


def _load_vercel_module():
    """Loaded by path because the filename contains a hyphen and is not importable."""
    spec = importlib.util.spec_from_file_location('vercel_predict_passes', _VERCEL_FN)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


vercel = _load_vercel_module()

# A real ISS element set, passed explicitly so the two modules' own bootstrap constants
# (deliberately different vintages) cannot affect the comparison.
TLE1 = '1 25544U 98067A   26231.53387315  .00011071  00000-0  20501-3 0  9990'
TLE2 = '2 25544  51.6332 346.5707 0007665  63.0282 297.1489 15.49512520581579'

# Melbourne, Sydney, London, Quito, and a Southern Ocean point with no land nearby.
SITES = [
    (-37.8136, 144.9631),
    (-33.8688, 151.2093),
    (51.5074, -0.1278),
    (-0.1807, -78.4678),
    (-55.0, 120.0),
]


def _pin_now(module, monkeypatch):
    fixed = module._ts.utc(2026, 9, 9, 12, 0, 0)
    monkeypatch.setattr(module._ts, 'now', lambda: fixed)


@pytest.mark.parametrize('lat,lon', SITES)
def test_both_implementations_agree(lat, lon, monkeypatch):
    _pin_now(orbital_passes, monkeypatch)
    _pin_now(vercel, monkeypatch)

    a = orbital_passes.predict_passes(lat, lon, 24, tle1=TLE1, tle2=TLE2, name='ISS (ZARYA)')
    b = vercel.predict_passes(lat, lon, 24, tle1=TLE1, tle2=TLE2, name='ISS (ZARYA)')

    assert a == b, f'pass prediction diverged at {lat},{lon}'


def test_direction_mapping_is_identical():
    for deg in range(0, 360, 7):
        assert orbital_passes.az_to_direction(deg) == vercel.az_to_direction(deg)


def test_longer_window_still_agrees(monkeypatch):
    _pin_now(orbital_passes, monkeypatch)
    _pin_now(vercel, monkeypatch)

    a = orbital_passes.predict_passes(-37.8136, 144.9631, 72, tle1=TLE1, tle2=TLE2)
    b = vercel.predict_passes(-37.8136, 144.9631, 72, tle1=TLE1, tle2=TLE2)

    assert a == b


class TestRequestValidation:
    """Ranges must match the FastAPI Query constraints they replace, so a request the ECS
    service rejected is still rejected."""

    def test_requires_coordinates(self):
        kwargs, err = vercel.parse_request('')
        assert kwargs is None and 'required' in err

    def test_rejects_out_of_range_latitude(self):
        _, err = vercel.parse_request('latitude=91&longitude=0')
        assert 'latitude' in err

    def test_rejects_out_of_range_longitude(self):
        _, err = vercel.parse_request('latitude=0&longitude=181')
        assert 'longitude' in err

    def test_rejects_non_numeric_coordinates(self):
        _, err = vercel.parse_request('latitude=abc&longitude=0')
        assert 'numbers' in err

    def test_hours_ahead_bounds_match_the_original(self):
        assert vercel.parse_request('latitude=0&longitude=0&hours_ahead=0')[1]
        assert vercel.parse_request('latitude=0&longitude=0&hours_ahead=169')[1]
        assert vercel.parse_request('latitude=0&longitude=0&hours_ahead=168')[1] is None
        assert vercel.parse_request('latitude=0&longitude=0&hours_ahead=1')[1] is None

    def test_defaults_hours_ahead_to_24(self):
        kwargs, err = vercel.parse_request('latitude=0&longitude=0')
        assert err is None and kwargs['hours_ahead'] == 24

    def test_rejects_a_half_supplied_tle(self):
        _, err = vercel.parse_request('latitude=0&longitude=0&tle1=x')
        assert 'together' in err

    def test_accepts_a_complete_request(self):
        kwargs, err = vercel.parse_request(
            'latitude=-37.8&longitude=144.9&hours_ahead=48&tle1=a&tle2=b&name=ISS'
        )
        assert err is None
        assert kwargs['latitude'] == pytest.approx(-37.8)
        assert kwargs['hours_ahead'] == 48
        assert kwargs['name'] == 'ISS'
