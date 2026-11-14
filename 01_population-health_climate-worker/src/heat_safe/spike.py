"""Heat-spike response, the fast loop: one site-sensor reading in, one decision for the crew out. No LLM.

The shift plan (optimise_schedule) assumed a TWL zone for every hour from the forecast. A sensor on site
can show it is hotter than that. This module decides, reading by reading, what the crew does *now*. It
only ever makes work stricter than the plan; the slow loop (re-planning the rest of the day) is separate.

    state = LoopState(zone=planned_zone)              # start of the hour: the plan's zone is in force
    for obs in readings:
        d = adjust_for_observation(obs, planned_zone, worked_minutes, "heavy", True, state)
        if d.alert: send_alert(...)                    # worker and supervisor
        state = d.state                                # carried to the next reading

Pure function: same inputs, same output, nothing mutated, no clock or I/O. That is what makes every
rule below unit-testable (tests/test_spike.py is the executable spec).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from heat_safe import rules

# Actions, from mildest to most severe
CONTINUE = "continue"          # conditions are no worse than the plan assumed: follow the plan
TIGHTEN = "tighten"            # a stricter zone is in force: fewer work minutes left this hour
REST_NOW = "rest_now"          # the worker has already used this hour's minutes for the stricter zone
SENSOR_FAULT = "sensor_fault"  # reading missing or implausible: one zone stricter, check the sensor
WITHDRAW = "withdraw"          # withdrawal limit reached: everyone stops outdoor work

ZONES = (rules.ZONE_LOW, rules.ZONE_MEDIUM, rules.ZONE_HIGH)  # least to most strict, a tuple from lowerest to highest strict level


@dataclass(frozen=True)
class Observation:
    """
        One site-sensor reading. None means the sensor did not report that value.
        Holiding one reading, any measurement can be None if missing.
    """
    time: datetime
    twl_wm2: float | None
    dry_bulb_c: float | None
    wet_bulb_c: float | None
    sensor_ok: bool = True  # False when the device reports its own fault


@dataclass(frozen=True)
class LoopState:
    """
        What the loop remembers between readings.
        The memeroy carrried between readings.
    """
    zone: str                            # zone in force after the previous reading (start: the plan's zone)
    better_since: datetime | None = None  # first reading of the current run of better-zone readings
    last_action: str = CONTINUE
    last_good: Observation | None = None  # last plausible reading: the reference for the next jump check


@dataclass(frozen=True)
class Decision:
    """
        Holding the result, action, zone, minutes remaining, whether to alert,
        a reason and the updated state to pass to next call.
    """
    action: str
    zone: str                      # zone in force now
    work_minutes_left: int         # work minutes still allowed in this hour; never more than the plan allowed
    alert: bool                    # push to worker and supervisor now
    reason: str                    # one line for the supervisor and the logs
    state: LoopState               # pass to the next call


# --- Helpers (done; use them) -----------------------------------------------------------------------

def stricter(a: str, b: str) -> str:
    """The stricter of two zones: stricter("medium", "high") == "high"."""
    return max(a, b, key=ZONES.index)


def one_stricter(zone: str) -> str:
    """Fail-safe step for a lost input: low -> medium -> high, capped at high."""
    return ZONES[min(ZONES.index(zone) + 1, len(ZONES) - 1)]


def allowed_minutes(zone: str, work_intensity: str, acclimatised: bool) -> int:
    """Work minutes per hour in a zone (ADOSH-SF TG Table 1). Unacclimatised workers: Low zone only."""
    controls = rules.ZONE_CONTROLS[zone]
    if not acclimatised and not controls.unacclimatised_may_work:
        return 0
    return (controls.work_minutes_per_hour_heavy if work_intensity == "heavy"
            else controls.work_minutes_per_hour_light)


# --- The fast loop -----------------------------------------------------------------------------------

def adjust_for_observation(
    obs: Observation,
    planned_zone: str,
    worked_minutes: int,
    work_intensity: str,
    acclimatised: bool,
    state: LoopState,
) -> Decision:
    """Decide what the crew does after this reading. The checks run IN THIS ORDER; the first that
    applies decides the action.

    1. Sensor fault. The reading is unusable if `sensor_ok` is False, or any of twl / dry bulb / wet bulb
       is None, or the dry bulb changed faster than rules.SENSOR_MAX_CHANGE_C_PER_MIN since
       `state.last_good` (compare |change| with rate x minutes between the two readings).
       -> SENSOR_FAULT. Zone = the stricter of one_stricter(planned_zone) and state.zone.
          Reset better_since. Do NOT store this reading as last_good.
       Why first: an implausible 47 °C must not trigger a withdrawal, and a broken sensor reading 25 °C
       must not relax anything. A bad input moves you toward safety, never away from it.

    2. Withdrawal limit: dry bulb > rules.WITHDRAWAL_DRY_BULB_C or wet bulb > rules.WITHDRAWAL_WET_BULB_C
       (strictly greater, as in heat_stress.py). -> WITHDRAW. Zone high, 0 minutes left.

    3. Zone with hysteresis. observed = rules.twl_zone(obs.twl_wm2). Compared with state.zone:
       - stricter: it applies at once; better_since = None.          (raise fast)
       - better: start the timer (better_since = obs.time) if it is not running. Keep state.zone until
         obs.time - better_since >= rules.STEP_DOWN_AFTER_MINUTES, then take `observed` and stop the
         timer.                                                      (lower slowly)
       - same: keep it; better_since = None (a run of better readings was interrupted).
       Then zone = stricter(that, planned_zone): the fast loop never relaxes below the plan.

    4. Minutes and action. left = max(0, allowed_minutes(zone, ...) - worked_minutes).
       zone == planned_zone -> CONTINUE; otherwise REST_NOW if left == 0, else TIGHTEN.
       `left` is computed this way for every action, from the zone in force (also for SENSOR_FAULT);
       only WITHDRAW is always 0.

    Alert: True when the action is not CONTINUE and differs from state.last_action (an alert is news;
    repeating the same one every reading is how alert fatigue starts).
    New state: zone, better_since, last_action = this action, last_good = this reading (except step 1).
    `reason`: a short sentence of your own, e.g. "Measured TWL 98 W/m² (high zone); plan assumed medium".


    How one reading is processed:
    1. check the sensor: if the reported faulty, moved to the planed zone to one stricter level, preserving any 
    stricter zone in force. do not save bad readding as last_good.
    2. Check withdrawal limites: if dry-bulb or wet-bulb temperature above the predefined limite, set decision to
    withdraw: high zone  and 0 minutes. 
    """
    def decide(action: str | None, zone: str, better_since: datetime | None, reason: str,
               keep_reading: bool = True) -> Decision:
        """Build the Decision. Shared by every branch, so minutes, action and alert follow one rule."""
        if action == WITHDRAW:
            left = 0
        else:
            left = max(0, allowed_minutes(zone, work_intensity, acclimatised) - worked_minutes)
        if action is None:  # step 4: the zone decided above, now name the action
            if zone == planned_zone:
                action = CONTINUE
            elif left == 0:
                action = REST_NOW
            else:
                action = TIGHTEN
        alert = action != CONTINUE and action != state.last_action
        new_state = LoopState(
            zone=zone,
            better_since=better_since,
            last_action=action,
            # A faulty reading must never become the reference for the next jump check
            last_good=obs if keep_reading else state.last_good,
        )
        return Decision(action, zone, left, alert, reason, new_state)

    # 1. Sensor fault: a bad input moves toward safety, never away from it
    fault = ""
    if not obs.sensor_ok:
        fault = "sensor reports a fault"
    elif obs.twl_wm2 is None or obs.dry_bulb_c is None or obs.wet_bulb_c is None:
        fault = "sensor reading incomplete"
    elif state.last_good is not None:
        minutes = max((obs.time - state.last_good.time).total_seconds() / 60, 1 / 60)
        change = abs(obs.dry_bulb_c - state.last_good.dry_bulb_c)
        if change > rules.SENSOR_MAX_CHANGE_C_PER_MIN * minutes:
            fault = f"implausible jump of {change:.1f} °C in {minutes:.0f} min"
    if fault:
        zone = stricter(one_stricter(planned_zone), state.zone)
        return decide(SENSOR_FAULT, zone, None,
                      f"Sensor fault ({fault}): {zone} zone controls until the sensor is checked",
                      keep_reading=False)

    # 2. Withdrawal limit: everyone stops, whatever the TWL says
    if obs.dry_bulb_c > rules.WITHDRAWAL_DRY_BULB_C or obs.wet_bulb_c > rules.WITHDRAWAL_WET_BULB_C:
        return decide(WITHDRAW, rules.ZONE_HIGH, None,
                      f"Withdrawal limit: dry bulb {obs.dry_bulb_c:.1f} °C, wet bulb {obs.wet_bulb_c:.1f} °C. "
                      "Stop outdoor work")

    # 3. Zone with hysteresis: raise fast, lower slowly
    observed = rules.twl_zone(obs.twl_wm2)
    zone, better_since = state.zone, state.better_since
    if ZONES.index(observed) > ZONES.index(zone):    # hotter: applies at once
        zone, better_since = observed, None
    elif ZONES.index(observed) < ZONES.index(zone):  # cooler: only after a steady run of cooler readings
        better_since = better_since or obs.time
        if (obs.time - better_since).total_seconds() >= rules.STEP_DOWN_AFTER_MINUTES * 60:
            zone, better_since = observed, None
    else:                                            # same zone: a run of cooler readings is broken
        better_since = None
    zone = stricter(zone, planned_zone)              # the fast loop never relaxes below the plan

    # 4. Minutes and action (inside decide)
    return decide(None, zone, better_since,
                  f"Measured TWL {obs.twl_wm2:.0f} W/m² ({observed} zone); plan assumed {planned_zone}; "
                  f"{zone} zone controls in force")
