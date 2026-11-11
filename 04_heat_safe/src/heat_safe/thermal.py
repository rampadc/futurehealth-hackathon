"""Outdoor thermal environment from hourly weather: solar geometry, globe, natural wet bulb, WBGT, MRT.

Globe and natural-wet-bulb temperatures use the Liljegren et al. (2008) model as implemented and
validated in ECMWF thermofeel (pinned to 2.3.0 because we call its internal liljegren module).
Reference: https://doi.org/10.1080/15459620802310770
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from numpy.typing import ArrayLike
from thermofeel import liljegren as lj

KMH_TO_MS = 1 / 3.6


def cos_solar_zenith(times_utc: pd.DatetimeIndex | pd.Series, lat: ArrayLike, lon: ArrayLike) -> np.ndarray:
    """Cosine of the solar zenith angle (NOAA general solar position equations, ~0.5° accuracy)."""
    t = pd.DatetimeIndex(times_utc)
    lat_r = np.radians(np.asarray(lat, dtype=float))
    hours = t.hour + t.minute / 60 + t.second / 3600
    g = 2 * np.pi / 365 * (t.day_of_year - 1 + (hours - 12) / 24)
    eqtime = 229.18 * (0.000075 + 0.001868 * np.cos(g) - 0.032077 * np.sin(g)
                       - 0.014615 * np.cos(2 * g) - 0.040849 * np.sin(2 * g))
    decl = (0.006918 - 0.399912 * np.cos(g) + 0.070257 * np.sin(g) - 0.006758 * np.cos(2 * g)
            + 0.000907 * np.sin(2 * g) - 0.002697 * np.cos(3 * g) + 0.00148 * np.sin(3 * g))
    true_solar_min = hours * 60 + eqtime + 4 * np.asarray(lon, dtype=float)
    ha = np.radians(true_solar_min / 4 - 180)
    return np.asarray(np.sin(lat_r) * np.sin(decl) + np.cos(lat_r) * np.cos(decl) * np.cos(ha))


def thermal_environment(df: pd.DataFrame) -> pd.DataFrame:
    """Add globe, natural wet bulb, psychrometric wet bulb, WBGT and mean radiant temperature (°C),
    plus 2 m wind (m/s), to an Open-Meteo hourly frame (columns as in heat_safe.forecast.HOURLY_VARS).

    Open-Meteo radiation is the mean over the preceding hour, so the sun position is taken at the
    middle of that hour.
    """
    out = df.copy()
    times_utc = pd.DatetimeIndex(out["time"]).tz_convert("UTC") - pd.Timedelta(minutes=30)
    cza = np.clip(cos_solar_zenith(times_utc, out["latitude"], out["longitude"]), 0, 1)

    ta_k = out["temperature_2m"].to_numpy(float) + 273.15
    rh = out["relative_humidity_2m"].to_numpy(float)
    p_hpa = out["surface_pressure"].to_numpy(float)
    ssrd = out["shortwave_radiation"].to_numpy(float)
    with np.errstate(divide="ignore", invalid="ignore"):
        fdir = np.where(ssrd > 0, out["direct_radiation"].to_numpy(float) / ssrd, 0.0)
    # KNMI guards, as in thermofeel.calculate_wbgt_liljegren
    fdir = np.where(cza < lj.CZA_MIN, 0.0, np.clip(fdir, 0, 0.9))
    wind_10m = np.maximum(out["wind_speed_10m"].to_numpy(float) * KMH_TO_MS, lj.MIN_WIND_10M)
    wind_2m = lj.wind_speed_2m(wind_10m, cza, ssrd)

    tg = lj.solve_globe(ta_k, rh / 100, p_hpa, wind_2m, ssrd, fdir, cza)
    tnwb = lj.solve_wetbulb(ta_k, rh / 100, p_hpa, wind_2m, ssrd, fdir, cza, 1.0)
    twb = lj.solve_wetbulb(ta_k, rh / 100, p_hpa, wind_2m, ssrd, fdir, cza, 0.0)
    ta = ta_k - 273.15

    # Mean radiant temperature: invert the same globe energy balance (Liljegren globe, 50.8 mm).
    tg_k = tg + 273.15
    h = lj.h_sphere_in_air(0.5 * (tg_k + ta_k), p_hpa, wind_2m)
    mrt = (tg_k**4 + h / (lj.STEFANB * lj.EMIS_GLOBE) * (tg_k - ta_k)) ** 0.25 - 273.15

    out["cos_zenith"] = cza
    out["wind_2m_ms"] = wind_2m
    out["globe_temp_c"] = tg
    out["natural_wet_bulb_c"] = tnwb
    out["wet_bulb_c"] = twb
    out["mean_radiant_temp_c"] = mrt
    out["wbgt_c"] = 0.1 * ta + 0.2 * tg + 0.7 * tnwb
    return out

