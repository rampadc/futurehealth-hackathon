"""Site sensor: measured TWL, the synthetic feed, forecast correction, and re-planning from measured heat."""
from datetime import datetime

import numpy as np
import pandas as pd
import pytest

from heat_safe import rules
from heat_safe.forecast import get_replay
from heat_safe.heat_stress import compute_heat_stress
from heat_safe.job_profile import lookup_job_profile
from heat_safe.schedule import optimise_schedule
from heat_safe.sensor import (apply_measurements, mean_radiant_from_globe, measured_twl, synthetic_feed,
                              to_observations, wet_bulb_stull)
from heat_safe.twl import sat_vapour_pressure, thermal_work_limit

DAY = "2025-08-01"


@pytest.fixture(scope="module")
def weather():
    return get_replay(DAY, sites=["mussafah"])  # cached ERA5 replay day: no network


@pytest.fixture(scope="module")
def hs(weather):
    return compute_heat_stress(weather)


def reading(**kw):
    row = dict(time=pd.Timestamp("2025-08-01 08:30", tz="Asia/Dubai"), dry_bulb_c=36.0, rh_pct=60.0,
               globe_temp_c=36.5, wind_ms=1.0, pressure_hpa=1000.0, sensor_ok=True) | kw
    return pd.DataFrame([row])


# --- physics ------------------------------------------------------------------------------------------

def test_stull_wet_bulb_matches_the_paper():
    assert wet_bulb_stull(20.0, 50.0) == pytest.approx(13.7, abs=0.1)  # Stull (2011) worked example


def test_globe_at_air_temperature_means_mean_radiant_equals_air():
    assert mean_radiant_from_globe(35.0, 35.0, 1.0) == pytest.approx(35.0)
    assert mean_radiant_from_globe(50.0, 35.0, 1.0) > 50.0  # a hot globe in wind: MRT above the globe


def test_measured_twl_uses_the_same_model_as_the_forecast():
    m = measured_twl(reading(globe_temp_c=36.0))  # globe = air: no radiant load
    pa = 0.6 * sat_vapour_pressure(36.0)
    assert m["twl_wm2"].iloc[0] == pytest.approx(float(thermal_work_limit(36.0, pa, 36.0, 1.0, 100.0)))


@pytest.mark.parametrize("dry,rh", [(44.5, 20.0), (40.0, 90.0)])  # dry bulb > 44, or wet bulb > 32
def test_withdrawal_limit_caps_measured_twl_into_high(dry, rh):
    m = measured_twl(reading(dry_bulb_c=dry, rh_pct=rh, globe_temp_c=dry))
    assert m["withdrawal_limit"].iloc[0] and rules.twl_zone(m["twl_wm2"].iloc[0]) == rules.ZONE_HIGH


def test_missing_input_gives_no_twl_and_becomes_none_for_the_fast_loop():
    m = measured_twl(reading(rh_pct=np.nan))
    assert np.isnan(m["twl_wm2"].iloc[0])
    (o,) = to_observations(m)
    assert o.twl_wm2 is None and o.dry_bulb_c == 36.0 and o.sensor_ok


# --- synthetic feed -------------------------------------------------------------------------------------

def test_feed_is_labelled_synthetic_and_reproducible(weather):
    a, b = synthetic_feed(weather), synthetic_feed(weather)
    pd.testing.assert_frame_equal(a, b)  # same seed, same feed: tests and demo are repeatable
    assert a["synthetic"].all() and (a["time"].diff().dropna() == pd.Timedelta(minutes=5)).all()


def test_spike_heats_the_air_but_keeps_its_moisture(weather):
    calm, spiky = synthetic_feed(weather, spike_c=0, fault_at=None), synthetic_feed(weather, fault_at=None)
    at = spiky["time"] == pd.Timestamp("2025-08-01 08:45", tz="Asia/Dubai")  # inside the hold
    assert float(spiky.loc[at, "dry_bulb_c"].iloc[0] - calm.loc[at, "dry_bulb_c"].iloc[0]) == pytest.approx(3.0, abs=0.6)
    vp = lambda f: float(f.loc[at, "rh_pct"].iloc[0]) / 100 * sat_vapour_pressure(float(f.loc[at, "dry_bulb_c"].iloc[0]))
    assert vp(spiky) == pytest.approx(vp(calm), rel=0.05)  # hotter air, same water: RH falls


def test_default_spike_pushes_the_shade_crew_into_high_without_a_withdrawal(weather, hs):
    m = measured_twl(synthetic_feed(weather, fault_at=None))
    spike = m[m["note"] != ""]
    assert (spike["twl_wm2"] < rules.TWL_HIGH_RISK_BELOW).any()  # the demo has something to react to
    assert not spike["withdrawal_limit"].any()                     # ...and it is a tighten, not a stop
    plan_zone = hs.set_index(pd.DatetimeIndex(hs["time"]).hour).loc[8, "twl_zone_shade"]
    assert plan_zone == rules.ZONE_MEDIUM                           # the plan assumed Medium for 08:00


def test_fault_reading_is_implausible(weather):
    f = synthetic_feed(weather)
    bad = f[f["note"].str.contains("fault")]
    assert len(bad) == 1 and bad["dry_bulb_c"].iloc[0] == 70.0
    before = f.loc[bad.index[0] - 1, "dry_bulb_c"]
    assert abs(70.0 - before) > rules.SENSOR_MAX_CHANGE_C_PER_MIN * 5  # the fast loop's check will catch it


# --- forecast correction (slow loop) --------------------------------------------------------------------

def test_measured_hours_replace_the_forecast_with_their_worst_reading(weather, hs):
    m = measured_twl(synthetic_feed(weather, fault_at=None))
    now = datetime(2025, 8, 1, 9, 10)
    out = apply_measurements(hs, m, now, shade=True)
    h8 = pd.DatetimeIndex(out["time"]).hour == 8
    in_hour = m[pd.DatetimeIndex(m["time"]).hour == 8]
    assert out.loc[h8, "twl_shade_wm2"].iloc[0] == pytest.approx(in_hour["twl_wm2"].min())
    assert out.loc[h8, "twl_basis"].iloc[0] == "measured"
    assert (out["twl_wm2"] == hs["twl_wm2"]).all()  # a shade sensor says nothing about the sun


def test_hotter_than_forecast_corrects_the_next_hours_and_fades(weather, hs):
    m = measured_twl(synthetic_feed(weather, fault_at=None))
    out = apply_measurements(hs, m, datetime(2025, 8, 1, 8, 55), shade=True)
    hour = pd.DatetimeIndex(out["time"]).hour
    bias = float(out.loc[hour == 8, "twl_shade_wm2"].iloc[0] - hs.loc[hour == 8, "twl_shade_wm2"].iloc[0])
    assert bias < 0
    deltas = [float(out.loc[hour == h, "twl_shade_wm2"].iloc[0] - hs.loc[hour == h, "twl_shade_wm2"].iloc[0])
              for h in (9, 10, 11, 12)]
    assert deltas == pytest.approx([bias, bias * 2 / 3, bias / 3, 0.0])
    assert out.loc[hour == 9, "twl_zone_shade"].iloc[0] == rules.twl_zone(out.loc[hour == 9, "twl_shade_wm2"].iloc[0])


def test_cooler_than_forecast_never_raises_the_forecast(hs):
    t = pd.Timestamp("2025-08-01 08:30", tz="Asia/Dubai")
    cool = measured_twl(reading(time=t, dry_bulb_c=25.0, rh_pct=40.0, globe_temp_c=25.0))
    out = apply_measurements(hs, cool, datetime(2025, 8, 1, 8, 40), shade=True)
    later = pd.DatetimeIndex(out["time"]).hour > 8
    assert (out.loc[later, "twl_shade_wm2"].to_numpy() == hs.loc[later, "twl_shade_wm2"].to_numpy()).all()


def test_faulty_and_future_readings_are_ignored(weather, hs):
    m = measured_twl(synthetic_feed(weather))  # includes the 09:40 fault, which the sensor does NOT self-report
    out = apply_measurements(hs, m, datetime(2025, 8, 1, 9, 50), shade=True)  # flag_faults must catch it
    h9 = pd.DatetimeIndex(out["time"]).hour == 9
    assert out.loc[h9, "twl_shade_wm2"].iloc[0] > 60.0  # the 70 °C fault did not become the hour's worst
    from_8 = m[pd.DatetimeIndex(m["time"]).hour >= 8]  # a sensor installed at 08:00
    assert apply_measurements(hs, from_8, datetime(2025, 8, 1, 7, 30), shade=True)["twl_basis"].eq("forecast").all()


# --- re-planning ----------------------------------------------------------------------------------------

def test_replan_puts_no_work_in_past_hours_and_counts_work_done(hs):
    steel = lookup_job_profile("steel fixer")
    plan = optimise_schedule(hs, steel, work_hours_needed=6, shade=True, from_hour=10, already_worked_minutes=90)
    assert all(b["scheduled_work_minutes"] == 0 for b in plan["hours"] if b["start"] < "10:00")
    assert plan["work_minutes_scheduled"] == 90 + sum(b["scheduled_work_minutes"] for b in plan["hours"])
    assert plan["work_minutes_scheduled"] <= 360 and plan["replanned_from"] == "10:00"
    assert all(plan["invariants"].values())


def test_replan_never_exceeds_the_acclimatisation_share(hs):
    from heat_safe.acclimatisation import Acclimatisation
    returning = Acclimatisation("returning", 1, False, 0.8, "test", ())
    plan = optimise_schedule(hs, lookup_job_profile("labourer"), work_hours_needed=5, shade=True,
                             acclimatisation=returning, from_hour=9, already_worked_minutes=200)
    assert plan["work_minutes_scheduled"] == 240  # 80 % of 300: only 40 more minutes after 200 worked
    assert plan["invariants"]["within_acclimatisation_share"]


def test_replan_on_measured_heat_moves_work_out_of_the_hot_hours(weather, hs):
    steel = lookup_job_profile("steel fixer")
    before = optimise_schedule(hs, steel, work_hours_needed=5, shade=True)
    measured = apply_measurements(hs, measured_twl(synthetic_feed(weather, fault_at=None)),
                                  datetime(2025, 8, 1, 8, 55), shade=True)
    after = optimise_schedule(measured, steel, work_hours_needed=5, shade=True, from_hour=9,
                              already_worked_minutes=60)
    by = lambda p: {b["start"]: b for b in p["hours"]}
    # 10:00 was forecast Medium (122.8); measured heat at 08:xx corrects it to High: 20 min work, not 45
    assert (by(before)["10:00"]["twl_zone"], by(after)["10:00"]["twl_zone"]) == (rules.ZONE_MEDIUM, rules.ZONE_HIGH)
    assert by(after)["10:00"]["allowed_work_minutes"] < by(before)["10:00"]["allowed_work_minutes"]
    assert by(after)["10:00"]["twl_basis"].endswith("W/m² worse (sensor)")  # the agent can say why


def test_already_worked_without_from_hour_is_rejected(hs):
    with pytest.raises(ValueError):
        optimise_schedule(hs, lookup_job_profile("roofer"), work_hours_needed=4, already_worked_minutes=30)


# --- end to end: the fast loop over the synthetic spike (activates once spike.py is implemented) ---------

def test_fast_loop_reacts_to_the_spike_and_the_fault(weather, hs):
    from heat_safe.sensor import replay_fast_loop
    from heat_safe.spike import REST_NOW, SENSOR_FAULT, TIGHTEN, WITHDRAW, allowed_minutes
    plan = optimise_schedule(hs, lookup_job_profile("steel fixer"), work_hours_needed=5, shade=True)
    try:
        log = replay_fast_loop(measured_twl(synthetic_feed(weather)), plan, start="08:00", end="10:00")
    except NotImplementedError:
        pytest.skip("spike.adjust_for_observation is not implemented yet (your part)")
    spike = log[(log["time"].dt.strftime("%H:%M") >= "08:25") & (log["time"].dt.strftime("%H:%M") < "09:00")]
    assert spike["action"].isin([TIGHTEN, REST_NOW]).any() and spike["zone"].eq(rules.ZONE_HIGH).any()
    assert log.loc[log["time"].dt.strftime("%H:%M") == "09:40", "action"].iloc[0] == SENSOR_FAULT
    assert not log["action"].eq(WITHDRAW).any()
    for _, r in log.iterrows():  # never more than the plan allowed in that hour
        assert r["work_minutes_left"] <= max(0, allowed_minutes(r["planned_zone"], "heavy", True) - r["worked_minutes"])
    assert log["alert"].sum() < len(log) / 3  # alerts are news, not every reading


# --- faults, the re-plan recommendation and the agent's view of the sensor (14 Nov) ----------------------

from heat_safe.sensor import flag_faults, get_site_sensor, replan_recommendation  # noqa: E402
from heat_safe.spike import CONTINUE, REST_NOW, SENSOR_FAULT, TIGHTEN, WITHDRAW  # noqa: E402


def test_flag_faults_uses_the_fast_loops_check(weather):
    f = flag_faults(measured_twl(synthetic_feed(weather)))
    bad = f[f["fault"] != ""]
    assert list(bad["time"].dt.strftime("%H:%M")) == ["09:40"] and "implausible" in bad["fault"].iloc[0]


def log_of(*rows, start=datetime(2025, 8, 1, 8, 0)):
    """A replay_fast_loop-shaped log: (minute, action, measured_zone, planned_zone)."""
    return pd.DataFrame([dict(time=start + pd.Timedelta(minutes=m), action=a, measured_zone=z, planned_zone=p)
                         for m, a, z, p in rows])


def test_no_replan_when_readings_match_the_plan_or_only_the_sensor_failed():
    assert replan_recommendation(log_of((0, CONTINUE, "medium", "medium"), (5, CONTINUE, "medium", "medium"))) == (False, "")
    faults = log_of(*[(m, SENSOR_FAULT, "", "medium") for m in range(0, 60, 5)])
    assert replan_recommendation(faults)[0] is False  # "check the sensor", not "re-plan"


def test_replan_after_a_withdrawal():
    ok, why = replan_recommendation(log_of((0, CONTINUE, "medium", "medium"), (5, WITHDRAW, "high", "medium")))
    assert ok and "08:05" in why


def test_replan_only_after_the_set_time_worse_than_planned():
    n = rules.REPLAN_RECOMMEND_AFTER_MINUTES
    short = log_of((0, TIGHTEN, "high", "medium"), (n - 1, REST_NOW, "high", "medium"))
    enough = log_of((0, TIGHTEN, "high", "medium"), (n, REST_NOW, "high", "medium"))
    assert replan_recommendation(short)[0] is False and replan_recommendation(enough)[0] is True


def test_a_better_reading_restarts_the_count():
    n = rules.REPLAN_RECOMMEND_AFTER_MINUTES
    log = log_of((0, TIGHTEN, "high", "medium"), (5, TIGHTEN, "medium", "medium"), (10, TIGHTEN, "high", "medium"),
                 (n + 5, TIGHTEN, "high", "medium"))
    assert replan_recommendation(log)[0] is False  # counted from minute 10: n - 5 minutes


def test_site_sensor_on_the_replay_day(weather, hs):
    plan = optimise_schedule(hs, lookup_job_profile("steel fixer"), work_hours_needed=5, shade=True)
    r = get_site_sensor("mussafah", DAY, "09:45", weather, hs, plan)
    assert r["status"] == "ok" and r["synthetic"] and r["location"] == "shade"
    h8 = next(h for h in r["hourly"] if h["hour"] == "08:00")
    assert (h8["forecast_zone"], h8["measured_zone"]) == ("medium", "high") and h8["worse_than_forecast_wm2"] > 0
    assert [f["time"] for f in r["faults"]] == ["09:40"] and r["fault_note"]
    assert all(h["max_dry_bulb_c"] < 70 for h in r["hourly"])  # the fault is excluded from the numbers
    alerts = [(a["time"], a["action"]) for a in r["fast_loop_alerts"]]
    assert ("08:30", "rest_now") in alerts and ("09:40", "sensor_fault") in alerts
    assert not any(t < "08:25" for t, _ in alerts)  # no alert before the spike: the feed matches the forecast
    assert r["replan_recommended"] and "plan medium" in r["replan_reason"]


def test_site_sensor_until_is_inclusive_and_other_days_have_no_sensor(weather, hs):
    plan = optimise_schedule(hs, lookup_job_profile("steel fixer"), work_hours_needed=5, shade=True)
    at_830 = get_site_sensor("mussafah", DAY, "08:30", weather, hs, plan)
    assert at_830["fast_loop_alerts"][-1]["time"] == "08:30"
    assert get_site_sensor("ruwais", DAY, "09:00", weather, hs)["status"] == "no_sensor"
    assert "fast_loop_alerts" not in get_site_sensor("mussafah", DAY, "09:00", weather, hs)  # no crew given



def test_replan_reports_the_work_still_needed(hs):
    plan = optimise_schedule(hs, lookup_job_profile("steel fixer"), work_hours_needed=5, shade=True, from_hour=9,
                             already_worked_minutes=150)
    assert (plan["work_minutes_still_needed"], plan["work_still_needed_hm"]) == (150, "2 h 30 min")


def test_site_sensor_alerts_carry_the_exact_texts_sent(weather, hs):
    from heat_safe.alerts import render
    plan = optimise_schedule(hs, lookup_job_profile("steel fixer"), work_hours_needed=5, shade=True)
    a = get_site_sensor("mussafah", DAY, "08:30", weather, hs, plan)["fast_loop_alerts"][-1]
    assert a["worker_message"] == render("rest_now", "en").text
    assert a["supervisor_message"].startswith("Steel fixer crew: rest now at 08:30")


# --- rolling 60-minute work limit (15 Nov) ---------------------------------------------------------------

from heat_safe.sensor import available_work_minutes  # noqa: E402

T8 = pd.Timestamp("2025-08-01 08:00", tz="Asia/Dubai")
WORKED_8_TO_830 = [(T8 + pd.Timedelta(minutes=m), 5) for m in range(0, 30, 5)]  # 30 min of work


def at(hhmm):
    return pd.Timestamp(f"2025-08-01 {hhmm}", tz="Asia/Dubai")


def test_nothing_worked_means_the_whole_allowance():
    assert available_work_minutes([], at("09:00"), 20) == 20


def test_work_before_the_hour_still_counts_after_it():
    """The clock-hour reset let a crew work 08:00-08:30 and again from 09:00: 50 minutes in 80 under 20/40."""
    assert available_work_minutes(WORKED_8_TO_830, at("09:00"), 20) == 0
    assert available_work_minutes(WORKED_8_TO_830, at("09:05"), 20) == 0


def test_after_forty_minutes_rest_a_full_twenty_minute_stretch():
    """Old minutes drop out of the window as the new stretch goes on, so it is 20, not 20 minus what is left."""
    assert available_work_minutes(WORKED_8_TO_830, at("09:10"), 20) == 20


def test_replay_day_follows_a_twenty_forty_cycle_in_high(weather, hs):
    from heat_safe.sensor import replay_fast_loop
    plan = optimise_schedule(hs, lookup_job_profile("steel fixer"), work_hours_needed=5, shade=True)
    log = replay_fast_loop(measured_twl(synthetic_feed(weather)), plan, start="08:00", end="10:00")
    alerts = [(f"{r.time:%H:%M}", r.action, r.work_minutes_left) for r in log[log["alert"]].itertuples()]
    assert alerts[:3] == [("08:30", "rest_now", 0), ("09:10", "tighten", 20), ("09:30", "rest_now", 0)]

