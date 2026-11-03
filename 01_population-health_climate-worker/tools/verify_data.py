"""Verify source manifests and write a combined local inventory. No network calls."""
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1] / "data"


def records(value):
    if isinstance(value, dict):
        path = value.get("path") or value.get("relativePath") or value.get("relative_path")
        if path and value.get("sha256"):
            yield path, value
        for child in value.values():
            yield from records(child)
    elif isinstance(value, list):
        for child in value:
            yield from records(child)


def main():
    manifests = {}
    checked = set()
    for name in ("weather", "station_nasa", "onet", "safety"):
        path = ROOT / f"manifest_{name}.json"
        if not path.exists():
            raise FileNotFoundError(path)
        data = json.loads(path.read_text())
        manifests[name] = data
        for relative, record in records(data):
            path = (ROOT / relative).resolve()
            assert path.is_relative_to(ROOT.resolve()), relative
            raw = path.read_bytes()
            assert hashlib.sha256(raw).hexdigest() == record["sha256"], relative
            if "bytes" in record:
                assert len(raw) == record["bytes"], relative
            if path.suffix.lower() == ".pdf":
                assert raw.startswith(b"%PDF-"), relative
            if path.suffix.lower() == ".zip":
                with zipfile.ZipFile(path) as archive:
                    assert archive.testzip() is None, relative
            if path.suffix.lower() in (".csv", ".txt") and isinstance(record.get("rows"), int):
                delimiter = "\t" if path.suffix.lower() == ".txt" else ","
                with path.open(newline="", encoding="utf-8-sig") as stream:
                    rows = sum(1 for _ in csv.reader(stream, delimiter=delimiter)) - 1
                assert rows == record["rows"], (relative, rows, record["rows"])
            checked.add(relative)
    inventory = []
    for folder in (ROOT / "raw", ROOT / "processed"):
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                raw = path.read_bytes()
                relative = str(path.relative_to(ROOT))
                inventory.append({"path": relative, "bytes": len(raw),
                                  "sha256": hashlib.sha256(raw).hexdigest(),
                                  "source_manifest_hash_checked": relative in checked})
    result = {"schema_version": 1, "verified_at_utc": datetime.now(timezone.utc).isoformat(),
              "scope": "Public Heat-Safe reference inputs. No synthetic workers, medical outcomes or live work-front observations.",
              "source_manifests": manifests, "files": inventory,
              "validation": {"files_checked_against_source_manifests": len(checked),
                             "raw_and_processed_files": len(inventory),
                             "bytes": sum(f["bytes"] for f in inventory)}}
    output = ROOT / "manifest.json"
    temp = output.with_suffix(".json.tmp")
    temp.write_text(json.dumps(result, indent=2) + "\n")
    temp.replace(output)
    print(json.dumps(result["validation"], indent=2))
    untracked = [f["path"] for f in inventory if not f["source_manifest_hash_checked"]]
    print("Files not covered by a source-manifest hash:", untracked)


if __name__ == "__main__":
    main()
