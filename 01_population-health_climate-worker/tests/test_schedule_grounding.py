"""optimise_schedule invariants and the numeric grounding guardrail."""
import pandas as pd
import pytest

from heat_safe.acclimatisation import Acclimatisation
from heat_safe.grounding import check_numeric_grounding, quoted_values
from heat_safe.heat_stress import compute_heat_stress
from heat_safe.job_profile import lookup_job_profile
from heat_safe.schedule import optimise_schedule
from tests.test_heat_stress import weather


def hot_day(**kw):
    """Hot August day: High zone in the afternoon, cooler early morning."""
    temps = [30.0] * 6 + [36.0] * 3 + [44.0] * 9 + [36.0] * 6
    return compute_heat_stress(weather(hours=24, temperature_2m=temps, relative_humidity_2m=35.0, **kw))


def test_no_work_scheduled_in_midday_break():
    plan = optimise_schedule(hot_day(), lookup_job_profile("roofer"), work_hours_needed=12)
    by_start = {b["start"]: b for b in plan["hours"]}
    assert by_start["13:00"]["scheduled_work_minutes"] == 0
    assert by_start["14:00"]["scheduled_work_minutes"] == 0
    assert by_start["12:00"]["scheduled_work_minutes"] <= 30
    assert by_start["12:00"]["outdoor_work_must_end_by"] == "12:30"
    assert plan["invariants"]["no_work_in_midday_break"]


def test_shortfall_reported_not_squeezed():
    plan = optimise_schedule(hot_day(), lookup_job_profile("roofer"), work_hours_needed=14)
    assert plan["shortfall_minutes"] > 0
    assert all(b["scheduled_work_minutes"] <= b["allowed_work_minutes"] for b in plan["hours"])


def test_unacclimatised_only_in_low_zone():
    new = Acclimatisation("new_starter", 3, True, 0.6, "test", ())
    plan = optimise_schedule(hot_day(), lookup_job_profile("labourer"), work_hours_needed=8, acclimatisation=new)
    assert all(b["scheduled_work_minutes"] == 0 for b in plan["hours"] if b["twl_zone"] != "low")
    assert plan["invariants"]["no_unacclimatised_outside_low_zone"]


def test_prefers_cooler_hours():
    plan = optimise_schedule(hot_day(), lookup_job_profile("roofer"), work_hours_needed=1)
    used = [b["start"] for b in plan["hours"] if b["scheduled_work_minutes"]]
    assert used == ["05:00"]


def test_rejects_multi_day_input():
    two_days = compute_heat_stress(weather(hours=48, temperature_2m=30.0))
    with pytest.raises(ValueError):
        optimise_schedule(two_days, lookup_job_profile("roofer"), 4)


TOOL = [{"summary": {"max_temperature_c": 45.0, "max_wbgt_c": 40.0, "min_twl_sun_wm2": 60},
         "hours": [{"work_rest": "20 min work / 40 min rest", "fluid_l_per_hr": "0.6-1.0 (light work)"}]}]


@pytest.mark.parametrize("text", [
    "Peak 45 °C, WBGT 40.0 °C, TWL 60 W/m².",
    "Use 20 min work / 40 min rest and drink 0.6-1.0 L per hour.",
    "Max temperature 45.0°C.",
])
def test_grounded_text_passes(text):
    assert check_numeric_grounding(text, TOOL)["passed"]


@pytest.mark.parametrize("text,bad", [
    ("Peak WBGT 44 °C.", "44 °C"),
    ("TWL falls to 55 W/m².", "55 W/m²"),
    ("Rest for 30 minutes each hour.", "30 minutes"),
])
def test_invented_numbers_fail(text, bad):
    r = check_numeric_grounding(text, TOOL)
    assert not r["passed"] and bad in r["ungrounded"]


def test_numbers_without_units_are_not_checked():
    assert quoted_values("Call 998. Crew of 6 on 1 Aug 2025 at 05:00.") == []


def test_neighbouring_hours_respect_the_rolling_limit():
    """A full Low-zone hour straight into a Medium hour is 60+ minutes in a 45-minute window (15 Nov)."""
    from heat_safe.forecast import get_replay
    hs = compute_heat_stress(get_replay("2025-08-01", sites=["mussafah"]))
    plan = optimise_schedule(hs, lookup_job_profile("steel fixer"), work_hours_needed=5, shade=True)
    hours = {int(b["start"][:2]): b for b in plan["hours"]}
    for h, b in hours.items():
        prev = hours.get(h - 1)
        if prev and b["scheduled_work_minutes"] > 0:
            limit = 60 if b["twl_zone"] == "low" else (45 if b["twl_zone"] == "medium" else 20)
            assert prev["scheduled_work_minutes"] <= limit, (h, prev["scheduled_work_minutes"], limit)
    assert plan["invariants"]["within_rolling_work_limit"]
    assert plan["shortfall_minutes"] == 300 - plan["work_minutes_scheduled"]  # anything not placed is reported
