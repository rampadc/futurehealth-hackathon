"""Create the project's BigQuery datasets and load data/heat_safe/raw into the `raw` dataset.

Usage:  uv run python tools/load_bigquery.py [--dry-run]

Run tools/download_data.py first. Every table is replaced on each run (WRITE_TRUNCATE),
so the script is safe to re-run after refreshing the downloads.
Project and location come from GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION
(set in .claude/settings.local.json), defaulting to heat-safe-example / me-central1.
"""
from __future__ import annotations

import argparse
import io
import os
import re
from pathlib import Path

import pandas as pd
from google.cloud import bigquery

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "heat-safe-example")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "me-central1")
from heat_safe.paths import DATA  # noqa: E402

RAW = DATA / "raw"

# Plan, Week 1: raw, analytics, vectors, telemetry, metrics
DATASETS = {
    "raw": "Source data as downloaded (Open-Meteo, NOAA, NASA POWER, O*NET). Rebuilt by tools/load_bigquery.py.",
    "analytics": "Derived, aggregated views. The supervisor agent's read-only service account reads only this dataset.",
    "vectors": "Chunked and embedded RAG corpus for search_guidance.",
    "telemetry": "Agent runs, tool calls, guardrail trips, token cost.",
    "metrics": "Eval results and backtest metrics.",
}


def snake(name: str) -> str:
    """BigQuery-safe column name: 'O*NET-SOC Code' -> 'onet_soc_code'."""
    name = name.replace("O*NET", "onet")
    return re.sub(r"[^0-9a-zA-Z]+", "_", name).strip("_").lower()


def read_many(pattern: str, **kwargs) -> pd.DataFrame:
    files = sorted(RAW.glob(pattern))
    if not files:
        raise FileNotFoundError(f"no files match data/heat_safe/raw/{pattern}; run tools/download_data.py")
    frames = []
    for f in files:
        df = pd.read_csv(f, **kwargs)
        df["source_file"] = str(f.relative_to(DATA))
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def read_nasa_power(pattern: str) -> pd.DataFrame:
    """NASA POWER CSVs carry a text header ending in '-END HEADER-'."""
    frames = []
    for f in sorted(RAW.glob(pattern)):
        text = f.read_text()
        df = pd.read_csv(io.StringIO(text.split("-END HEADER-", 1)[1]))
        df["source_file"] = str(f.relative_to(DATA))
        frames.append(df)
    return pd.concat(frames, ignore_index=True).replace(-999.0, pd.NA)  # POWER fill value


def open_meteo_hourly(pattern: str) -> pd.DataFrame:
    """Replay files overlap the summer files, so keep one row per site and hour."""
    df = read_many(pattern)
    df["time_local"] = pd.to_datetime(df.pop("time"))
    df["timezone"] = "Asia/Dubai"
    return df.drop_duplicates(["site", "time_local"]).sort_values(["site", "time_local"])


def snapshots(pattern: str) -> pd.DataFrame:
    df = read_many(pattern)
    df["time_local"] = pd.to_datetime(df.pop("time"))
    df["timezone"] = "Asia/Dubai"
    df["snapshot_date"] = pd.to_datetime(df["source_file"].str.extract(r"(\d{4}-\d{2}-\d{2})")[0]).dt.date
    return df


def gsod() -> pd.DataFrame:
    df = read_many("noaa_gsod/*.csv", dtype={"STATION": str}, skipinitialspace=True)
    df["DATE"] = pd.to_datetime(df["DATE"]).dt.date
    return df  # raw layer: GSOD sentinels (9999.9, 999.9) are left in place


TABLES = {
    "weather_era5_hourly": lambda: open_meteo_hourly("weather/era5_*.csv"),
    "weather_forecast_snapshot": lambda: snapshots("weather/forecast_snapshot_*.csv"),
    "air_quality_cams_hourly": lambda: open_meteo_hourly("air_quality/cams_replay_*.csv")
    .pipe(lambda d: pd.concat([d, open_meteo_hourly("air_quality/cams_summer_*.csv")]))
    .drop_duplicates(["site", "time_local"]),
    "air_quality_forecast_snapshot": lambda: snapshots("air_quality/cams_forecast_snapshot_*.csv"),
    "noaa_gsod_daily": gsod,
    "nasa_power_hourly": lambda: read_nasa_power("nasa_power/*_hourly_*.csv"),
    "nasa_power_daily": lambda: read_nasa_power("nasa_power/*_daily_*.csv"),
    "onet_work_context": lambda: read_many("onet/Work_Context.txt", sep="\t"),
    "onet_work_context_categories": lambda: read_many("onet/Work_Context_Categories.txt", sep="\t"),
    "onet_occupation_data": lambda: read_many("onet/Occupation_Data.txt", sep="\t"),
}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dry-run", action="store_true", help="build the tables locally, don't touch BigQuery")
    args = ap.parse_args()

    client = None if args.dry_run else bigquery.Client(project=PROJECT, location=LOCATION)
    if client:
        for name, description in DATASETS.items():
            ds = bigquery.Dataset(f"{PROJECT}.{name}")
            ds.location = LOCATION
            ds.description = description
            client.create_dataset(ds, exists_ok=True)
            print(f"dataset {PROJECT}.{name} ({LOCATION})")

    for table, build in TABLES.items():
        df = build()
        df.columns = [snake(c) for c in df.columns]
        if client:
            job = client.load_table_from_dataframe(
                df, f"{PROJECT}.raw.{table}",
                job_config=bigquery.LoadJobConfig(write_disposition="WRITE_TRUNCATE"),
            )
            job.result()
        print(f"raw.{table}: {len(df):,} rows, {len(df.columns)} columns" + (" (dry run)" if not client else ""))


if __name__ == "__main__":
    main()
