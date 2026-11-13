"""Acclimatisation (option B, 6 Nov 2026): every boundary in the rule, tested at and either side of it."""
from datetime import date, timedelta

import pytest

from heat_safe import agent_tools, rules
from heat_safe.acclimatisation import acclimatisation_status

PLAN = date(2025, 8, 1)


def started(day: int) -> date:
    """The start date that makes PLAN the given day (day 1 = the start date itself)."""
    return PLAN - timedelta(days=day - 1)


@pytest.mark.parametrize("day,low_only,share", [
    (1, True, 0.20), (2, True, 0.40), (4, True, 0.80),
    (5, True, 1.00),   # TG reaches 100% workload on day 5, but CoP's 5-7 days still applies
    (7, True, 1.00),   # last Low-zone-only day: the protective end of "5-7 days"
    (8, False, 1.00),  # first day with normal zone rules
])
def test_new_starter_low_zone_through_day_7_with_tg_workload(day, low_only, share):
    a = acclimatisation_status(PLAN, new_starter_since=started(day))
    assert (a.day, a.low_zone_only, a.workload_share) == (day, low_only, share)
    assert a.status == ("new_starter" if low_only else "acclimatised")


def test_experienced_new_starter_uses_the_experienced_column_but_same_zone_rule():
    a = acclimatisation_status(PLAN, new_starter_since=started(1), experienced_in_heat=True)
    assert a.workload_share == 0.50 and a.low_zone_only


@pytest.mark.parametrize("days_away,first_day_share,days_to_full", [
    (3, 1.00, 1),                                  # < 4 days: no reduction
    (4, rules.REDUCED_EXPECTATIONS_SHARE, 2), (5, rules.REDUCED_EXPECTATIONS_SHARE, 2),
    (6, 0.80, 2), (11, 0.80, 2),
    (12, 0.60, 3),                                 # TG rows overlap at 12: the stricter row
    (20, 0.60, 3),
    (21, 0.50, 4),
])
def test_returning_after_leave_follows_the_tg_table(days_away, first_day_share, days_to_full):
    first = acclimatisation_status(PLAN, returned_since=PLAN, days_away=days_away)
    assert first.workload_share == first_day_share
    assert first.low_zone_only is (days_away > 14)  # TG Table 1 note b
    full = acclimatisation_status(PLAN, returned_since=PLAN - timedelta(days=days_to_full - 1), days_away=days_away)
    assert full.workload_share == 1.0
    if days_to_full > 1:
        before = acclimatisation_status(PLAN, returned_since=PLAN - timedelta(days=days_to_full - 2),
                                        days_away=days_away)
        assert before.workload_share < 1.0


@pytest.mark.parametrize("days_ill,first_day_share", [
    (0, 1.00), (1, rules.REDUCED_EXPECTATIONS_SHARE), (3, rules.REDUCED_EXPECTATIONS_SHARE),
    (4, 0.80), (5, 0.80), (6, 0.60), (8, 0.60), (9, 0.50),
])
def test_returning_after_illness_uses_the_illness_column(days_ill, first_day_share):
    a = acclimatisation_status(PLAN, returned_since=PLAN, days_away=days_ill, away_for_illness=True)
    assert a.workload_share == first_day_share


def test_ten_days_leave_is_now_reduced_where_the_old_14_day_rule_gave_100_percent():
    """The reason option B replaced 'off > 14 days': the TG reduces workload from 4 days away."""
    assert acclimatisation_status(PLAN, returned_since=PLAN, days_away=10).workload_share == 0.80


def test_no_dates_means_acclimatised():
    a = acclimatisation_status(PLAN)
    assert a.status == "acclimatised" and a.workload_share == 1.0 and not a.low_zone_only


@pytest.mark.parametrize("kwargs", [
    dict(new_starter_since=PLAN + timedelta(days=1)),          # starts after the planned day
    dict(new_starter_since=PLAN, returned_since=PLAN),          # both at once
    dict(returned_since=PLAN, days_away=-1),
])
def test_invalid_inputs_raise(kwargs):
    with pytest.raises(ValueError):
        acclimatisation_status(PLAN, **kwargs)


def test_shares_never_exceed_full_and_never_drop_in_later_days():
    for table in (rules.REACCLIMATISATION_ABSENCE, rules.REACCLIMATISATION_ILLNESS):
        for _, seq in table:
            assert all(0 < s <= 1 for s in seq) and list(seq) == sorted(seq) and seq[-1] == 1.0


def test_tool_caps_a_returning_worker_and_blocks_a_new_starter():
    """End to end through the agent's tool, on the cached replay day (no network)."""
    back = agent_tools.optimise_schedule("mussafah", "2025-08-01", "labourer", 6,
                                         returned_since="2025-08-01", days_away=10)
    assert back["status"] == "ok", back
    assert back["work_minutes_allowed_by_acclimatisation"] == round(360 * 0.80)
    assert back["work_minutes_scheduled"] <= back["work_minutes_allowed_by_acclimatisation"]
    assert back["invariants"]["within_acclimatisation_share"]

    new = agent_tools.optimise_schedule("mussafah", "2025-08-01", "roofer", 6, new_starter_since="2025-07-28")
    assert new["acclimatisation"]["day"] == 5 and new["acclimatisation"]["low_zone_only"]
    assert all(h["scheduled_work_minutes"] == 0 or h["twl_zone"] == rules.ZONE_LOW for h in new["hours"])
    assert new["invariants"]["no_unacclimatised_outside_low_zone"]


def test_outputs_carry_the_forms_people_say():
    """The model must not convert 0.8 -> 80% or 288 min -> 4 h 48 min itself (numeric grounding, 6 Nov)."""
    back = agent_tools.optimise_schedule("mussafah", "2025-08-01", "labourer", 6,
                                         returned_since="2025-08-01", days_away=10)
    assert back["acclimatisation"]["workload_percent"] == 80
    assert back["work_needed_hm"] == "6 h 0 min" and back["work_minutes_scheduled"] == 288
    assert back["work_scheduled_hm"] == "4 h 48 min"


@pytest.mark.parametrize("days_away,illness,day_back,low_only", [
    (14, False, 1, False),   # exactly 14 days: not "more than 14"
    (15, False, 1, True),    # TG Table 1 note b: unacclimatised
    (15, True, 1, True),     # illness counts too
    (21, False, 7, True),    # last Low-zone-only day, like a new starter
    (21, False, 8, False),
])
def test_off_more_than_14_days_is_unacclimatised_per_table_1_note_b(days_away, illness, day_back, low_only):
    a = acclimatisation_status(PLAN, returned_since=PLAN - timedelta(days=day_back - 1),
                               days_away=days_away, away_for_illness=illness)
    assert a.low_zone_only is low_only
    if low_only:
        assert "ADOSH-SF TG Safety in the Heat, p. 5" in a.sources
