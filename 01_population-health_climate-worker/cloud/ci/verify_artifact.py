"""Treat a downloaded OCI archive as data until its origin is checked."""

import argparse
import hashlib
import json
import re
import tarfile
from pathlib import Path


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def verify(directory, sha, run_id):
    directory = Path(directory)
    metadata = json.loads((directory / "image.json").read_text())
    require(re.fullmatch(r"[a-f0-9]{40}", sha), "invalid SHA")
    require(re.fullmatch(r"[1-9][0-9]*", run_id), "invalid run ID")
    require(metadata["sha"] == sha and metadata["run_id"] == run_id, "artifact origin mismatch")
    require(metadata["tag"] == f"heat-safe-ci:{sha}", "artifact tag mismatch")
    archive = directory / "image.tar"
    with archive.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    require(metadata["sha256"] == digest, "artifact digest mismatch")
    with tarfile.open(archive) as tar:
        for member in tar:
            path = Path(member.name)
            require(not path.is_absolute() and ".." not in path.parts, "unsafe archive path")
            require(member.isfile() or member.isdir(), "unsafe archive member")
    return metadata["tag"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    parser.add_argument("sha")
    parser.add_argument("run_id")
    args = parser.parse_args()
    print(verify(args.directory, args.sha, args.run_id))
