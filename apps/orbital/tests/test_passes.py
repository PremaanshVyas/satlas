import pytest
from passes import predict_passes, az_to_direction


class TestAzToDirection:
    def test_north(self):
        assert az_to_direction(0) == 'N'
        assert az_to_direction(360) == 'N'

    def test_cardinal_directions(self):
        assert az_to_direction(90) == 'E'
        assert az_to_direction(180) == 'S'
        assert az_to_direction(270) == 'W'

    def test_intercardinal(self):
        assert az_to_direction(45) == 'NE'
        assert az_to_direction(225) == 'SW'
        assert az_to_direction(315) == 'NW'


class TestPredictPasses:
    # Melbourne — a real location Claude knows the coords for
    LAT = -37.8136
    LON = 144.9631

    def test_returns_list(self):
        result = predict_passes(self.LAT, self.LON, hours_ahead=48)
        assert isinstance(result, list)

    def test_pass_has_required_fields(self):
        result = predict_passes(self.LAT, self.LON, hours_ahead=48)
        if not result:
            pytest.skip('No passes in 48h window — stale TLE, rerun or extend window')
        p = result[0]
        assert 'start_utc' in p
        assert 'end_utc' in p
        assert 'max_elevation_deg' in p
        assert 'direction' in p

    def test_max_elevation_is_float(self):
        result = predict_passes(self.LAT, self.LON, hours_ahead=48)
        if not result:
            pytest.skip('No passes in 48h window')
        assert isinstance(result[0]['max_elevation_deg'], float)

    def test_direction_is_valid_compass_point(self):
        valid = {'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'}
        result = predict_passes(self.LAT, self.LON, hours_ahead=48)
        if not result:
            pytest.skip('No passes in 48h window')
        assert result[0]['direction'] in valid

    def test_start_before_end(self):
        result = predict_passes(self.LAT, self.LON, hours_ahead=48)
        if not result:
            pytest.skip('No passes in 48h window')
        for p in result:
            assert p['start_utc'] < p['end_utc']

    def test_longer_window_at_least_as_many_passes(self):
        passes_1h = predict_passes(self.LAT, self.LON, hours_ahead=1)
        passes_48h = predict_passes(self.LAT, self.LON, hours_ahead=48)
        assert len(passes_1h) <= len(passes_48h)
