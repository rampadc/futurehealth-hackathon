"""Check the built container through the local unauthenticated HTTP port."""

import json
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

BASE = "http://127.0.0.1:8088"


def fetch(path):
    try:
        with urlopen(BASE + path, timeout=2) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()
    except URLError:
        return None, b""


def smoke():
    for attempt in range(120):
        status, payload = fetch("/api/ready")
        if status == 200:
            if json.loads(payload).get("ok") is True:
                break
            raise RuntimeError("readiness response is not healthy")
        if status not in (None, 503):
            raise RuntimeError(f"unexpected readiness HTTP {status}")
        time.sleep(1)
    else:
        raise RuntimeError("container did not become ready within two minutes")
    for path, expected in (("/", 200), ("/api/case", 401), ("/api/demo/state", 401), ("/guide", 404)):
        status, _ = fetch(path)
        if status != expected:
            raise RuntimeError(f"{path}: expected HTTP {expected}, got {status}")
        print(f"{path}: HTTP {status}")


if __name__ == "__main__":
    smoke()
