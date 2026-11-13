#!/usr/bin/env python3
"""Download and validate the HeatSafe NOAA GSOD and NASA POWER source files."""

import csv
import hashlib
import io
import json
import time
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DATA = Path(__file__).resolve().parents[1] / "data"
NOAA = DATA / "raw/noaa_gsod"
NASA = DATA / "raw/nasa_power"
MANIFEST = DATA / "manifest_station_nasa.json"
STATIONS = {
    "abu_dhabi_international": ("412170", "OMAA"),
    "al_bateen": ("412160", "OMAD"),
    "al_ain": ("412180", "OMAL"),
}
PARAMS = ("T2M", "RH2M", "WS10M", "ALLSKY_SFC_SW_DWN", "PS")
BASE = "https://power.larc.nasa.gov/api/temporal"
METADATA_URL = "https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv"


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def download(url):
    # urllib verifies server certificates by default; never bypass TLS verification.
    for attempt in range(4):
        try:
            with urlopen(Request(url, headers={"User-Agent": "HeatSafe-data/1.0"}), timeout=75) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                return response.read(), utc_now()
        except HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
        except (URLError, TimeoutError) as exc:
            if attempt == 3:
                raise exc
        time.sleep(2 ** attempt)
    raise AssertionError("unreachable")


def save(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(body)
    temporary.replace(path)
    return {"relativePath": str(path.relative_to(DATA)), "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)}


def record(source_url, retrieved, path, body, rows, units, coverage, location, notes, status="ok"):
    return {"sourceURL": source_url, "retrievedUTC": retrieved, "status": status,
            **save(path, body), "rows": rows, "units": units, "coverage": coverage,
            "location": location, "notes": notes}


def validate_noaa(body, station, year):
    reader = csv.DictReader(io.StringIO(body.decode("utf-8-sig")))
    required = {"STATION", "DATE", "LATITUDE", "LONGITUDE", "TEMP", "DEWP", "WDSP"}
    assert required <= set(reader.fieldnames or []), f"missing NOAA columns: {reader.fieldnames}"
    rows = list(reader)
    assert rows, f"no NOAA observations: {station} {year}"
    dates = [date.fromisoformat(r["DATE"]) for r in rows]
    assert all(r["STATION"] == station for r in rows)
    assert all(d.year == year for d in dates)
    assert dates == sorted(set(dates)), f"duplicate/out-of-order NOAA dates: {station} {year}"
    assert all(22 <= float(r["LATITUDE"]) <= 26 and 53 <= float(r["LONGITUDE"]) <= 57 for r in rows)
    sentinels = {"TEMP": "9999.9", "DEWP": "9999.9", "SLP": "9999.9", "STP": "9999.9",
                 "VISIB": "999.9", "WDSP": "999.9", "MXSPD": "999.9", "GUST": "999.9",
                 "MAX": "9999.9", "MIN": "9999.9", "PRCP": "99.99", "SNDP": "999.9"}
    missing = {key: sum(not r[key] or r[key] == sentinel for r in rows)
               for key, sentinel in sentinels.items()}
    return rows, dates, missing


def validate_nasa(body, start, end, temporal):
    data = json.loads(body)
    header = data["header"]
    assert header["time_standard"].upper() == "UTC"
    assert header["start"] == start and header["end"] == end
    assert data["type"] == "Feature"
    assert data["geometry"]["coordinates"][:2] == [54.5, 24.35]
    assert set(PARAMS) <= set(data["parameters"])
    values = data["properties"]["parameter"]
    stamps = sorted(values[PARAMS[0]])
    expected = (date.fromisoformat(end[:4] + "-" + end[4:6] + "-" + end[6:]) -
                date.fromisoformat(start[:4] + "-" + start[4:6] + "-" + start[6:])).days + 1
    if temporal == "hourly":
        expected *= 24
    assert len(stamps) == expected, f"NASA coverage {len(stamps)} != {expected}"
    assert stamps[0] == start + ("00" if temporal == "hourly" else "")
    assert stamps[-1] == end + ("23" if temporal == "hourly" else "")
    assert all(set(values[p]) == set(stamps) for p in PARAMS)
    fill = header["fill_value"]
    units = {p: data["parameters"][p]["units"] for p in PARAMS}
    missing = {p: sum(v is None or v == fill for v in values[p].values()) for p in PARAMS}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp_utc" if temporal == "hourly" else "date_utc"] + list(PARAMS))
    for stamp in stamps:
        timestamp = datetime.strptime(stamp, "%Y%m%d%H" if temporal == "hourly" else "%Y%m%d")
        label = timestamp.isoformat(timespec="minutes") + "+00:00" if temporal == "hourly" else timestamp.date().isoformat()
        writer.writerow([label] +
                        ["" if values[p][stamp] is None or values[p][stamp] == fill else values[p][stamp]
                         for p in PARAMS])
    return data, output.getvalue().encode(), len(stamps), units, missing


def main():
    entries = []
    failures = []
    metadata_body, metadata_time = download(METADATA_URL)
    metadata_rows = list(csv.DictReader(io.StringIO(metadata_body.decode("utf-8-sig"))))
    selected = {}
    for name, (usaf, icao) in STATIONS.items():
        matches = [r for r in metadata_rows if r["USAF"] == usaf and r["WBAN"] == "99999"
                   and r["CTRY"] == "AE" and r["ICAO"] == icao]
        assert len(matches) == 1, f"station metadata mismatch: {name}"
        selected[name] = matches[0]
    entries.append(record(METADATA_URL, metadata_time, NOAA / "isd-history.csv", metadata_body,
                          len(metadata_rows), {"LAT": "degrees north", "LON": "degrees east", "ELEV(M)": "m"},
                          {"begin": "station-dependent", "end": "station-dependent"},
                          selected, "Official ISD station history; three selected station records in location."))

    for name, (usaf, _) in STATIONS.items():
        station = usaf + "99999"
        for year in range(2020, 2026):
            url = f"https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/{year}/{station}.csv"
            try:
                body, retrieved = download(url)
                rows, dates, missing = validate_noaa(body, station, year)
                location = {"stationID": station, "name": rows[0]["NAME"],
                            "latitude": float(rows[0]["LATITUDE"]), "longitude": float(rows[0]["LONGITUDE"]),
                            "metadata": selected[name]}
                entries.append(record(url, retrieved, NOAA / f"{name}_{year}.csv", body, len(rows),
                                      {"TEMP/DEWP/MAX/MIN": "deg F", "WDSP/MXSPD/GUST": "knots",
                                       "SLP/STP": "hPa", "VISIB": "miles", "PRCP": "inches"},
                                      {"first": dates[0].isoformat(), "last": dates[-1].isoformat(),
                                       "requestedYear": year}, location,
                                      {"missingByField": missing, "timeBasis": "NOAA GSOD DATE; no local-time conversion",
                                       "missingCalendarDaysWithinCoverage": (dates[-1] - dates[0]).days + 1 - len(rows)}))
            except Exception as exc:
                failures.append({"sourceURL": url, "status": "failed", "error": str(exc)})

    requests = [("hourly", "20250801", "20250801"), ("hourly", "20240804", "20240804")]
    requests += [("daily", f"{year}0601", f"{year}0930") for year in (2023, 2024, 2025)]
    for temporal, start, end in requests:
        query = urlencode({"parameters": ",".join(PARAMS), "community": "RE",
                           "longitude": 54.50, "latitude": 24.35, "start": start, "end": end,
                           "format": "JSON", "time-standard": "UTC"})
        url = f"{BASE}/{temporal}/point?{query}"
        stem = f"mussafah_{temporal}_{start}_{end}"
        try:
            body, retrieved = download(url)
            data, csv_body, rows, units, missing = validate_nasa(body, start, end, temporal)
            location = {"requestedLatitude": 24.35, "requestedLongitude": 54.50,
                        "returnedCoordinates": data["geometry"]["coordinates"]}
            coverage = {"first": start, "last": end, "temporal": temporal, "timeStandard": "UTC"}
            notes = {"missingByParameter": missing, "fillValue": data["header"]["fill_value"],
                     "sources": data["header"].get("sources"), "apiVersion": data["header"]["api"]["version"]}
            entries.append(record(url, retrieved, NASA / f"{stem}.json", body, rows, units,
                                  coverage, location, notes))
            entries.append(record(url, retrieved, NASA / f"{stem}.csv", csv_body, rows, units,
                                  coverage, location, {**notes, "derivedFrom": f"raw/nasa_power/{stem}.json",
                                                    "missingValues": "blank CSV cells"}))
        except Exception as exc:
            failures.append({"sourceURL": url, "status": "failed", "error": str(exc)})

    manifest = {"generatedUTC": utc_now(), "entries": entries, "failures": failures,
                "sourceDocumentation": ["https://www.ncei.noaa.gov/access/search/datasets/global-summary-of-the-day/",
                                        "https://power.larc.nasa.gov/docs/services/api/temporal/",
                                        "https://power.larc.nasa.gov/docs/faqs/other/"]}
    save(MANIFEST, (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode())
    print(f"Saved {len(entries)} files; {len(failures)} failed requests; manifest: {MANIFEST}")
    for failure in failures:
        print(f"FAILED {failure['sourceURL']}: {failure['error']}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
