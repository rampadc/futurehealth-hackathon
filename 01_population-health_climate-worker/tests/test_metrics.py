"""Replay metrics (heat_safe.metrics): small days where every number can be checked by hand, then the replay day."""
import pandas as pd
import pytest

from heat_safe.metrics import baseline_timeline, crew_day_metrics, replay_day_metrics

HIGH, MEDIUM, LOW = 100.0, 130.0, 150.0  # TWL in each zone


def readings(start: str, end: str, twl, fault_at=(), dry=38.0) -> pd.DataFrame:
    """5-minute measured readings; `twl` is a number or a function of the time."""
    t = pd.date_range(f"2025-08-01 {start}", f"2025-08-01 {end}", freq="5min", tz="Asia/Dubai", inclusive="left")
    vals = [twl(x) if callable(twl) else twl for x in t]
    return pd.DataFrame(dict(time=t, twl_wm2=vals, dry_bulb_c=dry, withdrawal_limit=False,
                             fault=["implausible" if f"{x:%H:%M}" in fault_at else "" for x in t]))


def work(start: str, minutes: int) -> list[tuple]:
    t0 = pd.Timestamp(f"2025-08-01 {start}", tz="Asia/Dubai")
    return [(t0 + pd.Timedelta(minutes=m), 5) for m in range(0, minutes, 5)]


def over(timeline, measured):
    return crew_day_metrics(timeline, measured, minutes_needed=0)["minutes_over_work_limit"]


def test_an_hour_of_heavy_work_in_high_is_forty_minutes_over():
    assert over(work("08:00", 60), readings("08:00", "10:00", HIGH)) == 40  # High allows 20 per 60


def test_a_crew_that_keeps_to_twenty_forty_scores_zero():
    assert over(work("08:00", 20) + work("09:00", 20), readings("08:00", "10:00", HIGH)) == 0


def test_low_zone_work_is_never_over():
    assert over(work("06:00", 120), readings("06:00", "08:00", LOW)) == 0  # continuous self-paced is allowed


def test_a_full_low_hour_straight_into_medium_is_over():
    """60 Low minutes then Medium work from 06:00: the window ending 06:05 already holds 60 minutes."""
    zone = lambda t: LOW if t.hour < 6 else MEDIUM  # noqa: E731
    assert over(work("05:00", 60) + work("06:00", 45), readings("05:00", "07:00", zone)) > 0
    assert over(work("05:00", 60) + work("06:15", 45), readings("05:00", "07:00", zone)) == 0  # 15 min rest


def test_work_before_conditions_changed_is_not_blamed_afterwards():
    zone = lambda t: MEDIUM if t.minute < 30 else HIGH  # noqa: E731
    assert over(work("08:00", 30), readings("08:00", "09:00", zone)) == 0  # stopped when it turned High


def test_a_faulty_reading_is_judged_by_the_last_good_one():
    m = readings("08:00", "09:00", MEDIUM, fault_at=("08:20",))
    m.loc[m["fault"] != "", "twl_wm2"] = 60.0  # the broken sensor says extreme heat
    assert over(work("08:00", 45), m) == 0  # judged as Medium, like the readings around it


def test_baseline_obeys_the_midday_break_and_reports_its_finish():
    m = readings("11:00", "17:00", MEDIUM)
    tl = baseline_timeline(m, minutes_needed=120, start="12:00")
    starts = [t.strftime("%H:%M") for t, _ in tl]
    assert not any("12:30" <= s < "15:00" for s in starts) and starts[0] == "12:00" and starts[-1] == "16:25"
    r = crew_day_metrics(tl, m, minutes_needed=120)
    assert (r["minutes_in_midday_break"], r["work_delivered_minutes"], r["finishes_at"]) == (0, 120, "16:30")


# --- the replay day ----------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def replay():
    return replay_day_metrics("mussafah", "2025-08-01", "steel fixer", 5, "09:00")


def test_heat_safe_keeps_to_the_limits_and_the_others_do_not(replay):
    results, _, _ = replay
    a, b, c = results["A. No plan"], results["B. Morning plan only"], results["C. Heat-Safe"]
    assert c["minutes_over_work_limit"] == 0
    assert a["minutes_over_work_limit"] > b["minutes_over_work_limit"] > 0  # the measure can tell them apart
    assert all(r["minutes_in_midday_break"] == 0 for r in results.values())  # a fair baseline


def test_nothing_is_lost_silently(replay):
    results, extra, _ = replay
    for r in results.values():
        assert r["work_delivered_minutes"] + r["shortfall_minutes"] == 300
    assert extra["minutes_cut_by_fast_loop"] >= 0 and extra["worked_before_replan"] > 0


def test_the_fast_loop_is_quick_quiet_and_not_fooled(replay):
    _, extra, _ = replay
    assert extra["detection_delay_minutes"] is not None and extra["detection_delay_minutes"] <= 5
    assert extra["sensor_faults_caught"] == 1 and extra["false_withdrawals"] == 0
    assert extra["alerts"] <= extra["readings"] / 10  # alerts are news: well under one per hour of readings
