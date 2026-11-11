"""Download the real, public datasets listed in doc/heat-safe-crew-agent-plan.md into data/.

Usage:  uv run python tools/download_data.py [--force]

Idempotent: files that already exist are skipped unless --force is given.
Writes data/manifest.json with source URL, retrieval time and status for every file.
Mocked/synthetic data (crews, sensors, wearables, check-ins) is NOT produced here.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import requests


from heat_safe.forecast import _session, get_forecast
from heat_safe.sites import SITES

ROOT = Path(__file__).resolve().parent.parent / "data"
RAW = ROOT / "raw"
TZ = "Asia/Dubai"

REPLAY_DAY = "2025-08-01"       # heat replay, Mussafah (plan, week 1)
DUST_REPLAY_DAY = "2024-08-04"  # dust replay
SUMMERS = [2023, 2024, 2025]    # backtest window; CAMS air-quality history starts Aug 2022
SUMMER_START, SUMMER_END = "06-01", "09-30"

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# Inputs for Liljegren WBGT plus context. ERA5 archive has no uv_index.
ARCHIVE_VARS = [
    "temperature_2m", "relative_humidity_2m", "dew_point_2m", "wet_bulb_temperature_2m",
    "apparent_temperature", "surface_pressure", "wind_speed_10m", "wind_gusts_10m",
    "shortwave_radiation", "direct_radiation", "diffuse_radiation", "direct_normal_irradiance",
    "cloud_cover", "precipitation",
]
FORECAST_VARS = ARCHIVE_VARS + ["uv_index"]
AIR_VARS = ["pm10", "pm2_5", "dust", "aerosol_optical_depth", "uv_index", "us_aqi"]

# NOAA GSOD stations (USAF+WBAN): Abu Dhabi Intl, Al Bateen, Al Ain Intl
GSOD_STATIONS = {"abu_dhabi_intl": "41217099999", "al_bateen": "41216099999", "al_ain_intl": "41218099999"}
GSOD_YEARS = range(2020, 2026)

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/{res}/point"
NASA_POWER_VARS = "T2M,RH2M,T2MWET,WS2M,ALLSKY_SFC_SW_DWN,PS"

ONET_BASE = "https://www.onetcenter.org/dl_files/database/db_30_1_text/"
ONET_FILES = ["Work Context.txt", "Work Context Categories.txt", "Occupation Data.txt"]
# Plan personas: roofer, steel fixer, labourer, driver
ONET_ROLES = {
    "47-2181.00": "roofer",
    "47-2171.00": "steel_fixer",
    "47-2061.00": "labourer",
    "53-3032.00": "driver",
}

GUIDANCE_DOCS = {
    "ilo_working_on_a_warmer_planet_2019.pdf":
        "https://www.ilo.org/wcmsp5/groups/public/---dgreports/---dcomm/---publ/documents/publication/wcms_711919.pdf",
    "niosh_2016-106_heat_stress_criteria.pdf":
        "https://www.cdc.gov/niosh/docs/2016-106/pdfs/2016-106.pdf",
    "who_wmo_heatwaves_and_health_warning_systems_2015.pdf":
        "https://www.uncclearn.org/wp-content/uploads/library/who16102015.pdf",
    # Sharjah regulator's CoP, a stand-in until the Abu Dhabi OSHAD heat CoP is sourced.
    "sharjah_oshj_cop33_safety_in_heat_2024.pdf":
        "https://mc.spsa.shj.ae/Media/documents/j3comnEiUeCQ3emVuS2OQ_Safety%20in%20Heat%20OSHJ-COP-33.pdf",
    "who_factsheet_climate_change_heat_and_health.html":
        "https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health",
}

# UAE / Abu Dhabi regulation and policy. Sites that block scripted downloads are collected by hand
# (see doc/manual-data-collection.md) and dropped into data/raw/regulatory/manual/.
ADPHC = "https://www.adphc.gov.ae/-/media/Project/ADPHC/ADPHC/PDF/OSHAD-SF/"
REGULATORY_DOCS = {
    "adosh_sf_cop_11_safety_in_the_heat_v4_2024_en.pdf":
        ADPHC + "Codes-of-Practise/11---Safety-in-the-Heat-v31-English.pdf",
    "adosh_sf_tg_safety_in_the_heat_v4_2024_en.pdf":
        ADPHC + "Technical-Guidelines/Safety-in-the-Heat--Eng.pdf",
    "adosh_sf_cop_53_1_osh_construction_en.pdf":
        ADPHC + "Codes-of-Practise/53__1---OSH-Construction--Eng.pdf",
    "adphc_codes_of_practice_index.html":
        "https://www.adphc.gov.ae/en/Legislation/Code-of-Practices",
}

manifest: list[dict] = []


def record(path: Path, source: str, status: str, note: str = "") -> None:
    manifest.append({
        "path": str(path.relative_to(ROOT)), "source": source, "status": status, "note": note,
        "retrieved_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    })
    print(f"[{status:7}] {path.relative_to(ROOT)}" + (f"  ({note})" if note else ""))


def skip(path: Path, source: str, force: bool) -> bool:
    if path.exists() and not force:
        record(path, source, "cached")
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    return False


def open_meteo(url: str, hourly: list[str], start: str, end: str, sess: requests.Session) -> pd.DataFrame:
    """All SITES for a date range in one call, as a long DataFrame."""
    names = list(SITES)
    params = {
        "latitude": ",".join(f"{SITES[n][0]:.4f}" for n in names),
        "longitude": ",".join(f"{SITES[n][1]:.4f}" for n in names),
        "hourly": ",".join(hourly),
        "start_date": start, "end_date": end,
        "timezone": TZ, "wind_speed_unit": "kmh",
    }
    resp = sess.get(url, params=params, timeout=120)
    if resp.status_code != 200:
        raise RuntimeError(f"{resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    locations = data if isinstance(data, list) else [data]
    frames = []
    for name, loc in zip(names, locations):
        df = pd.DataFrame(loc["hourly"])
        df.insert(0, "site", name)
        df.insert(1, "latitude", SITES[name][0])
        df.insert(2, "longitude", SITES[name][1])
        df.insert(3, "grid_elevation_m", loc.get("elevation"))
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def save_open_meteo(path: Path, url: str, hourly: list[str], start: str, end: str, sess, force: bool) -> None:
    if skip(path, url, force):
        return
    try:
        df = open_meteo(url, hourly, start, end, sess)
        df.to_csv(path, index=False)
        record(path, f"{url} {start}..{end}", "ok", f"{len(df)} rows")
    except Exception as e:  # keep going; failure is in the manifest
        record(path, url, "failed", str(e))


def download(path: Path, url: str, sess, force: bool, min_bytes: int = 1000) -> None:
    if skip(path, url, force):
        return
    try:
        resp = sess.get(url, timeout=180)
        resp.raise_for_status()
        if len(resp.content) < min_bytes:
            raise RuntimeError(f"suspiciously small response ({len(resp.content)} bytes)")
        path.write_bytes(resp.content)
        record(path, url, "ok", f"{len(resp.content) / 1e6:.1f} MB")
    except Exception as e:
        record(path, url, "failed", str(e))


def weather(sess, force: bool) -> None:
    out = RAW / "weather"
    # Live forecast snapshot (proves the real data path; 16 days max)
    path = out / f"forecast_snapshot_{date.today()}.csv"
    if not skip(path, "https://api.open-meteo.com/v1/forecast", force):
        try:
            df = get_forecast(hourly_vars=FORECAST_VARS, forecast_days=16, session=sess)
            df.to_csv(path, index=False)
            record(path, "https://api.open-meteo.com/v1/forecast", "ok", f"{len(df)} rows")
        except Exception as e:
            record(path, "https://api.open-meteo.com/v1/forecast", "failed", str(e))

    # Replay days (ERA5 via Open-Meteo archive)
    for day in (REPLAY_DAY, DUST_REPLAY_DAY):
        save_open_meteo(out / f"era5_replay_{day}.csv", ARCHIVE_URL, ARCHIVE_VARS, day, day, sess, force)
    # Summer backtest
    for y in SUMMERS:
        save_open_meteo(out / f"era5_summer_{y}.csv", ARCHIVE_URL, ARCHIVE_VARS,
                        f"{y}-{SUMMER_START}", f"{y}-{SUMMER_END}", sess, force)


def air_quality(sess, force: bool) -> None:
    out = RAW / "air_quality"
    today = date.today()
    save_open_meteo(out / f"cams_forecast_snapshot_{today}.csv", AIR_URL, AIR_VARS,
                    str(today), str(today + pd.Timedelta(days=4)), sess, force)
    for day in (DUST_REPLAY_DAY, REPLAY_DAY):
        save_open_meteo(out / f"cams_replay_{day}.csv", AIR_URL, AIR_VARS, day, day, sess, force)
    for y in SUMMERS:
        save_open_meteo(out / f"cams_summer_{y}.csv", AIR_URL, AIR_VARS,
                        f"{y}-{SUMMER_START}", f"{y}-{SUMMER_END}", sess, force)


def gsod(sess, force: bool) -> None:
    out = RAW / "noaa_gsod"
    for name, station in GSOD_STATIONS.items():
        for y in GSOD_YEARS:
            url = f"https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/{y}/{station}.csv"
            download(out / f"{name}_{station}_{y}.csv", url, sess, force)


def nasa_power(sess, force: bool) -> None:
    out = RAW / "nasa_power"
    lat, lon = SITES["mussafah"]
    jobs = [("hourly", REPLAY_DAY, REPLAY_DAY), ("hourly", DUST_REPLAY_DAY, DUST_REPLAY_DAY)]
    jobs += [("daily", f"{y}-{SUMMER_START}", f"{y}-{SUMMER_END}") for y in SUMMERS]
    for res, start, end in jobs:
        url = (NASA_POWER_URL.format(res=res) + f"?parameters={NASA_POWER_VARS}&community=AG"
               f"&latitude={lat}&longitude={lon}&start={start.replace('-', '')}&end={end.replace('-', '')}"
               f"&time-standard=LST&format=CSV")
        tag = start if start == end else start[:4] + "_summer"
        download(out / f"mussafah_{res}_{tag}.csv", url, sess, force, min_bytes=500)


def onet(sess, force: bool) -> None:
    out = RAW / "onet"
    for f in ONET_FILES:
        download(out / f.replace(" ", "_"), ONET_BASE + f.replace(" ", "%20"), sess, force)
    # Convenience extract for lookup_job_profile
    src, path = out / "Work_Context.txt", ROOT / "processed" / "onet_work_context_plan_roles.csv"
    if src.exists() and not skip(path, str(src), force):
        wc = pd.read_csv(src, sep="\t")
        wc = wc[wc["O*NET-SOC Code"].isin(ONET_ROLES)].copy()
        wc.insert(1, "plan_role", wc["O*NET-SOC Code"].map(ONET_ROLES))
        wc.to_csv(path, index=False)
        record(path, "derived from onet/Work_Context.txt", "ok", f"{len(wc)} rows (US proxy)")


def guidance(sess, force: bool) -> None:
    out = RAW / "guidance"
    for name, url in GUIDANCE_DOCS.items():
        download(out / name, url, sess, force)


def regulatory(sess, force: bool) -> None:
    out = RAW / "regulatory"
    for name, url in REGULATORY_DOCS.items():
        download(out / name, url, sess, force)
    manual = out / "manual"
    manual.mkdir(parents=True, exist_ok=True)
    for path in sorted(p for p in manual.iterdir() if not p.name.startswith(".")):
        record(path, "collected by hand, see doc/manual-data-collection.md", "manual")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--force", action="store_true", help="re-download files that already exist")
    args = ap.parse_args()

    sess = _session(retries=4)
    sess.headers["User-Agent"] = "future-health-hackathon/0.1 (data download script)"
    for step in (weather, air_quality, gsod, nasa_power, onet, guidance, regulatory):
        print(f"\n== {step.__name__}")
        step(sess, args.force)

    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    failed = [m for m in manifest if m["status"] == "failed"]
    print(f"\n{len(manifest)} files, {len(failed)} failed. Manifest: data/manifest.json")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
