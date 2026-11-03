"""Download real Open-Meteo inputs; never synthesize missing observations."""
import csv
import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1] / "data"
SITES = {
    "abu_dhabi_city": (24.4539, 54.3773),
    "mussafah": (24.35, 54.50),
    "al_ain": (24.2075, 55.7447),
    "ruwais": (24.08, 52.73),
}
WEATHER = ["temperature_2m", "relative_humidity_2m", "dew_point_2m",
           "surface_pressure", "wind_speed_10m", "shortwave_radiation",
           "direct_radiation", "diffuse_radiation"]
AIR = ["pm10", "pm2_5", "dust", "aerosol_optical_depth", "uv_index", "us_aqi"]


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_bytes(data)
    temp.replace(path)
    return {"path": str(path.relative_to(ROOT)), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest()}


def csv_bytes(hourly, variables):
    buf = io.StringIO(newline="")
    writer = csv.writer(buf)
    writer.writerow(["time", *variables])
    writer.writerows(zip(hourly["time"], *(hourly[v] for v in variables)))
    return buf.getvalue().encode()


def download(job):
    site, kind, period, base, options, variables, expected = job
    lat, lon = SITES[site]
    params = {"latitude": lat, "longitude": lon, "timezone": "Asia/Dubai",
              "hourly": ",".join(variables), **options}
    url = base + "?" + urlencode(params)
    entry = {"source_url": url, "site": site,
             "requested_coordinates": {"latitude": lat, "longitude": lon},
             "kind": kind, "period": period, "synthetic": False,
             "timezone": "Asia/Dubai", "status": "failed", "files": [],
             "notes": ["Representative locality coordinates chosen for this download; not a verified construction site.",
                       "Gridded model data, not work-front sensor measurements."]}
    try:
        for attempt in range(3):
            try:
                with urlopen(Request(url, headers={"User-Agent": "HeatSafe-research/1.0"}), timeout=45) as response:
                    raw = response.read()
                break
            except (HTTPError, OSError) as exc:
                if isinstance(exc, HTTPError) and exc.code not in (429, 500, 502, 503, 504):
                    raise
                if attempt == 2:
                    raise
                time.sleep(2 ** (attempt + 1))
        entry["retrieved_at_utc"] = datetime.now(timezone.utc).isoformat()
        obj = json.loads(raw)
        assert not obj.get("error"), obj
        h = obj["hourly"]
        n = len(h["time"])
        assert n == expected, (n, expected)
        assert len(set(h["time"])) == n and h["time"] == sorted(h["time"])
        assert all(len(h[v]) == n for v in variables)
        nulls = {v: sum(x is None for x in h[v]) for v in variables}
        assert any(nulls[v] < n for v in variables), "All requested values are null"
        folder = "air_quality" if kind.startswith("cams") else "weather"
        stem = f"{kind}_{site}_{period}"
        entry["files"] = [write(ROOT / "raw" / folder / (stem + ".json"), raw),
                          write(ROOT / "raw" / folder / (stem + ".csv"), csv_bytes(h, variables))]
        entry.update(status="partial" if any(nulls.values()) else "downloaded", rows=n,
                     null_counts=nulls, units=obj["hourly_units"],
                     coverage_start=h["time"][0], coverage_end=h["time"][-1],
                     returned_grid={k: obj.get(k) for k in ("latitude", "longitude", "elevation")},
                     utc_offset_seconds=obj.get("utc_offset_seconds"))
        # Replay files are extracts, not additional independent observations.
        if kind in ("era5", "cams_archive"):
            for day in ("2025-08-01", "2024-08-04"):
                indices = [i for i, t in enumerate(h["time"]) if t.startswith(day)]
                if indices:
                    assert len(indices) == 24
                    subset = {k: [h[k][i] for i in indices] for k in ["time", *variables]}
                    info = write(ROOT / "processed" / "replay" / f"{kind}_{site}_{day}.csv", csv_bytes(subset, variables))
                    info.update(rows=24, derived_from=entry["files"][0]["path"], coverage_date=day)
                    entry["files"].append(info)
    except Exception as exc:
        entry["error"] = f"{type(exc).__name__}: {exc}"
        entry["attempted_at_utc"] = datetime.now(timezone.utc).isoformat()
    print(kind, site, period, entry["status"], entry.get("error", ""), flush=True)
    return entry


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    jobs = []
    for site in SITES:
        for year in (2023, 2024, 2025):
            dates = {"start_date": f"{year}-06-01", "end_date": f"{year}-09-30"}
            jobs.append((site, "era5", str(year), "https://archive-api.open-meteo.com/v1/archive",
                         {**dates, "models": "era5", "wind_speed_unit": "ms"}, WEATHER, 122 * 24))
            jobs.append((site, "cams_archive", str(year), "https://air-quality-api.open-meteo.com/v1/air-quality",
                         {**dates, "domains": "cams_global"}, AIR, 122 * 24))
        jobs.append((site, "forecast", stamp, "https://api.open-meteo.com/v1/forecast",
                     {"forecast_days": 16, "wind_speed_unit": "ms"}, WEATHER + ["uv_index"], 16 * 24))
        jobs.append((site, "cams_forecast", stamp, "https://air-quality-api.open-meteo.com/v1/air-quality",
                     {"forecast_days": 5, "domains": "cams_global"}, AIR, 5 * 24))
    with ThreadPoolExecutor(max_workers=3) as pool:
        entries = list(pool.map(download, jobs))
    payload = {"provider": "Open-Meteo / ERA5 / CAMS", "entries": entries,
               "documentation": ["https://open-meteo.com/en/docs/historical-weather-api",
                                 "https://open-meteo.com/en/docs/air-quality-api",
                                 "https://open-meteo.com/en/docs", "https://open-meteo.com/en/terms"],
               "coordinate_note": "Chosen locality reference points; original implementation coordinates unavailable.",
               "license_note": "Attribute Open-Meteo and underlying providers; free API is non-commercial. Check terms before commercial use."}
    write(ROOT / "manifest_weather.json", json.dumps(payload, indent=2).encode())


if __name__ == "__main__":
    main()
