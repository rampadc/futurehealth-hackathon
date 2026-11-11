"""Hourly weather for Abu Dhabi sites: live forecast (Open-Meteo) or replay of a past date (ERA5 archive).

Docs: https://open-meteo.com/en/docs and https://open-meteo.com/en/docs/historical-weather-api
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from heat_safe.sites import SITES, TIMEZONE

FREE_URL = "https://api.open-meteo.com/v1/forecast"
CUSTOMER_URL = "https://customer-api.open-meteo.com/v1/forecast"  # paid / commercial, needs apikey
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

# Cached ERA5 downloads (tools/download_data.py). Replay reads these first so the demo works offline.
CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "raw" / "weather"

# Inputs for WBGT (Liljegren) and TWL (Brake & Bates), plus context.
HOURLY_VARS = [
    "temperature_2m",            # °C
    "relative_humidity_2m",      # %
    "dew_point_2m",              # °C
    "wet_bulb_temperature_2m",   # °C, psychrometric
    "apparent_temperature",      # °C, "feels like"
    "surface_pressure",          # hPa
    "wind_speed_10m",            # km/h
    "wind_gusts_10m",            # km/h
    "shortwave_radiation",       # W/m², global horizontal, mean of the preceding hour
    "direct_radiation",          # W/m², direct on horizontal plane
    "diffuse_radiation",         # W/m²
    "cloud_cover",               # %
    "precipitation",             # mm
]
FORECAST_ONLY_VARS = ["uv_index"]  # not in the ERA5 archive


def _session(retries: int = 3) -> requests.Session:
    """Session that retries transient failures (timeouts, 429, 5xx) with backoff."""
    s = requests.Session()
    retry = Retry(
        total=retries,
        backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s


def _fetch(
    url: str,
    params: dict,
    sites: dict[str, tuple[float, float]],
    timezone: str,
    timeout: float,
    session: requests.Session | None,
) -> pd.DataFrame:
    """One Open-Meteo call for all sites → long DataFrame (site, latitude, longitude, time, vars...)."""
    if not sites:
        raise ValueError("sites is empty")
    names = list(sites)
    params = {
        **params,
        "latitude": ",".join(f"{sites[n][0]:.4f}" for n in names),
        "longitude": ",".join(f"{sites[n][1]:.4f}" for n in names),
        "timezone": timezone,
        "wind_speed_unit": "kmh",
    }
    sess = session or _session()
    resp = sess.get(url, params=params, timeout=timeout)

    # Open-Meteo returns {"error": true, "reason": "..."} with HTTP 400 for bad params.
    if resp.status_code != 200:
        try:
            reason = resp.json().get("reason", resp.text)
        except ValueError:
            reason = resp.text
        raise RuntimeError(f"Open-Meteo request failed ({resp.status_code}): {reason}")

    data = resp.json()
    locations = data if isinstance(data, list) else [data]  # one site -> dict, many -> list
    if len(locations) != len(names):
        raise RuntimeError(f"Expected {len(names)} locations, got {len(locations)}")

    frames = []
    for name, loc in zip(names, locations):
        df = pd.DataFrame(loc["hourly"])
        df["time"] = pd.to_datetime(df["time"]).dt.tz_localize(timezone)
        df.insert(0, "site", name)
        df.insert(1, "latitude", sites[name][0])
        df.insert(2, "longitude", sites[name][1])
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def get_forecast(
    sites: dict[str, tuple[float, float]] = SITES,
    hourly_vars: list[str] = HOURLY_VARS + FORECAST_ONLY_VARS,
    forecast_days: int = 3,
    timezone: str = TIMEZONE,
    api_key: str | None = None,
    timeout: float = 15,
    session: requests.Session | None = None,
) -> pd.DataFrame:
    """Live hourly forecast for every site as one long DataFrame.

    Columns: site, latitude, longitude, time (local, tz-aware), then one column per variable.
    """
    if not 1 <= forecast_days <= 16:
        raise ValueError("forecast_days must be between 1 and 16")
    params = {"hourly": ",".join(hourly_vars), "forecast_days": forecast_days}
    url = FREE_URL
    if api_key:
        url = CUSTOMER_URL
        params["apikey"] = api_key
    df = _fetch(url, params, sites, timezone, timeout, session)
    df["source"] = "open-meteo-forecast"
    return df


def get_replay(
    day: date | str,
    sites: dict[str, tuple[float, float]] = SITES,
    hourly_vars: list[str] = HOURLY_VARS,
    timezone: str = TIMEZONE,
    use_cache: bool = True,
    timeout: float = 60,
    session: requests.Session | None = None,
) -> pd.DataFrame:
    """Hourly ERA5 reanalysis for a past day, same shape as get_forecast.

    Reads the cached downloads in data/raw/weather first; falls back to the Open-Meteo archive API.
    ERA5 lags real time by about 5 days, so recent dates may not be available yet.
    """
    day = pd.Timestamp(day).date()
    if day >= date.today():
        raise ValueError(f"replay day must be in the past, got {day}")

    if use_cache and CACHE_DIR.exists():
        cached = _from_cache(day, sites, hourly_vars, timezone)
        if cached is not None:
            return cached

    params = {"hourly": ",".join(hourly_vars), "start_date": str(day), "end_date": str(day)}
    df = _fetch(ARCHIVE_URL, params, sites, timezone, timeout, session)
    df["source"] = "open-meteo-era5"
    return df


def _from_cache(day: date, sites, hourly_vars, timezone) -> pd.DataFrame | None:
    for f in sorted(CACHE_DIR.glob("era5_*.csv")):
        df = pd.read_csv(f)
        df = df[pd.to_datetime(df["time"]).dt.date == day]
        if df.empty or not set(sites) <= set(df["site"]) or not set(hourly_vars) <= set(df.columns):
            continue
        df = df[df["site"].isin(sites)][["site", "latitude", "longitude", "time", *hourly_vars]]
        df["time"] = pd.to_datetime(df["time"]).dt.tz_localize(timezone)
        df["source"] = f"cache:{f.name}"
        return df.reset_index(drop=True)
    return None


if __name__ == "__main__":
    fc = get_forecast(forecast_days=2)
    print(fc.head(10).to_string(index=False))
    print(f"\n{len(fc)} rows for {fc['site'].nunique()} sites")

    rp = get_replay("2025-08-01")
    peak = rp.loc[rp.groupby("site")["temperature_2m"].idxmax(), ["site", "time", "temperature_2m", "source"]]
    print("\nReplay 2025-08-01, peak temperature per site:")
    print(peak.to_string(index=False))
