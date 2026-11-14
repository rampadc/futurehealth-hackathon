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
from heat_safe.spike import Observation
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


def apply_measurements(hs: pd.DataFrame, measured: pd.DataFrame, now: datetime, shade: bool = False) -> pd.DataFrame:
    """Heat stress for re-planning at `now`: measured TWL where the sensor has data, a corrected forecast after.

    - Hours up to and including the current one that have plausible readings: TWL = the lowest measured
      TWL in that hour (the worst moment counts, as for the band).
    - Later hours: if the latest measured hour was hotter than its forecast (lower TWL), that difference is
      applied in full to the next hour and fades linearly over rules.SENSOR_BIAS_FADE_HOURS. A cooler
      measurement never raises a forecast.
    The sensor measures where it stands, so only one column changes: the shade TWL for a sensor in the
    shaded work area (`shade=True`), else the sun TWL. Faulty readings (sensor_ok False, missing TWL) are
    ignored here; the fast loop has already handled them. `twl_basis` records where each value came from.
    """
    col = "twl_shade_wm2" if shade else "twl_wm2"
    out = hs.copy()
    out["twl_basis"] = "forecast"
    tz = pd.DatetimeIndex(out["time"]).tz
    times = pd.DatetimeIndex(measured["time"])
    times = times.tz_localize(tz) if times.tz is None and tz is not None else times
    now_ts = pd.Timestamp(now)
    now_ts = now_ts.tz_localize(tz) if now_ts.tz is None and tz is not None else now_ts

    good = measured.assign(time=times)
    good = good[(good["time"] <= now_ts) & good["sensor_ok"] & good["twl_wm2"].notna()]
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
            out.loc[rows, "twl_basis"] = f"forecast {bias * factor:+.0f} W/m² (sensor)"
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

    Between the hourly values: linear interpolation of air temperature and vapour pressure. A sensor in
    shade reads a globe 0.5 °C above air (no direct sun). The spike adds `spike_c` to air and globe
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

    ta = np.interp(x, xp, w["temperature_2m"].to_numpy(float))
    pa = np.interp(x, xp, (w["relative_humidity_2m"] / 100 * sat_vapour_pressure(w["temperature_2m"])).to_numpy(float))
    wind = np.interp(x, xp, wind_10m_to_body(w["wind_speed_10m"].to_numpy(float) * KMH_TO_MS))
    p_hpa = np.interp(x, xp, w["surface_pressure"].to_numpy(float))

    minutes = (t - t.normalize()).total_seconds().to_numpy() / 60
    h, m = map(int, spike_start.split(":"))
    s0 = h * 60 + m
    shape = np.clip(np.minimum((minutes - s0) / ramp_min, (s0 + 2 * ramp_min + hold_min - minutes) / ramp_min), 0, 1)
    rng = np.random.default_rng(seed)
    ta = ta + spike_c * shape + rng.normal(0, 0.15, len(t))
    rh = np.clip(100 * pa / sat_vapour_pressure(ta), 1, 100)
    globe = ta + 0.5 + rng.normal(0, 0.15, len(t))

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


def replay_fast_loop(measured: pd.DataFrame, plan: dict, acclimatised: bool = True,
                     start: str = "00:00", end: str = "24:00") -> pd.DataFrame:
    """Run the fast loop (spike.adjust_for_observation) over sensor readings against a stored plan.

    The crew is modelled simply: from the start of each hour they work until the hour's minutes are used
    (the plan's, or fewer if a decision cuts them), then rest. Worked minutes reset each hour, as the
    TWL work/rest limits are per hour. Returns one row per reading: the decision, the zone in force, and
    the minutes worked so far that hour. This is what the risk-monitor job will do on live readings.
    """
    from heat_safe.spike import REST_NOW, WITHDRAW, LoopState, adjust_for_observation

    blocks = {int(b["start"][:2]): b for b in plan["hours"]}
    intensity = plan["work_intensity"]
    rows, state, hour, worked = [], None, None, 0
    for o in to_observations(measured):
        if not (start <= o.time.strftime("%H:%M") < end) or o.time.hour not in blocks:
            continue
        b = blocks[o.time.hour]
        if o.time.hour != hour:  # a new hour: the plan's zone for it, minutes reset; stricter state carries over
            hour, worked = o.time.hour, 0
            state = LoopState(zone=b["twl_zone"]) if state is None else state
        d = adjust_for_observation(o, b["twl_zone"], worked, intensity, acclimatised, state)
        state = d.state
        rows.append(dict(time=o.time, twl_wm2=o.twl_wm2, dry_bulb_c=o.dry_bulb_c, planned_zone=b["twl_zone"],
                         action=d.action, zone=d.zone, worked_minutes=worked, work_minutes_left=d.work_minutes_left,
                         alert=d.alert, reason=d.reason))
        step = 5  # minutes to the next reading (the synthetic feed's interval)
        if d.action not in (REST_NOW, WITHDRAW) and b["scheduled_work_minutes"] > 0:
            worked += min(step, d.work_minutes_left, max(0, b["scheduled_work_minutes"] - worked))
    return pd.DataFrame(rows)
