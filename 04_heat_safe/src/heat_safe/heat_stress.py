"""compute_heat_stress: site-level heat stress per hour → TWL zone, warning band and controls. Pure code.

Regulatory index is TWL (ADOSH-SF CoP 11.0); WBGT is computed alongside for display and comparison.
Fail-safe: an hour with missing weather inputs is never reported as safe. It gets band RED and a
`data_issue`, because there is no environmental band to raise by one level.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from heat_safe import rules
from heat_safe.rules import Band
from heat_safe.thermal import KMH_TO_MS, thermal_environment
from heat_safe.twl import DEFAULT_ICL, DEFAULT_ICL_PERM, sat_vapour_pressure, thermal_work_limit, wind_10m_to_body

REQUIRED = ["temperature_2m", "relative_humidity_2m", "surface_pressure", "wind_speed_10m",
            "shortwave_radiation", "direct_radiation"]


def compute_heat_stress(
    weather: pd.DataFrame,
    icl: float = DEFAULT_ICL,
    icl_perm: float = DEFAULT_ICL_PERM,
) -> pd.DataFrame:
    """One row per site-hour with WBGT, TWL, zone, band, midday-break minutes and zone controls.

    Args:
        `weather` is the output of heat_safe.forecast.get_forecast / get_replay. Clothing defaults to
        standard long-sleeved work wear; per-worker PPE adjustments belong in compute_worker_risk.
    """
    missing = [c for c in REQUIRED if c not in weather.columns]
    if missing:
        raise ValueError(f"weather is missing columns {missing}")

    env = thermal_environment(weather)
    ta = env["temperature_2m"].to_numpy(float)
    pa = env["relative_humidity_2m"].to_numpy(float) / 100 * sat_vapour_pressure(ta)
    wind_body = wind_10m_to_body(env["wind_speed_10m"].to_numpy(float) * KMH_TO_MS)
    p_kpa = env["surface_pressure"].to_numpy(float) / 10
    twl = thermal_work_limit(ta, pa, env["mean_radiant_temp_c"], wind_body, p_kpa, icl=icl, icl_perm=icl_perm)
    # Shaded work: approximate mean radiant temperature by air temperature (no direct sun)
    twl_shade = thermal_work_limit(ta, pa, ta, wind_body, p_kpa, icl=icl, icl_perm=icl_perm)

    # Withdrawal limits cap TWL into the High Risk zone (Brake & Bates practice)
    wet_bulb = env["wet_bulb_c"].fillna(env.get("wet_bulb_temperature_2m"))
    too_hot = ta > rules.WITHDRAWAL_DRY_BULB_C
    too_humid = wet_bulb.to_numpy(float) > rules.WITHDRAWAL_WET_BULB_C
    withdraw = too_hot | too_humid
    capped = np.where(withdraw, np.minimum(twl, rules.TWL_HIGH_RISK_BELOW - 0.1), twl)
    capped_shade = np.where(withdraw, np.minimum(twl_shade, rules.TWL_HIGH_RISK_BELOW - 0.1), twl_shade)
    withdrawal = np.select(
        [too_hot & too_humid, too_hot, too_humid],
        [f"dry bulb > {rules.WITHDRAWAL_DRY_BULB_C:g} °C and wet bulb > {rules.WITHDRAWAL_WET_BULB_C:g} °C",
         f"dry bulb > {rules.WITHDRAWAL_DRY_BULB_C:g} °C",
         f"wet bulb > {rules.WITHDRAWAL_WET_BULB_C:g} °C"],
        default="",
    )

    out = env[["site", "latitude", "longitude", "time"]].copy()
    out["temperature_c"] = ta
    out["relative_humidity_pct"] = env["relative_humidity_2m"]
    out["wet_bulb_c"] = wet_bulb
    out["globe_temp_c"] = env["globe_temp_c"]
    out["mean_radiant_temp_c"] = env["mean_radiant_temp_c"]
    out["wbgt_c"] = env["wbgt_c"]
    out["twl_wm2"] = capped
    out["twl_shade_wm2"] = capped_shade
    out["withdrawal_limit"] = withdrawal

    data_issue = env[REQUIRED].isna().any(axis=1) | np.isnan(capped)
    zones = [rules.twl_zone(t) if not bad else rules.ZONE_HIGH for t, bad in zip(capped, data_issue)]
    out["twl_zone"] = zones
    out["twl_zone_shade"] = [rules.twl_zone(t) if not bad else rules.ZONE_HIGH
                             for t, bad in zip(capped_shade, data_issue)]
    out["band"] = [rules.ZONE_BAND[z].name.lower() for z in zones]
    out["data_issue"] = np.where(data_issue, "missing weather input: band set to red (fail-safe)", "")

    local = pd.DatetimeIndex(out["time"]).tz_localize(None)
    out["midday_break_minutes"] = [rules.midday_break_minutes(t) for t in local]
    out["heat_programme_required"] = ta >= rules.HEAT_PROGRAMME_TRIGGER_C

    controls = out["twl_zone"].map(rules.ZONE_CONTROLS)
    out["work_rest_light"] = controls.map(lambda c: c.work_rest_light)
    out["work_rest_heavy"] = controls.map(lambda c: c.work_rest_heavy)
    out["fluid_l_per_hr"] = controls.map(lambda c: c.fluid_l_per_hr)
    out["unacclimatised_may_work"] = controls.map(lambda c: c.unacclimatised_may_work)
    out["lone_work_allowed"] = controls.map(lambda c: c.lone_work_allowed)
    # Outdoor minutes available in the hour for each work intensity, after midday break and work/rest
    open_minutes = 60 - out["midday_break_minutes"]
    out["work_minutes_light"] = (open_minutes * controls.map(lambda c: c.work_minutes_per_hour_light) / 60).round().astype(int)
    out["work_minutes_heavy"] = (open_minutes * controls.map(lambda c: c.work_minutes_per_hour_heavy) / 60).round().astype(int)

    out["source"] = env.get("source", "")
    out["rules_version"] = rules.RULES_VERSION
    return out


def daily_summary(hs: pd.DataFrame) -> pd.DataFrame:
    """Per site and local date: peak values, hours per zone, worst band, midday-break applicability."""
    df = hs.assign(date=pd.DatetimeIndex(hs["time"]).date, band_rank=hs["band"].map(lambda b: Band[b.upper()]))
    g = df.groupby(["site", "date"])
    summary = g.agg(
        max_temperature_c=("temperature_c", "max"),
        max_wbgt_c=("wbgt_c", "max"),
        min_twl_wm2=("twl_wm2", "min"),
        worst_band_rank=("band_rank", "max"),
        hours_high=("twl_zone", lambda z: int((z == rules.ZONE_HIGH).sum())),
        hours_medium=("twl_zone", lambda z: int((z == rules.ZONE_MEDIUM).sum())),
        hours_low=("twl_zone", lambda z: int((z == rules.ZONE_LOW).sum())),
        midday_break_applies=("midday_break_minutes", lambda m: bool((m > 0).any())),
        heat_programme_required=("heat_programme_required", "any"),
        data_issues=("data_issue", lambda d: int((d != "").sum())),
    ).reset_index()
    summary["worst_band"] = summary.pop("worst_band_rank").map(lambda r: Band(r).name.lower())
    return summary
