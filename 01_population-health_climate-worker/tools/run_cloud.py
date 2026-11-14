"""Supervise the bundled case API and isolated loopback solver on Cloud Run."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]


def main():
    children = []
    stopping = False

    def stop(_signum=None, _frame=None):
        nonlocal stopping
        stopping = True
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        solver_python = os.getenv('HEAT_SOLVER_PYTHON', '/opt/solver/bin/python')
        children.append(subprocess.Popen([solver_python, '-m', 'uvicorn', 'api:app', '--host', '127.0.0.1', '--port', '8765'], cwd=ROOT / 'demo/solver'))
        deadline = time.monotonic() + 90
        while not stopping and time.monotonic() < deadline:
            if children[0].poll() is not None:
                raise RuntimeError('Solver exited before readiness')
            try:
                with urlopen('http://127.0.0.1:8765/health', timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(.25)
        else:
            if stopping:
                return 0
            raise RuntimeError('Solver readiness timed out')
        children.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'heat_safe.application.api:app', '--host', '0.0.0.0', '--port', os.getenv('PORT', '8080'), '--proxy-headers', '--forwarded-allow-ips', '*'], cwd=ROOT))
        while not stopping:
            if any(child.poll() is not None for child in children):
                raise RuntimeError('A bundled service exited')
            time.sleep(.25)
        return 0
    finally:
        stop()
        for child in reversed(children):
            try:
                child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == '__main__':
    raise SystemExit(main())
