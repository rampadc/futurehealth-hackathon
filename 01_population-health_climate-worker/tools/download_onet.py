"""Fetch O*NET 30.1 and extract US occupation work-context proxy data."""

import csv
import hashlib
import json
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = DATA / "raw" / "onet"
PROCESSED = DATA / "processed"
ARCHIVE_URL = "https://www.onetcenter.org/dl_files/database/db_30_1_text.zip"
LICENSE_URL = "https://www.onetcenter.org/license_db.html"
ARCHIVE = RAW / "db_30_1_text.zip"
LICENSE = RAW / "LICENSE.html"
SOURCE_FILES = ("Read Me.txt", "Occupation Data.txt", "Work Context.txt", "Work Context Categories.txt")
OCCUPATIONS = {
    "47-2061.00": "Construction Laborers",
    "47-2171.00": "Reinforcing Iron and Rebar Workers",
    "47-2181.00": "Roofers",
    "53-3032.00": "Heavy and Tractor-Trailer Truck Drivers",
    "53-3033.00": "Light Truck Drivers",
}
ELEMENTS = {
    "4.C.2.a.1.c": "Outdoors, Exposed to All Weather Conditions",
    "4.C.2.a.1.d": "Outdoors, Under Cover",
    "4.C.2.b.1.b": "Exposed to Very Hot or Cold Temperatures",
}


def download(url, path):
    if path.exists():
        return "existing"
    with urllib.request.urlopen(url, timeout=90) as response:
        data = response.read()
    assert data, f"Empty download: {url}"
    path.write_bytes(data)
    return "downloaded"


def file_info(path):
    data = path.read_bytes()
    return {"path": str(path.relative_to(DATA)), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def read_tsv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream, delimiter="\t"))


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    archive_status = download(ARCHIVE_URL, ARCHIVE)
    with zipfile.ZipFile(ARCHIVE) as archive:
        assert archive.testzip() is None, "Corrupt archive member"
        names = set(archive.namelist())
        assert all(f"db_30_1_text/{name}" in names for name in SOURCE_FILES)
        assert archive.read("db_30_1_text/Read Me.txt").startswith(b"O*NET 30.1 Database")
        for name in SOURCE_FILES:
            (RAW / name).write_bytes(archive.read(f"db_30_1_text/{name}"))
    license_status = download(LICENSE_URL, LICENSE)
    assert b"Creative Commons Attribution 4.0" in LICENSE.read_bytes()
    assert b"Earlier versions of the O*NET Database may be used under this license" in LICENSE.read_bytes()

    occupations = {row["O*NET-SOC Code"]: row for row in read_tsv(RAW / "Occupation Data.txt")}
    for code, title in OCCUPATIONS.items():
        assert occupations[code]["Title"] == title, (code, occupations[code]["Title"])
    categories = {
        (row["Element ID"], row["Scale ID"], row["Category"]): row["Category Description"]
        for row in read_tsv(RAW / "Work Context Categories.txt")
    }
    source_rows = read_tsv(RAW / "Work Context.txt")
    selected = []
    counts = Counter()
    for row in source_rows:
        code, element = row["O*NET-SOC Code"], row["Element ID"]
        if code not in OCCUPATIONS or element not in ELEMENTS:
            continue
        assert row["Element Name"] == ELEMENTS[element]
        scale = row["Scale ID"]
        assert scale in ("CX", "CXP")
        category_description = categories.get((element, scale, row["Category"]), "")
        if scale == "CXP":
            assert category_description, (element, row["Category"])
        selected.append({"occupation_code": code, "occupation_title": OCCUPATIONS[code],
                         "element_id": element, "element_name": ELEMENTS[element],
                         "scale_id": scale, "category": row["Category"],
                         "category_description": category_description, "data_value": row["Data Value"],
                         "n": row["N"], "standard_error": row["Standard Error"],
                         "lower_ci_bound": row["Lower CI Bound"], "upper_ci_bound": row["Upper CI Bound"],
                         "recommend_suppress": row["Recommend Suppress"], "not_relevant": row["Not Relevant"],
                         "date": row["Date"], "domain_source": row["Domain Source"]})
        counts[(code, element, scale)] += 1
    assert all(counts[(code, element, "CX")] == 1 and counts[(code, element, "CXP")] == 5
               for code in OCCUPATIONS for element in ELEMENTS)
    assert len(selected) == len(OCCUPATIONS) * len(ELEMENTS) * 6
    output = PROCESSED / "onet_30_1_work_context_heat_proxy.csv"
    with output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(selected[0]))
        writer.writeheader()
        writer.writerows(selected)
    with output.open(encoding="utf-8", newline="") as stream:
        assert sum(1 for _ in csv.DictReader(stream)) == len(selected)

    manifest = {
        "dataset": "O*NET 30.1 Database", "version": "30.1", "release": "December 2025",
        "status": "validated", "retrievedUTC": datetime.now(timezone.utc).isoformat(),
        "sourceURL": ARCHIVE_URL, "sourceArchive": file_info(ARCHIVE),
        "documentationURLs": ["https://www.onetcenter.org/db_releases.html",
                              "https://www.onetcenter.org/dictionary/30.1/excel/work_context.html",
                              "https://www.onetcenter.org/dictionary/30.1/excel/work_context_categories.html"],
        "archiveStatus": archive_status, "licenseStatus": license_status,
        "license": {"url": LICENSE_URL, "name": "CC BY 4.0", "file": file_info(LICENSE),
                    "attribution": "O*NET 30.1 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). Used under CC BY 4.0. Extract modified by selecting occupations and Work Context elements; USDOL/ETA has not approved, endorsed, or tested these modifications."},
        "files": [{**file_info(RAW / name), "rows": len(read_tsv(RAW / name)) if name.endswith(".txt") and name != "Read Me.txt" else None} for name in SOURCE_FILES],
        "processed": {**file_info(output), "rows": len(selected)},
        "coverage": {"geography": "United States occupations; proxy for UAE only, not UAE measurements",
                     "occupations": OCCUPATIONS, "elements": ELEMENTS, "scales": ["CX", "CXP"],
                     "scaleMeaning": {"CX": "mean frequency rating", "CXP": "percent of respondents endorsing each frequency category"},
                     "limitations": "The hot/cold item combines very hot and very cold exposure; outdoor conditions are not equivalent to heat exposure. O*NET ratings are US occupational survey data, not UAE exposure or worker health observations."},
    }
    (DATA / "manifest_onet.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Validated O*NET 30.1: {len(source_rows)} Work Context rows; {len(selected)} selected rows")


if __name__ == "__main__":
    main()
