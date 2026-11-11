"""Regulatory thresholds: TWL zone boundaries, midday break, fail-safe band ordering."""
from datetime import datetime

import pytest

from heat_safe import rules
from heat_safe.rules import Band


@pytest.mark.parametrize("twl,zone", [
    (60, "high"), (114.9, "high"), (115, "medium"), (139.9, "medium"), (140, "low"), (220, "low"), (380, "low"),
])
def test_twl_zone_boundaries_match_adosh_table1(twl, zone):
    assert rules.twl_zone(twl) == zone


def test_zone_bands():
    assert rules.ZONE_BAND == {"low": Band.GREEN, "medium": Band.AMBER, "high": Band.RED}


def test_unacclimatised_workers_only_in_low_zone():
    assert rules.ZONE_CONTROLS["low"].unacclimatised_may_work
    assert not rules.ZONE_CONTROLS["medium"].unacclimatised_may_work
    assert not rules.ZONE_CONTROLS["high"].unacclimatised_may_work


def test_work_rest_cycles():
    assert rules.ZONE_CONTROLS["medium"].work_minutes_per_hour_heavy == 45
    assert rules.ZONE_CONTROLS["high"].work_minutes_per_hour_light == 45
    assert rules.ZONE_CONTROLS["high"].work_minutes_per_hour_heavy == 20


@pytest.mark.parametrize("ts,expected", [
    (datetime(2025, 8, 1, 12, 29), False),
    (datetime(2025, 8, 1, 12, 30), True),
    (datetime(2025, 8, 1, 14, 59), True),
    (datetime(2025, 8, 1, 15, 0), False),
    (datetime(2025, 6, 14, 13, 0), False),  # season starts 15 Jun
    (datetime(2025, 6, 15, 13, 0), True),
    (datetime(2025, 9, 15, 13, 0), True),   # last day included
    (datetime(2025, 9, 16, 13, 0), False),
    (datetime(2025, 11, 20, 13, 0), False),  # judging day: no break
])
def test_midday_break(ts, expected):
    assert rules.in_midday_break(ts) is expected


@pytest.mark.parametrize("hour,minutes", [(11, 0), (12, 30), (13, 60), (14, 60), (15, 0)])
def test_midday_break_minutes_per_hour(hour, minutes):
    assert rules.midday_break_minutes(datetime(2025, 8, 1, hour)) == minutes


def test_unrecorded_year_uses_default_season():
    assert rules.midday_break_season(2026) == (datetime(2026, 6, 15).date(), datetime(2026, 9, 15).date())


def test_fail_safe_raise_never_lowers_and_never_reaches_emergency():
    assert Band.GREEN.raised() == Band.AMBER
    assert Band.AMBER.raised() == Band.RED
    assert Band.RED.raised() == Band.RED
    assert all(b.raised() >= b for b in (Band.GREEN, Band.AMBER, Band.RED))


def test_acclimatisation_schedule_reaches_full_load_by_day_5():
    assert rules.ACCLIMATISATION_NEW[1] == 0.20
    assert rules.ACCLIMATISATION_EXPERIENCED[1] == 0.50
    assert rules.ACCLIMATISATION_NEW[rules.FULLY_ACCLIMATISED_DAY] == 1.0
