"""Executable spec for the heat-spike fast loop (src/heat_safe/spike.py).

Scenario: 1 Aug 2025, 10:00-11:00 at Mussafah. The plan assumed the Medium zone (heavy work: 45 min
work / 15 min rest). A site sensor reports every few minutes. TWL zones: High < 115 <= Medium < 140 <= Low.

Run one test while you build:   uv run pytest tests/test_spike.py -k withdrawal -v
"""
from datetime import datetime, timedelta
from itertools import product

import pytest

from heat_safe import rules
from heat_safe.spike import (CONTINUE, REST_NOW, SENSOR_FAULT, TIGHTEN, WITHDRAW, ZONES, LoopState, Observation,
                             adjust_for_observation, allowed_minutes, one_stricter, stricter)

T0 = datetime(2025, 8, 1, 10, 0)
HIGH_TWL, MEDIUM_TWL, LOW_TWL = 100.0, 130.0, 150.0


def obs(minute: float, twl: float | None = MEDIUM_TWL, dry: float | None = 40.0, wet: float | None = 28.0,
        ok: bool = True) -> Observation:
    return Observation(T0 + timedelta(minutes=minute), twl, dry, wet, ok)


def decide(o: Observation, state: LoopState | None = None, planned: str = rules.ZONE_MEDIUM, worked: int = 10,
           intensity: str = "heavy", acclimatised: bool = True):
    return adjust_for_observation(o, planned, worked, intensity, acclimatised, state or LoopState(zone=planned))


def run(readings, planned: str = rules.ZONE_MEDIUM, worked: int = 10):
    """Feed a sequence of readings through the loop, carrying state; return every decision."""
    state, out = LoopState(zone=planned), []
    for o in readings:
        d = decide(o, state, planned, worked)
        out.append(d)
        state = d.state
    return out


# --- helpers (already implemented: these pass from the start) ----------------------------------------

def test_helpers():
    assert stricter("medium", "high") == "high" and stricter("low", "low") == "low"
    assert [one_stricter(z) for z in ZONES] == ["medium", "high", "high"]  # capped at high
    assert allowed_minutes("high", "heavy", True) == 20 and allowed_minutes("high", "light", True) == 45
    assert allowed_minutes("medium", "heavy", False) == 0  # unacclimatised: Low zone only


# --- 1. Plan holds ------------------------------------------------------------------------------------

def test_conditions_as_planned_continue_without_alert():
    d = decide(obs(0, MEDIUM_TWL), worked=10)
    assert (d.action, d.zone, d.work_minutes_left, d.alert) == (CONTINUE, "medium", 35, False)


def test_never_relaxes_below_the_plan():
    """Cooler than forecast is not a reason to work more: the fast loop only ever tightens."""
    d = decide(obs(0, LOW_TWL), planned=rules.ZONE_HIGH, worked=5)
    assert (d.action, d.zone, d.work_minutes_left) == (CONTINUE, "high", 15)


# --- 2. Spike: raise fast ----------------------------------------------------------------------------

def test_spike_into_high_zone_tightens_at_once():
    d = decide(obs(0, HIGH_TWL), worked=10)
    assert (d.action, d.zone, d.work_minutes_left, d.alert) == (TIGHTEN, "high", 10, True)
    assert d.reason  # the supervisor gets one line saying why


def test_worker_past_the_new_limit_rests_now():
    """30 min into a 45-min Medium block; High allows 20 per hour, so they are already over."""
    d = decide(obs(0, HIGH_TWL), worked=30)
    assert (d.action, d.work_minutes_left, d.alert) == (REST_NOW, 0, True)


def test_light_work_uses_the_light_work_minutes():
    d = decide(obs(0, HIGH_TWL), worked=10, intensity="light")
    assert (d.action, d.work_minutes_left) == (TIGHTEN, 35)  # High, light work: 45 min per hour


def test_unacclimatised_worker_stops_when_the_zone_leaves_low():
    d = decide(obs(0, MEDIUM_TWL), planned=rules.ZONE_LOW, worked=0, acclimatised=False)
    assert (d.action, d.zone, d.work_minutes_left) == (REST_NOW, "medium", 0)


# --- 3. Withdrawal limits ----------------------------------------------------------------------------

@pytest.mark.parametrize("dry,wet", [(44.5, 28.0), (40.0, 32.5)])
def test_withdrawal_limit_stops_all_work(dry, wet):
    first = decide(obs(0, HIGH_TWL, dry, wet), worked=0)
    assert (first.action, first.zone, first.work_minutes_left, first.alert) == (WITHDRAW, "high", 0, True)


def test_withdrawal_limit_is_strictly_greater_than():
    """At exactly 44.0 °C / 32.0 °C the limit is not exceeded (same rule as heat_stress.py)."""
    d = decide(obs(0, HIGH_TWL, 44.0, 32.0), worked=0)
    assert d.action == TIGHTEN


# --- 4. Lower slowly (hysteresis) --------------------------------------------------------------------

# Timings are relative to the rule, so changing STEP_DOWN_AFTER_MINUTES changes no test
STEP = rules.STEP_DOWN_AFTER_MINUTES


def test_stricter_zone_is_lifted_only_after_the_step_down_time_of_better_readings():
    ds = run([obs(0, HIGH_TWL), obs(5, MEDIUM_TWL), obs(10, MEDIUM_TWL), obs(5 + STEP - 1, MEDIUM_TWL),
              obs(5 + STEP, MEDIUM_TWL)])
    assert [d.zone for d in ds] == ["high", "high", "high", "high", "medium"]  # one minute short, then exactly STEP
    assert ds[-1].action == CONTINUE and not ds[-1].alert  # back to plan: the planned reminders take over


def test_a_hot_reading_in_between_restarts_the_clock():
    ds = run([obs(0, HIGH_TWL), obs(5, MEDIUM_TWL), obs(8, HIGH_TWL), obs(15, MEDIUM_TWL),
              obs(15 + STEP - 5, MEDIUM_TWL), obs(15 + STEP, MEDIUM_TWL)])
    assert [d.zone for d in ds] == ["high", "high", "high", "high", "high", "medium"]  # the clock restarted at 15


def test_a_reading_at_the_same_zone_also_restarts_the_clock():
    """'Same' interrupts a run of better readings: the step-down time must be consecutive."""
    ds = run([obs(0, HIGH_TWL), obs(5, MEDIUM_TWL), obs(10, HIGH_TWL), obs(12, MEDIUM_TWL),
              obs(12 + STEP - 1, MEDIUM_TWL)])
    assert ds[-1].zone == "high"  # counted from 12, not 5: one minute short


def test_the_plans_own_step_down_between_hours_is_not_a_deviation():
    """07:00 planned High and measured High; 08:00 planned Medium and measured Medium: nothing to hold back."""
    d1 = decide(obs(0, HIGH_TWL), planned=rules.ZONE_HIGH, worked=0)
    t8 = Observation(T0 + timedelta(minutes=5), MEDIUM_TWL, 40.0, 28.0)
    d2 = adjust_for_observation(t8, rules.ZONE_MEDIUM, 0, "heavy", True, d1.state)
    assert (d1.action, d2.action, d2.zone, d2.alert) == (CONTINUE, CONTINUE, "medium", False)


def test_a_spike_still_carries_into_the_next_hour():
    """A deviation in force at the hour change is held (lower slowly), even if the new hour's plan is lower."""
    d1 = decide(obs(0, HIGH_TWL), planned=rules.ZONE_MEDIUM, worked=0)          # spike: tighten to High
    t = Observation(T0 + timedelta(minutes=5), MEDIUM_TWL, 40.0, 28.0)
    d2 = adjust_for_observation(t, rules.ZONE_MEDIUM, 0, "heavy", True, d1.state)
    assert (d1.action, d2.zone) == (TIGHTEN, "high")


# --- 5. Alerts are news, not repeats -----------------------------------------------------------------

def test_the_same_action_alerts_once():
    ds = run([obs(0, HIGH_TWL), obs(3, HIGH_TWL), obs(6, HIGH_TWL)])
    assert [d.action for d in ds] == [TIGHTEN] * 3
    assert [d.alert for d in ds] == [True, False, False]


def test_a_more_severe_action_alerts_again():
    ds = run([obs(0, HIGH_TWL), obs(3, HIGH_TWL, dry=44.5)])
    assert [(d.action, d.alert) for d in ds] == [(TIGHTEN, True), (WITHDRAW, True)]


# --- 6. Sensor faults: a bad input moves toward safety -------------------------------------------------

@pytest.mark.parametrize("reading", [obs(0, twl=None), obs(0, dry=None), obs(0, wet=None), obs(0, ok=False)])
def test_missing_or_self_reported_fault_raises_one_zone(reading):
    d = decide(reading, worked=10)
    assert (d.action, d.zone, d.work_minutes_left, d.alert) == (SENSOR_FAULT, "high", 10, True)


def test_fault_on_a_high_zone_plan_stays_high():
    d = decide(obs(0, twl=None), planned=rules.ZONE_HIGH, worked=5)
    assert (d.action, d.zone) == (SENSOR_FAULT, "high")


def test_an_implausible_jump_is_a_fault_not_a_withdrawal():
    """40 -> 47 °C in one minute is a broken or sun-struck sensor, not weather. Check 1 runs before check 2."""
    ds = run([obs(0, MEDIUM_TWL, dry=40.0), obs(1, HIGH_TWL, dry=47.0)])
    assert ds[1].action == SENSOR_FAULT


def test_a_plausible_fast_rise_is_real():
    ds = run([obs(0, MEDIUM_TWL, dry=40.0), obs(1, HIGH_TWL, dry=41.5)])  # 1.5 °C in a minute: allowed
    assert ds[1].action == TIGHTEN


def test_the_rate_scales_with_time_between_readings():
    ds = run([obs(0, MEDIUM_TWL, dry=38.0), obs(5, HIGH_TWL, dry=44.5)])  # 6.5 °C in 5 min: plausible
    assert ds[1].action == WITHDRAW


def test_a_faulty_reading_is_not_the_reference_for_the_next_one():
    """If the bad 70 °C became last_good, the next normal reading would look like a 30 °C drop: another fault."""
    ds = run([obs(0, MEDIUM_TWL, dry=40.0), obs(1, MEDIUM_TWL, dry=70.0), obs(2, MEDIUM_TWL, dry=40.5)])
    # Not another fault; but the raised zone from the fault stays until STEP min of good readings (lower slowly)
    assert [(d.action, d.zone) for d in ds] == [(CONTINUE, "medium"), (SENSOR_FAULT, "high"), (TIGHTEN, "high")]


def test_a_fault_does_not_lower_a_zone_already_in_force():
    ds = run([obs(0, HIGH_TWL), obs(2, twl=None)], planned=rules.ZONE_LOW)
    assert [d.zone for d in ds] == ["high", "high"]  # one_stricter(low) is medium, but high is in force


# --- 7. The safety property, over every combination ---------------------------------------------------

@pytest.mark.parametrize("planned", ZONES)
def test_never_more_minutes_than_the_plan_allowed(planned):
    """Whatever the reading, the fast loop never gives more work than the plan's zone allowed."""
    readings = [obs(0, twl, dry, wet, ok) for twl, dry, wet, ok in product(
        [None, 60.0, HIGH_TWL, 114.9, 115.0, MEDIUM_TWL, 139.9, 140.0, LOW_TWL, 250.0],
        [None, 30.0, 44.0, 44.1], [None, 25.0, 32.0, 32.1], [True, False])]
    for o, worked, intensity, acclimatised in product(readings, [0, 10, 20, 45, 60], ["light", "heavy"],
                                                      [True, False]):
        d = adjust_for_observation(o, planned, worked, intensity, acclimatised, LoopState(zone=planned))
        plan_left = max(0, allowed_minutes(planned, intensity, acclimatised) - worked)
        assert d.work_minutes_left <= plan_left, (o, worked, intensity, acclimatised, d)
        assert ZONES.index(d.zone) >= ZONES.index(planned)
