"""Site heat-stress sensor: measured TWL, readings for the fast loop, and forecast correction for re-planning.

A site sensor (a heat-stress meter at the work area) reports air temperature, humidity, globe temperature
and wind at work height every few minutes. That is the "measured" TWL ADOSH-SF intends, and it replaces
the forecast estimate wherever it exists:

    feed     = synthetic_feed(get_replay(day, sites=[site]))       # or a real sensor's readings
    measured = measured_twl(feed)                                   # adds TWL, wet bulb, withdrawal limit
    for o in to_observations(measured): spike.adjust_for_observation(o, ...)    # fast loop, every reading
    hs_now   = apply_measurements(hs, measured, now, shade=True)    # slow loop: re-plan the rest of the day

The synthetic feed is demo data built from the real ERA5 replay day (1 Aug 2025, Mussafah), with an added
heat spike and one faulty reading. It is labelled synthetic in every row.
"""
from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd

from heat_safe import rules
from heat_safe.heat_stress import rezone
from heat_safe.spike import ZONES, Observation, reading_fault
from heat_safe.thermal import KMH_TO_MS
from heat_safe.twl import DEFAULT_ICL, DEFAULT_ICL_PERM, sat_vapour_pressure, thermal_work_limit, wind_10m_to_body

# Standard black globe of a heat-stress meter (ISO 7726): 150 mm, emissivity 0.95
GLOBE_DIAMETER_M = 0.15
GLOBE_EMISSIVITY = 0.95


def wet_bulb_stull(ta: np.ndarray, rh_pct: np.ndarray) -> np.ndarray:
    """Psychrometric wet bulb (°C) from air temperature and RH, Stull (2011), J. Appl. Meteor. Climatol.
    50:2267. Within about 1 °C for RH 5-99 % and -20 to 50 °C: enough for the 32 °C withdrawal check."""
    t, rh = np.asarray(ta, float), np.asarray(rh_pct, float)
    return (t * np.arctan(0.151977 * np.sqrt(rh + 8.313659)) + np.arctan(t + rh) - np.arctan(rh - 1.676331)
            + 0.00391838 * rh ** 1.5 * np.arctan(0.023101 * rh) - 4.686035)


def mean_radiant_from_globe(globe_c: np.ndarray, ta: np.ndarray, wind_ms: np.ndarray) -> np.ndarray:
    """Mean radiant temperature (°C) from a globe thermometer, forced convection (ISO 7726, Annex B)."""
    tg, ta, va = (np.asarray(v, float) for v in (globe_c, ta, wind_ms))
    k = 1.1e8 * np.maximum(va, 0.1) ** 0.6 / (GLOBE_EMISSIVITY * GLOBE_DIAMETER_M ** 0.4)
    return ((tg + 273.15) ** 4 + k * (tg - ta)) ** 0.25 - 273.15


def measured_twl(feed: pd.DataFrame, icl: float = DEFAULT_ICL, icl_perm: float = DEFAULT_ICL_PERM) -> pd.DataFrame:
    """Add wet bulb, mean radiant temperature, TWL and withdrawal limit to sensor readings.

    `feed` columns: time, dry_bulb_c, rh_pct, globe_temp_c, wind_ms (at work height), pressure_hpa, sensor_ok.
    Same TWL model and withdrawal cap as heat_stress.compute_heat_stress, so measured and forecast agree
    on method and differ only in their inputs. Missing inputs give NaN TWL, never a guessed value.
    """
    out = feed.copy()
    ta = out["dry_bulb_c"].to_numpy(float)
    pa = out["rh_pct"].to_numpy(float) / 100 * sat_vapour_pressure(ta)
    out["wet_bulb_c"] = wet_bulb_stull(ta, out["rh_pct"])
    out["mean_radiant_temp_c"] = mean_radiant_from_globe(out["globe_temp_c"], ta, out["wind_ms"])
    twl = thermal_work_limit(ta, pa, out["mean_radiant_temp_c"], out["wind_ms"],
                             out["pressure_hpa"].to_numpy(float) / 10, icl=icl, icl_perm=icl_perm)
    too_hot = ta > rules.WITHDRAWAL_DRY_BULB_C
    too_humid = out["wet_bulb_c"].to_numpy(float) > rules.WITHDRAWAL_WET_BULB_C
    out["twl_wm2"] = np.where(too_hot | too_humid, np.minimum(twl, rules.TWL_HIGH_RISK_BELOW - 0.1), twl)
    out["withdrawal_limit"] = too_hot | too_humid
    return out


def to_observations(measured: pd.DataFrame) -> list[Observation]:
    """Rows of measured_twl output -> spike.Observation, with NaN as None (a value the sensor did not give)."""
    def val(x):
        return None if pd.isna(x) else float(x)
    return [Observation(pd.Timestamp(r.time).to_pydatetime(), val(r.twl_wm2), val(r.dry_bulb_c), val(r.wet_bulb_c),
                        bool(r.sensor_ok)) for r in measured.itertuples()]


def flag_faults(measured: pd.DataFrame) -> pd.DataFrame:
    """Add a `fault` column ("" = usable), using the fast loop's own check (spike.reading_fault) in time order.
    A faulty reading is never the reference for the next jump check, exactly as in the fast loop."""
    out = measured.sort_values("time").copy()
    faults, last_good = [], None
    for o in to_observations(out):
        f = reading_fault(o, last_good)
        faults.append(f)
        if not f:
            last_good = o
    out["fault"] = faults
    return out


def apply_measurements(hs: pd.DataFrame, measured: pd.DataFrame, now: datetime, shade: bool = False) -> pd.DataFrame:
    """Heat stress for re-planning at `now`: measured TWL where the sensor has data, a corrected forecast after.

    - Hours up to and including the current one that have plausible readings: TWL = the lowest measured
      TWL in that hour (the worst moment counts, as for the band).
    - Later hours: if the latest measured hour was hotter than its forecast (lower TWL), that difference is
      applied in full to the next hour and fades linearly over rules.SENSOR_BIAS_FADE_HOURS. A cooler
      measurement never raises a forecast.
    The sensor measures where it stands, so only one column changes: the shade TWL for a sensor in the
    shaded work area (`shade=True`), else the sun TWL. Faulty readings (flag_faults: self-reported,
    incomplete or implausible) are ignored here; the fast loop has already handled them. `twl_basis` records where each value came from.
    """
    col = "twl_shade_wm2" if shade else "twl_wm2"
    out = hs.copy()
    out["twl_basis"] = "forecast"
    tz = pd.DatetimeIndex(out["time"]).tz
    times = pd.DatetimeIndex(measured["time"])
    times = times.tz_localize(tz) if times.tz is None and tz is not None else times
    now_ts = pd.Timestamp(now)
    now_ts = now_ts.tz_localize(tz) if now_ts.tz is None and tz is not None else now_ts

    good = flag_faults(measured.assign(time=times))
    good = good[(good["time"] <= now_ts) & (good["fault"] == "")]
    if good.empty:
        return out
    worst = good.groupby(good["time"].dt.floor("h"))["twl_wm2"].min()

    hour_start = pd.DatetimeIndex(out["time"])
    for h, twl in worst.items():
        out.loc[hour_start == h, col] = twl
        out.loc[hour_start == h, "twl_basis"] = "measured"

    last_hour = worst.index.max()
    forecast_last = hs.loc[hour_start == last_hour, col]
    bias = min(0.0, float(worst[last_hour] - forecast_last.iloc[0])) if len(forecast_last) else 0.0
    if bias < 0:
        for k in range(1, rules.SENSOR_BIAS_FADE_HOURS + 1):
            factor = 1 - (k - 1) / rules.SENSOR_BIAS_FADE_HOURS
            rows = hour_start == last_hour + pd.Timedelta(hours=k)
            out.loc[rows, col] = out.loc[rows, col] + bias * factor
            # A magnitude in words, not a signed number: people say "18 worse", and grounding checks what they say
            out.loc[rows, "twl_basis"] = f"forecast, {round(-bias * factor)} W/m² worse (sensor)"
    return rezone(out)


def synthetic_feed(
    weather: pd.DataFrame,
    interval_min: int = 5,
    spike_start: str = "08:15",
    spike_c: float = 3.0,
    ramp_min: int = 15,
    hold_min: int = 30,
    fault_at: str | None = "09:40",
    shade: bool = True,
    seed: int = 1,
) -> pd.DataFrame:
    """SYNTHETIC sensor readings for one site and day, built from real hourly weather (get_replay).

    The feed matches the forecast's own assumptions, so that the spike is the ONLY difference between the
    sensor and the plan: each hour's values are held through that hour (with small noise), and a sensor in
    shade reads globe = air temperature, as the forecast's shade TWL assumes (mean radiant = air). An
    interpolated feed drifted into the next hour's heat and fired alerts at 06:xx, before any spike (14 Nov).
    The spike adds `spike_c` to air and globe
    temperature (ramp up, hold, ramp down), with the same moisture, so RH falls as it would in real air.
    At `fault_at` the sensor reports a sun-struck 70 °C: implausible, for the fast loop's fault check.
    """
    w = weather.sort_values("time")
    if w["site"].nunique() != 1:
        raise ValueError("synthetic_feed needs weather for exactly one site")
    if not shade:
        raise NotImplementedError("sun-exposed sensor not modelled yet: use the forecast globe temperature")
    hourly = pd.DatetimeIndex(w["time"])
    t = pd.date_range(hourly[0], hourly[-1], freq=f"{interval_min}min")
    x, xp = t.asi8, hourly.asi8

    hour = np.searchsorted(xp, x, side="right") - 1  # each reading takes the values of the hour it is in
    ta = w["temperature_2m"].to_numpy(float)[hour]
    pa = (w["relative_humidity_2m"] / 100 * sat_vapour_pressure(w["temperature_2m"])).to_numpy(float)[hour]
    wind = wind_10m_to_body(w["wind_speed_10m"].to_numpy(float) * KMH_TO_MS)[hour]
    p_hpa = w["surface_pressure"].to_numpy(float)[hour]

    minutes = (t - t.normalize()).total_seconds().to_numpy() / 60
    h, m = map(int, spike_start.split(":"))
    s0 = h * 60 + m
    shape = np.clip(np.minimum((minutes - s0) / ramp_min, (s0 + 2 * ramp_min + hold_min - minutes) / ramp_min), 0, 1)
    rng = np.random.default_rng(seed)
    ta = ta + spike_c * shape + rng.normal(0, 0.15, len(t))
    rh = np.clip(100 * pa / sat_vapour_pressure(ta), 1, 100)
    globe = ta + rng.normal(0, 0.15, len(t))

    feed = pd.DataFrame(dict(time=t, dry_bulb_c=ta.round(2), rh_pct=rh.round(1), globe_temp_c=globe.round(2),
                             wind_ms=wind.round(2), pressure_hpa=p_hpa.round(1), sensor_ok=True))
    feed["note"] = np.where(shape > 0, f"synthetic heat spike (+{spike_c:g} °C)", "")
    if fault_at:
        fh, fm = map(int, fault_at.split(":"))
        bad = minutes == fh * 60 + fm
        feed.loc[bad, ["dry_bulb_c", "globe_temp_c"]] = [70.0, 75.0]
        feed.loc[bad, "note"] = "synthetic fault: sun-struck sensor"
    feed.insert(0, "site", w["site"].iloc[0])
    feed["synthetic"] = True
    return feed


def available_work_minutes(work_log: list[tuple], now, limit: int, window_min: int = 60) -> int:
    """How many minutes the crew can work in ONE stretch from `now` without the work done in any 60-minute
    window exceeding `limit` at any point. Earlier work drops out of the window as time passes, so this is
    not simply `limit - worked_in_last_60`: after 30 minutes of work at 08:00-08:30 and a High-zone limit of
    20, the answer is 0 until 09:10 and then 20 (exactly a 20 min work / 40 min rest cycle).
    `work_log` holds (start time, minutes) blocks of work already done."""
    def done_in(lo, hi):  # minutes of logged work inside [lo, hi)
        total = 0.0
        for t, m in work_log:
            end = t + pd.Timedelta(minutes=m)
            total += max(0.0, (min(end, hi) - max(t, lo)).total_seconds() / 60)
        return total

    best = 0
    for x in range(1, limit + 1):  # can the stretch be x minutes long? check every minute of it
        if all(done_in(now - pd.Timedelta(minutes=window_min - s), now) + s <= limit + 1e-9 for s in range(1, x + 1)):
            best = x
        else:
            break
    return best


def replay_fast_loop(measured: pd.DataFrame, plan: dict, acclimatised: bool = True,
                     start: str = "00:00", end: str = "24:00", replans: tuple[dict, ...] = ()) -> pd.DataFrame:
    """Run the fast loop (spike.adjust_for_observation) over sensor readings against a stored plan.

    The crew is modelled simply: from the start of each hour they work until the plan's minutes for that
    hour are used (or fewer if a decision cuts them), then rest.

    The work limit is checked over a ROLLING 60 minutes, not the clock hour (changed 15 Nov): with a reset
    at each hour, a crew could work 08:00-08:30, rest 30 minutes and work again 09:00-09:20, i.e. 50 minutes
    of work in 80 under a "20 min work / 40 min rest" cycle. Now the minutes worked in the last 60 minutes
    count, whichever hour they fell in. Returns one row per reading: the decision, the zone in force, and
    `worked_minutes` (worked in the last 60 minutes). This is what the risk-monitor job does on live readings.

    The monitor follows the plan IN FORCE (15 Nov): `replans` (optimise_schedule results with
    `replanned_from`) take over from their own start hour, keeping the state and the work already done.
    An alert never offers more minutes than that plan still schedules for the hour, and "tighten" /
    "rest now" are not sent while the plan has the crew resting anyway; if one was held back and still
    applies when work resumes, it is sent then. Sensor faults and withdrawals always alert.
    """
    from heat_safe.spike import (CONTINUE, REST_NOW, SENSOR_FAULT, TIGHTEN, WITHDRAW, LoopState,
                                 adjust_for_observation, allowed_minutes)

    def blocks_of(p):
        return {int(b["start"].split(":")[0]): b for b in p["hours"]}

    # (first hour, blocks) for the plan and each re-plan, latest first: the first that has started applies
    plans = sorted([(0, blocks_of(plan))] + [(int(p["replanned_from"].split(":")[0]), blocks_of(p)) for p in replans],
                   key=lambda x: -x[0])
    intensity = plan["work_intensity"]
    window = pd.Timedelta(minutes=60)
    rows, state, hour, worked_hour, work_log = [], None, None, 0, []  # work_log: (start time, minutes)
    held_back = None  # a work alert not sent during planned rest
    for o in to_observations(measured):
        blocks = next(bl for first, bl in plans if o.time.hour >= first)
        if not (start <= o.time.strftime("%H:%M") < end) or o.time.hour not in blocks:
            continue
        b = blocks[o.time.hour]
        if o.time.hour != hour:  # a new hour: the plan's zone and minutes for it; stricter state carries over
            hour, worked_hour = o.time.hour, 0
            state = LoopState(zone=b["twl_zone"]) if state is None else state
        worked = sum(m for t, m in work_log if t >= o.time - window)  # rolling 60 minutes, across hours
        # The zone in force does not depend on minutes worked, so a first call finds it; the decision then
        # uses the minutes the crew can work in one stretch from now under that zone's limit.
        zone = adjust_for_observation(o, b["twl_zone"], worked, intensity, acclimatised, state).zone
        limit = allowed_minutes(zone, intensity, acclimatised)
        stretch = available_work_minutes(work_log, o.time, limit)
        d = adjust_for_observation(o, b["twl_zone"], limit - stretch, intensity, acclimatised, state)
        state = d.state
        plan_left = max(0, b["scheduled_work_minutes"] - worked_hour)  # what the plan in force still schedules
        left = min(d.work_minutes_left, plan_left)
        alert = d.alert
        if d.action in (TIGHTEN, REST_NOW):
            if plan_left == 0:  # the crew is resting by plan: nothing to tell them about work now
                held_back = d.action if (alert or held_back) else None
                alert = False
            elif held_back == d.action:  # work resumes and the held-back alert still applies
                alert, held_back = True, None
        elif d.action != CONTINUE:
            held_back = None
        step = 5  # minutes to the next reading (the synthetic feed's interval)
        worked_now = 0
        if d.action not in (REST_NOW, WITHDRAW) and b["scheduled_work_minutes"] > 0:
            # never more than the limit allows now, nor more than the plan scheduled for this clock hour
            worked_now = min(step, left)
            if worked_now:
                work_log.append((o.time, worked_now))
                worked_hour += worked_now
        measured_zone = "" if d.action == SENSOR_FAULT else rules.twl_zone(o.twl_wm2)
        rows.append(dict(time=o.time, twl_wm2=o.twl_wm2, dry_bulb_c=o.dry_bulb_c, planned_zone=b["twl_zone"],
                         measured_zone=measured_zone, action=d.action, zone=d.zone, worked_minutes=worked,
                         work_minutes_left=left, plan_minutes_left=plan_left, alert=alert, reason=d.reason,
                         worked_now=worked_now))  # minutes the crew worked from this reading to the next
    return pd.DataFrame(rows)


def replan_recommendation(log: pd.DataFrame) -> tuple[bool, str]:
    """Should the supervisor re-plan the rest of the day? The fast loop only RECOMMENDS; a person decides.

    Yes after a withdrawal, or once the MEASURED zone has stayed stricter than the plan's zone for
    rules.REPLAN_RECOMMEND_AFTER_MINUTES of consecutive usable readings: the plan's assumption no longer
    holds. Faulty readings are skipped (they mean "check the sensor", not "re-plan"). `log` is
    replay_fast_loop output.
    """
    from heat_safe.spike import SENSOR_FAULT, WITHDRAW

    withdrawn = log[log["action"] == WITHDRAW]
    if len(withdrawn):
        return True, f"withdrawal limit reached at {withdrawn['time'].iloc[0]:%H:%M}"
    since = None
    for r in log[log["action"] != SENSOR_FAULT].itertuples():
        if ZONES.index(r.measured_zone) > ZONES.index(r.planned_zone):
            since = since or r.time
            if (r.time - since).total_seconds() >= rules.REPLAN_RECOMMEND_AFTER_MINUTES * 60:
                return True, (f"measured conditions worse than the plan assumed ({r.measured_zone} zone, plan "
                              f"{r.planned_zone}) from {since:%H:%M} to {r.time:%H:%M}")
        else:
            since = None
    return False, ""


# --- The site sensor as the agent sees it ---------------------------------------------------------------

# Only the replay day has a (synthetic) sensor. Anywhere else the tool says so instead of inventing readings.
DEMO_SENSORS = {("mussafah", "2025-08-01"): {"location": "shade"}}


def parse_clock(hhmm: str) -> tuple[int, int]:
    """ "09:20" -> (9, 20). Raises ValueError for anything else."""
    h, m = (int(x) for x in hhmm.split(":"))
    if not (0 <= h < 24 and 0 <= m < 60):
        raise ValueError(f"time must be HH:MM, got {hhmm!r}")
    return h, m


def sensor_measurements(site: str, day: str, weather: pd.DataFrame) -> pd.DataFrame | None:
    """Measured readings (with `fault`) for a site and day that has a sensor, else None."""
    if (site, day) not in DEMO_SENSORS:
        return None
    return flag_faults(measured_twl(synthetic_feed(weather)))


def get_site_sensor(site: str, day: str, until: str, weather: pd.DataFrame, hs: pd.DataFrame,
                    plan: dict | None = None) -> dict:
    """What the site sensor measured up to `until`, compared with the forecast; with a `plan`, also what the
    fast loop (the risk monitor) already did and whether it recommends a re-plan. Numbers rounded as the
    agent should quote them."""
    measured = sensor_measurements(site, day, weather)
    if measured is None:
        return {"status": "no_sensor", "site": site, "date": day,
                "note": "No site sensor on this site and day. Plans use the forecast only."}
    location = DEMO_SENSORS[(site, day)]["location"]
    h, m = parse_clock(until)
    times = pd.DatetimeIndex(measured["time"])
    upto = measured[(times.hour * 60 + times.minute) <= h * 60 + m]
    good = upto[upto["fault"] == ""]

    col = "twl_shade_wm2" if location == "shade" else "twl_wm2"
    forecast = hs.set_index(pd.DatetimeIndex(hs["time"]).hour)[col]
    hourly = []
    for hour, g in good.groupby(pd.DatetimeIndex(good["time"]).hour):
        worst, fc = float(g["twl_wm2"].min()), float(forecast[hour])
        hourly.append(dict(hour=f"{hour:02d}:00", readings=len(g), worst_twl_wm2=rules.display_twl(worst),
                           measured_zone=rules.twl_zone(worst), forecast_twl_wm2=rules.display_twl(fc),
                           forecast_zone=rules.twl_zone(fc),
                           # Positive = measured hotter (lower TWL) than forecast; 0 if not worse
                           worse_than_forecast_wm2=max(0, rules.display_twl(fc) - rules.display_twl(worst)),
                           max_dry_bulb_c=round(float(g["dry_bulb_c"].max()), 1),
                           withdrawal_limit=bool(g["withdrawal_limit"].any())))
    faults = [dict(time=f"{r.time:%H:%M}", dry_bulb_c=round(float(r.dry_bulb_c), 1), reason=r.fault)
              for r in upto[upto["fault"] != ""].itertuples()]
    out = {
        "status": "ok", "site": site, "date": day, "until": until, "synthetic": True, "location": location,
        "note": ("SYNTHETIC demo sensor: built from the real ERA5 replay day with an added heat spike and one "
                 f"faulty reading. Sensor in the {location} work area, reading every 5 minutes."),
        "readings": len(upto), "hourly": hourly, "faults": faults,
        "fault_note": ("Faulty readings are excluded from every number above and from re-planning. "
                       "Have the sensor checked.") if faults else "",
    }
    if plan is not None:
        nxt = h * 60 + m + 1  # replay_fast_loop's end is exclusive; one minute later includes `until`
        log = replay_fast_loop(upto, plan, end=f"{nxt // 60:02d}:{nxt % 60:02d}")
        alerts = log[log["alert"]]
        crew_name = f"{plan['role'].replace('_', ' ').capitalize()} crew"
        recommended, why = replan_recommendation(log)
        out |= {
            "crew": dict(role=plan["role"], shade=plan["shade"], assumption=(
                "acclimatised crew working the original plan until a monitor decision cut it")),
            "fast_loop_alerts": [_alert_summary(r, crew_name) for r in alerts.itertuples()],
            "fast_loop_note": "Sent automatically by the risk monitor to the crew and supervisor, not by the assistant.",
            "replan_recommended": recommended, "replan_reason": why,
        }
    return out


def _alert_summary(r, crew_name: str) -> dict:
    """One fast-loop alert as the agent sees it, with the exact texts the crew and supervisor received
    (English; the worker also got it in their own language, see alerts.alerts_for)."""
    from heat_safe.alerts import render

    kw = dict(minutes=int(r.work_minutes_left), time=f"{r.time:%H:%M}", crew=crew_name, zone=r.zone)
    return dict(time=kw["time"], action=r.action, zone=r.zone, work_minutes_left=kw["minutes"], reason=r.reason,
                worker_message=render(r.action, "en", **kw).text,
                supervisor_message=render(r.action, recipient="supervisor", **kw).text)


def replan_from_hour(now: str) -> int:
    """The first whole hour still open at `now`: "09:00" -> 9, "09:20" -> 10. The part-gone hour belongs to
    the fast loop, not to a new plan."""
    h, m = parse_clock(now)
    return h + (1 if m else 0)


def heat_stress_with_sensor(hs: pd.DataFrame, site: str, day: str, weather: pd.DataFrame,
                            now: str) -> tuple[pd.DataFrame, dict]:
    """Heat stress for a re-plan at `now`: sensor-corrected if this site and day has a sensor, else unchanged.
    Returns it with a short description for the tool output."""
    measured = sensor_measurements(site, day, weather)
    if measured is None:
        return hs, {"used": False, "note": "No site sensor on this site and day: re-planned on the forecast only."}
    location = DEMO_SENSORS[(site, day)]["location"]
    h, m = parse_clock(now)
    tz = pd.DatetimeIndex(hs["time"]).tz
    at = pd.Timestamp(f"{day} {h:02d}:{m:02d}").tz_localize(tz)
    info = {"used": True, "synthetic": True, "location": location,
            "note": f"Hours before {now} use measured TWL; the next hours a sensor-corrected forecast (twl_basis)."}
    return apply_measurements(hs, measured, at.to_pydatetime(), shade=location == "shade"), info

